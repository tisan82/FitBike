# 통합 Authoring Source 공급 및 검수·등록 통합 설계

상태: **설계·DB 시제품. 운영 미적용.** 2026-10-15 KST.
기준: FitBike main `26ce29a74a627e63a52311764cb5f9a97596280b` 및 같은 날 운영 schema 조회.
운영 단계: **1·2 통합 채팅 → 3-A 제작 → 검수·등록 통합 → 4단계 게시**.
이 문서는 개발 명세이며 현재 운영 기능이나 배포 완료를 의미하지 않는다.

## 1. 목표와 범위

통합 1·2단계가 본문과 이미지 Contract를 확정하면서 실제 제작에 사용할 Source 원본까지
저장한다. 사용자는 별도 공급 채팅을 운영하지 않는다. 3-A는 해당 자산을 읽어 제작·픽셀 QA·
QA_PENDING 인계를 수행한다. 공급 시점에 최종 제작·검수 PASS를 대신 기록하지 않는다.

MVP는 검증 가능한 공개 HTTPS 실사 Source와 기존 파일의 서버 접수다. 검색은 채팅의 실제
검색 도구가 담당한다. 서버는 선택된 URL의 안전한 다운로드·검증·보존을 담당한다.
외부 OpenAI API/서버 생성 모델은 추가하지 않는다. Native 생성은 실제 내장 도구와 공식
파일 전달이 가능한 채팅에서만 별도 provenance와 함께 접수한다. 이 기능이 예약의 내장 생성
도구 제공 여부나 플랫폼 Safety Check를 해결한다고 주장하지 않는다.

## 2. 확인한 현재 구조

| 현재 구성 | 재사용 / 제한 |
|---|---|
| claim_authoring_v1 → complete_authoring_v1 | 조사·집필·V5 기획을 한 번에 저장. 완료 시 sync_images가 Image Task 생성 |
| 18.writer_artifact.authoringContext | 본문·근거 원본 보존. 별도 본문 테이블 생성 불필요 |
| 21_content_pipeline_image | Contract, 제작·검수·등록 상태. 기존 status/visual_phase 유지 |
| 27_content_pipeline_source_stage_job | Production Claim에 연결된 작업. Authoring 공급 레코드로 변용하지 않음 |
| 31_content_pipeline_native_asset | Task/Contract/Production Claim 기반 Native 영속 자산. Claim 이전 Source 원장으로 재사용 불가 |
| content-pipeline-native-handoff | private, PNG/JPEG/WebP, 파일당 8 MiB. 원본 파일 컨테이너로 재사용 가능 |
| content-pipeline-staging | private, WebP, 파일당 4 MiB. 제작 결과에 계속 사용 |
| content-assets | public WebP. 승인 후 기존 3-B만 등록 |
| source-stage/source.ts | HTTPS/DNS/redirect/크기/MIME 검증 재사용 |
| source-resume.ts / native-resume.ts | 같은 worker/Task/hash/Claim 검증. Authoring→Producer에 그대로 적용 불가 |
| claim_asset_publisher_v1 / dispatch_asset_publisher_v1 | 기존 승인 파일 등록·read-back·DONE 백엔드 재사용 |
| visual-mcp role filter | PRODUCER/REVIEWER만 지원. Authoring 공급 및 Reviewer 등록 도구 추가 필요 |

현재 complete_authoring_v1은 version/execution/planning/research/writer만 허용한다.
임의 최상위 sources 필드를 추가하면 안 된다. v2 API를 별도로 설계하고 v1 호환성을 유지한다.
권리 정책은 CONTENT.md의 현행 provenance-only 정책을 따른다. 신규 rights/license/permission
상태나 운영자 승인 Gate를 만들지 않는다. 기존 허용 범위·출처 정책을 낮추지도 않는다.

## 3. 데이터 모델

파일 저장소는 추가하지 않는다. 원본을 기존 private bucket의
`authoring-supply/{pipelineId}/{authoringRunId}/{supplyId}/{originalSha}.{ext}`에 저장한다.
버킷 이름의 native는 물리적 컨테이너 이름일 뿐 Source 분류는 원장에서 명시한다.
실제 작업자는 이 prefix와 신규 테이블을 함께 검사해야 하며 기존 Native endpoint의 Claim
검증을 제거해서는 안 된다.

신규 `content_pipeline_visual_supply`는 **공급 원장 1개**다. 추가 공급 상태는 기존 Image
status enum에 넣지 않는다. 상세 DDL은 schema-prototype.sql을 참조한다.

| 필드군 | 의미 |
|---|---|
| supply_id, operation_id, intent_hash | 공급·재호출 식별. 동일 operation의 다른 입력은 충돌 |
| pipeline_id, authoring_run_id, image_id | Task 생성 전 임시 연결 |
| contract_hash | 서버 정규화 결과 Hash. 클라이언트 임의 Hash 신뢰 금지 |
| pipeline_image_id | 완료 트랜잭션에서 실제 Task 연결 |
| source_role | PRODUCTION_INPUT 또는 REFERENCE_ONLY |
| source_kind | REAL_SOURCE 또는 CHATGPT_NATIVE |
| production_path | SERVER_TRANSFORM, STORED_NATIVE_OUTPUT, NATIVE_EDIT_REQUIRED, REFERENCE_ONLY |
| lifecycle | PREPARED, STORED, BOUND, FAILED, REJECTED, SUPERSEDED |
| bucket/path/original_sha256/mime/bytes/dimensions | 서버가 확인한 원본 identity. 만료 URL 저장 금지 |
| source_page_url/source_asset_url/source_owner/provenance | 출처 원문. 비밀 토큰·서명 다운로드 URL 저장 금지 |
| technical_verified_at/source_inspected_at/source_evidence | 기술 검증과 공급 단계의 실제 관찰. 최종 QA와 별개 |
| native_evidence | 실제 생성·편집 시 원문 도구 인자/결과/출력 identity. Native가 아니면 불필요 |
| is_selected | 해당 Task에서 사용할 primary 제작 입력. 참고용은 선택 불가 |

원본 SHA, 정규화 WebP SHA, 최종 canonical SHA는 구분한다. 공급 원본을 390/780px preview로
대체하지 않는다. SOURCE 원본은 최대 8 MiB, decode 픽셀 상한 등 기존 안전 한도를 적용한다.
8 MiB 초과는 정책에 따라 명시적 오류로 종료하고 원본을 몰래 축소하여 동일 파일이라고 기록하지 않는다.

## 4. 하나의 통합 채팅에서 실행하는 순서

1. 기존 Authoring Claim으로 조사·본문·이미지 기획을 진행한다.
2. `prepare_authoring_sources`가 현재 run과 전체 V5 briefs를 검증하고, 기존 sync와 **같은
   정규화/Contract 생성 함수**로 image_id별 manifest와 hash를 반환한다. 이미지별 공급 intent를
   생성한다. 이 단계는 Production Claim을 만들거나 Task 상태를 바꾸지 않는다.
3. 채팅이 실제 Source를 탐색하고 원본 픽셀을 확인한다. HTML/XML은 기존 resolver로 실제
   이미지 URL을 추출한다. 문서 URL을 이미지 URL로 간주하거나 추측하지 않는다.
4. `persist_authoring_source`가 Source URL 또는 공식 fileParams 하나만 받아 다운로드→
   signature/decode→원본 SHA→Storage 저장→read-back SHA 검증 후 STORED를 기록한다.
   파일 경로·SHA·verified=true는 클라이언트가 지정하지 못한다. 파일 전달이 실패하면
   실패 code를 남기며 URL 기록만으로 STORED를 만들지 않는다.
5. `complete_authoring_v2`가 기존 본문 완료·image sync·공급 연결을 **한 DB 트랜잭션**에서
   처리한다. sync 결과의 image_id/asset_key/Hash를 실제로 재확인하고 공급을 BOUND로 바꾼다.
   연결 오류는 전체 트랜잭션 rollback이다. Draft 본문을 복제 저장하지 않는다.
6. 파일이 없는 이미지도 본문을 잃지 않도록 DRAFTED로 저장할 수 있지만 해당 Task는
   INPUT_REQUIRED 상태로 Queue에서 제외한다. 응답은 콘텐츠 저장과 공급 완료를 구분하여
   CONTENT_SAVED_SOURCE_PENDING 및 missingImageIds를 반환한다. 전부 준비됐을 때만
   AUTHORING_READY_FOR_PRODUCTION을 반환한다.
7. 이후 같은 통합 채팅의 `resume_authoring_source_supply`로 미확보 이미지의 공급만 재개한다.
   DRAFTED 본문 재작성·새 Topic 생성·Production Claim은 하지 않는다. 새 제한 세션은 현재
   Task/hash에만 연결되며 원래 작성 run의 provenance를 유지한다.

prepare와 complete 사이에 Brief가 바뀌면 새로운 manifest를 만든다. 이전 Hash 공급은
SUPERSEDED로 보존하며 자동 재사용하지 않는다. 본문 저장 전에 Task가 있다고 가정하면 안 된다.
prepare 이후 응답 유실은 operationId로 조회하고 동일 입력만 재생한다.

## 5. 3-A Queue와 Claim

21에 `source_supply_policy`를 추가하되 기존 row/default는 LEGACY다. v2에서 생성·연결한
Task만 INPUT_REQUIRED를 설정한다. 기존 대기 작업 전체를 한 번에 차단하거나 migration으로
이미지 상태를 바꾸지 않는다.

INPUT_REQUIRED의 신규 제작 가능 조건:

- 정확한 Task/현재 Contract Hash에 연결된 BOUND + selected PRODUCTION_INPUT이 존재한다.
- Storage read-back·signature·decode 증거와 공급 단계의 실제 픽셀 관찰이 있다.
- SERVER_TRANSFORM 또는 이미 저장된 Native 출력처럼 현재 worker가 실행 가능한 경로다.
- 참고용 이미지, URL만 기록한 후보, NATIVE_EDIT_REQUIRED, FAILED/REJECTED/SUPERSEDED는 제외한다.

Queue 조회와 Claim 모두 동일 predicate를 사용하고 Claim은 Task/supply lock 안에서 재검증한다.
Stage worker는 실제 파일을 다시 읽어 identity를 확인한다. readiness 함수는 DB 기록 조회일 뿐
실제 Storage가 여전히 존재한다는 증거를 대신하지 않는다. 파일 누락·변조는 안전하게 실패하고
source 재공급 대상으로 돌린다. final pixel PASS를 상속하지 않는다.

기존 recoverableProductionCandidate/Staging/NativeInput는 계속 우선한다. 완전한 복구 후보가
있으면 새 입력을 중복 요구하지 않는다. 다만 source가 의미적으로 거절된 경우에는 거절 identity를
재사용하지 않는다. legacy eligibility와 공급 eligibility는 기존 phase/lease/nextEligibleAt 검사를
모두 통과한 뒤 결합한다. 단순 OR로 Claim·HOLD·DONE 조건을 우회하면 안 된다.

AUTHORING→PRODUCER는 서버 승인된 공급 identity를 새로운 active Claim에 채택하는
`dispatch_visual_supplied_source` 경로로 구현한다. 기존 same-worker 복구 조건을 삭제하지 않는다.
이 도구는 supplyId/requestId/operationId/transform만 받고 서버가 URL/path/hash를 결정한다.

## 6. 공급 실패와 보존

| 상황 | 처리 |
|---|---|
| Source 없음 | 이미지별 미확보 이유·실제 탐색 내역 저장, Source 준비 전 무효 Claim 금지 |
| Native 도구 없음 | NATIVE_TOOL_UNAVAILABLE. serverGenerationSupported=false와 구분 |
| 파일 전달 실패 | FILE_HANDOFF_FAILED. 생성 실패·Source 없음으로 합치지 않음 |
| 저장/read-back/decode 실패 | 구체적 기술 code. 공급 미완료 유지 |
| Contract 변경 | 기존 공급 제외, 새 Hash에 재검증 후 새 binding |
| Producer semantic reject | 해당 공급 REJECTED, primary 선택 해제, 다음 실행에서 재사용 금지 |
| 플랫폼 도구 차단 | 그대로 보고, 같은 실행에서 우회·반복 호출 금지 |

Bound 및 미종료 콘텐츠의 공급 원본은 cleanup에서 보호한다. PREPARED/FAILED orphan은
예: 7일 뒤 bounded cleanup 대상으로 제안한다. 실제 TTL은 기존 유지 정책과 일치시켜 결정한다.
cleanup plan/reserve/guard/실제 worker 전부에서 같은 보호 조건을 검사한다. Storage 객체 삭제는
Storage API로만 수행한다. DB transaction으로 Storage 삭제까지 원자적이라고 주장하지 않는다.
파일 업로드 후 DB 기록 실패는 operation별 orphan으로 복구/정리하며 성공으로 보고하지 않는다.

## 7. 도구 개선 명세

새 이름은 제안이며 현재 노출 도구가 아니다. 실제 schema 계약은 tools-contract.json에 둔다.

| 도구 / 역할 | 개발 내용 |
|---|---|
| prepare_authoring_sources / AUTHORING | run fence, V5 normalizer, provisional supply manifest |
| persist_authoring_source / AUTHORING | 공식 fileParams 또는 안전한 URL ingest, 원본 proof 저장 |
| get_authoring_source_supply / AUTHORING | operation 응답 복구, 이미지별 미확보 사유 |
| resume_authoring_source_supply / AUTHORING | DRAFTED 이후 같은 콘텐츠의 누락 자산만 보완 |
| bind_authoring_source / AUTHORING | 공급 재개 세션에서 현재 Task/hash 확인 후 새 자산 연결 |
| complete_authoring_v2 / AUTHORING | v1 호환 유지, 본문 저장·Task sync·binding 원자 처리 |
| resolve_visual_source_assets / AUTHORING | 기존 read-only resolver 재사용 |
| dispatch_visual_supplied_source / PRODUCER | 공급 identity를 현재 Claim에서 안전하게 소비 |
| publish_approved_visual_asset / REVIEWER | 아래 검수·등록 통합. approve와 별도 도구 |
| get_visual_publish_result / REVIEWER | 등록 결과 유실/비동기 polling/재개 |

현재 MCP는 AUTHORING endpoint role을 지원하지 않는다. 전용 제한 endpoint/인증을 추가해야 한다.
AUTHORING에는 Production/Review/Publisher Claim 권한을 주지 않는다. 기존 allowlist operator
인증으로 worker를 서버에서 도출하고 모든 session/run/supply 접근을 검증한다. PUBLIC/anon/
authenticated에는 원장 및 RPC 권한을 주지 않는다. client의 workerKey를 신뢰하지 않는다.
Authoring 채팅이 Supabase 도구로만 동작한다면 fileParams가 없으므로 Native 파일 접수는 해결되지
않는다. 공식 파일 입력을 지원하는 Authoring MCP 연결이 필요하다. URL ingest MVP는 별개다.

프롬프트는 역할별 pipeline 도구 제한과 실제 검색·내장 생성 도구 사용 허용을 명시적으로
분리해야 한다. 프롬프트가 런타임에 없는 도구를 만들어 주지는 않는다.

## 8. 검수·등록 통합 검토

**권장: 한 번의 예약 실행에서 연속 처리하되 DB 상태와 Claim은 분리한다.**

Reviewer Claim → 실제 픽셀 QA → approve_visual_source → READY_FOR_UPLOAD/Reviewer Claim 해제
→ publish_approved_visual_asset → 별도 Publisher Claim → 기존 dispatch_asset_publisher_v1
→ read-back/decode/SHA → DONE/Publisher Claim 해제.

저장·검증 백엔드는 기존 3-B를 재사용한다. Reviewer에 임의 업로드/이미지 교체 API를 노출하지
않는다. 승인된 동일 pipelineImageId/approved Job/Contract Hash/canonical SHA만 등록한다.
승인 직후 새 Task를 고르지 않고 방금 승인한 정확한 Task를 처리한다. 등록 의도는 별도 requestId다.

| 필요한 개발 | 이유 |
|---|---|
| 승인 자산 전용 publish MCP + 조회 | 현재 Reviewer endpoint에 Publisher 도구가 없음 |
| 등록 request receipt와 operation replay | 기존 3-B token 기반 호출을 응답 유실 후 안전하게 재개 |
| approval snapshot 잠금·대조 | 승인 후 자산 변경, 중복 등록, 다른 Task 등록 방지 |
| Publisher lease 재개/해제 확인 | 만료된 Reviewer lease 재사용 금지 |
| protocol/capability/role schema | REVIEWER의 등록 권한을 승인된 자산으로 제한 |
| 통합 실행 프롬프트 | 성공 DONE와 등록 대기 READY_FOR_UPLOAD 구분 |

Publish tool은 승인된 Task만 exact claim하고 비동기면 DISPATCHED/IN_PROGRESS를 반환한다.
get_visual_publish_result가 서버 receipt를 조회한다. DONE 재호출은 같은 identity 결과만 반환한다.
다른 입력의 동일 requestId는 REPLAY_CONFLICT다. 등록 실패 시 READY_FOR_UPLOAD checkpoint를
유지하고 같은 파일로 등록부터 재개한다. 무조건 RETRY/PRODUCTION_PENDING으로 되돌리지 않는다.
실제 semantic 문제로만 정식 return-to-production 경로를 쓴다.

동시에 기존 독립 3-B가 실행돼도 같은 Task를 두 번 점유하지 못하게 기존 lease/row lock을
유지한다. 예약 통합 배포 전 기존 3-B와의 대상 중복·비활성화 정책을 운영자가 확인할 수 있게
보고하되 이번 설계에서 예약을 변경하지 않는다. 4단계는 필요한 모든 Image DONE를 확인한 후
콘텐츠 전체 QA·게시를 계속 담당한다.

## 9. 개발 순서와 검증 기준

1. 공통 normalizer/Contract preview 추출 + 공급 원장·RLS·private 원본 prefix/cleanup 보호.
2. Authoring URL/file intake, SHA/readback/decode, 실제 source 관찰 및 응답 복구.
3. complete_authoring_v2 원자 binding + 부분 공급·DRAFTED 후 공급 재개.
4. Queue/Claim predicate + supplied-source dispatch + 의미적 거절 invalidation.
5. 통합 1·2단계/3-A 프롬프트 및 실제 CHAT→SCHEDULED 1건 acceptance.
6. 검수·등록 publish tool/receipt + 기존 3-B 재사용·통합 프롬프트.

필수 acceptance: 미리 준비한 실제 이미지로 통합 작성→3-A→QA_PENDING, 다른 worker가 공급
파일을 안전하게 소비, 최종 픽셀 재검사, 참고용만 있을 때 미선정, run/hash 변경 실패,
URL/file 변조 실패, 중복 operation replay, cleanup 생존, 승인 후 등록 실패·재개,
Reviewer/Publisher 동시 실행·lease 만료·approval SHA 변경·DONE 재호출.

schema-prototype.test.mjs는 DDL 관계·제약·기본 권한·readiness만 확인한다. HTTP/file transport,
실제 SHA 계산·decode·Storage read-back, 전체 authoring/Claim atomicity, 등록 E2E를 검증한 것이
아니다. schema-prototype.sql은 자동 migration 경로 밖에 두며 단독 Production 적용 금지다.

배포: 새 준비 API/worker/cleanup을 먼저 배포하고 feature off 상태에서 검증한 뒤 v2 신규 작성만
opt-in한다. 기존 상태 일괄 변경 금지. rollback은 신규 v2 진입을 끄고 이미 저장한 자산/원장을
보존한다. column/table drop이나 전체 LEGACY 전환으로 Gate를 우회하지 않는다.

## 10. 다음 구현 시 수정 파일 경계

- unified Authoring SQL: v2 prepare/complete/resume RPC, source table, additive image policy.
- Source Stage: supplied input의 server admission·다운로드 identity·provenance, 기존 QA 유지.
- Visual MCP index/role contract/generation capability: 역할별 공급/등록 도구와 protocol.
- Native asset worker: 검증 코드를 공용화하되 기존 Claim guard 유지.
- Staging/native cleanup: supply protection과 orphan 복구.
- CONTENT_FACTORY.md, CONTENT_QUEUE.md, stage-2/production/review prompts, API.md, schema export:
  구현·검증과 함께 최소 범위로 갱신. 이 설계 자체를 현재 기능으로 정책 문서에 선언하지 않음.

정책 충돌: NONE. 신규 권리 승인, 외부 생성 모델, QA 생략 없음.
미해결 외부 경계: 예약 Native 도구 제공·공식 파일 egress·OpenAI safety block은 서버 설계로 보장 불가.
