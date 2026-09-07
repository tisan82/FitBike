export const CANDIDATE_FAILURE_CODES = new Set([
  "RESEARCH_FAILED",
  "FACT_QA_FAILED",
  "CONTENT_QA_FAILED",
  "IMAGE_QA_FAILED",
  "SOURCE_REVIEW_REQUIRED",
  "DUPLICATE_CONTENT",
  "PRODUCTION_QA_FAILED",
]);

export const GLOBAL_FATAL_CODES = new Set([
  "DATABASE_UNAVAILABLE",
  "AUTH_UNAVAILABLE",
  "STORAGE_UNAVAILABLE",
  "SCHEMA_MISMATCH",
]);

export type FactoryFailureClass = "CANDIDATE_FAILED" | "GLOBAL_FATAL";

export function classifyFactoryFailure(code?: string | null): FactoryFailureClass {
  if (code && GLOBAL_FATAL_CODES.has(code)) return "GLOBAL_FATAL";
  return "CANDIDATE_FAILED";
}

export function shouldContinueFactory(code?: string | null) {
  return classifyFactoryFailure(code) !== "GLOBAL_FATAL";
}
