# FitBike Content Image Storage Policy

**Status:** Mandatory

## Production rule

All images referenced by active Production content must be served from the managed `content-assets` Supabase Storage bucket. Repository `public/` paths are not valid long-term Production content image delivery paths.

Allowed:
- `content-assets` Storage object paths used by Hero, Thumbnail, and Body blocks.

Not allowed for active content delivery:
- external HTTP/HTTPS hotlinks
- `editorial-reference/**` reference-library paths
- repository-local `/content-guides/**`, `/images/contents/**`, `/content-assets/**` public paths

Local repository assets may exist as source/reference files, but before an active content record uses them they must be copied to `content-assets`, verified, and the DB path changed to the Storage object path.

## Official and external source provenance

Official manufacturer, dealer, marketplace, press, blog, community and workshop assets use the provenance-only policy in `CONTENT.md`.

- Record source type, original page/asset URL, source owner/author, checked time and actual edit history.
- Preserve factual model/year/trim labeling; do not present third-party sources as FitBike-created.
- Do not require, infer or write new rights/license/permission states. The operator manages rights questions and removal/correction separately.
- Convert selected assets to verified content-specific WebP and use the 3-A/3-B staging boundary. Never hotlink original assets.
- Direct use may have no edit plan; editing operations must still obey structural/factual and mobile QA rules.

## Required flow

웹 실사 Real Asset은 `content_pipeline_issue_source_ingest_ticket_v1` → `content-pipeline-source-ingest`를 사용한다. Source Ingest는 현재 Image Claim에 결합된 15분/1회 Ticket을 소비하고, 외부 HTTP(S) 원본의 MIME·용량을 검증한 뒤 ImageMagick WASM으로 WebP를 만들고 SHA-256과 Storage 객체를 재검증한다. 출처 기록만 사용하며 신규 권리 상태를 기록하지 않는다.

생성 이미지나 Worker가 이미 보유한 WebP는 `content_pipeline_issue_asset_upload_ticket_v1` → `content-pipeline-asset-upload` 경로를 사용한다.

### Generated Image Binary Bridge

`content-pipeline-asset-upload`는 현재 Claim과 결합된 1회성 Upload Ticket을 필수로 사용하며 다음 두 입력을 지원한다.

- `multipart/form-data`: 일반 Worker가 WebP File을 직접 전송
- `application/json`: 이미지 생성 Worker가 `imageBase64`로 WebP binary를 전달

JSON 입력 계약:

- `pipelineId`
- `contentKey`
- `assetKey`
- `imageBase64`: data URL prefix를 제외한 순수 WebP Base64
- `replaceExisting`: 재작업에서 기존 동일 asset path를 교체할 때만 `true`

서버는 최대 4MB, RIFF/WEBP signature, Upload Ticket, Storage SHA-256 재다운로드 검증을 수행한다. 기존 객체와 SHA가 다르면 기본적으로 `ASSET_CONFLICT`이며, 유효한 Claim/Ticket을 가진 재작업이 명시적으로 `replaceExisting=true`를 보낸 경우에만 교체한다.

생성 Worker는 생성 결과를 로컬 파일에만 남긴 채 실행을 종료하지 않는다. 생성 직후 WebP를 위 Binary Bridge로 전달하고 Storage 검증까지 같은 실행에서 완료해야 한다.

`source/reference asset → content-specific review → source ingest or asset upload → content-assets Storage → verify object → DB path replacement → Production QA`

## QA gates

Production image QA fails when any active content contains:
- `EXTERNAL_HOTLINK`
- `LOCAL_PUBLIC_IMAGE_REF`
- `REFERENCE_ASSET_DIRECTLY_SERVED`
- `MISSING_STORAGE_OBJECT`
- `BROKEN_IMAGE_RESPONSE`

Completion requires all active content Hero/Thumbnail/Body image references to resolve to managed Storage objects, with zero external hotlinks and zero local public image references.


## Generated Asset DB Handoff

ChatGPT Work 또는 예약 Image Producer의 생성 파일이 로컬 런타임에만 존재하고 외부 HTTP multipart 전송을 사용할 수 없는 경우, 생성 파일을 로컬 경로에 남긴 채 RETRY하지 않는다.

정식 경로:

`Generated WebP → content_pipeline_begin_generated_asset_handoff_v1 → chunk append → one-time Upload Ticket → content-pipeline-asset-upload(handoffId) → content-assets → SHA 재검증 → public HTTP QA → Image DONE`

- Handoff는 현재 PROCESSING Image Claim token과 결합한다.
- 최대 4MB이며 예상 SHA-256, byte 수, chunk 수를 시작 시 고정한다.
- chunk staging 테이블은 service_role 전용이며 anon/authenticated 접근을 허용하지 않는다.
- Asset Upload는 모든 chunk가 존재할 때만 handoff를 한 번 소비한다.
- 조립된 binary의 byte 수 또는 SHA가 다르면 `GENERATED_HANDOFF_INTEGRITY_MISMATCH`로 Storage 반영을 거부한다.
- 성공/실패와 관계없이 소비된 chunk binary는 즉시 삭제한다.
- 재작업에서 기존 object를 바꿀 때만 `replaceExisting=true`를 사용한다.
- 최종 DONE 전에 아래 Final Render Gate를 모두 통과해야 한다. HTTP 200 또는 MIME만으로 DONE 처리하지 않는다.

### Final Render Gate — Mandatory

모든 Hero/Thumbnail/Body Asset은 Image Task DONE 전에 다음 순서를 모두 통과해야 한다.

`Storage SHA → Public HTTP 200 → MIME image/webp → RIFF/WEBP signature → actual WebP decode → DONE`

- Storage에 저장된 binary를 다시 읽어 기록된 SHA-256과 일치해야 한다.
- Public URL은 HTTP 200과 `image/webp`를 반환해야 한다.
- binary header는 RIFF/WEBP signature를 만족해야 한다.
- 실제 WebP decoder가 binary를 열어 width/height를 1px 이상으로 읽어야 한다.
- Production `content-pipeline-image-verify`의 `decode=PASS`를 Final Render Gate 기준으로 사용한다.
- HTTP 200 + `image/webp`라도 decode가 실패하면 `BROKEN_IMAGE_RESPONSE`로 보고 DONE/PASS 처리하지 않는다.
- Source Ingest, Generated Asset Upload, DB Handoff, 재작업 교체 모두 동일 Gate를 적용한다.
- 재작업은 cache-busted Public URL 검증 후 새 SHA와 decode 결과를 Image Run metadata에 기록한다.


## Immutable WebP Storage and Binary Safety

Source Ingest must not trust a remote `Content-Type` header or filename extension as proof of the image binary format.

Required path:

`remote bytes → actual decode → WebP encode → copy encoded bytes out of WASM-owned memory → RIFF/WEBP signature → WebP decode → SHA-256 → immutable Storage object → public Final Render Gate`

Rules:

- `magick-wasm` callback output must be copied (for example `Uint8Array.from(data)`) before the callback returns. Never retain a view into WASM-owned memory.
- Every accepted JPEG/PNG/WebP source is decoded and normalized; remote `image/webp` is not pass-through merely because the server claims that MIME.
- Before Storage upload, require RIFF/WEBP signature and a successful decode with non-zero dimensions.
- Store new/reworked assets at `contents/<contentKey>/<assetKey>-<sha12>.webp`. The SHA suffix must equal the first 12 hex characters of the full stored SHA-256.
- Do not use same-path overwrite as the primary Production path. Supabase CDN propagation can temporarily serve stale bytes after overwrite.
- The legacy `<assetKey>.webp` path may remain for compatibility, but Pipeline manifest, QA, and Publish use the immutable path recorded on the Image Task.
- Final Render Gate requires public HTTP 200, `image/webp`, RIFF/WEBP signature, successful decode, non-zero dimensions, and exact expected SHA-256.
- A Source Ingest response is not sufficient proof of completion. Only the independent Final Render Gate may authorize Image DONE.

## Generated Asset Upload Transport

예약 Image Producer의 생성 자산 업로드는 Worker의 외부 HTTP/DNS 연결에 의존하지 않는다.

1. Worker는 QA PASS WebP를 `content_pipeline_begin_generated_asset_handoff_v1` + chunk RPC로 DB handoff에 적재한다.
2. `content_pipeline_dispatch_generated_asset_upload_v1`가 Postgres `pg_net`으로 `content-pipeline-asset-upload` Edge Function을 호출한다.
3. Edge Function은 WebP/SHA를 검증하고 `contents/{contentKey}/{assetKey}-{sha12}.webp` immutable 경로에 저장한다.
4. `content_pipeline_finalize_dispatched_upload_v1`가 HTTP 응답의 bucket/path/SHA를 확인한 뒤 Image Task를 DONE 처리한다.
5. Worker가 직접 Supabase Function URL로 curl/fetch하는 경로는 fallback으로도 사용하지 않는다.

이 경로의 목적은 ChatGPT/예약 실행 환경별 outbound network 차이로 인한 `UPLOAD_RUNTIME_NETWORK_BLOCKED` 반복을 제거하는 것이다.

## PDF source ingest

공식 매뉴얼·카탈로그 등 PDF가 Visual Contract의 근거/자산으로 지정된 경우 `content-pipeline-source-ingest`가 PDF page를 직접 렌더링할 수 있다.

- 입력 MIME: `application/pdf`
- 필수 입력: `sourcePdfPage` (1-based page number)
- 처리: PDF.js parse → page operator list → SVG → resvg WASM rasterize → ImageMagick WebP normalize
- 최종 저장: 기존과 동일한 `contents/{contentKey}/{assetKey}-{sha12}.webp` immutable path
- 저장 후 Storage 재다운로드 및 SHA-256 일치 검증을 반드시 수행한다.
- PDF 페이지가 기술적으로 정상 렌더됐다는 사실은 Semantic QA PASS를 의미하지 않는다. 현재 Image Contract의 `must_show`, `must_not_show`, user question, mobile requirement를 별도로 검사한다.
- PDF 전체를 임의로 이미지화하지 않는다. Writer/Research가 page를 특정할 수 있으면 Contract에 page를 전달하고, 특정하지 못한 경우 3단계가 공식 문서에서 관련 page를 먼저 확인한다.


## Private Persistent Staging — 3-A / 3-B

신규 분리 실행은 `CONTENT_FACTORY.md`의 3-A/3-B RPC 경로를 사용한다. 기존 Production 직접 Source Ingest/Generated Handoff 경로는 호환 경로로 유지하되 3-A 완료 경로로 사용하지 않는다.

- Private bucket: `content-pipeline-staging`, 최대 4MiB, image/webp. 일반 사용자 Storage policy를 부여하지 않는다.
- Immutable staging path: `<pipeline_id>/<pipeline_image_id>/<full_sha256>.webp`.
- Production path: `content-assets/contents/<contentKey>/<assetKey>-<sha12>.webp`.
- 3-A Final = Staging = Production Storage = 공개 원본 URL의 SHA/bytes/dimensions가 같아야 한다.
- 공개 원본 URL의 identity와 Next.js 최적화 렌더 이미지의 visual QA는 별도 검사다. 최적화 응답의 binary SHA는 재인코딩으로 달라질 수 있다.
- Staging은 public content, OG, sitemap, 고객 DB 이미지 경로에 넣지 않는다.
- 서버는 stage read-back을 decode한 뒤 READY_FOR_UPLOAD를 기록하고, publisher는 공개 원본 URL decode/identity 후에만 DONE을 기록한다.
- Ticket·Claim은 각 단계에 결합한다. 긴 service credential을 Chat artifact나 보고에 노출하지 않는다.
- `25/26` generated handoff/chunks는 binary 전달을 위한 임시 adapter로 재사용한다. 영속적인 단계 간 원본은 Storage이며 DB에 binary를 장기 보관하지 않는다. Staging 기록 전 chunks를 소비/삭제하지 않는다.
- 실패한 Handoff는 같은 Contract에서 인계해 재시도한다. READY_FOR_UPLOAD의 Staging은 Claim과 무관하게 지속된다.
- DONE 전 canonical Staging 삭제 금지. 자동 정리는 아래 Daily Staging Maintenance 규칙을 따른다.

Chat 생성 결과의 binary를 읽고 전송할 수 없는 환경은 이 Storage 구현으로 자동 해결되지 않는다. Binary transport를 Claim 전에 시험하고, 파일명·이미지 설명·추측한 Base64·다른 파일을 업로드하지 않는다. 지원되는 파일 업로드 도구가 없으면 실제 개발 잔여 항목으로 보고한다.

Source-stage capability probes are private `content-pipeline-staging/probes/<jobId>/<sha>.webp` objects. They cannot enter Production/DONE. Real source-stage candidates use `<pipelineId>/<pipelineImageId>/<sha>.webp`, and become canonical only after explicit 3-A QA approval. One-hour signed previews are for worker pixel review; do not publish them. Job receipts store provenance/transform/technical proof without binary DB storage. Preserve candidates required by incomplete images for recovery; terminal probes and obsolete completed-image candidates follow Daily Staging Maintenance.

## Canonical approved visual QA

- 승인된 3-A QA의 유일한 공식 저장 위치는 `21_content_pipeline_image.staging_asset.qa`이다. `imageQa`, `mobileQa`, `imageSeoQa` 및 승인 근거를 여기서 읽는다.
- Chat 및 관리자 화면의 공식 조회는 `content_pipeline_image_handoff_status_v1`을 사용한다. 반환되는 `imageQa`, `mobileQa`, `imageSeoQa`는 위 승인 QA에서만 파생하며 `qaSource=staging_asset.qa`로 명시한다. 누락된 승인 값을 status/DONE 또는 후보 값으로 추정하지 않는다.
- `27_content_pipeline_source_stage_job.result`의 QA 값은 후보 제작 시점의 미승인 상태다. STAGED 후보의 PENDING을 승인 QA로 사용하지 않으며, 승인해도 후보 이력은 덮어쓰지 않는다.
- 승인 저장 RPC는 `staging_asset` 최상위의 중복 후보 QA 키를 제거한다. 기존 Run metadata는 실행 당시의 감사 이력이며 현재 승인 조회를 대신하지 않는다.

## Public HTTPS Source Stage acquisition

Source Stage는 제조사/사진 사이트 도메인 allowlist를 사용하지 않는다. 공개 HTTPS 이미지/PDF의 URL·DNS/IP·리다이렉트 안전성, 허용 MIME/실제 signature, 용량·시간 제한으로 취득 여부를 결정한다. `sourcePageUrl`, `sourceOwner`, 원본/최종 asset URL, source SHA와 확인 시점을 기록한다. 신규 권리 상태·라이선스·사용/편집 허락을 요구하거나 자동 기록하지 않는다. 권리 판단과 문제 자산 처리는 운영자가 담당한다. 기술/품질/출처 검증은 유지한다.

실패로 Claim이 종료되면 PRODUCING/STAGING/UPLOADING/VERIFYING은 현재 작업 단계가 아니므로 `handoff_phase=null`로 정리한다. 재개 지점은 상태·failure_stage·보존된 staging_asset/staging_input/후보 Job에서 판독한다. 명시적인 RETURN_TO_IMAGE_PRODUCTION 라우팅은 유지한다.


## Source Stage Pixel Inspection Bridge — Mandatory

Source Stage의 기술적 `STAGED` 성공은 Semantic/Mobile Image QA PASS가 아니다. 3-A는 승인 전에 **Storage에 실제 저장된 동일 WebP binary**를 시각 검사해야 한다.

정식 경로:

`Source Stage verified WebP → service-role inspection chunks → runtime materialization → SHA-256 재검증 → actual pixel inspection → Image/Mobile/Image SEO QA → approve_source_stage`

- `content-pipeline-source-stage`는 Storage readback 검증을 통과한 **동일 WebP bytes**를 `28_content_pipeline_source_stage_inspection_chunk`에 service-role 전용 Base64 chunk로 materialize한다.
- 3-A는 `content_pipeline_source_stage_inspection_chunk_v1(jobId, seq)`로 모든 chunk를 순서대로 가져와 하나의 WebP로 조립한다.
- 조립 후 byte 수와 SHA-256이 Source Stage result의 `bytes`, `sha256`과 정확히 일치해야 한다. 불일치하면 `STAGING_IDENTITY_MISMATCH`로 승인하지 않는다.
- SHA 일치 binary를 실제 이미지 decoder/vision path로 열어 Contract의 `must_show`, `must_not_show`, `inspection_target`, `mobile_requirement`을 검사한다.
- signed `previewUrl`은 편의용이며 QA의 유일한 transport가 아니다. 실행 환경에서 외부 Storage URL 접근이 막혀도 DB inspection bridge를 사용한다.
- HTTP/MIME/decode metadata만으로 Semantic QA를 PASS 처리하지 않는다.
- 승인 성공 시 해당 Job의 inspection chunk는 즉시 삭제한다.
- inspection table/RPC는 `service_role` 전용이며 `public`, `anon`, `authenticated`에는 권한을 부여하지 않는다.

## Daily Staging Maintenance

- Production `content-assets` is never a deletion target. Daily pg_cron at 01:10 Asia/Seoul invokes `content-pipeline-staging-maintenance` with a short-lived one-time DB ticket, not a long-lived credential.
- Retention is at least 24 elapsed hours, not midnight-based; a daily run normally removes eligible files 24–48 hours later, subject to the 100-object/85-second batch bound. Backlog continues on subsequent runs.
- Completed canonical Staging is eligible only after DONE has been stable for 24 hours, no Claim, Staging proof/SHA match, and Production object exists. The worker downloads Production and Staging and requires both bytes/SHA to equal the canonical receipt, then atomically reserves deletion under the same path lock used by Image activation/approval. A 5-minute lease prevents concurrent reuse; remote requests are bounded to 15 seconds and a 115-second worker deadline. Successful deletion releases its lease; ambiguous failures retain the lease until expiry. Identity failure preserves the object.
- Terminal standalone probes and obsolete STAGED/FAILED candidates attached to DONE/CANCELLED images may expire after 24 hours. Unknown objects, active Jobs, and every candidate/canonical/input linked to an incomplete image (including RETRY/HOLD/READY_FOR_UPLOAD/PROCESSING) remain protected. “Old failed candidate” does not override recovery protection.
- Delete only through the Storage API; verify absence afterwards. Remove inspection chunks only for terminal eligible jobs whose Storage object no longer exists. Retain Image, Job, SHA, QA, provenance and maintenance audit receipts.
- Partial failures are recorded and retried by the next run. No automatic Claim/QA/status/publish action is performed by cleanup.
- `get_visual_maintenance_status` is the operator's read-only MCP entry point for usage and latest runs. Storage metadata inventory and database physical size are measured; monthly egress/function billing usage is not available from these counts and must be checked in the Supabase dashboard.
