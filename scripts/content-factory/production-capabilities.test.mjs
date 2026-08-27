import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { assessCapabilityReadiness, checkImageReceipt, inspectCheckpointResume, inspectOperationPreflight, isActiveBatch, requiredCapabilities } from "./production-capabilities.mjs";

test("Production Preflight 필수 Global Capability는 Brand Asset 존재 여부와 분리된다", () => {
  assert.deepEqual(requiredCapabilities, ["DB_READ", "DB_WRITE", "RESEARCH", "CONTENT_GENERATION", "IMAGE_GENERATION", "IMAGE_OUTPUT_ACQUISITION", "IMAGE_QA", "STORAGE_WRITE", "PUBLISH", "PRODUCTION_HTTP_QA", "SITEMAP_QA"]);
});

test("실제 출력과 QA가 있는 최신 Image Runtime Receipt는 E2E 검증 상태다", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fitbike-capability-"));
  try {
    const output = path.join(directory, "thumbnail.png");
    const qa = path.join(directory, "thumbnail.qa.json");
    const receipt = path.join(directory, "receipt.json");
    await writeFile(output, "image");
    await writeFile(qa, JSON.stringify({ assetAvailability: true, storageReadiness: true, unsafeVisual: false, technicalMisrepresentation: false }));
    await writeFile(receipt, JSON.stringify({ provider: "BUILT_IN_IMAGE_GEN", generatedAt: "2026-08-26T05:29:23Z", outputFile: path.relative(path.resolve("."), output), qaFile: path.relative(path.resolve("."), qa) }));
    const result = await checkImageReceipt(receipt, Date.parse("2026-08-26T06:00:00Z"));
    assert.equal(result.state, "IMPLEMENTED_AND_E2E_VERIFIED");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Image Runtime Receipt가 없으면 Adapter-only로 fail-closed한다", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fitbike-capability-"));
  try {
    const result = await checkImageReceipt(path.join(directory, "missing.json"));
    assert.deepEqual(result, { state: "ADAPTER_ONLY", reason: "IMAGE_RUNTIME_RECEIPT_MISSING" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("PARTIAL HOLD_CONTENT checkpoint는 retry-hold 대상으로 Resume 가능하다", () => {
  const result = inspectCheckpointResume({ status: "PARTIAL", batchId: "canary", records: [{ state: "HOLD_CONTENT" }, { state: "DROP" }] });
  assert.equal(result.state, "IMPLEMENTED_AND_E2E_VERIFIED");
  assert.equal(result.mode, "HOLD_CONTENT");
  assert.equal(result.resumable, 1);
  assert.equal(result.requiresFlag, "--retry-hold");
});

test("Hold도 System Block도 없는 checkpoint는 Resume 가능으로 오인하지 않는다", () => {
  assert.equal(inspectCheckpointResume({ status: "PARTIAL", records: [{ state: "DROP" }] }).reason, "RESUMABLE_CHECKPOINT_MISSING");
});

test("PUBLISHED_PENDING_QA checkpoint는 Production QA reconciliation 대상으로 Resume 가능하다", () => {
  const result = inspectCheckpointResume({ status: "PARTIAL", batchId: "canary", records: [{ state: "PUBLISHED_PENDING_QA" }] });
  assert.equal(result.state, "IMPLEMENTED_AND_E2E_VERIFIED");
  assert.equal(result.mode, "PRODUCTION_QA_RECONCILIATION");
  assert.equal(result.stage, "PRODUCTION_QA");
  assert.equal(result.resumable, 1);
});

test("NEW_BATCH는 Checkpoint가 없어도 시작 가능하다", () => {
  const result = inspectOperationPreflight({ operationMode: "NEW_BATCH", checkpoints: [] });
  assert.equal(result.checkpointResume.state, "NOT_REQUIRED");
  assert.equal(result.allowed, true);
});

test("완료된 Canary는 NEW_BATCH 시작을 막지 않는다", () => {
  const result = inspectOperationPreflight({ operationMode: "NEW_BATCH", checkpoints: [{ batchId: "canary", status: "SUCCESS", records: [] }] });
  assert.equal(result.activeBatchGuard.state, "IMPLEMENTED_AND_E2E_VERIFIED");
  assert.equal(result.allowed, true);
});

test("활성 Production Batch는 중복 NEW_BATCH 실행을 차단한다", () => {
  for (const status of ["RUNNING", "PARTIAL", "BLOCKED_SYSTEM", "GLOBAL_FATAL"]) assert.equal(isActiveBatch({ status }), true);
  const result = inspectOperationPreflight({ operationMode: "NEW_BATCH", checkpoints: [{ batchId: "active", status: "RUNNING" }] });
  assert.equal(result.activeBatchGuard.reason, "ACTIVE_BATCH_CONFLICT");
  assert.equal(result.allowed, false);
});

test("RESUME_BATCH는 유효한 BLOCKED_SYSTEM Checkpoint를 허용한다", () => {
  const checkpoint = { batchId: "blocked", status: "BLOCKED_SYSTEM", records: [{ state: "BLOCKED_SYSTEM", resumeFrom: "RESEARCH", checkpoint: { resumeEligible: true } }] };
  const result = inspectOperationPreflight({ operationMode: "RESUME_BATCH", checkpoint, checkpoints: [checkpoint], batchId: "blocked" });
  assert.equal(result.checkpointResume.state, "IMPLEMENTED_AND_E2E_VERIFIED");
  assert.equal(result.allowed, true);
});

test("PARTIAL CANDIDATE_FAILED checkpoint는 명시적 retry 대상으로 보존한다", () => {
  const checkpoint = { batchId: "failed", status: "PARTIAL", records: [{ state: "CANDIDATE_FAILED", resumeFrom: "IMAGE_QA", checkpoint: { resumeEligible: true } }] };
  const result = inspectCheckpointResume(checkpoint);
  assert.equal(result.state, "IMPLEMENTED_AND_E2E_VERIFIED");
  assert.equal(result.mode, "CANDIDATE_FAILED");
  assert.equal(result.requiresFlag, "--retry-system");
});

test("RESUME_BATCH의 누락 Checkpoint는 실패한다", () => {
  const result = inspectOperationPreflight({ operationMode: "RESUME_BATCH", checkpoint: null, checkpoints: [], batchId: "missing" });
  assert.equal(result.checkpointResume.reason, "BATCH_CHECKPOINT_MISSING");
  assert.equal(result.allowed, false);
});

test("완료된 Batch는 Resume 대상이 아니다", () => {
  const checkpoint = { batchId: "complete", status: "SUCCESS", records: [] };
  const result = inspectOperationPreflight({ operationMode: "RESUME_BATCH", checkpoint, checkpoints: [checkpoint], batchId: "complete" });
  assert.equal(result.checkpointResume.reason, "COMPLETED_BATCH");
  assert.equal(result.allowed, false);
});

test("HOLD와 Production QA Pending Resume 회귀를 보존한다", () => {
  const hold = { batchId: "hold", status: "PARTIAL", records: [{ state: "HOLD_CONTENT" }] };
  const pending = { batchId: "pending", status: "PARTIAL", records: [{ state: "PUBLISHED_PENDING_QA" }] };
  assert.equal(inspectOperationPreflight({ operationMode: "RESUME_BATCH", checkpoint: hold }).allowed, true);
  assert.equal(inspectOperationPreflight({ operationMode: "RESUME_BATCH", checkpoint: pending }).allowed, true);
});

test("Global Runtime 실패는 NEW_BATCH와 RESUME_BATCH를 모두 차단한다", () => {
  const matrix = Object.fromEntries(requiredCapabilities.map((capability) => [capability, { state: capability === "DB_READ" ? "BLOCKED_BY_CREDENTIAL" : "IMPLEMENTED_AND_E2E_VERIFIED" }]));
  const newOperation = inspectOperationPreflight({ operationMode: "NEW_BATCH", checkpoints: [] });
  const resumeCheckpoint = { batchId: "resume", status: "PARTIAL", records: [{ state: "HOLD_CONTENT" }] };
  const resumeOperation = inspectOperationPreflight({ operationMode: "RESUME_BATCH", checkpoint: resumeCheckpoint });
  assert.equal(assessCapabilityReadiness({ matrix, operationMode: "NEW_BATCH", operation: newOperation }).status, "BATCH_PREFLIGHT_BLOCKED");
  assert.equal(assessCapabilityReadiness({ matrix, operationMode: "RESUME_BATCH", operation: resumeOperation }).status, "BATCH_PREFLIGHT_BLOCKED");
});
