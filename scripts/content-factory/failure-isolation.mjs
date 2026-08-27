const globalErrorPatterns = [
  /PRODUCTION_(DB|DATABASE)_WRITE_(UNAVAILABLE|FAILED)/,
  /STORAGE_(TOTAL_)?WRITE_(UNAVAILABLE|FAILED)/,
  /(REQUIRED_)?CREDENTIAL(S)?_(MISSING|UNAVAILABLE|LOST)/,
  /WRITE_ACCESS_UNAVAILABLE(_STORAGE)?/,
  /STORAGE_BUCKET_CREATE_FAILED/,
  /PRODUCTION_(ENVIRONMENT|IDENTITY)_(MISSING|INVALID|UNVERIFIED|MISMATCH)/,
  /REGISTRY_GLOBAL_CORRUPTION/,
  /BATCH_(STATE|CHECKPOINT)_(CORRUPT|CORRUPTION|WRITE_FAILED)/,
  /EXACTLY_ONCE_(INTEGRITY_)?(FAILED|FAILURE|UNAVAILABLE)/,
  /(TRANSACTION|COUNTER)_INTEGRITY_(FAILED|FAILURE|UNAVAILABLE)/,
  /GLOBAL_RUNTIME_(FAILED|FAILURE|UNAVAILABLE)/
];

const fixCategoryRules = [
  ["FACT_NORMALIZATION", /NORMALIZATION|NUMERIC/],
  ["RESEARCH", /RESEARCH|SOURCE|EVIDENCE|FACT/],
  ["IMAGE_RUNTIME", /IMAGEGEN|IMAGE_GENERATION|IMAGE_OUTPUT|IMAGE_RUNTIME/],
  ["ASSET", /ASSET|STORAGE_OBJECT/],
  ["CONTENT_QA", /CONTENT_QA|CONTENT_PACKAGE|SUBJECT_DRIFT/],
  ["IMAGE_QA", /IMAGE_QA|VISUAL_QA/],
  ["REGISTRY_STATE", /REGISTRY|STATUS_TRANSITION/],
  ["PUBLISH", /PUBLISH/],
  ["PRODUCTION_QA", /PRODUCTION_QA|SITEMAP|ISR|CDN|CACHE/],
  ["DATA_COVERAGE", /MISSING_RELATION|DATA_COVERAGE|CRITICAL_CLAIM/]
];

function normalizeError(errorOrReason) {
  if (errorOrReason && typeof errorOrReason === "object") {
    const errorCode = errorOrReason.errorCode ?? errorOrReason.code ?? errorOrReason.reason ?? errorOrReason.message ?? "RUNTIME_ERROR";
    return {
      errorCode: String(errorCode),
      rootCause: String(errorOrReason.rootCause ?? errorOrReason.message ?? errorCode),
      explicitScope: errorOrReason.failureScope,
      retryable: errorOrReason.retryable !== false,
      mutationState: errorOrReason.mutationState
    };
  }
  const value = String(errorOrReason ?? "RUNTIME_ERROR");
  return { errorCode: value.replace(/^STAGE_ERROR:/, "") || "RUNTIME_ERROR", rootCause: value, explicitScope: null, retryable: true, mutationState: null };
}

function classifyFailureScope(errorOrReason) {
  const normalized = normalizeError(errorOrReason);
  if (["GLOBAL", "CANDIDATE_LOCAL"].includes(normalized.explicitScope)) return normalized.explicitScope;
  return globalErrorPatterns.some((pattern) => pattern.test(`${normalized.errorCode} ${normalized.rootCause}`.toUpperCase())) ? "GLOBAL" : "CANDIDATE_LOCAL";
}

function resolveFixCategory(errorCode, failedStage) {
  const value = `${errorCode} ${failedStage}`.toUpperCase();
  return fixCategoryRules.find(([, pattern]) => pattern.test(value))?.[0] ?? "OTHER";
}

function createFailureEntry({ candidate, record, error, failedStage, failureType = null }) {
  const normalized = normalizeError(error);
  const failureScope = classifyFailureScope(error);
  return {
    topic: candidate.topic ?? null,
    contentKey: candidate.content_key ?? record.publish?.contentKey ?? record.resumeContext?.generation?.contentKey ?? candidate.topic_key ?? null,
    candidateId: candidate.content_topic_id ?? null,
    failureType: failureType ?? (failureScope === "GLOBAL" ? "GLOBAL_FATAL" : "CANDIDATE_FAILED"),
    failureScope,
    failedStage,
    errorCode: normalized.errorCode,
    rootCause: normalized.rootCause,
    retryable: normalized.retryable,
    checkpoint: record.checkpoint ?? null,
    mutationState: normalized.mutationState ?? (record.publish?.status === "PUBLISHED" ? "PUBLISHED" : "CANDIDATE_MUTATION_STOPPED"),
    fixCategory: resolveFixCategory(normalized.errorCode, failedStage)
  };
}

function groupFailureBacklog(backlog = []) {
  const groups = new Map();
  for (const failure of backlog) {
    const key = `${failure.fixCategory}:${failure.rootCause}`;
    const current = groups.get(key) ?? { fixCategory: failure.fixCategory, rootCause: failure.rootCause, affected: 0, candidates: [] };
    current.affected += 1;
    current.candidates.push(failure.contentKey);
    groups.set(key, current);
  }
  return [...groups.values()];
}

export { classifyFailureScope, createFailureEntry, groupFailureBacklog, resolveFixCategory };
