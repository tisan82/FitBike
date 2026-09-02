import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { evaluateContentQuality } from "./content-quality-gate.mjs";

const rules = {
  globalImageQuality: { rejectDuplicateBodyPaths: true, requireNonEmptyCaption: true, requireVisualPurposeCaption: true },
  MAINTENANCE: { images: { minimumBodyImages: 2 } }
};

async function fixture({ duplicate = false, gallery = null } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fitbike-content-qa-"));
  await writeFile(path.join(dir, "a.webp"), "asset-a");
  await writeFile(path.join(dir, "b.webp"), duplicate ? "asset-a" : "asset-b");
  const bodyBlocks = [
    { type: "heading", level: 2, text: "확인 방법" },
    { type: "paragraph", text: "실차에서 위치와 상태를 함께 확인합니다." }
  ];
  if (gallery) bodyBlocks.push(gallery);
  return {
    dir,
    packageWithImages: {
      content: { contentKey: "qa-test", title: "QA 테스트", summary: "콘텐츠 품질 검증", contentType: "MAINTENANCE", bodyBlocks },
      images: { bodyImages: [{ required: true, description: "첫 번째 실제 확인 이미지" }, { required: true, description: "두 번째 실제 확인 이미지" }] }
    },
    imageResult: { status: "READY_FOR_VISUAL_REVIEW", assets: [{ id: "body-01", type: "body", status: "PASS", file: "a.webp" }, { id: "body-02", type: "body", status: "PASS", file: "b.webp" }] }
  };
}

test("passes structurally valid content", async () => {
  const data = await fixture();
  const result = await evaluateContentQuality({ contentDirectory: data.dir, rules, packageWithImages: data.packageWithImages, imageResult: data.imageResult });
  assert.equal(result.status, "PASS");
});

test("blocks duplicate body image hashes", async () => {
  const data = await fixture({ duplicate: true });
  const result = await evaluateContentQuality({ contentDirectory: data.dir, rules, packageWithImages: data.packageWithImages, imageResult: data.imageResult });
  assert.equal(result.status, "FAIL");
  assert.ok(result.checks.failures.some((item) => item.includes("DUPLICATE_BODY_HASH")));
});

test("blocks one-image galleries", async () => {
  const data = await fixture({ gallery: { type: "image_gallery", images: [{ storagePath: "one.webp", alt: "한 장", caption: "한 장" }] } });
  const result = await evaluateContentQuality({ contentDirectory: data.dir, rules, packageWithImages: data.packageWithImages, imageResult: data.imageResult });
  assert.equal(result.status, "FAIL");
  assert.ok(result.checks.failures.some((item) => item.includes("GALLERY_REQUIRES_2_IMAGES")));
});

test("blocks missing image caption metadata", async () => {
  const data = await fixture({ gallery: { type: "image", storagePath: "one.webp", alt: "설명" } });
  const result = await evaluateContentQuality({ contentDirectory: data.dir, rules, packageWithImages: data.packageWithImages, imageResult: data.imageResult });
  assert.equal(result.status, "FAIL");
  assert.ok(result.checks.failures.some((item) => item.includes("IMAGE_META_MISSING")));
});

test("blocks template packages that omit real-world access context", async () => {
  const data = await fixture();
  data.packageWithImages.content.contentTemplate = "HOW_TO";
  const templateRules = { templates: { HOW_TO: { minBlocks: 1, maxBlocks: 20, requiredBlockTypes: [], requiredRealitySignals: ["ACCESS_SCOPE", "STOP_CONDITION"] } } };
  const result = await evaluateContentQuality({ contentDirectory: data.dir, rules, templateRules, packageWithImages: data.packageWithImages, imageResult: data.imageResult });
  assert.equal(result.status, "FAIL");
  assert.ok(result.checks.failures.includes("TEMPLATE_REALITY_SIGNAL:ACCESS_SCOPE"));
  assert.ok(result.checks.failures.includes("TEMPLATE_REALITY_SIGNAL:STOP_CONDITION"));
});
