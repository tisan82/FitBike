import {
  decideVisual,
  evaluateAutoClearance,
  evaluateDuplicate,
  mandatoryHoldReason,
  redefineCandidate,
  reclassifyAfterRedefinition,
  shouldSkipCandidate
} from "./autonomous-policy.mjs";

const stateOrder = [
  "CANDIDATE",
  "DUPLICATE_CHECK",
  "RESEARCH",
  "FACT_QA",
  "CONTENT_GENERATION",
  "VISUAL_PLANNING",
  "ASSET_GENERATION_OR_SELECTION",
  "CONTENT_QA",
  "IMAGE_QA",
  "RISK_GATE",
  "PUBLISH",
  "PRODUCTION_QA"
];

function transition(record, state, detail = {}) {
  record.state = state;
  record.history.push({ state, ...detail });
}

function defaultDryRunGates() {
  return {
    criticalFact: "PLANNED",
    sourceConflict: "PLANNED",
    criticalUnverifiedClaim: "PLANNED",
    unsupportedNumericClaim: "PLANNED",
    unsupportedServiceLimit: "PLANNED",
    safetyQa: "PLANNED",
    technicalMisrepresentation: "PLANNED",
    productModelMismatch: "PLANNED",
    duplicateIntentGate: "PASS",
    contentQa: "PLANNED",
    imageQa: "PLANNED",
    mandatoryHumanReview: "PLANNED"
  };
}

async function processCandidate({ candidate, publishedContents, previousRecord, retryHold, dryRun, classifyTopicRisk, stages }) {
  if (shouldSkipCandidate(previousRecord, { retryHold })) return { ...previousRecord, skipped: true };
  const record = previousRecord ?? { topicKey: candidate.topic_key, originalTopicKey: candidate.topic_key, state: "CANDIDATE", history: [] };
  transition(record, "DUPLICATE_CHECK");
  let workingCandidate = candidate;
  let duplicate = evaluateDuplicate(workingCandidate, publishedContents);
  record.duplicate = duplicate;
  if (duplicate.decision === "REDEFINE") {
    const redefined = redefineCandidate(workingCandidate);
    if (!redefined) {
      transition(record, "DROP", { reason: "REDEFINITION_UNAVAILABLE" });
      return record;
    }
    record.redefinition = { from: workingCandidate, to: redefined };
    workingCandidate = redefined;
    transition(record, "DUPLICATE_CHECK", { reentry: true });
    duplicate = evaluateDuplicate(workingCandidate, publishedContents);
    record.redefinedDuplicate = duplicate;
    if (duplicate.decision !== "KEEP") {
      transition(record, "DROP", { reason: "REDEFINED_TOPIC_DUPLICATE" });
      return record;
    }
  } else if (duplicate.decision === "DROP") {
    transition(record, "DROP", { reason: duplicate.reason });
    return record;
  }

  const classification = reclassifyAfterRedefinition(workingCandidate, classifyTopicRisk);
  const visual = decideVisual(workingCandidate);
  record.candidate = workingCandidate;
  record.classification = classification;
  record.visual = visual;
  if (dryRun) {
    record.gates = defaultDryRunGates();
    record.expectedFlow = [...stateOrder, "PUBLISHED_OR_HOLD"];
    transition(record, "DRY_RUN_READY", { mutation: "NONE" });
    return record;
  }

  let stageResult = { gates: {}, holdSignals: {} };
  for (const state of stateOrder.slice(2, stateOrder.indexOf("RISK_GATE"))) {
    transition(record, state);
    stageResult = await stages[state](workingCandidate, { ...stageResult, classification, visual, record });
    const hold = mandatoryHoldReason(stageResult.holdSignals);
    if (hold) {
      transition(record, "HOLD", { reason: hold });
      record.gates = stageResult.gates;
      return record;
    }
  }
  transition(record, "RISK_GATE");
  const clearance = evaluateAutoClearance({ riskLevel: classification.riskLevel, gates: stageResult.gates });
  record.gates = stageResult.gates;
  record.autoClearance = clearance;
  if (clearance.decision === "HOLD") {
    transition(record, "HOLD", { reason: clearance.status, failures: clearance.failures });
    return record;
  }
  transition(record, "PUBLISH");
  const publish = await stages.PUBLISH(workingCandidate, { ...stageResult, classification, visual, record });
  if (publish.status !== "PUBLISHED") {
    transition(record, "HOLD", { reason: publish.reason ?? "PUBLISH_FAILED" });
    return record;
  }
  transition(record, "PRODUCTION_QA");
  const productionQa = await stages.PRODUCTION_QA(workingCandidate, { ...stageResult, publish, classification, visual, record });
  if (productionQa.status !== "PASS") {
    transition(record, "HOLD", { reason: "PRODUCTION_INTEGRITY_UNCERTAINTY" });
    return record;
  }
  record.productionQa = productionQa;
  transition(record, "PUBLISHED");
  return record;
}

async function runAutonomousBatch({ target, maxCandidates, candidates, publishedContents = [], previousRecords = {}, retryHold = false, dryRun = false, classifyTopicRisk, stages = {}, onRecord = null }) {
  if (!Number.isInteger(target) || target < 1 || !Number.isInteger(maxCandidates) || maxCandidates < target) throw new Error("INVALID_BATCH_LIMIT");
  const records = [];
  let published = 0;
  let readyCandidates = 0;
  let considered = 0;
  for (const candidate of candidates) {
    if ((dryRun ? readyCandidates : published) >= target || considered >= maxCandidates) break;
    considered += 1;
    let record;
    try {
      record = await processCandidate({ candidate, publishedContents, previousRecord: previousRecords[candidate.topic_key], retryHold, dryRun, classifyTopicRisk, stages });
    } catch (error) {
      record = {
        topicKey: candidate.topic_key,
        originalTopicKey: candidate.topic_key,
        state: "HOLD",
        history: [{ state: "HOLD", reason: "STAGE_ERROR", error: error instanceof Error ? error.message : String(error) }]
      };
    }
    records.push(record);
    if (!dryRun && onRecord) await onRecord(candidate, record);
    if (record.state === "PUBLISHED") published += 1;
    if (record.state === "DRY_RUN_READY") readyCandidates += 1;
  }
  return {
    status: dryRun ? "DRY_RUN" : published >= target ? "SUCCESS" : "PARTIAL",
    target,
    maxCandidates,
    considered,
    published,
    readyCandidates,
    mutation: dryRun ? "NONE" : "PRODUCTION",
    records
  };
}

export { processCandidate, runAutonomousBatch, stateOrder };
