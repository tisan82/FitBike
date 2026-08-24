import assert from "node:assert/strict";
import test from "node:test";

import { classifyTopicRisk, evaluateAutoPublish } from "./automation-policy.mjs";

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
