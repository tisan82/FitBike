# Current Supabase Schema --- Source of Truth

이 폴더에는 **실제 최신 Supabase schema export**를 둔다.

Expected:

``` text
01_tables.csv
02_columns.csv
03_constraints.csv
04_indexes.csv
05_foreign_keys.csv
06_check_constraints.csv
07_triggers.csv
```

정확한 table/column/type/constraint/index/FK/check/trigger는 이 export가
prose 문서보다 우선한다.

2026-09-18 운영 metadata 기준 public table은 총 20개다. Fitment core
`01`~`11`, Content `12`~`17`, Service Shop `20`~`22`를 포함한다.
누락된 schema detail을 기억이나 문서로 재구성하지 않는다.

`public.rls_auto_enable()`은 `service_role`만 실행할 수 있으며,
`public.set_updated_at()`은 `search_path=pg_catalog`으로 고정한다.

## Tire Model Relationship

`04_tire_product.tire_model_id`는 nullable `bigint`이며
`11_tire_model.tire_model_id`를 참조한다. FK constraint는
`04_tire_product_tire_model_id_fkey`이고 `ON UPDATE NO ACTION`,
`ON DELETE NO ACTION`이다. `idx_04_tire_product_tire_model_id` index가
연결 조회를 지원한다.

`11_tire_model`은 RLS가 활성화되어 있다. 공개 SELECT policy는
`Public can read active tire models`이며 `anon`, `authenticated` role에
`is_active = true` 조건으로 적용된다.

## 2026-09-30 Visual staging delta

21_content_pipeline_image의 현재 column/check/index metadata를 Production에서 다시 조회해 동기화했다. staging_asset/staging_input/handoff_phase와 READY_FOR_UPLOAD가 추가됐다. 다른 테이블의 기존 export는 이번 변경으로 최신 전체 export임을 보장하지 않는다. RPC/Storage DDL의 정확한 정의는 이번 네 개 migration을 함께 확인한다.

## 2026-09-30 Source-stage job delta

`27_content_pipeline_source_stage_job` is an additive, service-role-only transport receipt for URL/PDF capability probes and optional real 3-A candidates. Columns/checks/indexes were fetched from Production after the two source-stage migrations. It is not a replacement Content Pipeline or image status table. RLS has no public policy by design. Existing unrelated exports remain unchanged and are not asserted current.

## 2026-10-01 Provenance-only image operations

`17_content_asset_source.rights_status` is nullable with no default. Historical values/check constraints remain; new Publish rows store NULL for rights/license/permission metadata. Source Stage ignores legacy rights/license/permission input and writes provenance only. Existing Claim, image QA, SHA/decode, RLS and ticket guards are unchanged. Migration: `20261001015258_source_provenance_only.sql`.


## 2026-10-01 Visual Claim request receipt

`29_content_pipeline_visual_claim_request` is a service-role-only idempotency receipt keyed by worker_key/request_id. RLS is enabled without public policies; PUBLIC/anon/authenticated have no table or RPC access. It references image_id and retains original Claim metadata for transport recovery, not a new image status machine. Runtime definition is preserved in the two visual_claim migrations. Existing table exports were not comprehensively refreshed by this change.

## 2026-10-01 Visual Source request transport

Migration `20261001040232_visual_source_request_transport.sql` adds service-only content_pipeline_dispatch_visual_source_request_v1; no new image status or table. It serializes the operator/operation intent and stores its internal receipt in 27.spec.visualMcpOperation. Existing source/ticket/network/claim/Contract guards remain authoritative. Public/anon/authenticated EXECUTE is revoked.

## 2026-10-01 Staging maintenance

`content_pipeline_maintenance_run` stores service-only short-lived ticket hashes and bounded aggregate cleanup receipts. RLS enabled; no PUBLIC/anon/authenticated privileges. New usage/plan/ticket/dispatch/finish/chunk/status RPCs are service-only. The actual definition and daily pg_cron schedule are in `20261001095441_content_staging_maintenance.sql`; unrelated schema exports are unchanged. No Storage metadata is deleted through SQL.

### 2026-10-02 Reference generation transport

Migration `20261002014159_reference_visual_generation.sql` adds service-only generation permission/dispatch RPCs using existing `27_content_pipeline_source_stage_job` rows and existing Image statuses. It updates approval provenance for AI-edit input URL identity and includes `result.generatedInput.path` in staging cleanup plan/reservation/activation protection. No public table access or new Image status is introduced. Deployment must include the Source Stage `generation.ts` dependency and MCP `generation.ts`/`source.ts` validation dependencies.

### 2026-10-02 Native ChatGPT file input

`20261002042408_native_chat_file_handoff.sql` replaces only the generation dispatch body and adds service-only `content_pipeline_native_file_identity_v1(jsonb)`. Existing image/job tables, statuses, Contract permission and preserved-input protection remain. Native file references travel through existing private Job specs; signed URLs are not input identity and are scrubbed after preservation/handled failure. No table/column or public grant is added.

### 2026-10-04 Visual execution ownership and candidate recovery

Migration `20261004052044_visual_execution_isolation_recovery.sql` changes no tables or columns.
The first `29_content_pipeline_visual_claim_request` receipt for a Claim token owns the execution;
new request IDs return BUSY and historical Resume aliases no longer authorize mutations.
Service-only recovery, failure and approval RPCs use existing image/job/run receipts. Recovery joins
same-contract STAGED jobs to existing private Storage objects, and excludes old approved jobs that no
longer match `staging_asset.sourceJobId`. QA-approved staging semantics and public grants are unchanged.


### 2026-10-07 Two-execution visual handoff delta

Migration `20261007013115_visual_production_review_handoff.sql` adds nullable image `visual_phase`
(text checked to PRODUCTION_PENDING/PRODUCING/QA_PENDING/REVIEWING/APPROVED) and `review_candidate`
(jsonb). Existing public status/handoff_phase checks, RLS and grants stay unchanged. Request role
is stored in the existing immutable 29.response.executionRole; no extra receipt table is created.
Candidate joins current Contract, semantic fences and actual private Storage metadata. Stage Claim,
handoff, candidate read and role guard RPCs are service-only. Existing NULL phases retain legacy
compatibility; no bulk data backfill. Production DDL verification and transactional regression are
required before deployment is reported complete. Rollback restores prior function definitions,
then removes the two columns/check only after draining split Claims/candidates; never discard a
live pending candidate to roll back.


### Native generation attempt evidence (2026-10-07)

`record_visual_generation_attempt(requestId, attemptId, phase, evidence)` appends immutable evidence to internal RLS-protected `30_content_pipeline_native_attempt_event`. UUID attemptId identifies one native call. The authenticated worker and original receipt derive the Task and Contract; callers cannot choose another owner.

Before imagegen, record REQUEST with `contractHash` and `nativeCall` containing the exact intended tool arguments (prompt and only actually used reference options). After the call, record RESULT with `actualNativeCall`, `outputs` (actual fileId/path), `inspectedOutput` (an exact member of outputs), `pixelsInspected`, `pixelQa` (PASS/FAIL/NOT_INSPECTED), `pixelEvidence` and the intended handoff `operationId`. A different actual call can be recorded as FAIL; it cannot assert PASS. Record connector rejection as TRANSPORT_ERROR with `operationId` and exact `error`. Never store connector download URLs or credentials. Each phase is immutable; identical replay succeeds and changed replay fails. Maximum three REQUEST events per receipt.

`get_visual_image_task.nativeAttemptAudit` returns the latest 30 events for the authenticated worker. `get_visual_claim_result.nativeAttemptAudit` restricts to that receipt. Linked `serverReceivedJobs` are read from actual Job records, not operator assertions. Native input SHA, pre-staging source SHA and canonical SHA are distinct. Missing historical evidence is MISSING, never reconstructed. REQUEST is a saved intention; RESULT is operator-reported invocation evidence. The server cannot observe imagegen's internal prompt/session or authenticate a tool transcript. Audit events do not prove context isolation. Late RESULT/error recording is permitted only against a previously saved REQUEST and never renews the lease. Audit failure must not block official Claim release or existing asset recovery. This addition does not certify scheduled Native E2E success.


Native call capture schema update (2026-10-07): service-only, immutable/invoker `content_pipeline_validate_native_call_v2(jsonb)` validates bounded raw call envelopes without table access or Claim mutation. `content_pipeline_record_native_attempt_v1` reuses that validator while retaining receipt/Contract/lease/immutability/output/PASS guards. Table/column/constraint exports remain unchanged; only function definitions changed. Canonical format and operator-report limits are owned by API.md.

Nullable Native prompt capture: validator accepts raw null/omitted prompt and separately validates sceneInstruction. Record RPC removes its duplicate string-prompt assumption. Audit read RPC adds per-event captureValidation; unchanged service-only grants/ownership/lease/immutable evidence. No table export delta.

## 2026-10-07 Visual Brief V5 compatibility

V5 semantic Contract remains the deployed minimal raw nine fields plus contract_version; Task identity stays in existing columns/Job metadata. No new table/column and no automatic data conversion. Five concurrently applied V5 authoring migrations (094243–094510) were synchronized from actual migration history; subsequent visual_semantic_contract_v5_repair validates current function definitions before adding missing runtime policy/Stage2/native/QA integration and service-role-only grants. Existing V4 legacy paths and Hash/Claim/Job fences are retained. Role-based asset keys are allocated server-side for V5; Writer does not author asset_key. Exact schema/bounds are in visual-brief-v5.schema.json; product semantics belong to CONTENT.md.

## 2026-10-08 Preserved Native input recovery

`20261007161854_native_preserved_input_recovery` adds service-only discovery `content_pipeline_owned_native_input_v1(worker,image)` over existing Job `result.generatedInput`; no new table, column, status or bucket. A FAILED Job with committed generated-input/storage checkpoint may expose a distinct `recoverableNativeInput` receipt when current immutable Contract/method/worker, decoded normalized WebP identity, bounded bytes/pixels, and actual Storage metadata all match. Same-contract semantic rejection by any worker excludes matching input identity. The packet has `status=INPUT_PRESERVED`, `sourceSha256` (normalized input SHA), `canonicalSha256=null`, and `qaStatus=NOT_EVALUATED`; it never pretends to be STAGED or approved. Producer queue prioritizes valid stored candidates first, then preserved inputs. Reviewer receives no input-only recovery packet. Closed receipts still require a new owned role Claim before writes. Existing cleanup protects generatedInput paths for nonterminal images, including FAILED Jobs; no cleanup policy change.

Audit Job linkage adds `jobAccepted`, `binaryReceipt=CONFIRMED|UNKNOWN`, normalized input SHA, checkpoint and operator binding metadata. A missing Job remains unconfirmed; REQUEST/RESULT audit events are still operator-reported rather than server observation of the Native call. Migration checks exact deployed function checksums before additive updates. `native-preserved-input-regression.sql` exercises packet/Claim/dispatch/release/new receipt and identity/ACL guards in a rolled-back transaction; queued pg_net requests never commit or reach the worker. These protocol fixtures do not certify scheduled Native generation or first connector egress.
