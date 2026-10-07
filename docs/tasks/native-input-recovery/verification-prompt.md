# FitBike 3-A 제작 — 예약 Native 전달·복구 검증

일반 예약 채팅에서 공식 Production Image Task 1건을 실제 처리한다. 최신 production-prompt.md의 제작 정책과 현재 서버 executionProtocol을 적용한다. Reviewer 승인·3-B·게시·코드/DB/예약 변경은 하지 않는다. 성공 종료는 QA_PENDING과 Production activeClaim=false다.

## 대상과 복구

Capability와 Queue를 실제 조회한다. 신규 Native 검증에는 nativeDispatchAttemptBindingSupported=true와 현재 dispatch schema의 spec.nativeAttemptId가 필요하다. 누락이면 Claim 전에 PRECHECK_BLOCKED로 보고하고 없는 입력을 호출했다고 기록하지 않는다. 저장 입력 복구만 수행할 때에는 현재 서버가 반환한 resume spec과 공식 schema의 호환성을 확인한다. 기존 자기 유효 Claim부터 복구하고 다른 실행 점유·backoff·QA_PENDING 등은 제외한다. Production Claim 후 현재 Contract와 전체 Hash를 확인한다.

유효 recoverableProductionCandidate/recoverableStaging을 먼저 처리한다. 그다음 recoverableNativeInput이 있으면 반환 spec을 그대로 사용해 새 operationId로 dispatch_visual_generation을 호출한다. 새 Native 생성이나 file 재전달은 하지 않는다. 원래 nativeAttemptId도 유지한다. 입력 저장 확인을 STAGED/QA PASS라고 기록하지 않는다.

복구 대상이 없으면 현재 Contract가 허용하는 제작 경로를 사용한다. Native 검증 목적이라고 실사/Reference 요구를 낮추거나 Source 자산을 버리지 않는다. Source로 완료한 경우 신규 Native 전달은 미검증으로 보고한다.

## 신규 Native 호출의 실제 연결

현재 장면만으로 실제 호출 prompt를 확정한다. 현재 실제 내장 도구 이름·schema·인자를 확인하고 validate_visual_generation_call로 감사 입력을 검사한다. prompt=null을 쓰는 다른 런타임의 예시를 복사하지 말고 현재 도구에서 실제 사용하는 값을 기록한다.

attemptId 하나를 만들어 REQUEST에 정확한 실제 예정 인자와 현재 Contract Hash를 저장한다. 신규 생성에는 num_last_images_to_include를 생략하고 편집에는 현재 Task에서 실제 검사한 입력만 명시한다. 실제 Native 호출 후 그 호출의 반환 파일을 열어 장면·필수·금지 요소를 확인한다.

RESULT에는 실제 actualNativeCall, outputs, inspectedOutput, pixelsInspected, pixelQa/pixelEvidence와 이번 operationId를 저장한다. 관찰하지 못한 파일 ID·SHA·참조 입력은 추측하지 않는다. REQUEST는 계획, RESULT는 실행자가 관찰한 호출 기록이며 서버 자동 관찰이라고 보고하지 않는다.

정상 반환 파일을 공식 file 입력으로 dispatch_visual_generation에 접수한다. spec.nativeAttemptId는 방금 기록한 ID이며 spec.prompt는 실제 생성 prompt와 동일하게 사용한다. productionMethod·references·preflightOnly=true는 현재 Contract와 제작 정책을 따른다.

## 접수·저장·Staging 판정

응답 유실 또는 BLOCKED_FILE_REFERENCE이면 같은 operationId의 get_visual_dispatch_result를 먼저 조회한다. 같은 attemptId로 실제 오류 원문을 TRANSPORT_ERROR에 기록한다. 서버 접수 결과와 실행자가 본 Connector 오류를 구분한다.

nativeAttemptAudit.serverReceivedJobs에서 Job 생성, binaryReceipt, normalizedInputSha, checkpoint를 확인한다. Job 존재만으로 bytes 수신·저장 성공을 주장하지 않는다. NOT_FOUND/빈 목록은 미수신 확정이 아닌 확인 불가다. 최초 서버 미수신 차단은 저장 복구 개발로 해결됐다고 보고하지 않는다.

STAGED가 되면 실제 원본·390px를 열어 장면을 확인하고 handoff_visual_review를 수행한다. QA_PENDING, 동일 Job/Hash/canonical SHA, Production activeClaim=false를 재조회한다.

실패하면 유효 자산과 식별자를 보존하고 자기 Claim만 공식 종료한다. 조회에서 recoverableNativeInput이 확인되면 다음 실행의 재개 지점은 SOURCE_STAGE이며 재생성은 하지 않는다. 이미 QA_PENDING이면 다음 담당은 Reviewer다. 검증을 위해 Production 장애를 인위적으로 만들거나 상태를 변경하지 않는다.

## 최종 보고

- Task/requestId/전체 Contract Hash
- 신규 생성 또는 저장 입력 복구 경로, Native 호출 횟수
- attemptId, 실제 호출 인자·참조·반환 파일 연결 관찰 범위
- operationId, Job 접수, binaryReceipt, 저장 checkpoint
- original Native SHA / normalizedInputSha / 최종 canonical SHA 구분
- 실제 원본·390px 열람, 인계, 최종 phase와 activeClaim
- 신규 Native 최초 전달: 성공/실패/미검증
- 다음 실행 저장 입력 복구: 이번에 실제 수행했는지 또는 미검증
- 실패 단계·오류 원문·보존 자산·다음 담당/재개 지점

한 번의 정상 실행을 장애 후 예약 복구 성공으로 계산하지 않는다. 개발 회귀 통과와 실제 예약의 성공을 구분한다.
