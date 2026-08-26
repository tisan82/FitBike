import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { inspectPublishArtifactConsistency, synchronizePublishArtifacts, synchronizePublishPackage } from "./artifact-synchronization.mjs";
import { repairContentDirectory } from "./content-repair.mjs";

function fixture() {
  const staleQa = { status: "REVIEW_REQUIRED", checks: { informationDensity: "TOO_LIGHT", sentenceFragments: 1, unsupportedClaims: 0, questionAnswerAlignment: true }, issues: ["Sentence fragments detected (1)", "Information density is TOO_LIGHT"] };
  const qa = { status: "READY_FOR_REVIEW", checks: { informationDensity: "GOOD", unsupportedClaims: 0 } };
  const oldContent = { contentKey: "example", bodyBlocks: [{ type: "paragraph", text: "old" }] };
  const content = { contentKey: "example", bodyBlocks: [{ type: "paragraph", text: "repaired" }] };
  const imageResult = { status: "READY_FOR_VISUAL_REVIEW", assets: [{ id: "thumbnail", status: "PASS", file: "images/thumbnail.webp" }] };
  const evidence = { status: "NOT_REQUIRED", facts: [] };
  const packageWithImages = { content: oldContent, qa: staleQa, images: { thumbnail: { required: true } }, imageCandidates: imageResult, customMetadata: { preserve: true } };
  return { contentPackage: { content, qa }, qa, evidence, imageResult, packageWithImages };
}

test("Auto-Repair Content와 QA를 Publish Package에 동기화한다", () => {
  const input = fixture();
  const result = synchronizePublishPackage(input);
  assert.deepEqual(result.content, input.contentPackage.content);
  assert.deepEqual(result.qa, input.qa);
  assert.equal(result.qa.status, "READY_FOR_REVIEW");
});

test("Image와 기존 Package Metadata를 보존하고 Evidence Hash를 기록한다", () => {
  const input = fixture();
  const result = synchronizePublishPackage(input);
  assert.deepEqual(result.imageCandidates, input.imageResult);
  assert.deepEqual(result.customMetadata, { preserve: true });
  assert.equal(typeof result.artifactSynchronization.evidenceHash, "string");
});

test("Risk와 Approval 입력의 최신 상태를 동기화 Metadata에 기록한다", () => {
  const input = fixture();
  const risk = { autoClearance: { status: "AUTO_CLEARANCE_PASS" } };
  const approval = { status: "APPROVED" };
  const result = synchronizePublishPackage({ ...input, risk, approval });
  assert.deepEqual(result.artifactSynchronization.risk, risk);
  assert.deepEqual(result.artifactSynchronization.approval, approval);
});

test("Stale Package를 검출하고 원자적 파일 동기화 후 CONSISTENT로 만든다", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fitbike-artifact-sync-"));
  const input = fixture();
  try {
    for (const [name, value] of [["content-package.json", input.contentPackage], ["qa.json", input.qa], ["evidence.json", input.evidence], ["image-result.json", input.imageResult], ["content-package-with-images.json", input.packageWithImages]]) await writeFile(path.join(directory, name), JSON.stringify(value));
    assert.equal(inspectPublishArtifactConsistency(input).status, "STALE");
    const result = await synchronizePublishArtifacts(directory);
    assert.equal(result.before, "STALE");
    assert.equal(result.after, "CONSISTENT");
    assert.equal(JSON.parse(await readFile(path.join(directory, "content-package-with-images.json"), "utf8")).qa.status, "READY_FOR_REVIEW");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Image Artifact 충돌은 자동 덮어쓰기하지 않고 차단한다", () => {
  const input = fixture();
  assert.throws(() => synchronizePublishPackage({ ...input, imageResult: { status: "FAILED", assets: [] } }), /ARTIFACT_SYNCHRONIZATION_IMAGE_CONFLICT/);
});

test("Auto-Repair Directory 경로가 Re-QA 직후 Publish Package까지 갱신한다", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fitbike-repair-sync-"));
  const input = fixture();
  const headings = ["준비", "확인", "비교", "판단"];
  input.contentPackage.content.bodyBlocks = headings.flatMap((text) => [{ type: "heading", level: 2, text }, { type: "paragraph", text: "확인 가능한 정보를 구분하여 상태를 판단하는 방법을 설명합니다" }]);
  input.contentPackage.qa = input.packageWithImages.qa;
  input.packageWithImages.content = structuredClone(input.contentPackage.content);
  try {
    for (const [name, value] of [["content-package.json", input.contentPackage], ["qa.json", input.packageWithImages.qa], ["evidence.json", input.evidence], ["image-result.json", input.imageResult], ["content-package-with-images.json", input.packageWithImages]]) await writeFile(path.join(directory, name), JSON.stringify(value));
    const result = await repairContentDirectory(directory);
    const publishPackage = JSON.parse(await readFile(path.join(directory, "content-package-with-images.json"), "utf8"));
    assert.equal(result.status, "PASS");
    assert.equal(result.artifactSynchronization.after, "CONSISTENT");
    assert.equal(publishPackage.qa.status, "READY_FOR_REVIEW");
    assert.deepEqual(publishPackage.content, JSON.parse(await readFile(path.join(directory, "content-package.json"), "utf8")).content);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
