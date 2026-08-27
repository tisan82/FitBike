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

const verifiedStates = new Set(["PUBLISHED", "PUBLISHED_VERIFIED"]);

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

function clearResumeCheckpoint(record) {
  delete record.resumeContext;
  delete record.resumeFrom;
  delete record.retryContext;
  delete record.retryFrom;
  delete record.holdCheckpoint;
  delete record.checkpoint;
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

function checkpointContentHold(record, stageResult, reason, failedStage) {
  record.retryFrom = failedStage;
  record.retryContext = resumableContext(stageResult);
  record.holdCheckpoint = {
    failedStage,
    blockerType: "HOLD_CONTENT",
    blockerReason: reason,
    retryEligible: true,
    resumeEligible: true
  };
  transition(record, "HOLD_CONTENT", { reason, retryFrom: failedStage });
  record.gates = stageResult.gates;
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

function finalizeProductionQa(record, productionQa, qaContext) {
  record.productionQa = productionQa;
  if (productionQa.status === "PASS") {
    delete record.qaContext;
    clearResumeCheckpoint(record);
    transition(record, "PUBLISHED_VERIFIED");
  } else if (productionQa.status === "PRODUCTION_QA_PENDING") {
    record.qaContext = resumableContext(qaContext);
    clearResumeCheckpoint(record);
    transition(record, "PUBLISHED_PENDING_QA", { reason: "PRODUCTION_QA_PENDING" });
  } else {
    delete record.qaContext;
    clearResumeCheckpoint(record);
    transition(record, "PRODUCTION_QA_FAILED", { reason: productionQa.status ?? "PRODUCTION_QA_FAILED" });
  }
  return record;
}

async function reconcileProductionQa({ record, workingCandidate, classification, visual, stages }) {
  let context = record.qaContext ?? record.resumeContext ?? { gates: record.gates ?? {}, holdSignals: {} };
  transition(record, "PRODUCTION_QA", { reconciliation: true, publish: "SKIPPED_ALREADY_PUBLISHED" });
  try {
    if (typeof stages.PREPARE_PRODUCTION_QA_RESUME !== "function") throw new Error("PRODUCTION_QA_RESUME_VERIFIER_UNAVAILABLE");
    context = await stages.PREPARE_PRODUCTION_QA_RESUME(workingCandidate, { ...context, classification, visual, record });
  } catch (error) {
    if (error && typeof error === "object") {
      error.pipelineStage = "PRODUCTION_QA";
      error.pipelineRecord = record;
      error.resumeContext = resumableContext(context);
    }
    throw error;
  }
  const qaContext = { ...context, classification, visual, record };
  const productionQa = await executeStage(stages, "PRODUCTION_QA", workingCandidate, qaContext, record);
  return finalizeProductionQa(record, productionQa, qaContext);
}

async function processCandidate({ candidate, publishedContents, previousRecord, retryHold, retrySystem, dryRun, classifyTopicRisk, stages }) {
  if (shouldSkipCandidate(previousRecord, { retryHold, retrySystem })) return { ...previousRecord, skipped: true };
  const record = previousRecord ?? { topicKey: candidate.topic_key, originalTopicKey: candidate.topic_key, state: "CANDIDATE", history: [] };
  const resumingSystemBlock = previousRecord?.state === "BLOCKED_SYSTEM" && retrySystem;
  const resumingContentHold = ["HOLD", "HOLD_CONTENT"].includes(previousRecord?.state) && retryHold;
  const reconcilingProductionQa = previousRecord?.state === "PUBLISHED_PENDING_QA";
  if (reconcilingProductionQa) {
    delete record.skipped;
    const workingCandidate = record.candidate ?? candidate;
    const classification = record.classification ?? reclassifyAfterRedefinition(workingCandidate, classifyTopicRisk);
    const visual = record.visual ?? decideVisual(workingCandidate);
    return reconcileProductionQa({ record, workingCandidate, classification, visual, stages });
  }
  if (resumingSystemBlock || resumingContentHold) {
    delete record.skipped;
    const workingCandidate = record.candidate ?? candidate;
    const classification = record.classification ?? reclassifyAfterRedefinition(workingCandidate, classifyTopicRisk);
    const visual = record.visual ?? decideVisual(workingCandidate);
    const preparedHold = resumingContentHold && stages.PREPARE_HOLD_RETRY ? await stages.PREPARE_HOLD_RETRY(workingCandidate, record) : null;
    const resumeFrom = resumingSystemBlock ? record.resumeFrom : preparedHold?.resumeFrom ?? record.retryFrom ?? "RESEARCH";
    const resumeIndex = stateOrder.indexOf(resumeFrom);
    if (resumeIndex < 2 || resumeIndex > stateOrder.indexOf("PRODUCTION_QA")) throw new Error("INVALID_RESUME_STATE");
    let stageResult = resumingSystemBlock ? record.resumeContext ?? { gates: {}, holdSignals: {} } : preparedHold?.context ?? record.retryContext ?? { gates: {}, holdSignals: {} };
    if (resumeFrom === "PRODUCTION_QA") {
      record.qaContext = stageResult;
      return reconcileProductionQa({ record, workingCandidate, classification, visual, stages });
    }
    if (resumeFrom === "PUBLISH") {
      clearResumeCheckpoint(record);
      return finalizeCandidate({ record, workingCandidate, classification, visual, stageResult, stages, publishResume: true });
    }
    for (const state of stateOrder.slice(resumeIndex, stateOrder.indexOf("RISK_GATE"))) {
      transition(record, state, state === resumeFrom ? { resumed: true, retryType: resumingSystemBlock ? "SYSTEM" : "HOLD_CONTENT" } : {});
      stageResult = await executeStage(stages, state, workingCandidate, { ...stageResult, classification, visual, record }, record);
      if (stageResult.systemBlock) {
        record.resumeFrom = stageResult.systemBlock.resumeFrom ?? state;
        record.resumeContext = resumableContext(stageResult);
        return checkpointSystemBlock(record, workingCandidate, stageResult.systemBlock.reason, record.resumeFrom);
      }
      const hold = mandatoryHoldReason(stageResult.holdSignals);
      if (hold) {
        checkpointContentHold(record, stageResult, hold, state);
        delete record.resumeContext;
        delete record.resumeFrom;
        return record;
      }
    }
    clearResumeCheckpoint(record);
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
      return checkpointContentHold(record, stageResult, hold, state);
    }
  }
  return finalizeCandidate({ record, workingCandidate, classification, visual, stageResult, stages });
}

async function finalizeCandidate({ record, workingCandidate, classification, visual, stageResult, stages, publishResume = false }) {
  transition(record, "RISK_GATE", publishResume ? { reused: true } : {});
  const clearance = evaluateAutoClearance({ riskLevel: classification.riskLevel, gates: stageResult.gates });
  record.gates = stageResult.gates;
  record.autoClearance = clearance;
  if (clearance.decision === "HOLD") {
    transition(record, "HOLD_CONTENT", { reason: clearance.status, failures: clearance.failures });
    return record;
  }
  transition(record, "PUBLISH", publishResume ? { resumed: true, retryType: "HOLD_CONTENT" } : {});
  const publish = await executeStage(stages, "PUBLISH", workingCandidate, { ...stageResult, classification, visual, record }, record);
  if (publish.status !== "PUBLISHED") {
    transition(record, "HOLD_CONTENT", { reason: publish.reason ?? "PUBLISH_FAILED" });
    return record;
  }
  record.publish = publish;
  transition(record, "PUBLISHED_PENDING_QA");
  transition(record, "PRODUCTION_QA");
  const qaContext = { ...stageResult, publish, classification, visual, record };
  const productionQa = await executeStage(stages, "PRODUCTION_QA", workingCandidate, qaContext, record);
  return finalizeProductionQa(record, productionQa, qaContext);
}

async function runAutonomousBatch({ batchId = null, target, maxCandidates, candidates, publishedContents = [], previousRecords = {}, retryHold = false, retrySystem = false, dryRun = false, classifyTopicRisk, stages = {}, onRecord = null, maxPendingQa = 2 }) {
  if (!Number.isInteger(target) || target < 1 || !Number.isInteger(maxCandidates) || maxCandidates < target) throw new Error("INVALID_BATCH_LIMIT");
  const recordsByKey = new Map(Object.values(previousRecords).map((record) => [record.originalTopicKey, record]));
  const publishedAtStart = dryRun ? 0 : [...recordsByKey.values()].filter((record) => verifiedStates.has(record.state)).length;
  let published = publishedAtStart;
  let pendingQa = dryRun ? 0 : [...recordsByKey.values()].filter((record) => record.state === "PUBLISHED_PENDING_QA").length;
  let readyCandidates = 0;
  let considered = 0;
  let systemBlocked = false;
  for (const candidate of candidates) {
    if ((dryRun ? readyCandidates : published) >= target || considered >= maxCandidates) break;
    const previousRecord = previousRecords[candidate.topic_key];
    if (!dryRun && !previousRecord && pendingQa >= maxPendingQa) break;
    considered += 1;
    const wasPublished = verifiedStates.has(previousRecord?.state);
    const wasPending = previousRecord?.state === "PUBLISHED_PENDING_QA";
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
    if (verifiedStates.has(record.state) && !wasPublished) published += 1;
    if (record.state === "PUBLISHED_PENDING_QA" && !wasPending) pendingQa += 1;
    if (wasPending && record.state !== "PUBLISHED_PENDING_QA") pendingQa -= 1;
    if (record.state === "DRY_RUN_READY") readyCandidates += 1;
    if (!dryRun && onRecord) await onRecord(candidate, record, { batchId, target, publishedCount: published, considered });
    if (record.state === "BLOCKED_SYSTEM") {
      systemBlocked = true;
      break;
    }
  }
  const records = [...recordsByKey.values()];
  const actualPublished = records.filter((record) => verifiedStates.has(record.state) || ["PUBLISHED_PENDING_QA", "PRODUCTION_QA_FAILED"].includes(record.state)).length;
  return {
    status: dryRun ? "DRY_RUN" : systemBlocked ? "BLOCKED_SYSTEM" : published >= target ? "SUCCESS" : "PARTIAL",
    batchId,
    target,
    maxCandidates,
    considered,
    publishedAtStart,
    published,
    verified: published,
    pendingQa,
    actualPublished,
    readyCandidates,
    mutation: dryRun ? "NONE" : "PRODUCTION",
    records
  };
}

export { processCandidate, runAutonomousBatch, stateOrder };
