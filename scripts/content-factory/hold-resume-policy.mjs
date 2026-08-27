const holdResumeMatrix = Object.freeze({
  CRITICAL_CLAIM_UNVERIFIED: { resumeStage: "RESEARCH", reuse: "CANDIDATE", countAttempt: true, retryable: true, reQaStage: "FACT_QA" },
  SOURCE_CONFLICT: { resumeStage: "RESEARCH", reuse: "CANDIDATE", countAttempt: true, retryable: true, reQaStage: "FACT_QA" },
  FACT_QA_FAILED: { resumeStage: "CONTENT_QA", reuse: "RESEARCH_CONTENT_IMAGE", countAttempt: false, retryable: true, reQaStage: "CONTENT_QA" },
  CONTENT_QA_FAILED: { resumeStage: "CONTENT_QA", reuse: "RESEARCH_CONTENT_IMAGE", countAttempt: false, retryable: true, reQaStage: "CONTENT_QA" },
  IMAGE_QA_FAILED: { resumeStage: "ASSET_GENERATION_OR_SELECTION", reuse: "RESEARCH_CONTENT_PLAN", countAttempt: false, retryable: true, reQaStage: "IMAGE_QA" },
  SAFETY_UNCERTAINTY: { resumeStage: "ASSET_GENERATION_OR_SELECTION", reuse: "RESEARCH_CONTENT_PLAN", countAttempt: false, retryable: true, reQaStage: "IMAGE_QA" },
  ASSET_DATA_ISSUE: { resumeStage: "ASSET_GENERATION_OR_SELECTION", reuse: "RESEARCH_CONTENT_PLAN", countAttempt: false, retryable: true, reQaStage: "IMAGE_QA" },
  PRODUCT_MODEL_MISMATCH: { resumeStage: "ASSET_GENERATION_OR_SELECTION", reuse: "RESEARCH_CONTENT_PLAN", countAttempt: false, retryable: true, reQaStage: "IMAGE_QA" },
  IMAGE_SOURCE_BLOCKED: { resumeStage: "ASSET_GENERATION_OR_SELECTION", reuse: "RESEARCH_CONTENT_PLAN", countAttempt: false, retryable: true, reQaStage: "IMAGE_QA" },
  RETRY_HOLD_REGISTRY_RESTORE_REQUIRED: { resumeStage: "PUBLISH", reuse: "ALL_APPROVED_ARTIFACTS", countAttempt: false, retryable: true, reQaStage: "RISK_GATE" },
  UNRESOLVED_DUPLICATE: { resumeStage: null, reuse: "NONE", countAttempt: false, retryable: false, reQaStage: null },
  UNRESOLVED_SUBJECT_DRIFT: { resumeStage: "CONTENT_QA", reuse: "RESEARCH_CONTENT_IMAGE", countAttempt: false, retryable: true, reQaStage: "CONTENT_QA" },
  UNSUPPORTED_NUMERIC_CLAIM: { resumeStage: "CONTENT_QA", reuse: "RESEARCH_CONTENT_IMAGE", countAttempt: false, retryable: true, reQaStage: "CONTENT_QA" },
  UNSUPPORTED_SERVICE_LIMIT: { resumeStage: "CONTENT_QA", reuse: "RESEARCH_CONTENT_IMAGE", countAttempt: false, retryable: true, reQaStage: "CONTENT_QA" },
  TECHNICAL_MISREPRESENTATION: { resumeStage: "CONTENT_QA", reuse: "RESEARCH_CONTENT_IMAGE", countAttempt: false, retryable: true, reQaStage: "CONTENT_QA" },
  PRODUCTION_INTEGRITY_UNCERTAINTY: { resumeStage: null, reuse: "NONE", countAttempt: false, retryable: false, reQaStage: null },
  MANDATORY_HUMAN_REVIEW: { resumeStage: null, reuse: "NONE", countAttempt: false, retryable: false, reQaStage: null },
  AUTO_CLEARANCE_HOLD: { resumeStage: null, reuse: "NONE", countAttempt: false, retryable: false, reQaStage: null },
  AUTO_CLEARANCE_FAILED: { resumeStage: null, reuse: "NONE", countAttempt: false, retryable: false, reQaStage: null },
  HIGH_RISK_HOLD: { resumeStage: null, reuse: "NONE", countAttempt: false, retryable: false, reQaStage: null },
  REQUIRED_GATE_FAILED: { resumeStage: null, reuse: "NONE", countAttempt: false, retryable: false, reQaStage: null }
});

function latestHoldReason(record) {
  return [...(record.history ?? [])].reverse().find((entry) => ["HOLD", "HOLD_CONTENT"].includes(entry.state))?.reason
    ?? record.holdCheckpoint?.blockerReason
    ?? "UNKNOWN_HOLD";
}

function resolveHoldResumePolicy(record) {
  const reason = latestHoldReason(record);
  const policy = holdResumeMatrix[reason] ?? { resumeStage: null, reuse: "NONE", countAttempt: false, retryable: false, reQaStage: null };
  return { reason, ...policy };
}

function isHoldResumeStateMachineFailure(record) {
  return record.state === "BLOCKED_SYSTEM"
    && record.checkpoint?.failedStage === "RESEARCH"
    && String(record.checkpoint?.blockerReason ?? "").includes("AUTOMATION_ATTEMPT_LIMIT_OR_INVALID_STATE")
    && (record.history ?? []).some((entry) => ["HOLD", "HOLD_CONTENT"].includes(entry.state));
}

function auditHoldResume(records, registryRows) {
  const registry = new Map(registryRows.map((row) => [row.topic_key, row]));
  return records.map((record) => {
    const policy = resolveHoldResumePolicy(record);
    const row = registry.get(record.originalTopicKey ?? record.topicKey);
    const validRegistryState = ["BLOCKED", "GENERATING"].includes(row?.status);
    return { topicKey: record.originalTopicKey ?? record.topicKey, reason: policy.reason, registryState: row?.status ?? "MISSING", attemptCount: row?.attempt_count ?? null, retryable: policy.retryable && validRegistryState, terminal: !policy.retryable, resumeStage: policy.resumeStage, artifactReuse: policy.reuse, invalidState: !validRegistryState };
  });
}

export { auditHoldResume, holdResumeMatrix, isHoldResumeStateMachineFailure, latestHoldReason, resolveHoldResumePolicy };
