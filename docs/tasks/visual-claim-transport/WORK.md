# 3-A dedicated MCP transport

## Scope
Backend Claim/recovery extended to Source dispatch/recovery/status, exact private image inspection, approval and verified failure close. Existing production statuses/Source Stage v12/3-B remain unchanged. OAuth consent frontend at /oauth/consent added with noindex/robots exclusion. Source provenance only; no rights/licensing gates or AI capability claims.

## Validation
Full Next build/lint/typecheck; Edge strict TS via locally resolved pinned packages; 8 Node MCP HTTP boundary tests; exact same pixel implementation tested with pinned ImageMagick WASM (SHA/decode/dimensions/signature/390px/aspect cap). Production transactional rollback asserts dispatch replay/input conflict/closed rejection and revocation; image2001 stays PENDING and test receiptCount0. Independent QA identified preview expansion and null JSON faults; both fixed.

Deno native dependency fetch is blocked by this workspace network (JSR), so local typecheck used equivalent pinned npm declarations and pixel runtime used Node adapter. No native-Deno or authenticated Chat E2E success is claimed.

## Connection gate
NOT_READY_FOR_CHAT until Supabase OAuth Server/dynamic registration, operator email Secret and account-holder Chat connection are completed and tested. Existing installed Supabase SQL tools do not auto-discover this Edge’s tools. User credentials/consent are never fabricated or replaced with service keys.

## Rollback
Revert this commit/frontend and redeploy previous MCP v2 files; the additive service-only RPC can remain unused. No customer content/image data migrated or overwritten.

MCP v3 deployed ACTIVE. Local browser verification could not start agent-browser daemon (two attempts); no browser visual or interactive OAuth test claimed. Existing Admin/Content API boundary regression8 passed. Production HTTP/auth-discovery and Vercel release checks tracked separately.
