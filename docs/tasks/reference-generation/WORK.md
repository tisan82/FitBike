# Reference-first visual generation transport

- Level: AUDIT. Scope: additive 3-A MCP/Source Stage generation transport; no Production publishing or Image completion.
- Root cause: Writer sets `REFERENCE_FIRST_GENERATIVE` but dedicated MCP only ingests original source URLs. Image 2009 is RETRY without Claim/asset.
- Changes: authenticated capability preflight, idempotent generation dispatch, explicit Contract gate, optional fixed OpenAI Images generation/edit provider, safe exact-SHA generated WebP URL ingest, preserved pre-transform input/resume, actual input provenance/duplicate identity, existing pixel inspection/approval, cleanup protection for recovery input.
- No new Image states or automatic QA PASS. Reference-based generation uses verified facts as text; real-photo AI edit supplies actual input binary.
- Validation: automated generation/stage/MCP/maintenance tests; actual pinned WASM transform/decode tests; Production rollback transaction for current Contract permission, real-source prohibition, operation replay/input conflict/running candidate rejection, service-only RPC access; independent QA.
- Production capability probe confirms enabled=false, apiKeyPresent=false, modelPresent=false. Real Provider generation/edit → Staging E2E is BLOCKED pending operator Secrets configuration, not claimed PASS. No API billing call occurred; 2009 remains RETRY with no Claim.
- Native Deno check cannot load JSR manifest in this environment. Node TypeScript check found no non-environment diagnostics; deployed ticket probe confirms worker startup. Provider branch uses mocked responses in automated tests until configured.
- Rollback: restore previous Source Stage/MCP runtime and revoke execute on new generation dispatch RPC. Existing canonical/Production assets and Image statuses remain untouched. Keep job evidence; do not delete recoverable assets.
