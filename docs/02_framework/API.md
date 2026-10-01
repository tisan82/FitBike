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
Tools: `check_visual_source_usage`, `get_visual_queue_status`, `claim_visual_image`, `get_visual_claim_result`, `dispatch_visual_source`, `get_visual_dispatch_result`, `get_visual_source_status`, `inspect_visual_source`, `approve_visual_source`, `fail_visual_image`. No arbitrary SQL, Full Generation, AI Editing, production publication or DONE tool.

Each execution intent supplies a UUID requestId; reuse it after response interruption. The service-only receipt `29_content_pipeline_visual_claim_request` serializes by worker and stores the original result. Same request/changed target is rejected. A new request resumes this user's active PRODUCING/STAGING claim; it cannot add a second image. Closed/expired result never returns a usable Claim Token. Existing producer ordering, cooldown and expired-claim recovery remain authoritative.

The Edge validates Supabase access tokens via getUser(), confirmed email and server-only `CONTENT_FACTORY_MCP_OPERATOR_EMAILS`. Missing configuration returns 503; other users get 403. No user_metadata authorization, no public RPC grants. Worker identity is derived server-side as mcp-3a-<userId>; clients cannot impersonate another worker.

OAuth protected-resource metadata is public at endpoint + `/oauth-protected-resource`; unauthenticated MCP returns 401 with WWW-Authenticate. Chat connection additionally requires Supabase OAuth Server/dynamic registration, a sign-in/consent frontend, the operator allowlist and user installation. These are NOT proven/configured by deploying the MCP function. Existing SQL calls are not automatically replaced. Deployment does not guarantee platform approval.

Dispatch delegates to existing Source Stage through service-only `content_pipeline_dispatch_visual_source_request_v1`. Each source/edit intent has a UUID operationId; repeat it after a lost response and read `get_visual_dispatch_result`. Same operator/operationId returns the existing candidate, including FAILED candidates; changed image, Contract or spec is rejected. Use a new operationId only for a new source/edit intent. Only the operator’s current PRODUCING claim may create a candidate. Provenance only; crop/maxWidth/annotations[] circle/arrow supported. Full Generation/AI Editing are not capabilities of this transport.

Candidate status/inspection/approval first check that job image/Contract match the operator’s original claim receipt. Inspection obtains the private canonical WebP directly, checks SHA/bytes/MIME/RIFF/WEBP/actual decode/dimensions, and returns native MCP ImageContent plus a derived PNG at 390px. Preview height is capped at4000; invalid narrow crops are rejected before resize. Derived previews never replace the canonical asset. Technical verification is not semantic approval. Image-return rendering in ordinary Chat still requires an authenticated end-to-end test.

Approval QA uses exact flat fields: `contractHash` (current claim generationContractHash), `imageQa`, `mobileQa`, `imageSeoQa`. The three QA results must be literal `PASS` after actual inspection. Role requirements: THUMBNAIL adds `representativeImageQa` + `cardCropQa`; HERO adds `representativeImageQa` + `heroCropQa`; THUMBNAIL_HERO adds all three. BODY needs only the base QA. Inspect representative suitability and actual service card/hero crop composition separately; a 390px preview alone does not establish crop PASS. Evidence may be additional QA fields, but nested results or differently named fields do not replace these flags. The MCP schema describes each field and the runtime reports exact missing/non-PASS fields before approval RPC; it never fills PASS automatically. After tool schema deployment, refresh Chat tool metadata before retrying. Reuse the preserved candidate only after normal reclaim and matching Contract/SHA verification.

Approval delegates existing Contract/claim/SHA/explicit QA guards, then re-reads READY_FOR_UPLOAD and canonical SHA. A lost-response replay returns only the same already-approved canonical asset. Failure close delegates original fail RPC and re-reads the closed receipt. Neither tool publishes assets. 3-B retains its existing transport.

Frontend: `https://fitbike.co.kr/oauth/consent` (noindex, robots excluded). It preserves authorization_id, authenticates existing Supabase users, checks server operator access through MCP ping, shows client/scopes/redirect and requests explicit consent. SDK approve/deny handles registered redirect URLs; query parameters are never arbitrary redirect destinations. Setup: Auth Site URL=https://fitbike.co.kr, OAuth authorization path=/oauth/consent, OAuth Server enabled, dynamic registration enabled (or a pre-registered supported client), server secret CONTENT_FACTORY_MCP_OPERATOR_EMAILS=<verified operator email>. Final account settings and Chat connection require the account holder/session; do not paste service keys or access tokens into Chat.


3-A source selection preflight: call `check_visual_source_usage` with the claim requestId, actual page-confirmed sourceAssetUrl and sourceSha256 when known. It checks other READY_FOR_UPLOAD/DONE images; excludes this task for recovery. URL-only NO_KNOWN_DUPLICATE is provisional and does not identify alternate URLs/resolutions. Dispatch also rejects known exact-URL duplicates before creating a job. SHA/global approval gates remain authoritative and race-safe at approval. No source downloading, rights state or QA PASS is implied by this read tool. On duplicate/404/visual mismatch, preserve the failed candidate and switch source with a new operationId within the same valid claim, rather than immediately ending the task. Three failed candidates are not a search budget. Reuse requestId/operationId only for response-loss recovery, not a changed source. If continuation becomes impossible, fail normally and re-read claim closure; never claim another image first.


Source Stage worker recovery: `content_pipeline_source_stage_status_v1` reconciles PENDING/RUNNING jobs against their exact pg_net response. Definitive HTTP errors (including546 WORKER_RESOURCE_LIMIT) mark the job FAILED and preserve original code/checkpoint; Image/Claim/approved QA stay unchanged. Transport timeout or two-minute timedOut alone is advisory, not proof of worker termination. The server enforces a ten-minute unresolved-job deadline and fences late receipt writes. Status includes transport httpStatus/timedOut/responseAvailable, pollAfterSeconds and nextAction. This service-role-only status call may finalize a failed candidate receipt; it never claims, approves or publishes. MCP inspection requires STAGED and otherwise supplies current status/failure/action instead of treating SOURCE_NOT_STAGED as a visual defect.

Source processing uses one raster source decode and one WebP encode (quality84, bounded encoder effort), composites annotations without intermediate PNG roundtrips, loads PDF/SVG dependencies only when needed, limits source raster to8MP, PDF rendered page to4MP, final output to2MP/1600px height, and defaults maxWidth780 when unspecified. Larger sources should use a genuine page-provided smaller asset rather than guessed URLs. Storage read-back still performs independent actual WebP decode/SHA verification. A STORAGE_VERIFIED checkpoint is saved before legacy inspection chunk batches; it is not STAGED/QA approval and can never enter Production without renewed technical and semantic validation.
