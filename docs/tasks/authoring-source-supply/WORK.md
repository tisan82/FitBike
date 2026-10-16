# SOURCE_SUPPLY_V1 구현·배포

요청: 통합 1·2단계 Source 공급과 3-A 연결의 실제 구현. 검수/3-B 통합과 예약 변경은 제외.

## 구현 결정

설계 시점의 Task 생성 전 provisional 공급은 이 버전에서 사용하지 않는다. 동일 통합 채팅 안에서
본문·V5 기획 저장으로 실제 Task와 Hash를 먼저 확정하고 즉시 원본을 공급한다. complete wrapper가
INPUT_REQUIRED를 같은 DB 트랜잭션에 설정하므로 Source 미확보 Task가 중간에 Claim되지 않는다.
기존 본문 중복 저장·임시 Contract Hash 계산 경로·추가 Storage bucket은 만들지 않는다.

공급 원장은 service-only/RLS다. 실제 파일 download→signature/decode→원본 SHA→private 원본 저장
→read-back을 거쳐 READY가 된다. 공급 입력은 REAL_SOURCE다. 생성 결과를 실제 사진으로 분류하지
않으며 추가 Native 편집이 필요한 자료는 REFERENCE_ONLY로 남긴다. 기존 Native 생성/복구는 별개다.
실제 Source 관찰과 expectedSha를 먼저 요구하며 최종 canonical/mobile QA는 상속하지 않는다.

3-A는 현재 Claim에서 selected READY 공급을 Task/Hash로 admission하고 원본을 Storage에서 읽는다.
다른 operator의 공급도 서버가 허용한 정확한 Task로 소비할 수 있다. 기존 same-worker 복구 조건은
변경하지 않는다. Reviewer는 공급 원본을 다시 다운로드하지 않고 저장된 canonical 후보로 최종화한다.
원본 Source SHA와 canonical SHA를 구분해 유지한다.

영구적인 공급 파일 404·identity 불일치 및 확정된 중복·의미 거절은 해당 입력만 무효화한다.
네트워크/503 등 일시 장애는 원본을 거절하지 않는다. 초기 작성 실패는 owner-fenced fail 도구로
HOLD/BLOCKED 종료한다. 실패 보고 때문에 예약을 비활성화하지 않는다.

## 검증

배포 전 릴리스 회귀 173/173 PASS. 독립 QA SQL/intake/Stage/MCP 경계 109/109 PASS.
실제 PGlite SQL(Claim·본문 동기화·공급·dispatch 자식), 실제 ImageMagick 원본 decode,
Storage read-back 실패·변조·재호출, Reviewer finalization과 기존 제작/검수 회귀를 포함한다.
SQL HTTP dispatch 외부 호출 및 Storage I/O는 테스트에서 통제된 대체 구현을 사용한다.
따라서 실제 OAuth CHAT→SCHEDULED→QA_PENDING 성공을 이 숫자로 주장하지 않는다.

릴리스 migration은 CLI로 생성한 20261016012935_authoring_source_supply.sql이다.
scripts/content-factory/source-supply.sql과 동일성 검사가 적용된다. 기존 배포 workflow가 정확한
migration/history를 원자 적용하고 rollback-only 운영 SQL 검증 후 Stage→MCP를 배포한다.
SQL regression은 테스트 증거를 transaction 안에서만 만들고 rollback한다. 실제 관찰 PASS를
운영 레코드에 만들어 넣지 않는다. GitHub Actions 실행 로그와 운영 Edge read-back이 배포 증거다.

공급 원본은 native-handoff의 authoring-supply/ prefix에 보존하며 이번 릴리스에서 자동 삭제하지
않는다. 운영 daily cleanup은 별도 staging bucket만 대상으로 한다. 향후 원본 정리 기능을 만들면
selected/미종료/복구 자산을 보호하는 별도 정책과 bounded cleanup을 구현해야 한다.

## 연결과 실행

통합 작성용 MCP 주소:

`https://farjyjcvduthawpdjuqe.supabase.co/functions/v1/content-pipeline-visual-mcp?role=AUTHORING`

기존 Supabase OAuth와 동일 verified operator 계정/allowlist를 사용한다. 이 서버 주소를 통합
작성용 연결에 설정하고 capability의 connectedRole=AUTHORING, sourceSupplyVersion=SOURCE_SUPPLY_V1을
확인한다. 서버 배포가 ChatGPT의 신규 연결 생성/도구 schema 새로고침까지 대신하지는 않는다.
기존 Producer_02 연결은 PRODUCER endpoint를 유지한다. 새 dispatch_visual_supplied_source가
안 보이면 연결의 schema를 새로고침/재연결해야 한다. 없는 도구를 호출했다고 기록하지 않는다.

정식 통합 작성 프롬프트: docs/tasks/visual-contract-v5/stage-2-prompt.md.
정식 3-A 제작 프롬프트: docs/tasks/visual-contract-v5/production-prompt.md.
기존 예약 문구는 이번 릴리스에서 변경하지 않는다.

기존 DRAFTED 콘텐츠에서 Source만 보완할 때는 AUTHORING 연결에서 다음을 실행한다.

> pipelineId를 지정해 open_authoring_source_supply로 현재 Task/Hash와 누락 입력을 조회한다.
> 본문과 Contract를 변경하지 않고 현재 미확보 이미지의 실제 실사 Source를 찾아 preview의
> 픽셀·원본 SHA를 확인한 뒤 persist_authoring_source로 저장한다. get_authoring_source_supply로
> missingImageIds와 선택 READY 입력을 재조회한다. Production Claim·최종 QA·등록·게시·예약 변경은 하지 않는다.

배포 후 사용 승인은 실제 연결에서 해당 프롬프트로 한 콘텐츠를 공급하고, 3-A CHAT 및 SCHEDULED
실행에서 실제 후보를 검사하여 QA_PENDING/Claim 해제를 확인한다. 플랫폼 Safety Check는 우회하지 않는다.

## 복구 및 정책

기존 Task는 LEGACY 그대로다. 명시적으로 Source 재개한 콘텐츠와 새 공급-aware 작성 경로만
INPUT_REQUIRED를 사용한다. 새 경로를 중단하더라도 원장/파일을 삭제하거나 일괄 LEGACY 전환하여
Gate를 우회하지 않는다. 기존 v1 Authoring/Producer/Reviewer API는 유지한다.

Persistent Knowledge: 신규 Global rule NONE. 서비스 실행·Queue·API·schema delta와 정식 프롬프트를
기존 Source of Truth에 갱신했다. Policy Conflict NONE. 추가 권리 승인 Gate·외부 생성 모델 없음.
