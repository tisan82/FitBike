# FitBike 3-A 제작 — V4/V5 호환 · 저장 후보 · 검수 인계

대상 pipelineImageId: 미지정

파이프라인 조회·Claim·Staging·검수 인계에는 FitBike Visual Producer_02를 사용하고 connectedRole=PRODUCER를 확인한다. Source 탐색에는 현재 실제 노출된 검색 도구를 사용할 수 있다. Native가 필요한 기존 Task는 실제 제공된 내장 생성 도구와 공식 파일 전달을 별도 확인한다. 없는 도구를 추정하지 않는다.

공식 Production Queue에서 Image Task 1건을 처리한다. 성공 종료는 실제 STAGED 후보 → handoff_visual_review → visualPhase=QA_PENDING → 인계 Job/Contract/SHA 일치 → Production activeClaim=false 재조회다. Reviewer QA 기록·승인·READY_FOR_UPLOAD, 3-B 업로드/DONE, 게시, 코드/DB/Contract/예약 변경은 수행하지 않는다.

## 예약 환경 진단과 실제 후보 검사 — CANDIDATE_QA_GATE_V2

예약 실행은 runtime=SCHEDULED, 일반 수동 채팅은 CHAT, Work 수동 실행은 WORK를 정확히 사용한다. 새 claim_visual_production에는 runtime이 필수다. runtime을 생략하거나 다른 값으로 바꿔 진단을 피하지 않는다.

환경 Probe는 선택적 진단이다. 환경 health가 UNKNOWN/UNVERIFIED/OPEN/expired여도 Claim 시작을 차단하지 않는다. 매 실행마다 get_visual_inspection_delivery_status·Probe·환경 PASS 기록을 먼저 요구하지 않는다. Claim 응답의 environmentObservation을 진단으로 보고한다. 실제 후보를 검사하지 않은 상태에서 환경 PASS를 만들지 않는다.

플랫폼 Safety Check가 도구 호출을 차단하면 동등한 다른 도구·연결·경로로 우회하거나 같은 실행에서 즉시 반복 호출하지 않는다. 가능한 읽기 조회로 접수 여부만 확인하고, 미접수이면 TOOL_CALL_BLOCKED로 보고한다. 소유 Claim이 실제 존재하면 정상 종료 경로로만 정리한다. 서버 오류와 플랫폼 차단은 별도로 보고한다.

## 실행 전과 Claim

현재 AGENTS.md 및 CONTENT.md → CONTENT_FACTORY.md → CONTENT_QUEUE.md를 확인한다. 최신 도구 schema·Capability·Queue와 대상의 최신 Contract를 실제 조회한다. claim_visual_production, handoff_visual_review, 공식 Dispatch/Inspection/조회/fail 도구가 필요하다. legacy claim_visual_image로 대체하지 않는다. 신규 Native 감사 연결을 검증할 때는 Capability의 nativeDispatchAttemptBindingSupported와 현재 dispatch schema의 spec.nativeAttemptId를 확인한다. schema가 갱신되지 않았으면 Native 검증을 시작하기 전에 PRECHECK_BLOCKED로 보고한다. Source 전용 제작에는 이 Native 전용 조건을 적용하지 않는다.

자기 requestId의 유효한 미완료 Claim을 먼저 복구한다. 다른 실행 점유, QA_PENDING, READY_FOR_UPLOAD, DONE, HOLD, eligibility 미충족은 서버 Queue 정책에 따라 제외한다. Worker/이미지 잠금을 임의 변경하지 않는다. 실행 intent마다 requestId 하나를 만들고 응답 유실 시 같은 ID로 공식 결과를 조회한다. Claim receipt의 Task/전체 Contract Hash/소유권/만료를 확인한다.

## 계약과 복구

V5는 작은 generationContract와 별도 visualPolicy를 함께 사용한다. 모든 must_show가 필수이며 objective/user_question의 추상 의미를 새 Gate로 추가하지 않는다. 제작 방식은 서버 허용 범위에서 선택한다. V4의 필수·금지 표현과 실제 출력 검사는 유지하되 과거 생성/실사 허용 boolean은 제작 방식 제한으로 사용하지 않는다. Contract/Hash를 수정하지 않는다.

recoverableProductionCandidate가 있으면 새 Source 탐색·생성 대신 같은 Worker/Task/Contract/Job/SHA의 기존 후보를 실제 Inspection하고 인계를 재개한다. recoverableStaging도 현재 역할의 executionProtocol/nextAction에 따라 처리한다. 둘 다 없고 recoverableNativeInput이 있으면 서버가 반환한 spec을 그대로 사용해 새 operationId로 dispatch_visual_generation을 호출한다. 이 입력은 저장된 입력일 뿐 STAGED/QA PASS가 아니다. 파일을 다시 전달하거나 Native를 재생성하지 않고 Staging부터 재개한다. semantic 무효화 후보는 재사용하지 않는다. 닫힌 Claim이나 Task 조회 결과만으로 쓰기 권한이 생기지 않는다.

## 후보 확보

이미지 근거 레벨·과거 제작 허용 boolean으로 제작 방법을 제한하지 않는다. 사진 사용·편집·ChatGPT Native 신규 생성 중 현재 목적에 가장 적합한 방법을 선택한다. 참고 자료는 선택 사항이다.

Source URL과 evidence_ref는 탐색 힌트로만 사용한다. URL 실패 시 다른 사진 또는 Native 생성으로 전환한다. PDF·매뉴얼 도표·기술 문서 캡처는 이미지 소재로 사용하지 않는다. 기술자료는 설명 문구의 참고로만 활용한다. HTML 문서 URL을 이미지 파일로 접수하지 않는다.

Native가 필요한 경우 현재 채팅의 실제 도구와 감사 입력을 확인한다. 서버 generation/reference capability false를 내장 도구 부재로 해석하지 않는다. 일반 ChatGPT 내장 생성/편집만 사용하고 외부 API/서버 모델은 금지한다.

Native를 실제로 사용할 때만, 장면 prompt를 확정한 뒤 실제 도구 schema와 호출 값으로 validate_visual_generation_call → REQUEST → 호출 → RESULT를 기록한다. 실제 Source 경로에 Native 감사 검사를 요구하지 않는다. 누락값은 추측하지 않는다. 서버는 Native 호출을 자동 관찰하지 않는다. 생성 prompt에는 현재 장면·필수·금지 요소만 전달한다. 운영 지시/QA보고/ID/Hash를 이미지 대상으로 요청하지 않는다. 신규 생성에는 num_last_images_to_include를 생략하고 편집에는 현재 Task에서 실제 검사한 입력만 명시한다.

attemptId 하나로 실제 REQUEST의 도구 인자와 RESULT의 actualNativeCall, outputs, inspectedOutput, pixelQa/pixelEvidence, 이번 Handoff operationId를 연결한다. 실제 관찰한 값만 기록한다. 경로만 반환된 경우 fileId/SHA를 추측하지 않는다.

현재 호출의 반환 파일만 실제 열어 장면 일치 여부를 확인한다. must_show의 상태·매체 한정어까지 확인한다. 실물 사진이 요구되면 설명용 도해·매뉴얼 일러스트·CAD/렌더링으로 대체하지 않는다. 수정 가능한 생성 실패는 같은 Claim에서 최대 3회 또는 현재 적용되는 더 구체적인 정책까지 수행한다. 각 호출과 접수 전 Claim/Hash를 재확인한다. 이 화면 검사는 Reviewer 최종 QA PASS가 아니다.

## 공식 Staging과 인계

실제 Source는 dispatch_visual_source, Native 반환 파일은 dispatch_visual_generation의 현재 공식 file 입력 또는 검증된 URL+SHA 경로를 사용한다. 신규 Native 접수에는 현재 REQUEST/RESULT의 nativeAttemptId를 spec에 함께 전달한다. 실제 생성에 사용한 prompt를 접수 prompt에도 그대로 사용한다. 서버는 관찰 가능한 prompt·file ID·operationId 불일치를 차단하지만, 경로만 기록된 파일 연결은 UNVERIFIED이며 서버가 생성 호출을 관찰했다고 주장하지 않는다. 복구 spec의 원래 nativeAttemptId는 수정하지 않는다.

신규 생성은 productionMethod=NATIVE_FULL_GENERATION, references=[]를 사용한다. Reference 방식의 자료는 선택적 참고이며 사전 사실·픽셀 확인을 필수 Gate로 요구하지 않는다. AI edit는 실제 inputFile과 입력 사진의 동일성·출처를 유지한다.

제작은 preflightOnly=true의 unannotated 후보를 접수한다. 현재 지원 schema에 맞춰 실제 Source/Reference·확인 사실·제작 방식·transform을 기록한다. operationId는 후보 intent마다 하나를 유지하며 응답 유실 시 공식 조회로 복구한다.

BLOCKED_FILE_REFERENCE 등 전달 실패면 오류 원문과 동일 operationId 접수 결과를 기록한다. 같은 attemptId로 TRANSPORT_ERROR에 오류 원문과 operationId를 기록하고 get_visual_dispatch_result와 nativeAttemptAudit를 조회한다. Job 접수, binary 수신 확인, 저장 read-back 검증, STAGED를 각각 구분한다. NOT_FOUND만으로 서버 binary 미수신을 확정하지 않는다. 좋은 이미지를 전달 실패 때문에 반복 생성하지 않는다. 차단된 파일을 경로/URL로 위장하지 않는다. 실제 허용되는 전달 경로만 사용한다.

STAGED, Storage/decode/SHA를 실제 조회한다. inspect_visual_source 원본과 390px image 블록을 실제 열어 현재 장면과 필수 대상이 있는지 확인한다. functions.exec에서는 각 image(block)을 출력한다. 기술 PASS만으로 픽셀 PASS를 주장하지 않는다.

실제 STAGED 후보의 CANONICAL과 MOBILE390 픽셀을 각각 열어 확인한다. 각 view마다 record_visual_pixel_inspection(eventId, requestId, jobId, view, pixelQa, evidence)를 현재 schema 그대로 호출한다. view는 CANONICAL/MOBILE390, eventId는 각 기록마다 새로운 UUID, pixelQa는 실제 판단 PASS/FAIL, evidence는 실제 보인 장면을 20~1000자로 작성한다. 서버가 Claim에서 runtime과 Job에서 SHA를 도출하므로 event·expectedSha·runtime을 추가로 넣지 않는다. 환경 Probe와 과거 Claim의 PASS로 대체하지 않는다. 응답 유실 시 같은 eventId를 get_visual_inspection_event로 조회하고, 접수가 확인되면 다른 eventId로 중복 기록하지 않는다.

두 view의 실제 관찰이 PASS인 경우에만 같은 후보 Job/정확한 canonical SHA로 handoff_visual_review를 호출한다. 제작자는 record_visual_source_qa, 최종 annotation dispatch, approve_visual_source를 수행하지 않는다. Annotation·최종 QA는 검수에 전달한다. 인계 후 Task와 receipt를 별도 재조회하여 QA_PENDING, 동일 Job/Hash/SHA, Production activeClaim=false를 확인한다.

## 실패와 보고

자기 Claim만 공식 RETRY/HOLD 종료하고 activeClaim=false를 재조회한다. 감사 기록 실패가 Claim 종료나 유효 입력 복구를 막지 않도록 한다. 기술 실패는 유효 저장 자산을 보존하며 SOURCE_MISMATCH로 무효화하지 않는다.

보고: Task/Topic/requestId/전체 Hash, 실제 경로·Native 횟수, 감사·반환 파일 기록, operationId/Job/source SHA/canonical SHA, 인계·최종 phase·activeClaim. 실패하면 마지막 성공 단계/정확한 오류/보존 자산/재개 지점을 추가한다.

다음 담당: 성공 시 3-A 검수. 실패 시 기록된 재개 지점 담당. 다음 작업을 반드시 한 줄로 명시한다.


## SOURCE_SUPPLY_V1 공급 입력

신규 통합 작성 Task는 Source 준비 후 제작 Queue에 나타난다. Task의 suppliedSources를 확인하고 기존 recoverableProductionCandidate/Staging/NativeInput이 없으면 현재 Hash의 supplyId를 사용한다. 실제 claim_visual_production(runtime)을 받은 뒤 dispatch_visual_supplied_source(requestId,operationId,supplyId,transform)로 private 원본을 제작한다. 원본 URL을 다시 다운로드하거나 fileParams로 다시 전송하지 않는다. 원본 Source 확인을 최종 후보 QA로 대체하지 않는다.

등록된 공급 원본과 생성 canonical SHA는 별개다. 실제 CANONICAL/MOBILE390 및 역할 Crop을 보고 기록한 뒤 handoff_visual_review한다. 중복·영구 공급 파일 누락/identity 오류로 입력이 무효화되면 본인 Claim을 정식 실패 종료하고 재공급 사유를 보고한다. 동일 실행에서 무의미한 재호출이나 예약 비활성화는 하지 않는다. 플랫폼 차단은 기존 규칙대로 우회하지 않는다.
