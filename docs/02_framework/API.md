# FitBike API Guide

**Version:** v1.1\
**Status:** Baseline

## Principles

Service Module Driven / Contract First / Stable Response / Minimal
Exposure.

Public API baseline은 `/api/v1`.

## Tire Detail Route Policy

Customer-facing tire detail routes distinguish a sellable SKU from its shared
model identity.

- SKU Detail: `/tire-detail/[tireProductId]`
- Tire Model Detail: `/tire-detail/model/[tireModelKey]`

The SKU route remains keyed by `04_tire_product.tire_product_id`. The model
route is keyed by `11_tire_model.tire_model_key`; it resolves the model first
and then loads active `04_tire_product` rows through `tire_model_id`. Adding the
model route must not rename, remove, or redirect the existing SKU route.

These are page-route contracts. A new public `/api/v1` endpoint is not implied
by this policy and must be documented separately if one is introduced.

Tire Model Detail resolves active SKUs only as navigation choices. SKU fitment
availability and full specification belong to SKU Detail and must not be
substituted with size-based inference.

`GET /api/v1/tire-products/[tireProductId]` may include additive model linkage,
active fitment count, and other active SKUs for the same `tire_model_id` so the
SKU Detail can provide model navigation and progressive Fitment disclosure.

`GET /api/v1/tire-products/[tireProductId]/fitments` supports that deferred
disclosure. It accepts a positive active Tire Product ID and returns only
active, explicitly mapped Bike Model + Year rows with their mapping position.
It does not perform size-based matching or return inferred fitment.

`GET /api/v1/tire-models/[tireModelKey]/fitments` aggregates only active,
explicit SKU mappings for an active Tire Model. It groups rows by
`bike_model_year_id` and preserves distinct mapping position, stored
`tire_size_full`, and Tire Product identity within each Bike Model-Year. It
does not infer compatibility from size or model identity. The optional positive
`tireProductId` query parameter limits the response to an active SKU belonging
to that Tire Model; omitting it preserves the model-wide response.

## MVP Scope

브랜드, 모델, 연식, Fitment 결과, 상품 연결, 콘텐츠 조회.

## Contract

기존 endpoint/method/response field/type/필수 parameter를 임의 변경하지
않는다. Breaking Change는 승인 필요. 소비 화면에 필요한 필드만 노출한다.
Page component에 API/data business logic을 직접 작성하지 않는다.

## Security

`SUPABASE_SERVICE_ROLE_KEY`를 client에서 사용하지 않는다.
RLS/public-data boundary를 준수한다.

API를 의도적으로 변경하면 관련 API/Service Module 문서를 함께 갱신한다.

## Internal Content Factory API

`/api/internal/content-factory/**`는 공개 API가 아니다. 모든 요청은 서버 전용
`CONTENT_FACTORY_PUBLISH_TOKEN`의 Bearer 인증을 요구하며 응답은 캐시하지 않는다.
Supabase secret/service-role key는 FitBike 서버에만 두고 Factory에는 전달하지 않는다.

| Method | Route | Scope |
|---|---|---|
| `GET` | `/api/internal/content-factory/queue/next` | 다음 `PLANNED` Topic의 콘텐츠 제작 필드만 조회 |
| `PATCH` | `/api/internal/content-factory/queue/{topicKey}` | 허용된 Queue 상태 전환과 제한된 오류 기록 |
| `POST` | `/api/internal/content-factory/assets` | 서버가 결정한 `content-assets/contents/{contentKey}/{assetKey}.webp` 경로에 WebP 업로드 |
| `POST` | `/api/internal/content-factory/draft` | `BLOCKED` 고위험 Topic의 비공개 초안과 출처 원장을 저장 |
| `POST` | `/api/internal/content-factory/publish` | 승인 Topic에 신규 콘텐츠·관계·출처를 원자적으로 게시하고 Queue를 `PUBLISHED`로 전환 |

이 API는 회원 데이터, 사용자 인증 데이터, Fitment 원본 레코드, 임의 SQL,
임의 Storage bucket/path, 콘텐츠 수정·삭제를 제공하지 않는다. Bike/Year relation은
숫자 ID만 입력받아 FK로 존재 여부를 확인하며 원본 엔티티를 응답하지 않는다.

게시 DB 변경은 `service_role`에만 실행 권한을 부여한 제한 RPC를 통한다. RPC는
Topic 상태와 콘텐츠 유형, 이미지 경로, 출처 기록을 재검증하며 하나의 DB
트랜잭션에서 콘텐츠·관계·출처·Queue를 함께 반영한다.

콘텐츠 자산 업로드의 유일한 운영 경계는
`POST /api/internal/content-factory/assets`다. 과거 시드·이미지 마이그레이션 및
직접 업로드용 Supabase Edge Function은 운영 호출 경로로 사용하지 않으며, 새로운
Producer도 Edge Function을 직접 호출하지 않는다.

활성화는 migration 검토·적용, FitBike 서버의 `CONTENT_FACTORY_PUBLISH_TOKEN` 및
`SUPABASE_SECRET_KEY` 설정, Preview 통합 검증, 별도 Production 배포 순으로 진행한다.
토큰은 Git 파일이나 일반 GitHub 변수에 기록하지 않고 배포 환경 Secret으로만 둔다.

2026-09-18 운영 DB metadata를 기준으로 `docs/04_database_schema`의 table, column,
constraint, index, FK, check, trigger export를 다시 동기화했다. 운영 스키마에는
`01`~`17`, `20`~`22`의 총 20개 public table이 있다. 이후 DB 변경은 운영 적용과
동일 Task에서 schema export와 migration history를 함께 갱신한다.

## Internal Admin API

`/api/internal/admin/**`는 Supabase access token을 서버에서 `getUser()`로 검증하고,
서버 전용 `ADMIN_EMAILS` allowlist에 포함된 계정만 허용한다. 전환 기간에는 기존
`NEXT_PUBLIC_ADMIN_EMAILS`를 fallback으로 읽지만 신규 환경은 server-only 변수를 사용한다.

- `GET /api/internal/admin/session`: 로그인 세션과 관리자 권한 검증
- `GET /api/internal/admin/operations`: Content/Queue/Source 운영 요약 및 최근 Topic
- `PATCH /api/internal/admin/topics/{topicKey}`: Content Factory가 허용한 Queue 상태 전환

운영 Admin API는 회원 목록이나 Fitment 원본을 반환하지 않는다. 브라우저는 service-role
또는 Content Factory token을 보유하지 않으며 모든 운영 요청은 서버 인증을 다시 거친다.


## Scheduled Content Pipeline Asset Boundary

예약 Content Pipeline은 CONTENT_FACTORY.md/CONTENT_IMAGE_STORAGE_POLICY.md의 Claim-bound RPC → pg_net → Edge Function 서버 전송 경계를 사용한다. 위 legacy Content Factory REST `/assets`는 별도 Producer API 경계다. 신규 3-A/3-B는 `content-pipeline-staging` Edge Function을 일회용 Upload Ticket으로 호출하며 서버 credential을 Worker에 전달하지 않는다. 일반 Chat이 Edge URL로 장기 secret을 직접 전송하는 경로는 만들지 않는다.

### Content Factory Source Stage RPCs

- `content_pipeline_dispatch_source_stage_v1(p_spec jsonb, p_pipeline_image_id bigint DEFAULT NULL, p_claim_token uuid DEFAULT NULL)` → `{jobId,requestId,status:DISPATCHED,probeOnly}`. Both optional values NULL: isolated transport probe; otherwise live 3-A PRODUCING Claim required. Spec is stored server-side and pg_net invokes `content-pipeline-source-stage` with a hashed, expiring, one-use Job Ticket. No Chat binary/Base64 or long credential is needed.
- `content_pipeline_source_stage_status_v1(p_job_id uuid)` → status PENDING/RUNNING/STAGED/FAILED, result, failureCode, timedOut. Bounded two-minute polling; DISPATCHED is not PASS. STAGED is not READY_FOR_UPLOAD.
- `content_pipeline_approve_source_stage_v1(p_job_id uuid,p_claim_token uuid,p_expected_sha text,p_qa jsonb)` → existing record-staging receipt, after explicit pixel/Mobile/SEO and representative gates. Probe approval, publisher Claim approval and double approval denied.
- Internal `content_pipeline_consume_source_stage_ticket_v1` authenticates exactly one job. All four RPCs and `27_content_pipeline_source_stage_job` are service-role only, RLS enabled with no public policy. No public write or arbitrary URL proxy.

Spec example:
```json
{"sourceAssetUrl":"https://approved-host/path/image.png","sourcePageUrl":"https://approved-host/page","sourceOwner":"Manufacturer","sourcePdfPage":1,"transform":{"maxWidth":780,"crop":{"x":0.05,"y":0.05,"width":0.9,"height":0.9},"annotations":[{"type":"circle","x":0.5,"y":0.5,"radius":0.12},{"type":"arrow","x1":0.2,"y1":0.2,"x2":0.45,"y2":0.45}]}}
```
PDF page is 1-based and only required for PDF. Crop coordinates are fractions of the decoded original/rendered PDF page. Annotation coordinates are fractions of the cropped/resized final image; circle radius is a fraction of the shorter side. maxWidth 390–1600, height capped at 2000; no upscaling. At most six circle/arrow shapes; no arbitrary SVG, text/label, Zoom Inset or AI edits. No source-domain allowlist. Public HTTPS only; credentials, fragments, custom ports, localhost/private/reserved/metadata IPs denied. HTTPS DNS validates all A/AAAA answers; the native TCP transport pins a validated public IP while the original hostname remains the TLS/Host identity. Up to four redirects, each independently URL/DNS/IP checked, within a total 20-second deadline. MIME and file signature must agree (PNG/JPEG/WebP/PDF). sourcePageUrl and sourceOwner are mandatory; license/rights/permission metadata is not required or written to new result provenance. Legacy optional input is ignored. Original/final URL, redirect chain, owner, check time and source SHA are retained. Image source capped at 8 MiB, PDF 24 MiB, final WebP 4 MiB. Header MIME/format and 24MP check precede full image decode. PDF viewport/operator processing can still fail due to Edge runtime limits; report failure and choose another verified source, never infer semantic QA from technical decode.

Result includes actual WebP SHA/bytes/MIME/signature/decode/dimensions, source SHA/provenance, transform recipe, read-back PASS, signed preview/expiry and semantic QA PENDING. Preview URL is temporary/private, never a customer service URL. Native AI capabilities remain unverified by this endpoint.

### Approved visual QA read contract

`content_pipeline_image_handoff_status_v1(p_pipeline_id bigint DEFAULT NULL)` is the canonical Chat/admin read API for approved visual QA. `imageQa`, `mobileQa`, and `imageSeoQa` read only `staging_asset.qa`; `qaSource` is `staging_asset.qa`. Missing approval returns null, never an inferred PASS from DONE or candidate technical verification. Candidate job QA remains separate. Existing output fields and service-role permissions are preserved.


## Authenticated 3-A MCP operations (2026-10-01)

Endpoint: `https://farjyjcvduthawpdjuqe.supabase.co/functions/v1/content-pipeline-visual-mcp`.
Tools: `check_visual_source_usage`, `get_visual_queue_status`, `claim_visual_image`, `get_visual_claim_result`, `dispatch_visual_source`, `get_visual_dispatch_result`, `get_visual_source_status`, `inspect_visual_source`, `approve_visual_source`, `fail_visual_image`. No arbitrary SQL, external model calls, production publication or DONE tool. Native image output uses the file-input tools below.

Each execution intent supplies a UUID requestId; reuse it after response interruption. The service-only receipt `29_content_pipeline_visual_claim_request` serializes by worker and stores the original result. Same request/changed target is rejected. A new request resumes this user's active PRODUCING/STAGING claim; it cannot add a second image. Closed/expired result never returns a usable Claim Token. Existing producer ordering, cooldown and expired-claim recovery remain authoritative.

The Edge validates Supabase access tokens via getUser(), confirmed email and server-only `CONTENT_FACTORY_MCP_OPERATOR_EMAILS`. Missing configuration returns 503; other users get 403. No user_metadata authorization, no public RPC grants. Worker identity is derived server-side as mcp-3a-<userId>; clients cannot impersonate another worker.

OAuth protected-resource metadata is public at endpoint + `/oauth-protected-resource`; unauthenticated MCP returns 401 with WWW-Authenticate. Chat connection additionally requires Supabase OAuth Server/dynamic registration, a sign-in/consent frontend, the operator allowlist and user installation. These are NOT proven/configured by deploying the MCP function. Existing SQL calls are not automatically replaced. Deployment does not guarantee platform approval.

Dispatch delegates to existing Source Stage through service-only `content_pipeline_dispatch_visual_source_request_v1`. Each source/edit intent has a UUID operationId; repeat it after a lost response and read `get_visual_dispatch_result`. Same operator/operationId returns the existing candidate, including FAILED candidates; changed image, Contract or spec is rejected. Use a new operationId only for a new source/edit intent. Only the operator’s current PRODUCING claim may create a candidate. Provenance only; crop/maxWidth/annotations[] circle/arrow supported. Full Generation/AI Editing are not capabilities of this transport.

Candidate status/inspection/approval first check that job image/Contract match the operator’s original claim receipt. Inspection obtains the private canonical WebP directly, checks SHA/bytes/MIME/RIFF/WEBP/actual decode/dimensions, and returns native MCP ImageContent plus a derived PNG at 390px. Preview height is capped at4000; invalid narrow crops are rejected before resize. Inspection also returns `cardCropImage` (390×219) and `heroCropImage` (768×432) PNG blocks, matching the public centered 16:9 `object-cover` display. Their metadata includes source crop coordinates and the same canonical SHA; role crop QA remains NOT_EVALUATED until actual pixel inspection. These display derivatives are never stored as replacements. Derived previews never replace the canonical asset. Technical verification is not semantic approval. Image-return rendering in ordinary Chat still requires an authenticated end-to-end test.

Approval QA uses exact flat fields: `contractHash` (current claim generationContractHash), `imageQa`, `mobileQa`, `imageSeoQa`. The three QA results must be literal `PASS` after actual inspection. Role requirements: THUMBNAIL adds `representativeImageQa` + `cardCropQa`; HERO adds `representativeImageQa` + `heroCropQa`; THUMBNAIL_HERO adds all three. BODY needs only the base QA. Inspect representative suitability and actual service card/hero crop composition separately; a 390px preview alone does not establish crop PASS. Evidence may be additional QA fields, but nested results or differently named fields do not replace these flags. The MCP schema describes each field and the runtime reports exact missing/non-PASS fields before approval RPC; it never fills PASS automatically. After tool schema deployment, refresh Chat tool metadata before retrying. Reuse the preserved candidate only after normal reclaim and matching Contract/SHA verification.

Approval delegates existing Contract/claim/SHA/explicit QA guards, then re-reads READY_FOR_UPLOAD and canonical SHA. A lost-response replay returns only the same already-approved canonical asset. Failure close delegates original fail RPC and re-reads the closed receipt. Neither tool publishes assets. 3-B retains its existing transport.

Frontend: `https://fitbike.co.kr/oauth/consent` (noindex, robots excluded). It preserves authorization_id, authenticates existing Supabase users, checks server operator access through MCP ping, shows client/scopes/redirect and requests explicit consent. SDK approve/deny handles registered redirect URLs; query parameters are never arbitrary redirect destinations. Setup: Auth Site URL=https://fitbike.co.kr, OAuth authorization path=/oauth/consent, OAuth Server enabled, dynamic registration enabled (or a pre-registered supported client), server secret CONTENT_FACTORY_MCP_OPERATOR_EMAILS=<verified operator email>. Final account settings and Chat connection require the account holder/session; do not paste service keys or access tokens into Chat.


3-A source selection preflight: call `check_visual_source_usage` with the claim requestId, actual page-confirmed sourceAssetUrl and sourceSha256 when known. It checks other READY_FOR_UPLOAD/DONE images; excludes this task for recovery. URL-only NO_KNOWN_DUPLICATE is provisional and does not identify alternate URLs/resolutions. Dispatch also rejects known exact-URL duplicates before creating a job. SHA/global approval gates remain authoritative and race-safe at approval. No source downloading, rights state or QA PASS is implied by this read tool. On duplicate/404/visual mismatch, preserve the failed candidate and switch source with a new operationId within the same valid claim, rather than immediately ending the task. Three failed candidates are not a search budget. Reuse requestId/operationId only for response-loss recovery, not a changed source. If continuation becomes impossible, fail normally and re-read claim closure; never claim another image first.


Source Stage worker recovery: `content_pipeline_source_stage_status_v1` reconciles PENDING/RUNNING jobs against their exact pg_net response. Definitive HTTP errors (including546 WORKER_RESOURCE_LIMIT) mark the job FAILED and preserve original code/checkpoint; Image/Claim/approved QA stay unchanged. Transport timeout or two-minute timedOut alone is advisory, not proof of worker termination. The server enforces a ten-minute unresolved-job deadline and fences late receipt writes. Status includes transport httpStatus/timedOut/responseAvailable, pollAfterSeconds and nextAction. This service-role-only status call may finalize a failed candidate receipt; it never claims, approves or publishes. MCP inspection requires STAGED and otherwise supplies current status/failure/action instead of treating SOURCE_NOT_STAGED as a visual defect.

Source processing uses one raster source decode and one WebP encode (quality84, bounded encoder effort), composites annotations without intermediate PNG roundtrips, loads PDF/SVG dependencies only when needed, limits source raster to8MP, PDF rendered page to4MP, final output to2MP/1600px height, and defaults maxWidth780 when unspecified. Larger sources should use a genuine page-provided smaller asset rather than guessed URLs. Storage read-back still performs independent actual WebP decode/SHA verification. A STORAGE_VERIFIED checkpoint is saved before the final STAGED receipt; Source Stage stores no new inspection chunk rows and reports inspectionTransport=CANONICAL_STORAGE and inspectionChunksStored=false; it is not STAGED/QA approval and can never enter Production without renewed technical and semantic validation.

### Visual MCP native ChatGPT file handoff (2026-10-02)

External generation model API calls are prohibited and removed. No image API key/model/enabled setting is read. `get_visual_generation_capabilities` reports executionMode=NATIVE_CHATGPT_FILE_HANDOFF, externalGenerationApiAllowed=false, nativeFileHandoff/fileParamsSupported/userFileUploadSupported=true, provider=NONE, requiredSettings=[]. Server model-generation booleans remain false by design. Host native imagegen availability and automatic generated-file transfer are separate and unverified until ordinary Chat testing.

`get_visual_image_task(pipelineImageId)` reads exact state/Contract/hash without Claim or private URLs. `dispatch_visual_generation(requestId,operationId,spec,file?,inputFile?)` ingests already-created PNG/JPEG/WebP; it never generates. Both top-level file fields are declared in `_meta["openai/fileParams"]`. Each file schema declares download_url/file_id/mime_type/file_name; only download_url/file_id are required. The server computes SHA for file input. REAL_SOURCE_AI_EDIT additionally requires an inputFile whose bytes match the inspected public inputAssetUrl; native editing execution is operator-attested. Existing URL+expected SHA and preserved-input resume remain compatible. Missing input fails before dispatch.

`open_visual_file_upload(requestId,operationId,spec)` is an authenticated read-only render tool. It requires the same active Claim and permitted Contract, and references MCP resource `ui://fitbike/visual-file-upload-v1.html`. The widget uses the standard MCP Apps bridge for tools/call and optional ChatGPT selectFiles/uploadFile/getFileDownloadUrl for user-selected files. It checks dispatch recovery before submission, never generates/approves, and does not contain credentials. No network/CSP domains are required. Host file helpers unavailable: attach the file in Chat and use official fileParams; unsupported host transport is reported, not assumed. Expired Claims must use normal same-image reclaim before opening a fresh widget.

Service-only `content_pipeline_dispatch_visual_generation_request_v1` retains operator receipt, image/Contract permission, one-running-candidate and idempotent input identity guards. Native file identity excludes short-lived download_url only; changed fileId/prompt/references/method/transform/image/Contract is rejected. The worker scrubs download URLs after preservation or handled failure and never returns them in provenance. Existing source Jobs, inspection/approval APIs and normalized-WebP generatedInput resume protect the same private canonical identity. Generic source ingest still rejects generation specs, preventing permission bypass. No public table/RPC access is added.


### Visual production/review handoff (2026-10-07)

Additive MCP tools: `claim_visual_production(requestId,pipelineImageId?)`,
`claim_visual_review(requestId,pipelineImageId?)`, `handoff_visual_review(requestId,jobId,expectedSha)`.
Both stage claims retain server-derived user Worker and request idempotency. Role replay conflicts
are rejected; pending review candidates are excluded from legacy/production claims.
`get_visual_queue_status` optionally accepts executionRole PRODUCER/REVIEWER; Claim RPC selection
is authoritative. Task and Claim reads expose visualPhase and verified reviewCandidate (no signed URL).

Production dispatch requires spec.preflightOnly=true and no preStagingQa. Handoff requires current
producer ownership, same Contract, owned STAGED Job, canonical SHA, actual private Storage metadata,
decode/read-back proof and absence of semantic invalidation. It releases the lease and queues QA
without final approval. Review dispatch accepts only the handed-off source/native resume and
registered pixel QA; QA registration is parent-Job-bound, approval is parent or attested derivative.
All new SQL RPCs remain service-role-only with empty search_path, no new public table grants.
Migration: 20261007013115_visual_production_review_handoff.sql. Source-stage byte ingestion and
existing approval gates remain authoritative; no external generation model is added.


### Native generation attempt evidence (2026-10-07)

`record_visual_generation_attempt(requestId, attemptId, phase, evidence)` appends immutable evidence to internal RLS-protected `30_content_pipeline_native_attempt_event`. UUID attemptId identifies one native call. The authenticated worker and original receipt derive the Task and Contract; callers cannot choose another owner.

Before Claim, `validate_visual_generation_call(nativeCall)` performs read-only audit-capture validation and reports invalid `field`/`reason`. It does not validate runtime tool schema, references, Contract feasibility or pixels. New nativeCall format: `{toolName:"image_gen.text2im" (or actual image_gen.imagegen), schemaVersion:"RAW_ARGUMENTS_V1", arguments:{...exact actual native tool arguments...}}`. Tool-specific keys are preserved verbatim under arguments; size is bounded and credentials/signed capabilities/inline binary are prohibited. Legacy four-key imagegen calls remain supported. Rejected input is not saved as a successful invocation. Before imagegen, record REQUEST with `contractHash` and `nativeCall` containing the exact intended tool arguments (prompt and only actually used reference options). After the call, record RESULT with `actualNativeCall`, `outputs` (actual fileId/path), `inspectedOutput` (an exact member of outputs), `pixelsInspected`, `pixelQa` (PASS/FAIL/NOT_INSPECTED), `pixelEvidence` and the intended handoff `operationId`. A different actual call can be recorded as FAIL; it cannot assert PASS. Record connector rejection as TRANSPORT_ERROR with `operationId` and exact `error`. Never store connector download URLs or credentials. Each phase is immutable; identical replay succeeds and changed replay fails. Maximum three REQUEST events per receipt.

`get_visual_image_task.nativeAttemptAudit` returns the latest 30 events for the authenticated worker. `get_visual_claim_result.nativeAttemptAudit` restricts to that receipt. Linked `serverReceivedJobs` are read from actual Job records, not operator assertions. Native input SHA, pre-staging source SHA and canonical SHA are distinct. Missing historical evidence is MISSING, never reconstructed. REQUEST is a saved intention; RESULT is operator-reported invocation evidence. The server cannot observe imagegen's internal prompt/session or authenticate a tool transcript. Audit events do not prove context isolation. Late RESULT/error recording is permitted only against a previously saved REQUEST and never renews the lease. Audit failure must not block official Claim release or existing asset recovery. This addition does not certify scheduled Native E2E success.


Nullable Native prompt capture (2026-10-07): RAW_ARGUMENTS_V1 preserves null or omitted arguments.prompt; legacy prompt validation remains unchanged. Optional sibling `sceneInstruction:{text,location}` records a separate actual scene message without modifying arguments. location is TOOL_ARGUMENT (text must equal arguments.prompt), CONVERSATION_MESSAGE (actual operator-reported message, 20–6000 characters), or UNOBSERVED (explicit text:null). Omit it when unknown; never reconstruct a supposed runtime prompt. Preflight and each read-back event's captureValidation expose instructionVisibility=TOOL_ARGUMENT / OPERATOR_REPORTED_CONVERSATION / UNOBSERVED. valid means safe audit capture only. requestMatchesActualCall means exact reported JSON equality, not proven scene delivery or host observation. Pixel PASS remains an actual pixel attestation with existing identity checks; it does not certify instruction visibility. All native invocation and message evidence is operator-reported; serverObservedNativeCall and runtimeSchemaValidated remain false. No new table, Claim, Contract or approval behavior.

### Visual Brief V5 compatibility (2026-10-07)

V5 Task/Claim responses retain the minimal raw `generationContract` and immutable Hash, with separate service-derived `visualPolicy`. Capability reports `visualContractVersions:[4,5]`, `visualPolicyVersion:VISUAL_COMMON_V1` and nativeProductionMethods. Existing tools remain; dispatch_visual_generation adds `NATIVE_FULL_GENERATION` with references=[] only for valid V5 NONE contracts. Reference/Edit retain inspected-reference and actual edit-input requirements. Server/External generation remains prohibited. The selected method/source/transform and original/canonical SHA stay in same-contract Job/audit records; no new public table/RPC exposure. Host tool schema refresh may be needed for the added enum.


### Native input recovery / dispatch linkage (2026-10-08)

Additive dispatch `spec.nativeAttemptId` links the authenticated receipt's Native audit to ingest. Internal nativeAttemptBinding is computed server-side and cannot be supplied by clients; legacy calls remain supported. Current Task/claim responses include separate `recoverableNativeInput` from service-only owned-native-input discovery. Its resumeJobId uses verified preserved input bytes for Producer preflight restaging, with no new Native file or Source fetch. Failed input is neither a STAGED candidate nor QA PASS. Storage read-back rechecks normalized SHA, bytes and dimensions; current admission excludes rejected same-input identity. No new table/bucket/public RPC or server generation API is introduced. Refresh connector schema for the optional attempt field and capability flags.

### Native RESULT preflight and error tracing (2026-10-08)

`validate_visual_generation_result(requestId,attemptId,evidence)` checks exact RESULT evidence against this authenticated Producer receipt and its saved REQUEST. It delegates to the same internal core as `record_visual_generation_attempt` with validation-only mode and returns before insertion. No evidence, Claim, lease, image status or approval is changed. Returns valid/code/field/reason; valid is recording eligibility at that instant, not persistence, transport, native runtime proof or semantic approval. PASS requires JSON boolean pixelsInspected=true and a string pixelEvidence, plus the existing exact-call/output checks. Identical recorded replay validates without another insert; changed replay remains immutable. The validator and core are service_role-only.

Capability advertises nativeResultPreflightSupported/nativeResultPreflightTool and nativeAuditErrorTracingSupported. Audit preflight rejections and recording errors produce bounded structured Edge logs with traceId/tool/requestId/attemptId/phase/stage/code/field. Raw evidence, prompts, download capabilities and arbitrary database error text are omitted from these logs/responses. Logs follow the existing Edge Function retention; no permanent failure ledger is implied. Recording call errors report evidenceRecorded=null and UNVERIFIED_REQUIRES_READBACK because response loss or immutable conflict can coexist with a saved event. Preflight reports recorded=false. Query the matching attempt before identical replay, preserve valid assets, and release only the owned Claim through the official failure path. This release does not solve initial connector egress or prove scheduled Native E2E success.


### Inspection delivery protocol (pending release: PIXEL_DELIVERY_V1)

`inspect_visual_source` adds optional `view=ALL|CANONICAL|MOBILE390|CARD|HERO|METADATA`, `transport=MCP_IMAGE_CONTENT|CANONICAL_DOWNLOAD` and `expectedSha`. ALL retains the four-image legacy response; a selected image has contentIndex=1 and unrequested descriptors have contentIndex=null. METADATA verifies the same canonical WebP without making PNG derivatives or asserting delivery PASS. Output is bounded to 4 MiB including encoded image blocks; an oversized response preserves Job/SHA/download access and requests split views or verified canonical download. The signed URL is transport only, never asset identity.

The common `inspection-delivery.mjs` adapter accepts only direct MCP or JSON-RPC result envelopes and array content/content_items. It preserves image objects, validates MIME/signature, separates RESPONSE_SHAPE_INVALID, IMAGE_BLOCK_MISSING and IMAGE_BLOCK_INVALID, and forwards each actual image through an injected host renderer. The Node `inspection-client.mjs` requests individual views, saves only exact-origin/byte/SHA-verified WebP fallback and calls the supplied image viewer. Output submission and verified download are not proof of actual pixel inspection. Fixed UNVERIFIED_REQUIRES_RENDERING is advisory, not a failure code.

`probe_visual_inspection_delivery(runtime)` issues a small PNG before any Claim; `record_visual_inspection_delivery(event)` records bounded server or operator observations; `get_visual_inspection_delivery_status(runtime)` reads worker/runtime health. WORK, CHAT and SCHEDULED evidence is separate. Only an operator-reported actual probe pixel inspection establishes 30-minute readiness. Two independent probe failures open a 10-minute environment circuit; probe recovery remains allowed. Candidate failures cannot open an environment circuit.

New split Producer/Reviewer MCP Claims require the truthful runtime (WORK/CHAT/SCHEDULED). The atomic receipt wrapper retains runtime binding and records environmentObservation; UNKNOWN/UNVERIFIED/OPEN probe health is diagnostic and never blocks Claim or substitutes for candidate inspection. Capability reports RUNTIME_REQUIRED_ENVIRONMENT_ADVISORY / CANDIDATE_QA_GATE_V2. Response loss uses get_visual_claim_result with the same requestId before identical replay; platform Safety Check rejection is not permission to route around it. Bound handoff and approval require the latest same-worker/request/Job/canonical-SHA/runtime CANONICAL and MOBILE390 operator pixel reports to be PASS inside the existing locked DB mutation. A later FAIL revokes earlier PASS, and a new Claim cannot inherit prior reports. Candidate observation writes acquire job then image locks, matching finalization, so observations and finalization serialize. Historical exact completion replay and already-existing unbound legacy receipts retain compatibility; the split MCP no longer creates unbound Claims. Explicit Contract, source, crop, semantic, storage/decode/SHA and lease gates remain.

Three distinct receipts failing the same worker/runtime/role/Task/Contract/candidate SHA/view/stage/code open a 30-minute candidate cooldown through existing next_eligible_at after the owned Claim closes. New SHA, new Contract and different runtime do not inherit old failure groups. Observations expire after seven days via bounded per-worker cleanup; protocol version is part of breaker scope. Semantic rejection retains the existing explicit rejection/fence path, never transport-only regeneration.

Delivery logs contain safe symbolic stage/code, traceId, validated request/job UUID, response bytes and elapsed time. Unknown raw RPC errors are classified safely; signed URLs, image bytes, token values, prompts and raw evidence are omitted. Event evidence is validated but not persisted. Client observations are OPERATOR_REPORTED; serverObservedClientPixels=false. Actual scheduled-runtime handoff and Native first delivery/preserved-input recovery remain separate acceptance evidence. This protocol is not considered deployed until migration and Edge read-back pass.


### Minimal visual inspection contract (2026-10-12)

`record_visual_pixel_inspection(eventId,requestId,jobId,view,pixelQa,evidence)` records an actually inspected candidate view. Runtime/canonical SHA/Task/Contract/role are derived from an owned receipt and STAGED Job. `pixelQa=FAIL` means delivery/observation succeeded but candidate quality failed; this tool never approves. New reports require an active owned lease. Identical existing eventId replay remains valid after lease closure; different payloads are immutable conflicts.

`get_visual_inspection_event(eventId)` returns only this operator's event (recorded=true) or NOT_FOUND (recorded=false), with no evidence text/binary/URLs. `get_visual_inspection_recovery(requestId)` returns authoritative current checkpoint, Job/SHA and latest required-view records for this receipt. Missing/failed views require actual inspection; previous Claim PASS is not inherited. The legacy `record_visual_inspection_delivery({event})` now advertises its exact typed field set; optional unknown keys are rejected before RPC. `DELIVERY_REQUEST_INVALID` + safe field/reason + REQUEST_VALIDATION + NOT_ATTEMPTED identifies input failure separately from DB_RECORD/response uncertainty.

Connect role-specific apps to the same authenticated MCP endpoint with `?role=PRODUCER` or `?role=REVIEWER`. The server filters tools/list, rejects cross-role tool calls and fences shared writes to matching receipt roles. OAuth operator worker identity stays unchanged so the same stored candidate remains reviewable. The shared URL retains old clients for migration; existing RPC role/ownership guards still apply. This release does not change account plugin configuration or automations.



## Unified Authoring (1·2단계 단일 실행)

Service-role-only RPCs; SECURITY INVOKER. No new table/column, public endpoint or stored prompt.

| RPC | Input | Read/write and role |
| --- | --- | --- |
| `content_pipeline_claim_authoring_v1` | `p_request_id uuid`, `p_pipeline_id bigint default null` | 신규 null 대상은 eligible Topic을 원자적으로 선택해 Pipeline WRITING + AUTHORING_V1 RUNNING 1개를 생성한다. 동일 요청은 같은 실행과 현재 상태를 읽어 반환한다. 대상 ID 지정은 종료된 통합 HOLD/BLOCKED 실행의 재개용이다. |
| `content_pipeline_complete_authoring_v1` | `p_pipeline_id bigint`, `p_pipeline_run_id bigint`, `p_package jsonb` | 현재 실행 소유권·산출물 결합·V5 feasibility를 확인하고 한 트랜잭션에서 writer 저장, DRAFTED, image sync, run PASS를 완료한다. |

Package의 루트 키는 `version`, `execution`, `planning`, `research`, `writer`만 허용한다. version=1, execution은 Claim의 `packageExecution`을 그대로 복사한다: `{pipelineId,pipelineRunId,topicKey}`. planning/research는 비어 있지 않은 object, writer는 기존 Writer Artifact object이며 image_briefs는 V5이다. writer.authoringContext는 서버가 생성하므로 호출자가 넣지 않는다. 실제 본문·근거·이미지 기획의 내용 규약은 기존 콘텐츠 정책을 따른다. 형식 검증은 사실 확인을 대신하지 않는다.

단일 저장 위치: writer 필드 + `writer_artifact.authoringContext={version:1,execution,planning,research}`. 기존 NOT NULL planning_artifact/research_artifact는 `{}`로 남기고 payload를 중복 기록하지 않는다. Run metadata는 request identity, package hash, 작은 완료 receipt만 저장한다.

응답 유실은 새 실행을 만들지 않는다. Claim은 동일 requestId/동일 p_pipeline_id(null 포함)로 재호출한다. `activeExecution`, `stage`, `nextAction`을 확인하며 성공/종료 응답을 새 RUNNING으로 해석하지 않는다. 완료는 같은 pipeline/run/package를 그대로 재전달한다. 동일 hash의 PASS replay는 저장·이미지 동기화를 반복하지 않고 원래 receipt와 currentStage를 반환한다. 변경된 package는 REPLAY_CONFLICT이다.

실패는 기존 `content_pipeline_fail_stage_v1`에 정확한 pipelineId/runId와 expected_stage=WRITING을 전달한다. 잘못된/과거 run은 현재 실행을 실패시킬 수 없다. 공식 HOLD/BLOCKED 이후 새 requestId + 해당 pipelineId로 claim_authoring을 호출하면 새 run fence를 발급한다. 과거 execution이 포함된 산출물을 재사용하지 않는다. generic resume는 통합 실행에 AUTHORING_RESUME_REQUIRES_REQUEST_ID로 거부한다. 응답 유실을 이유로 다른 requestId를 만들거나 직접 stage를 수정하지 않는다. 실행 종료가 확인되지 않은 RUNNING은 운영 복구 대상이며 자동 lease 만료를 새로 추가하지 않았다.

기존 단계별 실행·산출물은 그대로 유지한다. 새 통합 경로 적용은 호출부/운영 지시를 이 RPC로 전환해야 하며 기존 예약·Supabase 프롬프트는 자동 변경하지 않는다.


## Authoring Source supply V1

기존 Visual MCP의 `?role=AUTHORING` endpoint는 동일 verified operator allowlist 인증 뒤에서 작성/Source 공급 도구만 노출한다. Producer/Reviewer 역할의 Claim/승인 도구는 AUTHORING에 노출하지 않는다. 파일 입력은 persist_authoring_source의 공식 fileParams를 사용하며 이 버전의 입력 종류는 REAL_SOURCE다. SOURCE_SUPPLY_V1 capability와 dispatch_visual_supplied_source는 기존 PRODUCER endpoint에 추가한다.

Service-only DB RPC:
- content_pipeline_claim_authoring_supply_v1(worker,requestId,optionalPipelineId)
- content_pipeline_complete_authoring_supply_v1(worker,pipelineId,runId,existingV1Package)
- content_pipeline_fail_authoring_supply_v1(worker,pipelineId,runId,HOLD|BLOCKED,error)
- content_pipeline_open_source_supply_v1(worker,pipelineId)
- content_pipeline_prepare_source_supply_v1(worker,runId,imageId,operationId,intent)
- content_pipeline_finish_source_supply_v1(worker,supplyId,serverProof)
- content_pipeline_source_supply_status_v1(worker,optionalPipelineId,optionalImageId)
- content_pipeline_dispatch_supplied_source_v1(worker,requestId,operationId,supplyId,transform)
- content_pipeline_reject_source_supply_v1(worker,requestId,supplyId,DUPLICATE_SOURCE_PREFLIGHT)
- content_pipeline_source_supply_queue_v1(worker,optionalPipelineId,optionalRole)

Worker identity comes from authenticated MCP user, not submitted tool arguments. prepare/finish writes are authoring-run owner fenced; original immutable intent/Storage proof and operation replay are validated. Shared authorized operators may read supply receipts and consume bound input through their own exact Producer lease. Neither PUBLIC/anon/authenticated SQL access nor direct client-supplied proof is exposed by MCP. Final pixel QA is never inherited from sourceObservation.

### Authoring MCP 입력 진단과 상태 조회

`complete_content_authoring`은 기존 V1 package envelope 및 V5 Brief의 명시적 schema를 노출하고 DB 호출 전에 동일 schema로 검증한다. 입력 오류는 `AUTHORING_PACKAGE_INVALID`, `field`, `reason`, `stage=REQUEST_VALIDATION`, `mutationOutcome=NOT_ATTEMPTED`를 반환한다. Writer의 기존 본문/SEO 확장 필드는 보존하지만 `writer.authoringContext`는 서버 관리 필드다. DB의 Authoring 업무 오류 코드는 일반 서버 오류로 치환하지 않는다. 네트워크 등 결과 미확정 오류는 상태 조회 후 재개한다. 입력 원문·URL·본문을 오류 진단에 복사하지 않는다.

`get_authoring_execution_status(requestId?,pipelineId?)`는 최소 하나의 식별자를 받아 현재 인증 작업자에게 결합된 AUTHORING_V1 Run만 조회한다. 반환 필드는 `activeExecution`, `pipelineRunId`, `runStatus`, Pipeline `stage`, 원래 `requestId`/`targetPipelineId`, `packageExecution`, `contentSaved`, `nextAction`이다. 읽기 전용이며 새 Claim·상태 변경·자동 만료를 수행하지 않는다. 이미지용 `get_visual_claim_result`의 NOT_FOUND는 Authoring 종료 증거가 아니다. RUNNING은 동일 Run으로 복구하고 저장 완료 PASS는 Source 공급으로 이어간다.
