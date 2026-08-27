import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { classifyTopicRisk } from "./automation-policy.mjs";
import { runAutonomousBatch } from "./autonomous-batch-engine.mjs";
import { decideVisual, deriveModelCandidates, evaluateAutoClearance, evaluateDuplicate, redefineCandidate, reclassifyAfterRedefinition, shouldSkipCandidate } from "./autonomous-policy.mjs";
import { inspectDetailHtml, runChecks } from "./production-content-qa.mjs";
import { createProductionStages, normalizeHoldResumeStateMachineRecord, normalizeLegacyRetryHoldPublishRecord, normalizeProductionQaRecord, verifyPublishedContentForProductionQaResume } from "./autonomous-batch.mjs";

const topic15 = { content_topic_id: 15, topic_key: "brake-pad-pre-replacement-check", topic: "브레이크 패드 교체 전 확인할 것", content_type: "MAINTENANCE", part_type: "BRAKE", normalized_subject: "BRAKE", normalized_action: "REPLACE", normalized_scope: "GENERIC", risk_level: "MEDIUM", automation_level: "L1" };
const topic14 = { content_key: "motorcycle-brake-check", title: "오토바이 브레이크 패드 마모 확인 방법", summary: "브레이크 패드 마찰재의 마모 상태를 관찰하고 교체 필요 여부를 판단합니다.", part_types: ["BRAKE"], body_blocks: [{ type: "paragraph", text: "브레이크 패드 위치와 마찰재 잔량, 편마모, 이상 징후를 확인하고 제조사 기준으로 교체 필요 여부를 판단합니다." }] };

function passGates() {
  return { criticalFact: "VERIFIED", sourceConflict: "NONE", criticalUnverifiedClaim: "NONE", unsupportedNumericClaim: "NONE", unsupportedServiceLimit: "NONE", safetyQa: "PASS", technicalMisrepresentation: "NONE", productModelMismatch: "NONE", duplicateIntentGate: "PASS", contentQa: "PASS", imageQa: "PASS", mandatoryHumanReview: "NONE" };
}

function passingStages(holdAt = null) {
  const result = { gates: passGates(), holdSignals: {} };
  const stages = {};
  for (const state of ["RESEARCH", "FACT_QA", "CONTENT_GENERATION", "VISUAL_PLANNING", "ASSET_GENERATION_OR_SELECTION", "CONTENT_QA", "IMAGE_QA"]) stages[state] = async () => state === holdAt ? { ...result, holdSignals: { SOURCE_CONFLICT: true } } : result;
  stages.PUBLISH = async () => ({ status: "PUBLISHED" });
  stages.PREPARE_PRODUCTION_QA_RESUME = async (candidate, context) => ({ ...context, publish: { status: "PUBLISHED" }, productionExistence: { status: "PASS" } });
  stages.PRODUCTION_QA = async () => ({ status: "PASS" });
  return stages;
}

test("명백한 기존 Published 중복은 DROP 또는 REDEFINE한다", () => assert.notEqual(evaluateDuplicate(topic15, [topic14]).decision, "KEEP"));
test("Topic 15는 제목 하드코딩 없이 REDEFINE 대상이 된다", () => assert.equal(evaluateDuplicate(topic15, [topic14]).decision, "REDEFINE"));
test("Topic 15 재정의는 구매 전 호환성 Intent를 만든다", () => {
  const redefined = redefineCandidate(topic15);
  assert.equal(redefined.normalized_action, "SELECT");
  assert.equal(redefined.normalized_subject, "BRAKE_PAD_SIZE");
  assert.equal(evaluateDuplicate(redefined, [topic14]).decision, "KEEP");
});
test("MAXXIS Product Representation은 Brand Asset First다", () => assert.deepEqual(decideVisual({ topic: "타이어 제품 호환 규격", part_type: "TIRE", normalized_action: "SELECT" }), { type: "PRODUCT_REPRESENTATION", brand: "MAXXIS", brandAssetRequired: true }));
test("POWEROAD Product Representation은 Brand Asset First다", () => assert.deepEqual(decideVisual({ topic: "배터리 제품 호환 규격", part_type: "BATTERY", normalized_action: "SELECT" }), { type: "PRODUCT_REPRESENTATION", brand: "POWEROAD", brandAssetRequired: true }));
test("BRAKE Visual은 Educational이다", () => assert.equal(decideVisual(topic15).type, "EDUCATIONAL"));
test("MEDIUM은 모든 Gate 통과 시 AUTO CLEARANCE PASS다", () => assert.deepEqual(evaluateAutoClearance({ riskLevel: "MEDIUM", gates: passGates() }), { decision: "AUTO_PUBLISH", status: "AUTO_CLEARANCE_PASS", failures: [] }));
test("SOURCE_CONFLICT는 HOLD다", () => assert.equal(evaluateAutoClearance({ riskLevel: "MEDIUM", gates: { ...passGates(), sourceConflict: "PRESENT" } }).decision, "HOLD"));
test("HIGH Risk는 모든 Gate가 PASS여도 HOLD다", () => assert.equal(evaluateAutoClearance({ riskLevel: "HIGH", gates: passGates() }).status, "HIGH_RISK_HOLD"));
test("재정의 후 Risk를 새로운 Intent로 재평가한다", () => assert.equal(reclassifyAfterRedefinition(redefineCandidate(topic15), classifyTopicRisk).reEvaluated, true));
test("HOLD Candidate 뒤에도 Batch가 계속된다", async () => {
  const candidates = [
    { ...topic15, topic_key: "hold", topic: "고유 브레이크 안전 점검" },
    { topic_key: "next", topic: "타이어 구조 이해", content_type: "PARTS_GUIDE", part_type: "TIRE", normalized_subject: "TIRE_CONSTRUCTION", normalized_action: "UNDERSTAND", normalized_scope: "GENERIC", risk_level: "LOW", automation_level: "L2" }
  ];
  let calls = 0;
  const stages = passingStages();
  stages.RESEARCH = async () => ++calls === 1 ? { gates: passGates(), holdSignals: { SOURCE_CONFLICT: true } } : { gates: passGates(), holdSignals: {} };
  const result = await runAutonomousBatch({ target: 1, maxCandidates: 2, candidates, classifyTopicRisk, stages });
  assert.equal(result.records[0].state, "HOLD_CONTENT");
  assert.equal(result.records[1].state, "PUBLISHED_VERIFIED");
});
test("PUBLISHED와 DROP과 HOLD는 Resume 시 재처리하지 않는다", () => {
  assert.equal(shouldSkipCandidate({ state: "PUBLISHED" }), true);
  assert.equal(shouldSkipCandidate({ state: "DROP" }), true);
  assert.equal(shouldSkipCandidate({ state: "HOLD" }), true);
  assert.equal(shouldSkipCandidate({ state: "HOLD_CONTENT" }), true);
});
test("BLOCKED_SYSTEM은 명시적 retry에서만 저장된 Asset 단계부터 재개한다", async () => {
  const candidate = { topic_key: "resume", topic: "resume topic", content_type: "PARTS_GUIDE", part_type: "BRAKE", normalized_subject: "BRAKE", normalized_action: "UNDERSTAND", normalized_scope: "GENERIC", risk_level: "LOW", automation_level: "L2" };
  const calls = [];
  const stages = passingStages();
  stages.ASSET_GENERATION_OR_SELECTION = async (current, context) => {
    calls.push("ASSET");
    return { ...context, gates: passGates(), holdSignals: {} };
  };
  for (const state of ["CONTENT_QA", "IMAGE_QA"]) stages[state] = async (current, context) => {
    calls.push(state);
    return { ...context, gates: passGates(), holdSignals: {} };
  };
  const previousRecord = {
    topicKey: "resume",
    originalTopicKey: "resume",
    state: "BLOCKED_SYSTEM",
    history: [{ state: "BLOCKED_SYSTEM", reason: "IMAGEGEN_OUTPUT_PENDING" }],
    candidate,
    classification: classifyTopicRisk(candidate),
    visual: { type: "EDUCATIONAL" },
    resumeFrom: "ASSET_GENERATION_OR_SELECTION",
    resumeContext: { gates: passGates(), holdSignals: {}, contentDirectory: "content-work/resume" }
  };
  assert.equal(shouldSkipCandidate(previousRecord), true);
  assert.equal(shouldSkipCandidate(previousRecord, { retrySystem: true }), false);
  const result = await runAutonomousBatch({ target: 1, maxCandidates: 1, candidates: [candidate], previousRecords: { resume: previousRecord }, retrySystem: true, classifyTopicRisk, stages });
  assert.deepEqual(calls, ["ASSET", "CONTENT_QA", "IMAGE_QA"]);
  assert.equal(result.records[0].state, "PUBLISHED_VERIFIED");
});
test("BLOCKED_SYSTEM 발생 즉시 Batch를 중단하고 다음 Candidate를 평가하지 않는다", async () => {
  const candidates = [
    { topic_key: "system-block", content_topic_id: 101, topic: "system block", content_type: "PARTS_GUIDE", part_type: "BRAKE", normalized_subject: "BRAKE", normalized_action: "UNDERSTAND", normalized_scope: "GENERIC", risk_level: "LOW", automation_level: "L2" },
    { topic_key: "must-not-run", content_topic_id: 102, topic: "must not run", content_type: "PARTS_GUIDE", part_type: "TIRE", normalized_subject: "TIRE", normalized_action: "UNDERSTAND", normalized_scope: "GENERIC", risk_level: "LOW", automation_level: "L2" }
  ];
  const evaluated = [];
  const stages = passingStages();
  stages.RESEARCH = async (candidate, context) => {
    evaluated.push(candidate.topic_key);
    return { ...context, gates: passGates(), holdSignals: {} };
  };
  stages.ASSET_GENERATION_OR_SELECTION = async (candidate, context) => ({ ...context, systemBlock: { reason: "IMAGE_EXECUTOR_UNAVAILABLE", resumeFrom: "ASSET_GENERATION_OR_SELECTION" } });
  const result = await runAutonomousBatch({ batchId: "canary-regression", target: 1, maxCandidates: 2, candidates, classifyTopicRisk, stages });
  assert.equal(result.status, "BLOCKED_SYSTEM");
  assert.equal(result.considered, 1);
  assert.deepEqual(evaluated, ["system-block"]);
  assert.equal(result.records.some((record) => record.originalTopicKey === "must-not-run"), false);
});
test("BLOCKED_SYSTEM 이후 DB와 Storage Mutation 경로를 호출하지 않는다", async () => {
  const candidates = [
    { topic_key: "blocked", topic: "blocked", content_type: "PARTS_GUIDE", part_type: "BRAKE", normalized_subject: "BRAKE", normalized_action: "UNDERSTAND", normalized_scope: "GENERIC", risk_level: "LOW", automation_level: "L2" },
    { topic_key: "mutation", topic: "mutation", content_type: "PARTS_GUIDE", part_type: "TIRE", normalized_subject: "TIRE", normalized_action: "UNDERSTAND", normalized_scope: "GENERIC", risk_level: "LOW", automation_level: "L2" }
  ];
  let databaseMutations = 0;
  let storageMutations = 0;
  const stages = passingStages();
  stages.ASSET_GENERATION_OR_SELECTION = async (candidate, context) => candidate.topic_key === "blocked"
    ? { ...context, systemBlock: { reason: "CAPABILITY_MISSING", resumeFrom: "ASSET_GENERATION_OR_SELECTION" } }
    : (databaseMutations += 1, storageMutations += 1, context);
  await runAutonomousBatch({ target: 1, maxCandidates: 2, candidates, classifyTopicRisk, stages });
  assert.equal(databaseMutations, 0);
  assert.equal(storageMutations, 0);
});
test("BLOCKED_SYSTEM Checkpoint는 실패 단계와 재개 정보를 보존한다", async () => {
  const candidate = { topic_key: "checkpoint", content_topic_id: 301, topic: "checkpoint", content_type: "PARTS_GUIDE", part_type: "BRAKE", normalized_subject: "BRAKE", normalized_action: "UNDERSTAND", normalized_scope: "GENERIC", risk_level: "LOW", automation_level: "L2" };
  const stages = passingStages();
  stages.ASSET_GENERATION_OR_SELECTION = async (current, context) => ({ ...context, systemBlock: { reason: "IMAGEGEN_OUTPUT_PENDING", resumeFrom: "ASSET_GENERATION_OR_SELECTION" } });
  const result = await runAutonomousBatch({ batchId: "checkpoint-batch", target: 1, maxCandidates: 1, candidates: [candidate], classifyTopicRisk, stages });
  const checkpoint = result.records[0].checkpoint;
  assert.equal(result.batchId, "checkpoint-batch");
  assert.equal(checkpoint.topicId, 301);
  assert.equal(checkpoint.failedStage, "ASSET_GENERATION_OR_SELECTION");
  assert.equal(checkpoint.blockerType, "BLOCKED_SYSTEM");
  assert.equal(checkpoint.blockerReason, "IMAGEGEN_OUTPUT_PENDING");
  assert.equal(checkpoint.resumeEligible, true);
  assert.equal(checkpoint.completedStages.includes("RESEARCH"), true);
});
test("Pipeline Adapter 예외도 실제 실패 단계에서 BLOCKED_SYSTEM으로 기록한다", async () => {
  const candidate = { topic_key: "adapter-error", content_topic_id: 302, topic: "adapter error", content_type: "PARTS_GUIDE", part_type: "BRAKE", normalized_subject: "BRAKE", normalized_action: "UNDERSTAND", normalized_scope: "GENERIC", risk_level: "LOW", automation_level: "L2" };
  const stages = passingStages();
  stages.ASSET_GENERATION_OR_SELECTION = async () => { throw new Error("ADAPTER_UNAVAILABLE"); };
  const result = await runAutonomousBatch({ target: 1, maxCandidates: 1, candidates: [candidate], classifyTopicRisk, stages });
  assert.equal(result.status, "BLOCKED_SYSTEM");
  assert.equal(result.records[0].checkpoint.failedStage, "ASSET_GENERATION_OR_SELECTION");
  assert.match(result.records[0].checkpoint.blockerReason, /ADAPTER_UNAVAILABLE/);
});
test("Resume은 이전 Published Count를 보존하고 Target까지 이어서 처리한다", async () => {
  const blockedCandidate = { topic_key: "resume-target", topic: "resume target", content_type: "PARTS_GUIDE", part_type: "BRAKE", normalized_subject: "BRAKE", normalized_action: "UNDERSTAND", normalized_scope: "GENERIC", risk_level: "LOW", automation_level: "L2" };
  const nextCandidate = { topic_key: "target-three", topic: "target three", content_type: "PARTS_GUIDE", part_type: "TIRE", normalized_subject: "TIRE", normalized_action: "UNDERSTAND", normalized_scope: "GENERIC", risk_level: "LOW", automation_level: "L2" };
  const previousRecords = {
    published: { topicKey: "published", originalTopicKey: "published", state: "PUBLISHED", history: [{ state: "PUBLISHED" }] },
    "resume-target": { topicKey: "resume-target", originalTopicKey: "resume-target", state: "BLOCKED_SYSTEM", history: [{ state: "BLOCKED_SYSTEM" }], candidate: blockedCandidate, classification: classifyTopicRisk(blockedCandidate), visual: { type: "EDUCATIONAL" }, resumeFrom: "ASSET_GENERATION_OR_SELECTION", resumeContext: { gates: passGates(), holdSignals: {} } }
  };
  const result = await runAutonomousBatch({ batchId: "target-preservation", target: 3, maxCandidates: 3, candidates: [blockedCandidate, nextCandidate], previousRecords, retrySystem: true, classifyTopicRisk, stages: passingStages() });
  assert.equal(result.publishedAtStart, 1);
  assert.equal(result.published, 3);
  assert.equal(result.status, "SUCCESS");
});
test("PUBLISHED 재등장은 Target Count를 중복 증가시키지 않는다", async () => {
  const candidate = { topic_key: "already-published", topic: "already", content_type: "PARTS_GUIDE", part_type: "TIRE", normalized_subject: "TIRE", normalized_action: "UNDERSTAND", normalized_scope: "GENERIC", risk_level: "LOW", automation_level: "L2" };
  const previousRecords = { "already-published": { topicKey: "already-published", originalTopicKey: "already-published", state: "PUBLISHED", history: [{ state: "PUBLISHED" }] } };
  const result = await runAutonomousBatch({ target: 2, maxCandidates: 2, candidates: [candidate], previousRecords, classifyTopicRisk, stages: passingStages() });
  assert.equal(result.publishedAtStart, 1);
  assert.equal(result.published, 1);
  assert.equal(result.records[0].skipped, true);
});
test("원인이 해결된 HOLD는 명시적 retry 정책에서만 재처리한다", () => {
  assert.equal(shouldSkipCandidate({ state: "HOLD" }, { retryHold: false }), true);
  assert.equal(shouldSkipCandidate({ state: "HOLD" }, { retryHold: true }), false);
});
test("HOLD_CONTENT는 retry-hold 없이 기존 상태를 유지한다", async () => {
  const candidate = { ...topic15, topic_key: "hold-no-retry", topic: "고유한 브레이크 확인" };
  const previous = { topicKey: candidate.topic_key, originalTopicKey: candidate.topic_key, state: "HOLD_CONTENT", history: [{ state: "HOLD_CONTENT", reason: "FACT_QA_FAILED" }], candidate };
  const result = await runAutonomousBatch({ target: 1, maxCandidates: 1, candidates: [candidate], previousRecords: { [candidate.topic_key]: previous }, classifyTopicRisk, stages: passingStages() });
  assert.equal(result.records[0].state, "HOLD_CONTENT");
  assert.equal(result.records[0].skipped, true);
});
test("retry-hold는 저장된 Content QA 단계부터 재개하고 이전 단계를 재실행하지 않는다", async () => {
  const candidate = { ...topic15, topic_key: "hold-stage-reuse", topic: "고유한 브레이크 확인" };
  const previous = { topicKey: candidate.topic_key, originalTopicKey: candidate.topic_key, state: "HOLD_CONTENT", history: [{ state: "HOLD_CONTENT", reason: "FACT_QA_FAILED" }], candidate, classification: classifyTopicRisk(candidate), visual: { type: "EDUCATIONAL" }, gates: passGates() };
  const calls = [];
  const stages = passingStages();
  stages.PREPARE_HOLD_RETRY = async () => ({ resumeFrom: "CONTENT_QA", context: { gates: passGates(), holdSignals: {} } });
  for (const state of ["RESEARCH", "FACT_QA", "CONTENT_GENERATION", "VISUAL_PLANNING", "ASSET_GENERATION_OR_SELECTION", "CONTENT_QA", "IMAGE_QA"]) stages[state] = async (current, context) => { calls.push(state); return { ...context, gates: passGates(), holdSignals: {} }; };
  const result = await runAutonomousBatch({ target: 1, maxCandidates: 1, candidates: [candidate], previousRecords: { [candidate.topic_key]: previous }, retryHold: true, classifyTopicRisk, stages });
  assert.deepEqual(calls, ["CONTENT_QA", "IMAGE_QA"]);
  assert.equal(result.records[0].state, "PUBLISHED_VERIFIED");
});
test("retry-hold Fact 재평가 후 Evidence가 부족하면 HOLD_CONTENT를 유지한다", async () => {
  const candidate = { ...topic15, topic_key: "hold-still-missing", topic: "고유한 브레이크 확인" };
  const previous = { topicKey: candidate.topic_key, originalTopicKey: candidate.topic_key, state: "HOLD_CONTENT", history: [{ state: "HOLD_CONTENT", reason: "CRITICAL_CLAIM_UNVERIFIED" }], candidate };
  const stages = passingStages();
  stages.PREPARE_HOLD_RETRY = async () => ({ resumeFrom: "FACT_QA", context: { gates: {}, holdSignals: {} } });
  stages.FACT_QA = async (current, context) => ({ ...context, gates: { ...passGates(), criticalFact: "UNVERIFIED", criticalUnverifiedClaim: "PRESENT" }, holdSignals: { CRITICAL_CLAIM_UNVERIFIED: true } });
  const result = await runAutonomousBatch({ target: 1, maxCandidates: 1, candidates: [candidate], previousRecords: { [candidate.topic_key]: previous }, retryHold: true, classifyTopicRisk, stages });
  assert.equal(result.records[0].state, "HOLD_CONTENT");
  assert.equal(result.records[0].retryFrom, "FACT_QA");
});
test("retry-hold에서도 기존 Published Count와 PUBLISHED/DROP skip을 보존한다", async () => {
  const published = { topic_key: "published-retry", topic: "published", content_type: "PARTS_GUIDE", part_type: "TIRE", risk_level: "LOW", automation_level: "L2" };
  const dropped = { ...published, topic_key: "drop-retry" };
  const hold = { ...topic15, topic_key: "hold-retry-target", topic: "고유한 브레이크 확인" };
  const previousRecords = {
    [published.topic_key]: { topicKey: published.topic_key, originalTopicKey: published.topic_key, state: "PUBLISHED", history: [{ state: "PUBLISHED" }] },
    [dropped.topic_key]: { topicKey: dropped.topic_key, originalTopicKey: dropped.topic_key, state: "DROP", history: [{ state: "DROP" }] },
    [hold.topic_key]: { topicKey: hold.topic_key, originalTopicKey: hold.topic_key, state: "HOLD_CONTENT", history: [{ state: "HOLD_CONTENT", reason: "FACT_QA_FAILED" }], candidate: hold }
  };
  const stages = passingStages(); stages.PREPARE_HOLD_RETRY = async () => ({ resumeFrom: "CONTENT_QA", context: { gates: passGates(), holdSignals: {} } });
  const result = await runAutonomousBatch({ target: 2, maxCandidates: 3, candidates: [published, dropped, hold], previousRecords, retryHold: true, classifyTopicRisk, stages });
  assert.equal(result.publishedAtStart, 1); assert.equal(result.published, 2); assert.equal(result.status, "SUCCESS");
  assert.equal(result.records.find((record) => record.originalTopicKey === published.topic_key).skipped, true);
  assert.equal(result.records.find((record) => record.originalTopicKey === dropped.topic_key).skipped, true);
});
test("Dry Run은 Production Mutation 없이 계획까지만 계산한다", async () => {
  const result = await runAutonomousBatch({ target: 1, maxCandidates: 1, candidates: [topic15], publishedContents: [topic14], dryRun: true, classifyTopicRisk });
  assert.equal(result.mutation, "NONE");
  assert.equal(result.records[0].state, "DRY_RUN_READY");
});
test("Production Detail QA는 canonical, Article JSON-LD와 mobile viewport를 확인한다", () => {
  const url = "https://fitbike.co.kr/contents/example";
  const checks = inspectDetailHtml(`<html><head><meta name="viewport"><link rel="canonical" href="${url}"><script type="application/ld+json">{"@type":"Article"}</script></head><body>${"내용".repeat(600)}</body></html>`, url);
  assert.deepEqual(checks, { canonical: true, articleJsonLd: true, mobileViewport: true, contentIntegrity: true });
});
test("Queue가 부족하면 검증 데이터가 있는 Model에서 Candidate를 보충한다", () => {
  const candidates = deriveModelCandidates([{ bike_model_id: 1, model_key: "HONDA_TEST125", model_name_en: "TEST125", model_name_ko: null, has_tire_data: true, has_battery_data: false, has_brake_data: true }], new Set(["honda-test125-tire-size-guide"]));
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].topic_key, "honda-test125-brake-pad-guide");
  assert.equal(candidates[0].generated_candidate, true);
});

test("Publish 예외는 실제 PUBLISH 단계로 Checkpoint한다", async () => {
  const candidate = { ...topic15, topic_key: "publish-stage-error", topic: "고유 브레이크 패드 규격 확인" };
  const stages = passingStages();
  stages.PUBLISH = async () => { throw new Error("PUBLISH_ADAPTER_FAILURE"); };
  const result = await runAutonomousBatch({ target: 1, maxCandidates: 1, candidates: [candidate], classifyTopicRisk, stages });
  assert.equal(result.records[0].checkpoint.failedStage, "PUBLISH");
  assert.equal(result.records[0].resumeFrom, "PUBLISH");
});

test("Research와 Image QA 예외도 각 실제 단계로 Checkpoint한다", async () => {
  const candidate = { ...topic15, topic_key: "stage-context", topic: "고유 브레이크 단계 확인" };
  for (const failedStage of ["RESEARCH", "IMAGE_QA"]) {
    const stages = passingStages();
    stages[failedStage] = async () => { throw new Error(`${failedStage}_FAILURE`); };
    const result = await runAutonomousBatch({ target: 1, maxCandidates: 1, candidates: [candidate], classifyTopicRisk, stages });
    assert.equal(result.records[0].checkpoint.failedStage, failedStage);
  }
});

test("기존 Canary의 잘못된 Publish Checkpoint를 retry-hold PUBLISH 재개로 복원한다", () => {
  const record = normalizeLegacyRetryHoldPublishRecord({
    topicKey: "brake-pad-pre-replacement-check",
    originalTopicKey: "brake-pad-pre-replacement-check",
    state: "BLOCKED_SYSTEM",
    history: [{ state: "BLOCKED_SYSTEM", reason: "STAGE_ERROR:INVALID_STATUS_TRANSITION:BLOCKED->REVIEW_REQUIRED", resumeFrom: "RESEARCH" }],
    checkpoint: { failedStage: "RESEARCH", blockerReason: "STAGE_ERROR:INVALID_STATUS_TRANSITION:BLOCKED->REVIEW_REQUIRED" }
  });
  assert.equal(record.state, "HOLD_CONTENT");
  assert.equal(record.retryFrom, "PUBLISH");
  assert.equal(record.holdCheckpoint.failedStage, "PUBLISH");
});

test("retry-hold PUBLISH 재개는 이전 QA 단계를 실행하지 않고 게시를 계속한다", async () => {
  const candidate = { ...topic15, topic_key: "publish-resume", topic: "고유 브레이크 게시 재개" };
  const previous = { topicKey: candidate.topic_key, originalTopicKey: candidate.topic_key, state: "HOLD_CONTENT", history: [{ state: "HOLD_CONTENT", reason: "RETRY_HOLD_REGISTRY_RESTORE_REQUIRED" }], candidate, classification: classifyTopicRisk(candidate), visual: { type: "EDUCATIONAL" }, retryFrom: "PUBLISH" };
  const calls = [];
  const stages = passingStages();
  stages.PREPARE_HOLD_RETRY = async () => ({ resumeFrom: "PUBLISH", context: { gates: passGates(), holdSignals: {} } });
  for (const state of ["RESEARCH", "FACT_QA", "CONTENT_GENERATION", "VISUAL_PLANNING", "ASSET_GENERATION_OR_SELECTION", "CONTENT_QA", "IMAGE_QA"]) stages[state] = async () => { calls.push(state); throw new Error("MUST_NOT_RUN"); };
  stages.PUBLISH = async () => { calls.push("PUBLISH"); return { status: "PUBLISHED" }; };
  stages.PRODUCTION_QA = async () => { calls.push("PRODUCTION_QA"); return { status: "PASS" }; };
  const result = await runAutonomousBatch({ target: 1, maxCandidates: 1, candidates: [candidate], previousRecords: { [candidate.topic_key]: previous }, retryHold: true, classifyTopicRisk, stages });
  assert.deepEqual(calls, ["PUBLISH", "PRODUCTION_QA"]);
  assert.equal(result.records[0].state, "PUBLISHED_VERIFIED");
});

function productionQaCheckpoint(candidate, context = { gates: passGates(), holdSignals: {}, publish: { status: "PUBLISHED" } }) {
  return {
    topicKey: candidate.topic_key,
    originalTopicKey: candidate.topic_key,
    state: "BLOCKED_SYSTEM",
    history: [{ state: "PUBLISH" }, { state: "PRODUCTION_QA" }, { state: "BLOCKED_SYSTEM", reason: "STAGE_ERROR:PRODUCTION_QA_RETRY_TIMEOUT", resumeFrom: "PRODUCTION_QA" }],
    candidate,
    classification: classifyTopicRisk(candidate),
    visual: { type: "EDUCATIONAL" },
    resumeFrom: "PRODUCTION_QA",
    resumeContext: context,
    checkpoint: { failedStage: "PRODUCTION_QA", blockerType: "BLOCKED_SYSTEM", retryEligible: true, resumeEligible: true }
  };
}

test("Publish 성공 뒤 Production QA 예외는 PRODUCTION_QA 단계로 Checkpoint한다", async () => {
  const candidate = { ...topic15, topic_key: "production-qa-stage" };
  const stages = passingStages();
  stages.PRODUCTION_QA = async () => { throw new Error("PRODUCTION_QA_RETRY_TIMEOUT"); };
  const result = await runAutonomousBatch({ target: 1, maxCandidates: 1, candidates: [candidate], classifyTopicRisk, stages });
  assert.equal(result.records[0].checkpoint.failedStage, "PRODUCTION_QA");
  assert.equal(result.records[0].resumeFrom, "PRODUCTION_QA");
});

test("PRODUCTION_QA Resume은 Publish를 건너뛰고 존재 확인과 QA만 실행한다", async () => {
  const candidate = { ...topic15, topic_key: "production-qa-resume" };
  const calls = [];
  const stages = passingStages();
  stages.PUBLISH = async () => { calls.push("PUBLISH"); throw new Error("MUST_NOT_RUN"); };
  stages.PREPARE_PRODUCTION_QA_RESUME = async (current, context) => { calls.push("EXISTENCE_CHECK"); return { ...context, publish: { status: "PUBLISHED" } }; };
  stages.PRODUCTION_QA = async () => { calls.push("PRODUCTION_QA"); return { status: "PASS" }; };
  const previous = productionQaCheckpoint(candidate);
  const result = await runAutonomousBatch({ batchId: "canary-3-6898291", target: 3, maxCandidates: 3, candidates: [candidate], previousRecords: { [candidate.topic_key]: previous }, retrySystem: true, classifyTopicRisk, stages });
  assert.deepEqual(calls, ["EXISTENCE_CHECK", "PRODUCTION_QA"]);
  assert.equal(result.records[0].state, "PUBLISHED_VERIFIED");
  assert.equal(result.records[0].checkpoint, undefined);
  assert.equal(result.published, 1);
  assert.equal(result.status, "PARTIAL");
});

test("Production Content가 없으면 Publish 없이 PRODUCTION_QA BLOCKED_SYSTEM을 유지한다", async () => {
  const candidate = { ...topic15, topic_key: "production-missing" };
  let publishCalls = 0;
  const stages = passingStages();
  stages.PUBLISH = async () => { publishCalls += 1; return { status: "PUBLISHED" }; };
  stages.PREPARE_PRODUCTION_QA_RESUME = async () => { throw new Error("PRODUCTION_QA_RESUME_PUBLISHED_CONTENT_MISSING"); };
  const previous = productionQaCheckpoint(candidate);
  const result = await runAutonomousBatch({ target: 1, maxCandidates: 1, candidates: [candidate], previousRecords: { [candidate.topic_key]: previous }, retrySystem: true, classifyTopicRisk, stages });
  assert.equal(result.status, "BLOCKED_SYSTEM");
  assert.equal(result.records[0].checkpoint.failedStage, "PRODUCTION_QA");
  assert.match(result.records[0].checkpoint.blockerReason, /PUBLISHED_CONTENT_MISSING/);
  assert.equal(publishCalls, 0);
});

test("완료된 PRODUCTION_QA Resume 반복 실행은 게시와 Counter를 중복시키지 않는다", async () => {
  const candidate = { ...topic15, topic_key: "production-qa-idempotent" };
  let mutationCalls = 0;
  const stages = passingStages();
  stages.PUBLISH = async () => { mutationCalls += 1; return { status: "PUBLISHED" }; };
  const first = await runAutonomousBatch({ target: 1, maxCandidates: 1, candidates: [candidate], previousRecords: { [candidate.topic_key]: productionQaCheckpoint(candidate) }, retrySystem: true, classifyTopicRisk, stages });
  const publishedRecord = first.records[0];
  const second = await runAutonomousBatch({ target: 2, maxCandidates: 2, candidates: [candidate], previousRecords: { [candidate.topic_key]: publishedRecord }, retrySystem: true, classifyTopicRisk, stages });
  assert.equal(first.published, 1);
  assert.equal(second.publishedAtStart, 1);
  assert.equal(second.published, 1);
  assert.equal(second.records[0].skipped, true);
  assert.equal(mutationCalls, 0);
});

test("PRODUCTION_QA Resume 완료 뒤 남은 Target의 다음 Candidate를 계속 처리한다", async () => {
  const resumed = { ...topic15, topic_key: "brake-specification-check" };
  const next = { ...topic15, topic_key: "next-candidate", topic: "next unique topic", normalized_subject: "NEXT_UNIQUE" };
  const calls = [];
  const stages = passingStages();
  stages.PREPARE_PRODUCTION_QA_RESUME = async (candidate, context) => { calls.push(`VERIFY:${candidate.topic_key}`); return { ...context, publish: { status: "PUBLISHED" } }; };
  stages.RESEARCH = async (candidate) => { calls.push(`RESEARCH:${candidate.topic_key}`); return { gates: passGates(), holdSignals: {} }; };
  const result = await runAutonomousBatch({ batchId: "canary-3-6898291", target: 2, maxCandidates: 2, candidates: [resumed, next], previousRecords: { [resumed.topic_key]: productionQaCheckpoint(resumed) }, retrySystem: true, classifyTopicRisk, stages });
  assert.equal(result.published, 2);
  assert.equal(result.status, "SUCCESS");
  assert.deepEqual(calls, ["VERIFY:brake-specification-check", "RESEARCH:next-candidate"]);
});

test("Production 존재 검증은 receipt의 Content ID와 Registry Published 연결을 모두 요구한다", async () => {
  const candidate = { ...topic15, topic_key: "brake-specification-check" };
  const context = { contentDirectory: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../content-work/brake-specification-check") };
  const validRow = { content_id: 11, content_key: "brake-specification-check", is_active: true, published_at: "2026-08-27T00:00:00Z", registry_status: "PUBLISHED", registry_content_id: 11 };
  const verified = await verifyPublishedContentForProductionQaResume(candidate, context, async () => [validRow]);
  assert.equal(verified.productionExistence.status, "PASS");
  await assert.rejects(() => verifyPublishedContentForProductionQaResume(candidate, context, async () => [{ ...validRow, registry_status: "APPROVED" }]), /PUBLISHED_CONTENT_MISSING/);
});

test("Publish PASS와 immediate Production QA PASS는 PUBLISHED_VERIFIED가 된다", async () => {
  const candidate = { ...topic15, topic_key: "immediate-verified", topic: "immediate verified" };
  const result = await runAutonomousBatch({ target: 1, maxCandidates: 1, candidates: [candidate], classifyTopicRisk, stages: passingStages() });
  assert.equal(result.records[0].state, "PUBLISHED_VERIFIED");
  assert.equal(result.verified, 1);
  assert.equal(result.pendingQa, 0);
});

test("Cache pending은 PUBLISHED_PENDING_QA로 남고 다음 Candidate를 계속 처리한다", async () => {
  const pending = { ...topic15, topic_key: "cache-pending", topic: "cache pending" };
  const next = { ...topic15, topic_key: "pending-next", topic: "pending next", normalized_subject: "NEXT" };
  const stages = passingStages();
  stages.PRODUCTION_QA = async (candidate) => candidate.topic_key === pending.topic_key ? { status: "PRODUCTION_QA_PENDING", checks: { sitemapExposure: false } } : { status: "PASS" };
  const result = await runAutonomousBatch({ target: 2, maxCandidates: 2, candidates: [pending, next], classifyTopicRisk, stages });
  assert.equal(result.records.find((record) => record.originalTopicKey === pending.topic_key).state, "PUBLISHED_PENDING_QA");
  assert.equal(result.records.find((record) => record.originalTopicKey === next.topic_key).state, "PUBLISHED_VERIFIED");
  assert.equal(result.pendingQa, 1);
  assert.equal(result.verified, 1);
});

test("Pending QA가 나중에 PASS하면 Publish 없이 Verified Counter를 한 번 증가시킨다", async () => {
  const candidate = { ...topic15, topic_key: "pending-later-pass", topic: "pending later pass" };
  const previous = { topicKey: candidate.topic_key, originalTopicKey: candidate.topic_key, state: "PUBLISHED_PENDING_QA", history: [{ state: "PUBLISHED_PENDING_QA" }], candidate, classification: classifyTopicRisk(candidate), visual: { type: "EDUCATIONAL" }, qaContext: { publish: { status: "PUBLISHED" }, gates: passGates(), holdSignals: {} } };
  let publishCalls = 0;
  const stages = passingStages();
  stages.PUBLISH = async () => { publishCalls += 1; return { status: "PUBLISHED" }; };
  const first = await runAutonomousBatch({ target: 1, maxCandidates: 1, candidates: [candidate], previousRecords: { [candidate.topic_key]: previous }, classifyTopicRisk, stages });
  const second = await runAutonomousBatch({ target: 2, maxCandidates: 2, candidates: [candidate], previousRecords: { [candidate.topic_key]: first.records[0] }, classifyTopicRisk, stages });
  assert.equal(first.records[0].state, "PUBLISHED_VERIFIED");
  assert.equal(first.verified, 1);
  assert.equal(second.verified, 1);
  assert.equal(publishCalls, 0);
});

function qaFetcher({ directoryVisible = true, sitemapVisible = true } = {}) {
  return async (url, options = {}) => {
    if (options.method === "HEAD") return { response: new Response(null, { status: 200, headers: { "content-type": "image/webp" } }), text: "" };
    if (url.endsWith("/contents")) return { response: new Response(), text: directoryVisible ? '<a href="/contents/example">example</a>' : "empty" };
    if (url.endsWith("/sitemap.xml")) return { response: new Response(), text: sitemapVisible ? "https://fitbike.co.kr/contents/example" : "empty" };
    if (url.endsWith("/robots.txt")) return { response: new Response(), text: "User-agent: *\nAllow: /" };
    return { response: new Response(), text: '<meta name="viewport"><link rel="canonical" href="https://fitbike.co.kr/contents/example"><script type="application/ld+json">{"@type":"Article"}</script>' + "content".repeat(200) };
  };
}

test("Sitemap cache 미반영은 BLOCKED_SYSTEM이 아닌 PRODUCTION_QA_PENDING이다", async () => {
  const result = await runChecks({ origin: "https://fitbike.co.kr", contentKey: "example", assetUrls: ["asset"], fetcher: qaFetcher({ sitemapVisible: false }) });
  assert.equal(result.status, "PRODUCTION_QA_PENDING");
});

test("Contents ISR 미반영은 BLOCKED_SYSTEM이 아닌 PRODUCTION_QA_PENDING이다", async () => {
  const result = await runChecks({ origin: "https://fitbike.co.kr", contentKey: "example", assetUrls: ["asset"], fetcher: qaFetcher({ directoryVisible: false }) });
  assert.equal(result.status, "PRODUCTION_QA_PENDING");
});

test("Production QA Runtime 예외만 BLOCKED_SYSTEM으로 중단한다", async () => {
  const candidate = { ...topic15, topic_key: "qa-runtime-failure", topic: "qa runtime failure" };
  const stages = passingStages();
  stages.PRODUCTION_QA = async () => { throw new Error("PRODUCTION_HTTP_RUNTIME_DOWN"); };
  const result = await runAutonomousBatch({ target: 1, maxCandidates: 1, candidates: [candidate], classifyTopicRisk, stages });
  assert.equal(result.status, "BLOCKED_SYSTEM");
  assert.equal(result.records[0].checkpoint.failedStage, "PRODUCTION_QA");
});

test("실제 Content 무결성 실패는 PRODUCTION_QA_FAILED이고 Batch System Block이 아니다", async () => {
  const candidate = { ...topic15, topic_key: "qa-final-failure", topic: "qa final failure" };
  const stages = passingStages();
  stages.PRODUCTION_QA = async () => ({ status: "PRODUCTION_QA_FAILED", checks: { detailHttp200: false } });
  const result = await runAutonomousBatch({ target: 1, maxCandidates: 1, candidates: [candidate], classifyTopicRisk, stages });
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.records[0].state, "PRODUCTION_QA_FAILED");
});

test("Pending Limit에 도달하기 전에는 Pending Candidate가 있어도 다음 Candidate를 게시할 수 있다", async () => {
  const candidates = ["one", "two", "three"].map((key) => ({ ...topic15, topic_key: `pending-${key}`, topic: `pending ${key}`, normalized_subject: key }));
  const stages = passingStages();
  stages.PRODUCTION_QA = async () => ({ status: "PRODUCTION_QA_PENDING", checks: { directoryExposure: false } });
  const result = await runAutonomousBatch({ target: 3, maxCandidates: 3, candidates, classifyTopicRisk, stages, maxPendingQa: 2 });
  assert.equal(result.considered, 2);
  assert.equal(result.pendingQa, 2);
  assert.equal(result.records.some((record) => record.originalTopicKey === "pending-three"), false);
});

test("현재 CBR650R PRODUCTION_QA Checkpoint는 재Publish 없이 Pending QA로 정규화한다", () => {
  const record = normalizeProductionQaRecord({ topicKey: "cbr650r-tire-size-guide", originalTopicKey: "cbr650r-tire-size-guide", state: "BLOCKED_SYSTEM", history: [], resumeFrom: "PRODUCTION_QA", resumeContext: { publish: { status: "PUBLISHED", contentKey: "cbr650r-tire-specification", database: { contentId: 12 } } }, checkpoint: { failedStage: "PRODUCTION_QA" } });
  assert.equal(record.state, "PUBLISHED_PENDING_QA");
  assert.equal(record.qaContext.publish.database.contentId, 12);
  assert.equal(record.checkpoint, undefined);
});

test("현재 PCX125 State Machine Block은 공통 HOLD Resume으로 복원한다", () => {
  const record = normalizeHoldResumeStateMachineRecord({ topicKey: "pcx125-brake-pad-guide", originalTopicKey: "pcx125-brake-pad-guide", state: "BLOCKED_SYSTEM", history: [{ state: "HOLD_CONTENT", reason: "CRITICAL_CLAIM_UNVERIFIED" }, { state: "RESEARCH", resumed: true }], checkpoint: { failedStage: "RESEARCH", blockerReason: "STAGE_ERROR:AUTOMATION_ATTEMPT_LIMIT_OR_INVALID_STATE" }, resumeFrom: "RESEARCH" });
  assert.equal(record.state, "HOLD_CONTENT");
  assert.equal(record.retryFrom, "RESEARCH");
  assert.equal(record.holdCheckpoint.retryEligible, true);
  assert.equal(record.checkpoint, undefined);
});

test("FACT QA HOLD Registry 준비 후 Research는 PLANNED-only Action을 반복하지 않는다", async () => {
  const calls = [];
  const stages = createProductionStages({ scriptRunner: async (script, args) => {
    calls.push([script, ...args]);
    if (args.includes("prepare-topic-for-hold-resume")) return { result: "PREPARED", attemptRecorded: true, topic: { status: "GENERATING", attempt_count: 2 } };
    if (script === "generate-content.mjs") return { outputDirectory: "runtime" };
    throw new Error(`UNEXPECTED_CALL:${script}:${args.join(":")}`);
  } });
  const candidate = { ...topic15, topic_key: "pcx125-brake-pad-guide", topic: "PCX125 brake guide" };
  const record = { state: "HOLD_CONTENT", history: [{ state: "HOLD_CONTENT", reason: "CRITICAL_CLAIM_UNVERIFIED" }] };
  const prepared = await stages.PREPARE_HOLD_RETRY(candidate, record);
  await stages.RESEARCH(candidate, { ...prepared.context, classification: classifyTopicRisk(candidate), record });
  assert.equal(prepared.resumeFrom, "RESEARCH");
  assert.equal(calls.filter((call) => call.includes("record-automation-attempt")).length, 0);
  assert.equal(calls.filter((call) => call.includes("prepare-topic-for-hold-resume")).length, 1);
});

test("Attempt Limit Terminal HOLD는 다음 Candidate 처리를 계속한다", async () => {
  const terminal = { ...topic15, topic_key: "terminal-hold", topic: "terminal hold" };
  const next = { ...topic15, topic_key: "after-terminal", topic: "after terminal", normalized_subject: "AFTER_TERMINAL" };
  const previous = { topicKey: terminal.topic_key, originalTopicKey: terminal.topic_key, state: "HOLD_CONTENT", history: [{ state: "HOLD_CONTENT", reason: "CRITICAL_CLAIM_UNVERIFIED" }], candidate: terminal };
  const stages = passingStages();
  stages.PREPARE_HOLD_RETRY = async () => ({ terminalHold: true, reason: "AUTOMATION_ATTEMPT_LIMIT", resumeFrom: "RESEARCH" });
  const result = await runAutonomousBatch({ target: 1, maxCandidates: 2, candidates: [terminal, next], previousRecords: { [terminal.topic_key]: previous }, retryHold: true, classifyTopicRisk, stages });
  assert.equal(result.status, "SUCCESS");
  assert.equal(result.records.find((record) => record.originalTopicKey === terminal.topic_key).holdCheckpoint.retryEligible, false);
  assert.equal(result.records.find((record) => record.originalTopicKey === next.topic_key).state, "PUBLISHED_VERIFIED");
});

test("Published, Drop, Pending QA는 HOLD retry 경로에 진입하지 않는다", async () => {
  for (const state of ["PUBLISHED_VERIFIED", "DROP", "PUBLISHED_PENDING_QA"]) {
    const candidate = { ...topic15, topic_key: `skip-${state}`, topic: `skip ${state}` };
    let holdPrepareCalls = 0;
    const stages = passingStages();
    stages.PREPARE_HOLD_RETRY = async () => { holdPrepareCalls += 1; throw new Error("SHOULD_NOT_RUN"); };
    const previous = { topicKey: candidate.topic_key, originalTopicKey: candidate.topic_key, state, history: [{ state }], candidate, classification: classifyTopicRisk(candidate), visual: { type: "EDUCATIONAL" }, qaContext: { publish: { status: "PUBLISHED" }, gates: passGates(), holdSignals: {} } };
    await runAutonomousBatch({ target: 2, maxCandidates: 2, candidates: [candidate], previousRecords: { [candidate.topic_key]: previous }, retryHold: true, classifyTopicRisk, stages });
    assert.equal(holdPrepareCalls, 0);
  }
});
