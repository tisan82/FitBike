import assert from "node:assert/strict";
import test from "node:test";

import { classifyTopicRisk } from "./automation-policy.mjs";
import { runAutonomousBatch } from "./autonomous-batch-engine.mjs";
import { decideVisual, deriveModelCandidates, evaluateAutoClearance, evaluateDuplicate, redefineCandidate, reclassifyAfterRedefinition, shouldSkipCandidate } from "./autonomous-policy.mjs";
import { inspectDetailHtml } from "./production-content-qa.mjs";

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
  assert.equal(result.records[1].state, "PUBLISHED");
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
  assert.equal(result.records[0].state, "PUBLISHED");
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
