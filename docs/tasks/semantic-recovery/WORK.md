# Semantic recovery and pre-Staging gate

15539 original Source was Honda PlusOne 202606/img05.jpg (handlebar controls), then annotated as engine underside/parking surface. Cross-task contamination is not proven. Retain bytes/history, mark this exact Job/SHA semantically invalid, exclude it from recovery/approval. New rejection RPC keeps the active Claim open for another source.

New creation protocol: preflightOnly candidate without transform annotations → inspect actual PNGs → preStagingQa binding current task/Contract/source Job+SHA and explicit required/forbidden/annotation target checks → production transform. Server validates identity/attestation, not automatic Vision. Existing final QA gates remain mandatory. Preview candidates never enter recovery or approval. New schema fields/tool require connector discovery refresh where cached.

Rollback: prior Edge Function versions and previous DB definitions; no asset deletion or table changes. Validation and operational rejection pending.

Validation: 45 transport/reference/worker-flow tests PASS; real PNG decoded-pixel identity test PASS; transactional SQL verifies current-task/SHA/Contract gate, unannotated preview for annotation-required Contracts, registration without approval, null rejection denial, semantic invalidation excludes recovery/approval while keeping Claim active, and rejected-SHA resurrection denial. Independent QA findings fixed: explicit preview annotation rule, normalized native/composition SHA identity, null evidence, composition TOCTOU SHA pin. No auto-Vision claim.

15539 exact original Job f2589ad3-fe42-47c3-9ef8-d00e528d6629/SHA0d47...3b514 marked semantic FAIL/SOURCE_MISMATCH with actual pixel evidence; bytes preserved. A different execution subsequently staged another Job; that distinct candidate was not invalidated or approved by this development task.

New record/reject tools require discovery refresh in cached Chat connections. No fabricated final PASS workaround. Source-stage v27 and Visual MCP v23 deployed, exact file readback matched. Worker cold start unauthenticated probe returns401 SOURCE_STAGE_TICKET_INVALID. Live get_visual_image_task exposes new protocol and excludes the rejected15539 original Job. Cached current tool registry lacks the new record/reject tools: ordinary3-A tool discovery refresh remains required; full native-runtime3-A approval is not claimed.
