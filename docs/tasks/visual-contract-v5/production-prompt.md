# FitBike 3-A 제작 — V4/V5 호환 · 저장 후보 · 검수 인계

대상 pipelineImageId: 미지정

공식 Production Queue에서 Image Task 1건을 처리한다. 성공 종료는 실제 STAGED 후보 → handoff_visual_review → visualPhase=QA_PENDING → 인계 Job/Contract/SHA 일치 → Production activeClaim=false 재조회다. Reviewer QA 기록·승인·READY_FOR_UPLOAD, 3-B 업로드/DONE, 게시, 코드/DB/Contract/예약 변경은 수행하지 않는다.

## 실행 전과 Claim

현재 AGENTS.md 및 CONTENT.md → CONTENT_FACTORY.md → CONTENT_QUEUE.md를 확인한다. 최신 도구 schema·Capability·Queue와 대상의 최신 Contract를 실제 조회한다. claim_visual_production, handoff_visual_review, 공식 Dispatch/Inspection/조회/fail 도구가 필요하다. legacy claim_visual_image로 대체하지 않는다.

자기 requestId의 유효한 미완료 Claim을 먼저 복구한다. 다른 실행 점유, QA_PENDING, READY_FOR_UPLOAD, DONE, HOLD, eligibility 미충족은 서버 Queue 정책에 따라 제외한다. Worker/이미지 잠금을 임의 변경하지 않는다. 실행 intent마다 requestId 하나를 만들고 응답 유실 시 같은 ID로 공식 결과를 조회한다. Claim receipt의 Task/전체 Contract Hash/소유권/만료를 확인한다.

## 계약과 복구

V5는 작은 generationContract와 별도 visualPolicy를 함께 사용한다. 모든 must_show가 필수이며 objective/user_question의 추상 의미를 새 Gate로 추가하지 않는다. 제작 방식은 서버 허용 범위에서 선택한다. V4는 기존의 명시적 생성/실사/Annotation/모바일 제한을 그대로 따른다. Contract/Hash를 수정하지 않는다.

recoverableProductionCandidate가 있으면 새 Source 탐색·생성 대신 같은 Worker/Task/Contract/Job/SHA의 기존 후보를 실제 Inspection하고 인계를 재개한다. recoverableStaging도 현재 역할의 executionProtocol/nextAction에 따라 처리한다. semantic 무효화 후보는 재사용하지 않는다. 닫힌 Claim이나 Task 조회 결과만으로 쓰기 권한이 생기지 않는다.

## 후보 확보

V5 NONE은 일반 상황 NATIVE_FULL_GENERATION 또는 실제 Source를 사용할 수 있다. REFERENCE는 실제 검사한 근거 기반 제작이며 REQUIRED는 검증된 실제/공식 Source 기반 최종 자산이어야 한다. 실제 구조·표시·손상을 바꾸지 않는 허용 편집만 수행한다. Source 부재 때문에 evidence level을 바꾸지 않는다.

이미 확보된 evidence_ref를 먼저 확인한다. HTML/XML 문서에서 실제 이미지가 필요하면 resolve_visual_source_assets를 사용하고 반환 preview를 실제 열어 적합성을 확인한다. HTML 문서 URL을 sourceAssetUrl로 접수하지 않는다. PDF는 다른 적합한 실제 자산이 없을 때 해당 페이지 범위로 사용한다. Source 후보가 403/404/MIME/내용 불일치이면 같은 URL 반복 대신 독립 후보로 교체한다. 실제 근거가 없는 상태 차이·가짜 경고/라벨은 만들지 않는다.

Native가 필요한 경우 현재 채팅의 실제 도구와 감사 입력을 확인한다. 서버 generation/reference capability false를 내장 도구 부재로 해석하지 않는다. 일반 ChatGPT 내장 생성/편집만 사용하고 외부 API/서버 모델은 금지한다.

감사는 실제 도구 schema와 실제 호출 값으로 validate_visual_generation_call → REQUEST → 호출 → RESULT를 기록한다. 누락값은 추측하지 않는다. 서버는 Native 호출을 자동 관찰하지 않는다. 생성 prompt에는 현재 장면·필수·금지 요소만 전달한다. 운영 지시/QA보고/ID/Hash를 이미지 대상으로 요청하지 않는다. 신규 생성에는 num_last_images_to_include를 생략하고 편집에는 현재 Task에서 실제 검사한 입력만 명시한다.

현재 호출의 반환 파일만 실제 열어 장면 일치 여부를 확인한다. 수정 가능한 생성 실패는 같은 Claim에서 최대 3회 또는 현재 적용되는 더 구체적인 정책까지 수행한다. 각 호출과 접수 전 Claim/Hash를 재확인한다. 이 화면 검사는 Reviewer 최종 QA PASS가 아니다.

## 공식 Staging과 인계

실제 Source는 dispatch_visual_source, Native 반환 파일은 dispatch_visual_generation의 현재 공식 file 입력 또는 검증된 URL+SHA 경로를 사용한다. V5 NONE full generation은 productionMethod=NATIVE_FULL_GENERATION, references=[]다. Reference/Edit 방식은 실제 검사한 references를 사용하고 AI edit는 실제 inputFile 연결도 검증한다.

제작은 preflightOnly=true의 unannotated 후보를 접수한다. 현재 지원 schema에 맞춰 실제 Source/Reference·확인 사실·제작 방식·transform을 기록한다. operationId는 후보 intent마다 하나를 유지하며 응답 유실 시 공식 조회로 복구한다.

BLOCKED_FILE_REFERENCE 등 전달 실패면 오류 원문과 동일 operationId 접수 결과를 기록한다. 좋은 이미지를 전달 실패 때문에 반복 생성하지 않는다. 차단된 파일을 경로/URL로 위장하지 않는다. 실제 허용되는 전달 경로만 사용한다.

STAGED, Storage/decode/SHA를 실제 조회한다. inspect_visual_source 원본과 390px image 블록을 실제 열어 현재 장면과 필수 대상이 있는지 확인한다. functions.exec에서는 각 image(block)을 출력한다. 기술 PASS만으로 픽셀 PASS를 주장하지 않는다.

같은 후보 Job/정확한 canonical SHA로 handoff_visual_review를 호출한다. 제작자는 record_visual_source_qa, 최종 annotation dispatch, approve_visual_source를 수행하지 않는다. Annotation·최종 QA는 검수에 전달한다. 인계 후 Task와 receipt를 별도 재조회하여 QA_PENDING, 동일 Job/Hash/SHA, Production activeClaim=false를 확인한다.

## 실패와 보고

자기 Claim만 공식 RETRY/HOLD 종료하고 activeClaim=false를 재조회한다. 기술 실패는 유효 저장 자산을 보존하며 SOURCE_MISMATCH로 무효화하지 않는다.

보고: Task/Topic/requestId/전체 Hash, 실제 경로·Native 횟수, 감사·반환 파일 기록, operationId/Job/source SHA/canonical SHA, 인계·최종 phase·activeClaim. 실패하면 마지막 성공 단계/정확한 오류/보존 자산/재개 지점을 추가한다.

다음 담당: 성공 시 3-A 검수. 실패 시 기록된 재개 지점 담당. 다음 작업을 반드시 한 줄로 명시한다.
