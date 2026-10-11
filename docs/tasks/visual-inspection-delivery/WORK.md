# Visual inspection delivery

User scope: develop reliable inspection delivery; keep all automation settings unchanged. AUDIT. Source baseline main 080e8b46426fbc6536e7c1a8c679b7bc3ac35f98 and Edge v35 exact match.

Implemented: bounded array/wrapper normalization; actual host image callback; split canonical/mobile/card/hero/metadata; selected derivatives only; SHA-verified exact-origin download fallback; safe stage/trace/response-size/timing; server-issued runtime probe and operator observations; atomic runtime-bound Claim; same-receipt mutation read-back; worker/runtime/role/Contract/SHA failure circuits; latest per-view pixel gate. Legacy callers remain compatible. An immutable ChatGPT host cannot be patched by FitBike code; clients must use the adapter/protocol after schema refresh.

Independent QA found and fixed stale PASS acceptance, historical SHA/runtime cooldown inheritance, exact replay expiry and missing image signature validation. SQL payloads contain only bounded typed observations; evidence is never stored. No actual semantic PASS is fabricated.

Validation: 75 targeted checks pass (59 MCP transport, 9 adapter, 4 pixel and 3 local SQL tests); real magick-wasm pixel equality/geometry; ESLint on changed code; local PostgreSQL (PGlite 0.3.14) migration/ACL/health/latest-report/circuit tests. Existing RPC boundaries are deterministic stubs in local SQL tests and do not certify Production integration. Full Production transactional regression is provided but not executed successfully. Direct Deno check is blocked fetching jsr package manifest; Edge deployment compilation remains unverified.

Blocker: two rollback-only SQL batches and apply_migration all returned MCP Invalid or expired requestState. Read-back confirms new event table absent and Edge v35 unchanged. GitHub branch creation works. Do not merge/deploy until actual migration/transactional regression and independent release verification succeed.

Release order: fresh main/Edge drift check → apply migration → rolled-back visual-delivery-regression.sql → inspect ACL/advisors → merge validated PR → deploy Edge with all relative dependencies → exact source read-back → WORK probe and same-SHA split/fallback inspection → actual SCHEDULED probe/inspection/handoff → QA_PENDING and own activeClaim=false read-back. No automation update is authorized. Native first connector delivery and preserved-input recovery are separately NOT_VERIFIED.

Rollback: undeployed change requires no runtime rollback. Once deployed restore previous Edge bundle before removing new functions/table; preserve existing Claim/Job/SHA and operator evidence. Do not discard active candidates. Bound receipt fields are additive; legacy RPC ignores them. Production data is never bulk-reset for this release.

Persistent knowledge: no new global rule; feature API contract updated in API.md; pending schema delta in schema README; no policy conflict. Existing fixed 3-minute retry policy gains failure-specific transport cooldown only when the new observation protocol is used; CONTENT_QUEUE.md contains the scoped release rule.
