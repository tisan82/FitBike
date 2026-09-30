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
