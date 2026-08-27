const terminalStates = new Set(["PUBLISHED", "PUBLISHED_VERIFIED", "PRODUCTION_QA_FAILED", "DROP", "HOLD", "HOLD_CONTENT"]);
const criticalHoldReasons = new Set([
  "SOURCE_CONFLICT",
  "FACT_QA_FAILED",
  "CRITICAL_CLAIM_UNVERIFIED",
  "SAFETY_UNCERTAINTY",
  "UNSUPPORTED_NUMERIC_CLAIM",
  "UNSUPPORTED_SERVICE_LIMIT",
  "TECHNICAL_MISREPRESENTATION",
  "PRODUCT_MODEL_MISMATCH",
  "UNRESOLVED_DUPLICATE",
  "UNRESOLVED_SUBJECT_DRIFT",
  "IMAGE_SOURCE_BLOCKED",
  "ASSET_DATA_ISSUE",
  "IMAGE_QA_FAILED",
  "PRODUCTION_INTEGRITY_UNCERTAINTY",
  "MANDATORY_HUMAN_REVIEW"
]);

const partLabels = { TIRE: "타이어", BATTERY: "배터리", BRAKE: "브레이크 패드" };
const actionTerms = {
  REPLACE: /교체|교환|replace/i,
  INSPECT: /점검|확인|inspect|check/i,
  SELECT: /선택|구매|호환|고르|select|compatib/i,
  UNDERSTAND: /이해|규격|구조|표기|understand|specification/i
};

function tokenize(value) {
  return new Set(String(value ?? "").normalize("NFKC").toLowerCase().match(/[a-z0-9가-힣]{2,}/g) ?? []);
}

function overlapRatio(left, right) {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (Math.min(leftTokens.size, rightTokens.size) === 0) return 0;
  let shared = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1;
  return shared / Math.min(leftTokens.size, rightTokens.size);
}

function inferAction(topic) {
  if (Object.hasOwn(actionTerms, topic.normalized_action)) return topic.normalized_action;
  const text = `${topic.topic ?? ""} ${topic.normalized_action ?? ""}`;
  return Object.entries(actionTerms).find(([, pattern]) => pattern.test(text))?.[0] ?? topic.normalized_action ?? "UNDERSTAND";
}

function coverageText(content) {
  const blocks = Array.isArray(content.body_blocks) ? content.body_blocks : [];
  return [content.title, content.summary, ...blocks.flatMap((block) => [block.text, block.title, block.body, ...(block.items ?? [])])].filter(Boolean).join(" ");
}

function evaluateDuplicate(candidate, publishedContents) {
  const candidateAction = inferAction(candidate);
  let best = { decision: "KEEP", overlap: "LOW", duplicateWith: null, score: 0, reason: "DISTINCT_INTENT" };
  for (const content of publishedContents) {
    const samePart = !candidate.part_type || (content.part_types ?? []).includes(candidate.part_type);
    if (!samePart) continue;
    const candidateIsModel = candidate.normalized_scope === "MODEL" || Boolean(candidate.bike_model_key);
    const contentModels = content.model_keys ?? [];
    const sameEntity = candidateIsModel ? contentModels.includes(candidate.bike_model_key) : contentModels.length === 0;
    if (!sameEntity) continue;
    const titleScore = overlapRatio(candidate.topic, `${content.title} ${content.summary ?? ""}`);
    const bodyScore = overlapRatio(candidate.topic, coverageText(content));
    const action = inferAction({ topic: `${content.title} ${content.summary ?? ""}`, normalized_action: content.normalized_action });
    const relatedAction = candidateAction === action || candidateAction === "REPLACE" && /교체|교체 필요|교환/.test(coverageText(content));
    const score = Math.max(titleScore, bodyScore) + (relatedAction ? 0.35 : 0);
    if (score <= best.score) continue;
    const redefinedActionIsDistinct = Boolean(candidate.redefined_from) && candidateAction !== action;
    const high = score >= 0.65 && !redefinedActionIsDistinct;
    best = {
      decision: high ? (canRedefine(candidate) ? "REDEFINE" : "DROP") : "KEEP",
      overlap: high ? "HIGH" : score >= 0.4 ? "MEDIUM" : "LOW",
      duplicateWith: content.content_key,
      score: Number(Math.min(score, 1).toFixed(3)),
      reason: high ? "PUBLISHED_COVERAGE_AND_INTENT_OVERLAP" : "DISTINCT_FOCUSED_VALUE_REMAINS"
    };
  }
  return best;
}

function canRedefine(candidate) {
  return candidate.normalized_action === "REPLACE" || inferAction(candidate) === "REPLACE";
}

function redefineCandidate(candidate) {
  if (!canRedefine(candidate)) return null;
  const part = partLabels[candidate.part_type] ?? "부품";
  const topic = `${part} 구매 전 호환 규격 확인 방법`;
  return {
    ...candidate,
    topic,
    normalized_subject: candidate.part_type === "BRAKE" ? "BRAKE_PAD_SIZE" : `${candidate.part_type ?? "PART"}_COMPATIBILITY`,
    normalized_action: "SELECT",
    redefined_from: candidate.topic_key,
    redefinition_reason: "Separate replacement-necessity inspection from replacement-part compatibility selection."
  };
}

function decideVisual(candidate) {
  const text = `${candidate.topic ?? ""} ${candidate.normalized_subject ?? ""} ${candidate.normalized_action ?? ""}`;
  const productRelated = /구매|호환|제품|모델|규격|SELECT|COMPATIBILITY|SIZE/i.test(text);
  if (candidate.part_type === "BRAKE") return { type: "EDUCATIONAL", brand: null, brandAssetRequired: false };
  if (candidate.part_type === "TIRE" && productRelated) return { type: "PRODUCT_REPRESENTATION", brand: "MAXXIS", brandAssetRequired: true };
  if (candidate.part_type === "BATTERY" && productRelated) return { type: "PRODUCT_REPRESENTATION", brand: "POWEROAD", brandAssetRequired: true };
  if (["TIRE", "BATTERY"].includes(candidate.part_type)) return { type: "MIXED", brand: candidate.part_type === "TIRE" ? "MAXXIS" : "POWEROAD", brandAssetRequired: true };
  return { type: "NO_VISUAL", brand: null, brandAssetRequired: false };
}

function reclassifyAfterRedefinition(candidate, classifyTopicRisk) {
  const classification = classifyTopicRisk(candidate);
  return { ...classification, reEvaluated: Boolean(candidate.redefined_from), source: "REDEFINED_SUBJECT_INTENT_ACTION_SAFETY" };
}

function deriveModelCandidates(models, existingTopicKeys = new Set()) {
  const candidates = [];
  const definitions = [
    { available: "has_tire_data", part: "TIRE", suffix: "tire-size-guide", label: "타이어 규격 가이드", subject: "TIRE_SIZE" },
    { available: "has_battery_data", part: "BATTERY", suffix: "battery-guide", label: "배터리 가이드", subject: "BATTERY" },
    { available: "has_brake_data", part: "BRAKE", suffix: "brake-pad-guide", label: "브레이크 패드 가이드", subject: "BRAKE" }
  ];
  for (const model of models) {
    const baseKey = model.model_key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const modelName = model.model_name_ko || model.model_name_en;
    for (const definition of definitions) {
      const topicKey = `${baseKey}-${definition.suffix}`;
      if (!model[definition.available] || existingTopicKeys.has(topicKey)) continue;
      candidates.push({
        topic_key: topicKey,
        topic: `${modelName} ${definition.label}`,
        content_type: "MODEL_GUIDE",
        part_type: definition.part,
        bike_model_id: model.bike_model_id,
        bike_model_key: model.model_key,
        normalized_subject: definition.subject,
        normalized_action: "UNDERSTAND",
        normalized_scope: "MODEL",
        status: "CANDIDATE",
        priority: 3,
        risk_level: "MEDIUM",
        automation_level: "L1",
        generated_candidate: true
      });
    }
  }
  return candidates;
}

function evaluateAutoClearance({ riskLevel, gates = {} }) {
  const required = {
    criticalFact: "VERIFIED",
    sourceConflict: "NONE",
    criticalUnverifiedClaim: "NONE",
    unsupportedNumericClaim: "NONE",
    unsupportedServiceLimit: "NONE",
    safetyQa: "PASS",
    technicalMisrepresentation: "NONE",
    productModelMismatch: "NONE",
    duplicateIntentGate: "PASS",
    contentQa: "PASS",
    imageQa: "PASS",
    mandatoryHumanReview: "NONE"
  };
  const failures = Object.entries(required).filter(([key, expected]) => gates[key] !== expected).map(([key]) => key);
  if (riskLevel === "HIGH") return { decision: "HOLD", status: "HIGH_RISK_HOLD", failures: ["HIGH_RISK"] };
  if (riskLevel === "MEDIUM" && failures.length > 0) return { decision: "HOLD", status: "AUTO_CLEARANCE_FAILED", failures };
  if (riskLevel === "LOW" && failures.length > 0) return { decision: "HOLD", status: "REQUIRED_GATE_FAILED", failures };
  return { decision: "AUTO_PUBLISH", status: riskLevel === "MEDIUM" ? "AUTO_CLEARANCE_PASS" : "REQUIRED_GATES_PASS", failures: [] };
}

function mandatoryHoldReason(signals = {}) {
  return Object.entries(signals).find(([key, active]) => active && criticalHoldReasons.has(key))?.[0] ?? null;
}

function shouldSkipCandidate(record, { retryHold = false, retrySystem = false } = {}) {
  if (record?.state === "HOLD" || record?.state === "HOLD_CONTENT") return record.holdCheckpoint?.retryEligible === false || !retryHold;
  if (record?.state === "BLOCKED_SYSTEM") return !retrySystem;
  return terminalStates.has(record?.state);
}

export {
  criticalHoldReasons,
  decideVisual,
  deriveModelCandidates,
  evaluateAutoClearance,
  evaluateDuplicate,
  mandatoryHoldReason,
  redefineCandidate,
  reclassifyAfterRedefinition,
  shouldSkipCandidate,
  terminalStates
};
