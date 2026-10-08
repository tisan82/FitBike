# FitBike 3-A 제작 예약 프롬프트 추가·교체 블록 — RESULT 사전 검사·오류 추적

기존 제작 프롬프트의 정책·대상 선정·복구·Source·Contract·검수 인계 규칙을 유지하고, Native REQUEST/RESULT 기록 절차를 아래 내용으로 교체한다. 예약명·실행 시간·예약 설정은 변경하지 않는다.

## 1. 실행 전 확인

현재 공식 도구 schema와 Capability를 실제 확인한다. 신규 Native 생성에는 다음 기능이 필요하다.
- nativeAttemptAuditSupported=true
- nativeResultPreflightSupported=true
- nativeResultPreflightTool=validate_visual_generation_result
- nativeAuditErrorTracingSupported=true
- nativeDispatchAttemptBindingSupported=true
- dispatch_visual_generation의 spec.nativeAttemptId
- validate_visual_generation_call, validate_visual_generation_result, record_visual_generation_attempt, 공식 재조회·실패 종료 도구

신규 Native에 필요한 도구가 미노출이면 Claim 전에 PRECHECK_BLOCKED로 보고한다. 없는 도구를 호출했다고 기록하지 않는다. 도구 미노출은 제작 예약에서 반복 생성을 시도할 이유가 아니다. 저장 후보·보존 입력 복구와 Source-only 제작에는 신규 Native 생성 전용 Gate를 무조건 적용하지 말고 현재 서버의 공식 복구 schema와 executionProtocol을 따른다.

## 2. Native REQUEST → 실제 호출

requestId는 실행 intent마다 하나, attemptId는 실제 Native 호출마다 하나, operationId는 후보마다 하나를 유지한다.

현재 Task와 전체 Contract Hash에 맞는 장면만 작성한다. 운영 지시문·RESULT 보고서·이전 Task의 이미지나 프롬프트를 장면으로 사용하지 않는다. 새 이미지에는 이전 이미지 포함 인자와 Reference 인자를 생략하고, 편집에는 이번 Task에서 실제 검증한 Reference만 사용한다.

현재 실행 환경에 노출된 실제 Native 도구명과 실제 예정 인자를 RAW_ARGUMENTS_V1 형식으로 캡처한다.
nativeCall = {toolName: 실제 도구명, schemaVersion: "RAW_ARGUMENTS_V1", arguments: 실제 인자}
별도 장면 메시지가 실제로 존재할 때만 sceneInstruction에 실제 text와 location을 기록한다. null·생략된 prompt를 추정하거나 다른 값으로 대체하지 않는다.

validate_visual_generation_call로 캡처를 검사한 뒤 같은 attemptId로 REQUEST를 저장한다. REQUEST에는 현재 contractHash, 정확한 nativeCall과 실제 사용한 productionMethod·Reference를 담는다. REQUEST 저장은 호출 예정의 기록이며 실제 Native 실행 증거가 아니다.

그다음 캡처한 인자로 실제 내장 Native 생성·편집을 호출한다. 외부 OpenAI API나 서버 생성 모델은 사용하지 않는다.

## 3. RESULT 사전 검사 → 저장 → 재조회

반환된 실제 이미지의 픽셀을 열어 현재 Contract의 장면을 검사한다. 결과를 추정하지 않는다.

RESULT evidence는 공식 schema의 필드만 사용한다.
- actualNativeCall: 이번 실제 호출의 정확한 캡처
- outputs: 실제 반환된 파일 식별정보 배열. 각 항목은 fileId/path/mimeType/sha256만 허용한다. 실제 fileId 또는 절대 path가 있어야 한다.
- inspectedOutput: 실제 검사한 outputs의 항목을 변경 없이 그대로 사용한다.
- pixelsInspected: 실제 열어 검사한 경우에만 boolean true
- pixelQa: PASS / FAIL / NOT_INSPECTED
- pixelEvidence: 실제 픽셀에서 확인한 내용을 문자열로 기록한다.
- operationId: 이 후보를 접수할 실제 UUID
- toolCallId/toolError: 실제 확인된 경우에만 사용한다.

출력 파일 ID·경로·SHA·호출 인자·toolCallId를 추정해서 채우지 않는다. signed URL, download_url, 토큰, 인증정보, 이미지 base64는 evidence에 넣지 않는다.

PASS는 actualNativeCall과 같은 attemptId의 REQUEST.nativeCall이 정확히 같고, 실제 픽셀 검사·비어 있지 않은 outputs·그 배열에 포함된 inspectedOutput·20자 이상 실제 pixelEvidence가 있을 때만 기록한다. 파일 식별정보가 관측되지 않았다면 RESULT를 억지로 PASS시키지 않는다.

저장 전에 validate_visual_generation_result(requestId, attemptId, evidence)를 호출한다.
- valid=true: 같은 evidence를 변경 없이 record_visual_generation_attempt(phase="RESULT")로 저장한다.
- valid=false: 반환 code/field/reason/traceId를 보존하고, 실제 확인한 사실을 유지한 채 필드 형식 오류만 수정하여 다시 검사한다. 사실·픽셀 QA·출력 ID를 만들어 통과시키지 않는다.
- 사전 검사 통과는 RESULT 저장 성공이나 파일 Handoff 성공이 아니다.

저장 응답 뒤 get_visual_claim_result 또는 get_visual_image_task의 nativeAttemptAudit에서 같은 requestId/attemptId의 RESULT와 정확한 evidence를 실제 재조회한다. 저장 또는 재조회가 확인되지 않으면 Native binding 준비 완료로 보고하지 않는다.

## 4. RESULT 저장 오류·응답 유실

기록 오류 응답의 code, field, traceId, phase, stage, evidenceWriteOutcome을 보존한다. evidenceRecorded=null 또는 UNVERIFIED_REQUIRES_READBACK이면 저장 실패로 단정하지 말고 같은 attemptId의 공식 원장을 먼저 조회한다.

동일 RESULT가 이미 있으면 재생성·변경 기록 없이 다음 단계로 진행한다. 없다면 실제 evidence를 유지해 사전 검사와 동일 재접수를 시도한다. NATIVE_ATTEMPT_EVENT_IMMUTABLE이면 기존 원문을 확인하고 변경된 RESULT로 덮어쓰지 않는다. 근거 없는 새 attemptId나 가짜 REQUEST로 과거 호출을 복원하지 않는다.

오류를 다음처럼 구분한다.
- RESULT_PREFLIGHT / NATIVE_AUDIT_RECORD: 감사 기록 검증·저장 오류
- NATIVE_FILE_HANDOFF: 생성 파일의 공식 접수·전달 오류
- PIXEL/CONTRACT: 실제 장면 검사 실패

기록 오류를 Source/Contract 실패로 바꾸지 않는다. 유효한 기존 생성 자산·Job·SHA가 있으면 보존하고 공식 복구를 우선한다. 실제 저장 후보가 없는 상태에서 저장돼 있다고 보고하지 않는다. 해결할 수 없으면 사실에 맞는 오류를 보고하고 공식 실패 종료 경로로 자기 Claim만 정리한다. 감사 기록 오류가 Claim 해제를 막아서는 안 된다.

## 5. 공식 파일 접수·제작 종료

확인된 Native RESULT의 attemptId를 dispatch_visual_generation의 spec.nativeAttemptId로 연결한다. 공식 file 입력 또는 서버가 실제 반환한 복구 spec을 사용한다. file 입력이 거절되면 기존 자산의 공식 복구 가능 여부를 먼저 확인하고 전달 실패만으로 재생성하지 않는다.

Producer는 실제 STAGED 후보와 기술적 Storage/decode/SHA를 확인하고 원본·390px의 실제 장면을 점검한 뒤 handoff_visual_review를 수행한다. 인계 Job/SHA 일치와 visualPhase=QA_PENDING, Production activeClaim=false를 공식 재조회해 성공을 확인한다.

Reviewer 승인, READY_FOR_UPLOAD, 3-B/DONE, 4단계 게시, 코드·DB·Contract·예약 변경은 수행하지 않는다.

## 6. 실행 결과 보고

대상 Task / 전체 Contract Hash / attemptId / operationId / 마지막 확인된 성공 단계 / 최종 상태 / 자기 Claim 해제 여부를 보고한다.
실패 시 실제 오류 단계와 code·field·reason·traceId, RESULT 저장 여부(확인/없음/미확인), 서버 파일 접수 여부, 보존 자산·Job·SHA와 공식 복구 여부를 구분한다.
확인되지 않은 Native 내부 prompt 전달, Task isolation, 파일 영속화를 성공으로 단정하지 않는다.
