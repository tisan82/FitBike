# 1·2-stage authoring unification and inspection chunk retirement

## Scope

One authoring run and one final writer artifact with authoringContext; guarded request replay, completion replay and fresh run resume. Existing V5 evidence and Source policy remain. Source Stage stops table-28 chunk writes while preserving canonical Storage verification and final receipt. No schema/table drops, existing-row conversion, schedule change or Supabase prompt update.

## Implementation

- Two service-only RPCs; shared complete/fail/resume fenced by exact pipeline/run identity.
- Existing writer_artifact is canonical; old planning/research columns retain empty-object defaults on new authoring rows.
- Canonical docs own usage: docs/02_framework/API.md and docs/00_ai/CONTENT_FACTORY.md.
- Existing per-stage callers remain compatible; adoption requires calling unified RPCs.

## Validation and release

Independent AUDIT QA verified actual SQL children, real V5 image sync, no duplicate storage/replay writes, stale run denial, service ACL and Source Stage with disabled legacy chunks. Production deployment applies exact guarded migration/history, runs authoring rollback regression, retains existing visual regressions, and deploys Source Stage. Scheduled real-content authoring is not certified by rollback fixtures; scheduled Native/pixel delivery is outside this acceptance scope.

## Operator transition

Start one request UUID and call claim_authoring with null target. Copy packageExecution from its response. Finish evidence-backed planning, research, writer and V5 image briefs in the same chat; call complete_authoring with version=1 and those objects. On response loss replay unchanged identity/payload. On confirmed HOLD/BLOCKED resume with new UUID + same pipelineId and use the new execution identity. Never start a second request to replace a still-running request. Do not overlap old and new authoring instructions for one Topic.
