# FitBike 1~3단계 저장·도구 단순화

검토 기준: 2026-10-12 운영 DB, main 954dca26ac545d34d1c751be484062daf3a5cb47. 예약 설정·Supabase 예약용 프롬프트는 변경하지 않는다. AUDIT, root 단일 writer, 독립 DB/Native 정책 QA.

## DB 전체 목록

관련 18개 테이블, 실제 컬럼 264개. [DB_COLUMNS.csv](DB_COLUMNS.csv)는 컬럼명·타입·nullable·단계·SQL 정적 참조·축소 판단을 전부 나열한다. [ARTIFACT_KEYS.csv](ARTIFACT_KEYS.csv)는 planning/research/writer JSON의 실제 top-level 키 목록이다. 실제 값·개인정보·토큰·URL·바이너리는 포함하지 않는다. 함수 텍스트 참조는 실행 의존성 후보이며, 참조 없음이 컬럼 삭제 증명은 아니다.

| 테이블 | 컬럼 수 | 사용 단계/책임 | 판단 |
|---|---:|---|---|
|16_content_topic|24|1 기획·Queue·중복·범위|주제 핵심 유지|
|18_content_pipeline|22|1~4 단계 Artifact/본문/진행|신규 1·2단계는 writer_artifact.authoringContext 단일 저장; 구형 컬럼은 기존 건 호환 유지|
|19_content_pipeline_run|9|1~4 실행 이력|단계별 결과 유지|
|21_content_pipeline_image|37|2 Brief/Contract → 3A/검수/3B Task|ID·Hash·Claim·후보 유지; 상태 중복 컬럼은 소비자 이관 후 통합|
|23_content_pipeline_image_run|14|제작/검수/3B 실행 결과|raw Contract/hash 유지; 파생 JSON 신규 중복 저장 제거|
|27_content_pipeline_source_stage_job|15|제작 spec/result·Staging·받은 Native 입력 복구|자산·Job·SHA와 generatedInput 체크포인트 유지|
|29_content_pipeline_visual_claim_request|6|실행 intent/소유권/응답 유실 복구|receipt 핵심 유지; 파생 JSON 신규 중복 저장 제거|
|content_pipeline_visual_delivery_event|24|Probe/관찰/최신 뷰/회로 차단|검사 관찰 유지; 새 pending/evidence 테이블 추가 없음|
|30_content_pipeline_native_attempt_event|9|Native 사용 시 REQUEST/RESULT 연결|Native 사용 때만; raw binary/URL 복구 증명과 구분|
|17_content_asset_source|22|Source 출처 이력·3B|URL/운영자/편집 이력 유지; 권리 관련5컬럼은 신규 입력 제외·폐기 후보|
|20_content_pipeline_asset_upload_ticket|8|업로드 보안 ticket|활성0건이지만 소비 경로 제거 전 유지|
|24_content_pipeline_source_ingest_ticket|9|Source 수신 보안 ticket|활성0건이지만 소비 경로 제거 전 유지|
|25_content_pipeline_generated_asset_handoff|12|구형 분할 수신|9건, 활성0; 레거시 API 폐기 후 제거 후보|
|26_content_pipeline_generated_asset_chunk|3|구형 분할 binary|0건; 부모/append/consume 경로 폐기 후 제거 후보|
|28_content_pipeline_source_stage_inspection_chunk|4|구형 검사 binary 전송|신규 쓰기 중단 배포·실제 STAGED/0조각 검증 완료; 2026-10-12 재조회904건은 이력/정리 경로 유지|
|31_content_pipeline_native_asset|32|배포된 Native 입력 저장·복구 Edge 경로|0건이지만 content-pipeline-native-asset v1의 실제 조회·upsert 확인; 미사용/삭제 대상으로 확정하지 않음|
|content_pipeline_maintenance_run|11|Storage 정리|1~3단계 본문/검사 입력 아님; 삭제 보호에 필요|
|content_pipeline_staging_cleanup_lease|3|Storage 정리 경합 방지|1~3단계 본문/검사 입력 아님; 삭제 보호에 필요|

## 1~3단계 최소 업무 입력

- 1단계: 주제/고객 질문/적용 범위, 검증 사실·출처·미확인 사실. 별도 Source 제작 정책 사본을 만들지 않는다.
- 2단계: 본문 Artifact + V5 Brief9필드(contract_version,image_id,asset_role,user_question,visual_objective,must_show,must_not_show,evidence_requirement,alt_text_draft). 운영 Task ID/Hash는 서버 관리.
- 3A: requestId/역할, 현재 Contract, Job/spec/result와 actual Native file(필요 시). 받은 generatedInput은27 기존 checkpoint로 복구; 받지 못한 file_ref는 UNKNOWN.
- 실제 픽셀 관찰: eventId/requestId/jobId/view/pixelQa/evidence6필드. runtime/SHA/Task/Contract/역할은 서버가 채운다.
- 검수 승인: 같은 후보의 실제 검사와 기존 QA/승인 프로토콜. 관찰 기록은 승인 대체가 아니다.

## 이번 축소

새 테이블/컬럼 추가 없음, 과거 기록·Contract·승인 자산 삭제 없음. 신규23.metadata/29.response에서 nativeGenerationContext/nativeGenerationIsolationPolicy/runtimePolicy/reviewRequirements/preservedStagingInput 파생 정보의 반복 저장을 줄인다. 동일 API 필드는 frozen Contract 및 현재 권한/체크포인트로 읽을 때 복원한다. 원본 raw Contract/hash, token/run/role/request identity는 보존한다. 확인되지 않은 컬럼은 DROP하지 않는다.

API는 typed legacy event + 최소 후보 관찰 + eventId 조회 + 미완료 뷰 복구를 제공한다. 미완료 요청의 raw evidence를 저장하는 테이블을 만들지 않는다. 응답 유실은 exact eventId 조회로 복구하고, 다음 새 Claim은 동일 Job/SHA를 재개하되 새 실제 관찰을 기록한다. 과거 eventId에 새 requestId를 덮어쓰지 않는다.

역할 endpoint는 동일 operator identity를 유지하며 도구 노출/호출과 receipt 역할을 제한한다. 도구 연결 주소는 기존 endpoint 뒤 ?role=PRODUCER / ?role=REVIEWER. 기존 shared 연결은 호환 유지. ChatGPT 계정 플러그인 연결 설정과 예약은 자동으로 변경하지 않는다.

2단계 Source는 실제 외형 자체가 답변의 근거인지로 NONE/REFERENCE/REQUIRED를 정한다. 일반 장면에 실제 물체가 등장했다는 이유만으로 REQUIRED를 강제하지 않는다. 매뉴얼은 사실 근거가 될 수 있지만 최종 자산은 차선책이며 실사/실제 UI 요구를 매뉴얼 도해로 대체하지 않는다. REQUIRED 생성 금지/기존 V4 제한은 유지한다. §7 직접 사용 금지와 V5 REAL_SOURCE_DIRECT 허용의 문서 충돌을 해결했다.

## 검증/출시

로컬87검사 통과: 기존 회귀 + typed 입력/응답 유실 조회/역할 제한/미완료 뷰 복구/전체 migration 컴파일·원자적 이력/lease 종료 후 replay 검증. 실제 RPC rollback·두 세션의 짧은 SELECT row-lock 경합 검증과 배포 read-back은 출시 단계에서 확인한다. 동시성 SELECT는 Task/Claim/자산 값을 변경하지 않는다. 실제 예약 간 복구·신규 Native 파일 최초 전달·서로 다른 Task의 실제 예약 동시 실행은 Work 테스트와 분리해 보고한다. 서버 테스트를 SCHEDULED 성공으로 기록하지 않는다.

DB DROP 후보는 단계별 레거시 consumer 제거와 외부 작성자 확인 후 후속 migration으로 처리한다. 이번 release의 축소는 신규 중복 저장 제거이며264→다른 수로 컬럼 수가 줄었다고 보고하지 않는다.

## 운영 배포 확인

- PR86 main 병합: `750279d7fcf38b7e11768bf5c303e35f619924b1`.
- Code Quality / Agent Orchestration QA / Supabase Visual Delivery 모두 SUCCESS. 워크플로87검사 PASS.
- 운영 migration `20261012012704` 적용, 실제 RPC rollback 회귀 PASS. 두 실제 DB 세션에서 같은 Task 잠금 제외·다른 Task 잠금 획득 PASS. Task/Claim/자산 값은 테스트 후 유지.
- Edge v37: 운영11개 파일을 해당 GitHub commit과 재조회 비교하여 모두 일치. PIXEL_RECORD_V2 capability 실호출 확인.
- Vercel 운영 READY, 동일 commit, fitbike.co.kr HTTP200 확인.
- 실제 Producer_01 연결은 connectedRole=SHARED. 계정의 App MCP 연결 주소는 파일 편집 도구로 변경할 수 없어, 제작/검수 역할 endpoint 적용은 연결 설정 변경이 남음. 예약은 변경하지 않음.
- 실제 SCHEDULED 예약 간 복구·두 Task 예약 동시 실행·신규 Native 최초 전달·저장 Native 복구는 이번 배포 검증에서 미실행. 서버 잠금 PASS를 예약 성공으로 계산하지 않음.
- 264개 컬럼 유지. 삭제 후보는 확인했지만 DROP하지 않았으며 신규 JSON 반복 저장만 축소.


## 2026-10-12 후속 결정

1·2단계는 일반 채팅에서 통합하며 예약은 3-A부터 시작한다. 1·2단계 통합 때문에 예약을 바꾸지 않는다. 신규 실행은 claim_authoring → 한 산출물 → complete_authoring을 사용한다. 구형 경로의 범위·현재 서버 호환 상태와 전체 검증 순서는 [RETIREMENT_SCOPE.md](RETIREMENT_SCOPE.md)를 따른다. 범위 확정과 API 서버 차단/물리 삭제는 서로 다른 조치다. 이번 후속 문서 변경은 신규 API 차단이나 DROP을 실행한 것으로 보고하지 않는다.

## 역할 연결과 실제 Work E2E 확인 (2026-10-12 KST)

- 공식 표준: Producer_02=PRODUCER(26도구), Reviewer_01=REVIEWER(22도구). capability 실호출과 현재 callable 목록 확인. 기존 Producer_01/Reviewer_02 SHARED는 신규 표준에서 제외; 기존 App URL 편집/삭제를 수행했다고 보고하지 않음.
- 기존 작성 콘텐츠 pipeline68 `motorcycle-fuel-octane-selection-guide`의 마지막 이미지43019를 실제 완결. 기존 본문/기획/근거/Contract는 보존했고 최종 assembly에서 H2 level·승인 이미지 배치·접힌 공식자료 영역을 적용.
- 내장 Native1회, REQUEST/RESULT exact reported argument read-back, official fileParams 첫 전달 PASS. 원본 PNG SHA `d08ee7a855830d2c93b70c7ec5313d442620636acec8801b4531afa1e7608caf`; 서버 보존 입력 SHA `33c79fb35724c69fbb2b9e3e48786a39e67ef0f428b62a4b2b976331aa0fef5a`.
- Producer receipt `bc1dfb70-1874-4c6c-b35f-07441153045f`: STAGED Job `32bec281-d921-41c4-a8a0-a7c6e09d07c5`의 canonical/390px 실제 관찰·최소 이벤트 저장 → QA_PENDING 인계 → activeClaim=false.
- Reviewer receipt `a91f6780-a6f2-42c5-b7f0-2b61d6540054`: 같은 후보 검사·QA기록 → 저장 입력 재사용으로 최종화 Job `b6b8b098-b33f-4ad0-acba-b4a70a364bac` → final canonical/390px 재검사·승인 → READY_FOR_UPLOAD/Reviewer activeClaim=false.
- 승인/Production SHA 동일 `0cd0a35e960f1e75c2ee9377561d577b7062cb8e29859c0009b9f15bfe9ff512`. 3-B run1474가 ticket-bound 서버 업로드·read-back 후 DONE/claim 해제. 모든4이미지 DONE → IMAGE_READY.
- 최종 QA run355 PASS; Publish run356에서 Content172 게시 후 HTTP200, canonical, 단일H1, H2, 실제4이미지·각 public binary SHA, ALT, 접힌 참고 공식자료, Article/Breadcrumb JSON-LD 확인 → COMPLETE/ownership COMPLETE/활성 image Claim0.
- 공개 결과: https://fitbike.co.kr/contents/motorcycle-fuel-octane-selection-guide . 이번 두 Source Stage Job의 구형 table28 조각은0행.
- 범위: Work에서 실제 기존 콘텐츠의 후속 제작·검수·업로드·게시 성공. 예약/SCHEDULED, 장애 후 FAILED native 입력 복구, 새 통합 authoring의 실제 콘텐츠 신규 저장, 두 Task의 실제 예약 동시 실행은 이 결과로 인증하지 않음. 통합 authoring SQL은 앞선 운영 rollback 회귀로 검증됨.
- 구형 신규 실행 지시 범위는 확정; 호환 SQL 서버 차단·테이블/컬럼 DROP은 아직 미실행. 예약/ Supabase 프롬프트 변경 없음.
