import assert from "node:assert/strict";
import test from "node:test";

import { classifyTopicRisk, evaluateAutoPublish, resolveExecutionClassification } from "./automation-policy.mjs";

test("classifies low-risk generic guides as L2 candidates", () => {
  assert.deepEqual(classifyTopicRisk({ topic: "TL과 TT 타이어 차이", content_type: "PARTS_GUIDE", part_type: "TIRE", normalized_subject: "TIRE_TUBE_TYPE", normalized_action: "UNDERSTAND", normalized_scope: "GENERIC" }).riskLevel, "LOW");
  assert.equal(classifyTopicRisk({ topic: "TL과 TT 타이어 차이", content_type: "PARTS_GUIDE", part_type: "TIRE", normalized_scope: "GENERIC" }).automationLevel, "L2");
});

test("keeps model, brake maintenance, and DIY topics in L1", () => {
  assert.equal(classifyTopicRisk({ topic: "PCX125 타이어 가이드", content_type: "MODEL_GUIDE", normalized_scope: "MODEL" }).automationLevel, "L1");
  assert.equal(classifyTopicRisk({ topic: "브레이크 패드 마모 확인", content_type: "MAINTENANCE", part_type: "BRAKE", normalized_scope: "GENERIC" }).riskLevel, "MEDIUM");
  assert.equal(classifyTopicRisk({ topic: "브레이크 분해", content_type: "DIY", part_type: "BRAKE", normalized_scope: "GENERIC" }).riskLevel, "HIGH");
});

test("auto publish fails closed unless every gate passes", () => {
  const result = evaluateAutoPublish({ topic: { topic: "TL과 TT 타이어 차이", content_type: "PARTS_GUIDE", part_type: "TIRE", normalized_scope: "GENERIC" }, evidenceStatus: "NOT_REQUIRED", duplicateStatus: "DISTINCT_CONTENT", qa: { informationDensity: "GOOD", semanticDuplication: true, proceduralCompleteness: true, informationPriority: true, subjectCoverage: true, crossPartContamination: true, unsupportedClaims: 0, sentenceFragments: 0, text: "" }, images: { topicRelevance: true, noUnexpectedLogo: true, noUnsupportedText: true, noTechnicalNumber: true, noProductImpersonation: true, mobileLegibility: true, bodyRequired: true, educationalValue: true, subjectCoverage: true } });
  assert.equal(result.eligible, true);
  assert.equal(evaluateAutoPublish({ topic: { topic: "TL과 TT 타이어 차이", content_type: "PARTS_GUIDE", part_type: "TIRE", normalized_scope: "GENERIC" }, evidenceStatus: "BLOCKED", duplicateStatus: "DISTINCT_CONTENT", qa: {}, images: {} }).eligible, false);
});

test("medium risk requires and accepts explicit auto clearance", () => {
  const input = { topic: { topic: "브레이크 패드 상태 확인", content_type: "MAINTENANCE", part_type: "BRAKE", normalized_scope: "GENERIC" }, evidenceStatus: "NOT_REQUIRED", duplicateStatus: "DISTINCT_CONTENT", qa: { informationDensity: "GOOD", semanticDuplication: true, proceduralCompleteness: true, informationPriority: true, subjectCoverage: true, crossPartContamination: true, unsupportedClaims: 0, sentenceFragments: 0, text: "" }, images: { topicRelevance: true, noUnexpectedLogo: true, noUnsupportedText: true, noTechnicalNumber: true, noProductImpersonation: true, mobileLegibility: true, bodyRequired: false } };
  assert.equal(evaluateAutoPublish(input).eligible, false);
  assert.equal(evaluateAutoPublish({ ...input, autoClearance: "AUTO_CLEARANCE_PASS" }).eligible, true);
});

test("uses stored L1 when current classifier returns L2", () => {
  const result = resolveExecutionClassification({ risk_level: "MEDIUM", automation_level: "L1" }, { riskLevel: "LOW", automationLevel: "L2" });
  assert.deepEqual(result.execution, { riskLevel: "MEDIUM", automationLevel: "L1" });
});

test("uses matching stored L2 classification", () => {
  const result = resolveExecutionClassification({ risk_level: "LOW", automation_level: "L2" }, { riskLevel: "LOW", automationLevel: "L2" });
  assert.equal(result.status, "READY");
  assert.equal(result.execution.automationLevel, "L2");
});

test("requires safety review when current classifier is more restrictive", () => {
  const result = resolveExecutionClassification({ risk_level: "LOW", automation_level: "L2" }, { riskLevel: "MEDIUM", automationLevel: "L1" });
  assert.equal(result.status, "SAFETY_REVIEW_REQUIRED");
  assert.equal(result.execution.automationLevel, "L1");
});

test("keeps stored high-risk L1 when current classifier returns medium L1", () => {
  const result = resolveExecutionClassification({ risk_level: "HIGH", automation_level: "L1" }, { riskLevel: "MEDIUM", automationLevel: "L1" });
  assert.deepEqual(result.execution, { riskLevel: "HIGH", automationLevel: "L1" });
});

test("blocks execution when stored classification is missing", () => {
  const result = resolveExecutionClassification({ risk_level: null, automation_level: null }, { riskLevel: "LOW", automationLevel: "L2" });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.execution, undefined);
});
