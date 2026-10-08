// Never log raw evidence, signed URLs, prompts, file capabilities or arbitrary SQL messages.
export function nativeAuditDiagnostic(error: unknown, context: {
  traceId: string; tool: string; requestId?: unknown; attemptId?: unknown; phase?: unknown;
}) {
  const message = error instanceof Error ? error.message : "VISUAL_OPERATION_FAILED";
  const candidate = message.split(":")[0];
  const code = /^[A-Z][A-Z0-9_]{1,100}$/.test(candidate) ? candidate : "VISUAL_OPERATION_FAILED";
  const fieldCandidate = message.split(":")[1]?.trim();
  const field = fieldCandidate && /^(evidence|actualNativeCall|nativeCall)(\.[A-Za-z0-9_]+)*$/.test(fieldCandidate) && fieldCandidate.length <= 200 ? fieldCandidate : null;
  const id = (v: unknown) => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v) ? v : null;
  return { event: "NATIVE_AUDIT_ERROR", traceId: context.traceId, tool: context.tool,
    requestId: id(context.requestId), attemptId: id(context.attemptId),
    phase: ["REQUEST", "RESULT", "TRANSPORT_ERROR"].includes(String(context.phase)) ? context.phase : null,
    stage: context.tool === "validate_visual_generation_result" ? "RESULT_PREFLIGHT" : "NATIVE_AUDIT_RECORD",
    code, field, evidenceRecorded: context.tool === "validate_visual_generation_result" ? false : null,
    evidenceWriteOutcome: context.tool === "validate_visual_generation_result" ? "NO_WRITE_PREFLIGHT" : "UNVERIFIED_REQUIRES_READBACK", nativeAssetDisposition: "PRESERVE_EXISTING_ASSET",
    nextAction: "READ_BACK_MATCHING_ATTEMPT_BEFORE_IDENTICAL_REPLAY",
    serverObservedNativeCall: false };
}
