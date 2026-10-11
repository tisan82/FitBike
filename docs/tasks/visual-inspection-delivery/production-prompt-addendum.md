# FitBike inspection delivery — 적용 대기 추가 규칙

이 추가 규칙은 PIXEL_DELIVERY_V1 배포와 Connector schema 갱신 후 적용한다. 예약 설정 변경은 사용자가 진행한다. 기존 Contract/역할/Native 감사·복구 정책을 유지한다.

1. Claim 전에 get_visual_generation_capabilities와 새 도구 노출을 확인한다. 예약은 runtime=SCHEDULED, 일반 Chat은 CHAT, Work는 WORK로 구분한다. 다른 환경의 PASS를 재사용하지 않는다. get_visual_inspection_delivery_status에서 준비되지 않았으면 probe_visual_inspection_delivery를 호출한다. 실제 PNG를 모델에 전달해 확인하고 record_visual_inspection_delivery로 실제 픽셀 관찰만 보고한다. PASS를 추정하지 않는다. 환경 전달 장애이면 Claim하지 않는다.
2. 실제 보고 event는 eventId UUID, scope ENVIRONMENT/CANDIDATE, runtime, stage CLIENT_PARSE/CLIENT_IMAGE_OUTPUT/PIXELS_INSPECTED, outcome PASS/FAIL, code를 사용한다. ENVIRONMENT는 발급 probeId와 기대 SHA, CANDIDATE는 자기 requestId/jobId/expectedSha와 view CANONICAL/MOBILE390/CARD/HERO를 고정한다. PIXELS_INSPECTED PASS는 pixelsInspected=true와 실제 evidence(20~1000자)를 요구한다. 후보는 pixelQa PASS/FAIL도 보고한다. evidence에 URL/토큰/이미지 바이트를 넣지 않는다. 응답 유실 시 같은 eventId를 동일 재전달한다.
3. Claim에 runtime을 전달한다. requestId는 실행 intent마다 하나를 유지한다. 변경 호출 응답 유실 시 get_visual_claim_result와 필요한 Job/operation 상태를 먼저 읽고 동일 intent만 재개한다. 새 Claim이나 새 후보를 만들지 않는다.
4. inspect_visual_source는 원본 CANONICAL과 MOBILE390을 각각 조회한다. 대표 역할은 해당 CARD/HERO도 조회한다. 같은 Job/expectedSha를 유지한다. 응답의 문서화된 result 래퍼를 해제하고 content 또는 content_items가 실제 배열인지 확인한다. 이미지 설명 metadata와 image 블록을 혼동하지 않는다. functions.exec에서는 각 실제 image 블록을 image(block)으로 전달한다. 공통 구현은 scripts/content-factory/inspection-client.mjs를 사용한다. 형식 오류, 이미지 누락, 출력 실패를 구분해 보고한다.
5. UNVERIFIED_REQUIRES_RENDERING은 고정 안내값이며 실패 판정이 아니다. 서버 기술 PASS, 클라이언트 출력 제출, 실제 픽셀 검사 및 semantic 판정을 분리한다. 전달 실패면 METADATA 조회로 canonical download URL을 갱신하고 동일 파일의 origin/bytes/SHA를 검증한 후 실제 viewer로 연다. 원본 다운로드를 모바일/Crop 검사로 대체하지 않는다.
6. 실제 픽셀에서 현재 Contract의 필수/금지 요소, 사람 정책 및 390px 식별성을 검사한다. 사용자 대상 텍스트는 한국어 또는 영어만 허용하며 숫자·단위·공식 브랜드/모델명·기술 식별코드는 정책상 예외를 검토한다. 확인한 각 view의 최신 관찰을 기록한다. 실제 semantic 불일치 후보는 기존 반려 정책으로 처리하며 전달 장애와 구분한다.
7. Producer는 원본과 390px 실제 검사 PASS 보고 후에만 handoff_visual_review를 실행한다. QA_PENDING, 인계 Job/SHA 일치 및 자기 activeClaim=false를 재조회한다. Reviewer 승인·3-B·게시를 수행하지 않는다. 신규 Native 최초 전달, recoverableNativeInput 복구, 저장 후보 검사 복구의 검증 결과는 따로 보고한다.
8. 기술 실패는 같은 Job/SHA를 보존하고 자기 Claim만 공식 RETRY 종료한다. Circuit Breaker가 열린 Task는 next_eligible_at과 Queue 정책에 따라 제외한다. 예약을 비활성화하지 않는다. 새 후보 생성은 실제 품질 실패에 따른 기존 제작 정책에서만 수행한다.
