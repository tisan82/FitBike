# Native RESULT preflight and error tracing

AUDIT; scope: existing Native audit RESULT validation, same-core record path, bounded structured Edge error tracing, Producer prompt addendum. No reservations, content claims, image generation, Storage or publication changed.

Observed production audit at inspection: REQUEST=17, TRANSPORT_ERROR=6, RESULT=0. This is an observed snapshot, not a full failure count or root cause attribution. Historical rejected writes have no diagnostic trace and are not reconstructed.

DEV: validation-only shared core returns before the existing INSERT; existing record RPC uses that same core with write mode. New authenticated MCP validate_visual_generation_result returns recording eligibility and diagnostics. Edge audit errors return/log traceId and safe metadata, never raw evidence or arbitrary DB text. Unknown write outcomes require same-attempt readback. Strict boolean/string PASS fields match native dispatch screening.

QA: existing Code Quality lint was blocked by an unused table argument in reference-stage.test.mjs; removed only that unused parameter. 60 scoped Node transport/recovery tests passed. Runtime TypeScript used Node's built-in stripping in the local test harness because the full project dependencies were unavailable; repository tests retain the normal typescript import. Existing legacy/raw/nullable SQL regressions and new no-write/replay/owner/closed-receipt/output/type/ACL tests passed in a rolled-back Production transaction. Independent QA findings about unknown write outcomes and boolean mismatch were corrected. No real content pixel PASS or scheduled Native E2E is inferred from fixtures.

Release: migration 20261008040920_native_result_preflight_error_tracing applied. content-pipeline-visual-mcp v35 ACTIVE; deployed files exactly match release payload, and live Producer Capability confirms nativeResultPreflightSupported/nativeAuditErrorTracingSupported. Service-only ACLs verified. Rollback: restore prior record function from parent revision, revoke/drop new validator and core, restore prior MCP files. Never discard audit rows or assets. Error logs use existing retention, not a permanent failure ledger.
