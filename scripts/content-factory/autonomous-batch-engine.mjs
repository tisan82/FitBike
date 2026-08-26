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

function resumableContext(stageResult) {
  const context = { ...stageResult };
  delete context.record;
  delete context.systemBlock;
  return context;
}

function checkpointSystemBlock(record, candidate, reason, failedStage) {
  record.resumeFrom = failedStage;
  record.checkpoint = {
    candidateId: candidate.content_topic_id ?? null,
    topicId: candidate.content_topic_id ?? null,
    topicKey: candidate.topic_key,
    currentPipelineStage: failedStage,
    completedStages: [...new Set(record.history.map((entry) => entry.state).filter((state) => stateOrder.includes(state) && state !== failedStage))],
    failedStage,
    blockerType: "BLOCKED_SYSTEM",
    blockerReason: reason,
    retryEligible: true,
    resumeEligible: true
  };
  transition(record, "BLOCKED_SYSTEM", { reason, resumeFrom: failedStage });
  return record;
}

async function executeStage(stages, state, candidate, context, record) {
  try {
    return await stages[state](candidate, context);
  } catch (error) {
    if (error && typeof error === "object") {
      error.pipelineStage = state;
      error.pipelineRecord = record;
      error.resumeContext = resumableContext(context);
    }
    throw error;
  }
}

async function processCandidate({ candidate, publishedContents, previousRecord, retryHold, retrySystem, dryRun, classifyTopicRisk, stages }) {
  if (shouldSkipCandidate(previousRecord, { retryHold, retrySystem })) return { ...previousRecord, skipped: true };
  const record = previousRecord ?? { topicKey: candidate.topic_key, originalTopicKey: candidate.topic_key, state: "CANDIDATE", history: [] };
  const resumingSystemBlock = previousRecord?.state === "BLOCKED_SYSTEM" && retrySystem;
  if (resumingSystemBlock) {
    delete record.skipped;
    const workingCandidate = record.candidate ?? candidate;
    const classification = record.classification ?? reclassifyAfterRedefinition(workingCandidate, classifyTopicRisk);
    const visual = record.visual ?? decideVisual(workingCandidate);
    const resumeIndex = stateOrder.indexOf(record.resumeFrom);
    if (resumeIndex < 2 || resumeIndex >= stateOrder.indexOf("RISK_GATE")) throw new Error("INVALID_RESUME_STATE");
    let stageResult = record.resumeContext ?? { gates: {}, holdSignals: {} };
    for (const state of stateOrder.slice(resumeIndex, stateOrder.indexOf("RISK_GATE"))) {
      transition(record, state, state === record.resumeFrom ? { resumed: true } : {});
      stageResult = await executeStage(stages, state, workingCandidate, { ...stageResult, classification, visual, record }, record);
      if (stageResult.systemBlock) {
        record.resumeFrom = stageResult.systemBlock.resumeFrom ?? state;
        record.resumeContext = resumableContext(stageResult);
        return checkpointSystemBlock(record, workingCandidate, stageResult.systemBlock.reason, record.resumeFrom);
      }
      const hold = mandatoryHoldReason(stageResult.holdSignals);
      if (hold) {
        transition(record, "HOLD_CONTENT", { reason: hold });
        record.gates = stageResult.gates;
        delete record.resumeContext;
        delete record.resumeFrom;
        return record;
      }
    }
    delete record.resumeContext;
    delete record.resumeFrom;
    return finalizeCandidate({ record, workingCandidate, classification, visual, stageResult, stages });
  }
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
    stageResult = await executeStage(stages, state, workingCandidate, { ...stageResult, classification, visual, record }, record);
    if (stageResult.systemBlock) {
      record.resumeFrom = stageResult.systemBlock.resumeFrom ?? state;
      record.resumeContext = resumableContext(stageResult);
      return checkpointSystemBlock(record, workingCandidate, stageResult.systemBlock.reason, record.resumeFrom);
    }
    const hold = mandatoryHoldReason(stageResult.holdSignals);
    if (hold) {
      transition(record, "HOLD_CONTENT", { reason: hold });
      record.gates = stageResult.gates;
      return record;
    }
  }
  return finalizeCandidate({ record, workingCandidate, classification, visual, stageResult, stages });
}

async function finalizeCandidate({ record, workingCandidate, classification, visual, stageResult, stages }) {
  transition(record, "RISK_GATE");
  const clearance = evaluateAutoClearance({ riskLevel: classification.riskLevel, gates: stageResult.gates });
  record.gates = stageResult.gates;
  record.autoClearance = clearance;
  if (clearance.decision === "HOLD") {
    transition(record, "HOLD_CONTENT", { reason: clearance.status, failures: clearance.failures });
    return record;
  }
  transition(record, "PUBLISH");
  const publish = await stages.PUBLISH(workingCandidate, { ...stageResult, classification, visual, record });
  if (publish.status !== "PUBLISHED") {
    transition(record, "HOLD_CONTENT", { reason: publish.reason ?? "PUBLISH_FAILED" });
    return record;
  }
  transition(record, "PRODUCTION_QA");
  const productionQa = await stages.PRODUCTION_QA(workingCandidate, { ...stageResult, publish, classification, visual, record });
  if (productionQa.status !== "PASS") {
    transition(record, "HOLD_CONTENT", { reason: "PRODUCTION_INTEGRITY_UNCERTAINTY" });
    return record;
  }
  record.productionQa = productionQa;
  transition(record, "PUBLISHED");
  return record;
}

async function runAutonomousBatch({ batchId = null, target, maxCandidates, candidates, publishedContents = [], previousRecords = {}, retryHold = false, retrySystem = false, dryRun = false, classifyTopicRisk, stages = {}, onRecord = null }) {
  if (!Number.isInteger(target) || target < 1 || !Number.isInteger(maxCandidates) || maxCandidates < target) throw new Error("INVALID_BATCH_LIMIT");
  const recordsByKey = new Map(Object.values(previousRecords).map((record) => [record.originalTopicKey, record]));
  const publishedAtStart = dryRun ? 0 : [...recordsByKey.values()].filter((record) => record.state === "PUBLISHED").length;
  let published = publishedAtStart;
  let readyCandidates = 0;
  let considered = 0;
  let systemBlocked = false;
  for (const candidate of candidates) {
    if ((dryRun ? readyCandidates : published) >= target || considered >= maxCandidates) break;
    considered += 1;
    const wasPublished = previousRecords[candidate.topic_key]?.state === "PUBLISHED";
    let record;
    try {
      record = await processCandidate({ candidate, publishedContents, previousRecord: previousRecords[candidate.topic_key], retryHold, retrySystem, dryRun, classifyTopicRisk, stages });
    } catch (error) {
      const failedStage = error?.pipelineStage ?? "RESEARCH";
      record = error?.pipelineRecord ?? {
        topicKey: candidate.topic_key,
        originalTopicKey: candidate.topic_key,
        state: "CANDIDATE",
        history: []
      };
      record.resumeContext = error?.resumeContext ?? { gates: {}, holdSignals: {} };
      record = checkpointSystemBlock(record, record.candidate ?? candidate, `STAGE_ERROR:${error instanceof Error ? error.message : String(error)}`, failedStage);
    }
    recordsByKey.set(record.originalTopicKey, record);
    if (record.state === "PUBLISHED" && !wasPublished) published += 1;
    if (record.state === "DRY_RUN_READY") readyCandidates += 1;
    if (!dryRun && onRecord) await onRecord(candidate, record, { batchId, target, publishedCount: published, considered });
    if (record.state === "BLOCKED_SYSTEM") {
      systemBlocked = true;
      break;
    }
  }
  const records = [...recordsByKey.values()];
  return {
    status: dryRun ? "DRY_RUN" : systemBlocked ? "BLOCKED_SYSTEM" : published >= target ? "SUCCESS" : "PARTIAL",
    batchId,
    target,
    maxCandidates,
    considered,
    publishedAtStart,
    published,
    readyCandidates,
    mutation: dryRun ? "NONE" : "PRODUCTION",
    records
  };
}

export { processCandidate, runAutonomousBatch, stateOrder };
