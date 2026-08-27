import assert from "node:assert/strict";
import test from "node:test";

import { classifyTopicRisk } from "./automation-policy.mjs";
import { runAutonomousBatch } from "./autonomous-batch-engine.mjs";
import { classifyFailureScope, createFailureEntry, groupFailureBacklog, resolveFixCategory } from "./failure-isolation.mjs";

function candidate(key) {
  return { content_topic_id: key.length, topic_key: key, topic: key, content_type: "PARTS_GUIDE", part_type: "BRAKE", normalized_subject: "BRAKE", normalized_action: "UNDERSTAND", normalized_scope: "GENERIC", risk_level: "LOW", automation_level: "L2" };
}

function gates() {
  return { criticalFact: "VERIFIED", sourceConflict: "NONE", criticalUnverifiedClaim: "NONE", unsupportedNumericClaim: "NONE", unsupportedServiceLimit: "NONE", safetyQa: "PASS", technicalMisrepresentation: "NONE", productModelMismatch: "NONE", duplicateIntentGate: "PASS", contentQa: "PASS", imageQa: "PASS", mandatoryHumanReview: "NONE" };
}

function stages(behavior = {}) {
  const output = { gates: gates(), holdSignals: {} };
  const result = {};
  for (const stage of ["RESEARCH", "FACT_QA", "CONTENT_GENERATION", "VISUAL_PLANNING", "ASSET_GENERATION_OR_SELECTION", "CONTENT_QA", "IMAGE_QA"]) result[stage] = async (item) => behavior[item.topic_key]?.[stage]?.() ?? output;
  result.PUBLISH = async (item) => behavior[item.topic_key]?.PUBLISH?.() ?? { status: "PUBLISHED" };
  result.PREPARE_PRODUCTION_QA_RESUME = async (item, context) => ({ ...context, publish: { status: "PUBLISHED" } });
  result.PRODUCTION_QA = async (item) => behavior[item.topic_key]?.PRODUCTION_QA?.() ?? { status: "PASS" };
  return result;
}

test("오류 이름이 같아도 명시된 영향 범위를 우선한다", () => {
  assert.equal(classifyFailureScope({ reason: "IMAGEGEN_RUNTIME_ERROR", failureScope: "CANDIDATE_LOCAL" }), "CANDIDATE_LOCAL");
  assert.equal(classifyFailureScope({ reason: "IMAGEGEN_RUNTIME_ERROR", failureScope: "GLOBAL" }), "GLOBAL");
});

test("전역 무결성 오류만 GLOBAL로 분류한다", () => {
  for (const code of ["PRODUCTION_DB_WRITE_UNAVAILABLE", "STORAGE_TOTAL_WRITE_UNAVAILABLE", "REQUIRED_CREDENTIAL_MISSING", "REGISTRY_GLOBAL_CORRUPTION", "EXACTLY_ONCE_INTEGRITY_FAILURE"]) assert.equal(classifyFailureScope(code), "GLOBAL");
  for (const code of ["IMAGE_GENERATION_RUNTIME_FAILURE", "CONTENT_QA_RUNTIME_ERROR", "MISSING_RELATION"]) assert.equal(classifyFailureScope(code), "CANDIDATE_LOCAL");
});

test("Candidate 실패는 백로그를 남기고 다음 Candidate를 계속 처리한다", async () => {
  const first = candidate("image-failed");
  const second = candidate("verified-next");
  const runtime = stages({ "image-failed": { ASSET_GENERATION_OR_SELECTION: () => { throw new Error("IMAGE_GENERATION_RUNTIME_FAILURE"); } } });
  const result = await runAutonomousBatch({ target: 1, maxCandidates: 2, candidates: [first, second], classifyTopicRisk, stages: runtime });
  assert.equal(result.status, "SUCCESS");
  assert.equal(result.records.find((record) => record.originalTopicKey === first.topic_key).state, "CANDIDATE_FAILED");
  assert.equal(result.records.find((record) => record.originalTopicKey === second.topic_key).state, "PUBLISHED_VERIFIED");
  assert.equal(result.failureBacklog.length, 1);
  assert.equal(result.failureBacklog[0].fixCategory, "IMAGE_RUNTIME");
});

test("HOLD, DROP, Candidate 실패, Pending QA 뒤에도 안전한 Candidate를 처리한다", async () => {
  const items = ["hold", "failed", "pending", "verified"].map(candidate);
  const runtime = stages({
    hold: { FACT_QA: () => ({ gates: gates(), holdSignals: { CRITICAL_CLAIM_UNVERIFIED: true } }) },
    failed: { CONTENT_QA: () => { throw new Error("CONTENT_QA_RUNTIME_ERROR"); } },
    pending: { PRODUCTION_QA: () => ({ status: "PRODUCTION_QA_PENDING" }) }
  });
  const result = await runAutonomousBatch({ target: 1, maxCandidates: 4, candidates: items, classifyTopicRisk, stages: runtime, maxPendingQa: 2 });
  assert.equal(result.published, 1);
  assert.equal(result.records.find((record) => record.originalTopicKey === "hold").state, "HOLD_CONTENT");
  assert.equal(result.records.find((record) => record.originalTopicKey === "failed").state, "CANDIDATE_FAILED");
  assert.equal(result.records.find((record) => record.originalTopicKey === "pending").state, "PUBLISHED_PENDING_QA");
});

test("GLOBAL_FATAL은 Batch를 중단하고 성공 Counter를 보존한다", async () => {
  const items = ["verified", "db-fatal", "must-not-run"].map(candidate);
  const error = new Error("Production database unavailable");
  error.errorCode = "PRODUCTION_DB_WRITE_UNAVAILABLE";
  const runtime = stages({ "db-fatal": { PUBLISH: () => { throw error; } } });
  const result = await runAutonomousBatch({ target: 3, maxCandidates: 3, candidates: items, classifyTopicRisk, stages: runtime });
  assert.equal(result.status, "GLOBAL_FATAL");
  assert.equal(result.published, 1);
  assert.equal(result.considered, 2);
  assert.equal(result.globalFatal.verifiedCounter, 1);
  assert.equal(result.globalFatal.lastSuccessfulCandidate, "verified");
});

for (const errorCode of ["PRODUCTION_DB_WRITE_UNAVAILABLE", "STORAGE_TOTAL_WRITE_UNAVAILABLE", "REQUIRED_CREDENTIAL_MISSING", "EXACTLY_ONCE_INTEGRITY_FAILURE"]) {
  test(`${errorCode}는 GLOBAL_FATAL로 Batch를 중단한다`, async () => {
    const items = [candidate("fatal"), candidate("next")];
    const error = new Error(errorCode);
    error.errorCode = errorCode;
    const result = await runAutonomousBatch({ target: 1, maxCandidates: 2, candidates: items, classifyTopicRisk, stages: stages({ fatal: { RESEARCH: () => { throw error; } } }) });
    assert.equal(result.status, "GLOBAL_FATAL");
    assert.equal(result.considered, 1);
    assert.equal(result.failureBacklog[0].failureScope, "GLOBAL");
  });
}

test("Failure Backlog은 동일 원인을 그룹화한다", () => {
  const base = { candidate: candidate("a"), record: { history: [], checkpoint: null }, failedStage: "IMAGE_QA" };
  const failures = ["a", "b"].map((key) => createFailureEntry({ ...base, candidate: candidate(key), error: "IMAGE_QA_RUNTIME_ERROR" }));
  assert.deepEqual(groupFailureBacklog(failures), [{ fixCategory: "IMAGE_QA", rootCause: "IMAGE_QA_RUNTIME_ERROR", affected: 2, candidates: ["a", "b"] }]);
  assert.equal(resolveFixCategory("MISSING_RELATION", "FACT_QA"), "RESEARCH");
});

test("CANDIDATE_FAILED는 명시적 retry에서만 Checkpoint부터 재개한다", async () => {
  const item = candidate("retry-local");
  const previous = { originalTopicKey: item.topic_key, topicKey: item.topic_key, state: "CANDIDATE_FAILED", history: [{ state: "CANDIDATE_FAILED" }], candidate: item, classification: classifyTopicRisk(item), visual: { type: "EDUCATIONAL" }, resumeFrom: "CONTENT_QA", resumeContext: { gates: gates(), holdSignals: {} }, checkpoint: { resumeEligible: true } };
  const skipped = await runAutonomousBatch({ target: 1, maxCandidates: 1, candidates: [item], previousRecords: { [item.topic_key]: previous }, classifyTopicRisk, stages: stages() });
  assert.equal(skipped.records[0].skipped, true);
  const retried = await runAutonomousBatch({ target: 1, maxCandidates: 1, candidates: [item], previousRecords: { [item.topic_key]: previous }, retrySystem: true, classifyTopicRisk, stages: stages() });
  assert.equal(retried.records[0].state, "PUBLISHED_VERIFIED");
  assert.equal(retried.failureBacklog.length, 0);
});

test("Checkpoint 저장 실패는 GLOBAL_FATAL이며 후속 Candidate를 실행하지 않는다", async () => {
  const items = ["checkpoint-fatal", "must-not-run"].map(candidate);
  const result = await runAutonomousBatch({ target: 2, maxCandidates: 2, candidates: items, classifyTopicRisk, stages: stages(), onRecord: async () => { throw new Error("disk unavailable"); } });
  assert.equal(result.status, "GLOBAL_FATAL");
  assert.equal(result.considered, 1);
  assert.equal(result.failureBacklog[0].errorCode, "BATCH_CHECKPOINT_WRITE_FAILED");
});
