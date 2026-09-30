# Visual staging split — 2026-09-30

Requested result: ordinary Chat/scheduled Chat can operate independent 3-A/3-B image stages, with persistent assets, inspectable state, and no repeated regeneration on upload failures. No automation was registered.

Implementation: Private content-pipeline-staging; staging_asset/staging_input/handoff_phase on existing image table; READY_FOR_UPLOAD; dedicated 3-A and 3-B claims; claim-bound pg_net upload; staging read-back/WebP decode; unchanged binary promotion; independent public URL SHA/decode; matched run/lease/immutable path guard; admin image status view. Existing legacy transport remains compatible. No API generation provider was added.

Policy: real-source AI edit is separate from full generation; legacy false is mapped to full-generation never; 390px and role-specific representative QA remain human/model pixel review, not automatic decoder results. Ordinary Chat is permitted only when connected tools and binary bridge preflight pass.

Acceptance evidence: Internal unpublished fixture pipeline 33/image 2017 passed READY_FOR_UPLOAD -> fresh publisher claim with no local file input -> DONE. Final SHA e940bcfb201dc1600320ac16ca57423644ddda8827d03120640243e2f85bd7d9, 18550 bytes, 839x595. Separate public download matched. This proves server transport only and is not Semantic QA for IMG_02.

Actual IMG_02 (pipeline 16/image 1766): remains RETRY. Existing public artifact inspected; warning-location identification is insufficient at mobile width. Do not claim it DONE or reuse it as Semantic PASS. General Chat generation -> binary bridge -> READY_FOR_UPLOAD and a separate Chat publisher acceptance still require testing in the intended runtime.

Security: new operations RPCs service_role only, private bucket, one-time tickets, lease binding. Existing generated-handoff verify RPC's anon/authenticated grants were revoked. Existing Auth advisory outside task unchanged.

Validation: ESLint and TypeScript pass; Deno check passes. Default Turbopack build hits runner port restrictions; Webpack build with public Supabase config and NODE_USE_ENV_PROXY=1 passes. Production deployment and affected routes are checked separately after main is updated; a successful local build is not Production completion.

Rollback: keep new columns/bucket/assets as recoverable data. Switch new prompts off and use legacy Producer only for unstaged tasks; do not drop READY_FOR_UPLOAD or staging data. Restore RPC definitions from prior main only after all staged tasks are completed/returned. No destructive automatic cleanup is enabled.

Additional recovery tests: Internal image 2063 deliberately failed before staging and was reclaimed with a new token. Existing handoff/chunks were adopted, yielding READY_FOR_UPLOAD without re-reading/regenerating a local image. Publishing its duplicated SHA was rejected with CONTENT_PIPELINE_DUPLICATE_VISUAL_ASSET; status remained RETRY and staging SHA was preserved. The pipeline remained VISUAL, confirming incomplete/representative coverage does not become IMAGE_READY. Invalid Complete run/path/SHA proof was rejected in a rolled-back fixture transaction. Sixteen existing admin/API/content-quality regression tests pass after scoped expectations were aligned with the existing ticket authorization path and added read-only admin RPC.

## URL/PDF staging bridge follow-up (2026-09-30)

AUDIT scope: no 1766 Claim; reuse existing PDF renderer dependencies and add isolated URL/PDF server -> crop/circle/arrow/WebP -> private Staging. Existing source-ingest Production route unchanged. Added source-stage Edge + service-only job/ticket/status/approval RPCs, two additive migrations. Candidates remain semantic QA PENDING until explicit approval; probes cannot attach to content. Native AI Edit/Generation not implemented or validated.

Evidence: image probe fb326340-b60d-4410-9868-be9acd0533ec SHA 0c6039100fc6d1b221fd5638c69112839dc64311fe04cb38ff3868f8ec6630cb, 27,564 bytes, 755x535. Server upload/read-back and independent signed download/Pillow WebP decode/SHA passed; 390px crop/annotations visible (test coordinates, not actual warning location). Official Honda PDF probe e01da96c-16e6-41c9-adc9-530500ba38c9 and hardened-v2 repeat 75f67bcb-eca0-47c2-af73-4e88b7b34c91: SHA 0f76e914af2424462bb3d7caa5be5c94cf447c423187c4823d4b06af0be17ad5, 4,040 bytes, 503x356, read-back/decode PASS. These are technical fixtures, not customer-quality approval. Blocked host probe cd82ab95-48f8-4c89-9d61-2fdfb47561bb FAILED SOURCE_HOST_NOT_APPROVED.

Independent reviewer found approval reuse/publisher-phase flaw. Fixed with locked current PRODUCING Claim, null canonical staging, corresponding RUNNING run and one-time approved_at. Rolled-back fixture2063 transaction verified real producer approval, publisher rejection and double-approval rejection; 1766 untouched. Same-contract new producer can recover preserved candidate. Header predecode size/format limit added. Security advisors show only expected no-public-policy INFO for this service-only table; no new public RPC permissions. Deno/ESLint + 3 semantic transform/format tests passed. PDF Canvas polyfill warning is inherited renderer behavior; tested SVG render succeeds, arbitrary PDFs/quality are not guaranteed.

Rollback: revoke dispatch/approve RPC execution and disable source-stage Edge; retain private files/job receipts for recovery. No changes to existing customer assets or original DONE images. General Chat must still independently invoke this RPC and read its actual receipt; this Work test does not certify that client runtime. No schedule created. Admin auth setting remains a separate missing configuration.
