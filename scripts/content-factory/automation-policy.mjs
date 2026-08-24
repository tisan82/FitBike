const autoContentTypes = new Set(["MAINTENANCE", "PARTS_GUIDE"]);
const highRiskPattern = /분해|탈거|전기\s*작업|토크|체결|disassembl|remov(?:e|al)|electrical work|torque/i;
const mediumRiskPattern = /공기압|교체\s*시기|교체\s*주기|수명|점검|pressure|replacement interval|service life|inspection/i;
const numericClaimPattern = /\b\d+(?:\.\d+)?\s*(?:psi|kpa|mm|v|ah|cca|n[·.]?m|°c)\b|교체\s*(?:주기|시기)|수명/i;
const performanceClaimPattern = /성능\s*(?:향상|개선)|접지\s*향상|제동거리|내구성\s*증가|performance improvement|braking distance/i;

function classifyTopicRisk(topic) {
  const text = `${topic.topic ?? ""} ${topic.normalized_subject ?? ""} ${topic.normalized_action ?? ""}`.normalize("NFKC");
  let riskLevel = "LOW";
  let reason = "Generic explanatory or visual-inspection topic without known numeric, model, or safety-critical requirements.";
  if (topic.content_type === "DIY" || highRiskPattern.test(text)) {
    riskLevel = "HIGH";
    reason = "DIY or safety-critical disassembly, electrical, removal, or torque procedure requires strict human review.";
  } else if (topic.content_type === "MODEL_GUIDE" || topic.normalized_scope === "MODEL") {
    riskLevel = "MEDIUM";
    reason = "Model-specific content depends on verified model/year evidence and remains human-reviewed initially.";
  } else if (topic.part_type === "BRAKE" && topic.content_type === "MAINTENANCE") {
    riskLevel = "MEDIUM";
    reason = "Brake maintenance can affect safety even when the topic is inspection-focused.";
  } else if (topic.normalized_subject === "TIRE_PRESSURE" || topic.normalized_subject === "BATTERY_CONDITION" || mediumRiskPattern.test(text)) {
    riskLevel = "MEDIUM";
    reason = "The topic can invite measurements, replacement timing, or diagnostic judgment and requires human review.";
  }
  const automationLevel = riskLevel === "LOW" && autoContentTypes.has(topic.content_type) ? "L2" : "L1";
  return { riskLevel, automationLevel, reason };
}

function resolveExecutionClassification(topic, currentClassification = classifyTopicRisk(topic)) {
  const storedRisk = topic.risk_level;
  const storedAutomation = topic.automation_level;
  if (!["LOW", "MEDIUM", "HIGH"].includes(storedRisk) || !["L1", "L2"].includes(storedAutomation)) {
    return { status: "BLOCKED", reason: "MISSING_STORED_CLASSIFICATION", stored: null, current: currentClassification, drift: true };
  }
  const stored = { riskLevel: storedRisk, automationLevel: storedAutomation };
  const safetyDowngrade = storedAutomation === "L2" && currentClassification.automationLevel === "L1";
  return {
    status: safetyDowngrade ? "SAFETY_REVIEW_REQUIRED" : "READY",
    reason: safetyDowngrade ? "CURRENT_CLASSIFIER_IS_MORE_RESTRICTIVE" : "REGISTRY_SOURCE_OF_TRUTH",
    stored,
    current: currentClassification,
    drift: stored.riskLevel !== currentClassification.riskLevel || stored.automationLevel !== currentClassification.automationLevel,
    execution: safetyDowngrade ? { riskLevel: currentClassification.riskLevel, automationLevel: "L1" } : stored
  };
}

function evaluateAutoPublish({ topic, evidenceStatus, duplicateStatus, qa, images }) {
  const classification = classifyTopicRisk(topic);
  const blockers = [];
  if (classification.automationLevel !== "L2") blockers.push("AUTOMATION_LEVEL_L1");
  if (duplicateStatus !== "DISTINCT_CONTENT") blockers.push(duplicateStatus === "EXACT_DUPLICATE" ? "EXACT_DUPLICATE" : "NEAR_DUPLICATE");
  if (evidenceStatus !== "NOT_REQUIRED") blockers.push(`EVIDENCE_${evidenceStatus}`);
  const requiredQa = ["informationDensity", "semanticDuplication", "proceduralCompleteness", "informationPriority", "subjectCoverage", "crossPartContamination"];
  if (qa.informationDensity !== "GOOD" || requiredQa.slice(1).some((key) => qa[key] !== true) || qa.unsupportedClaims !== 0 || qa.sentenceFragments !== 0) blockers.push("TEXT_QA_FAILED");
  const contentText = `${topic.topic ?? ""} ${qa.text ?? ""}`;
  if (numericClaimPattern.test(contentText) || performanceClaimPattern.test(contentText)) blockers.push("CLAIM_RISK");
  if (!images?.topicRelevance || !images?.noUnexpectedLogo || !images?.noUnsupportedText || !images?.noTechnicalNumber || !images?.noProductImpersonation || !images?.mobileLegibility || images.bodyRequired && (!images.educationalValue || !images.subjectCoverage)) blockers.push("IMAGE_QA_FAILED");
  return { eligible: blockers.length === 0, classification, blockers };
}

export { classifyTopicRisk, evaluateAutoPublish, resolveExecutionClassification };
