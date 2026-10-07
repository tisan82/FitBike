# Native tracing and preserved-input recovery

AUDIT. Scope: existing Native audit linkage and FAILED-job input recovery. Reuse table27/privateStaging/generatedInput; no separate persist tool/table/bucket, external model, actual content claims, 3B or publish.

Root owns source worker/helper/docs/prompts/release; MCP DEV owns transport/spec/native packet; DB DEV owns service discovery/status/claim/audit migration and rollback SQL; independent QA reviews combined behavior.

Acceptance: actual reported call→output→dispatch attempt binding with truthful unknowns; confirmed stored input survives later failure; current Producer receipt can discover/restage exact admitted input without regeneration; current Hash/owner/semantic rejection/storage bytes guarded; Reviewer never treats input-only as staged/approved. Existing V4/V5 and role recovery retained.

Validation: 88 related Node tests and 5 actual Magick codec/crop/input SHA tests passed; scoped Edge ESLint and diff checks passed. Native input recovery, role recovery and V5 SQL regressions passed in rolled-back Production transactions. Independent QA: PASS_WITH_NOTE, no release blockers. Codec fixture tests are not content semantic QA.

Production deployment: migration 20261007162712_native_preserved_input_recovery; content-pipeline-source-stage v30 and content-pipeline-visual-mcp v34 ACTIVE. Deployed file contents exactly match release files. Live capability confirms nativeDispatchAttemptBindingSupported and failedNativeInputRecoverySupported. Discovery RPC execute permission is service_role only (anon/authenticated denied). Task 16085 was read only; no content Claim/generation or reservation settings were changed by this release.

Actual scheduled Native generation→initial egress and a later scheduled recovery remain separate acceptance and are not inferred from development regression. Deployment does not create a ChatGPT binary bridge or force native runtime context isolation.
