# FitBike 3-A 검수 — V4/V5 호환 · 동일 저장 자산 · 최종 승인

대상 pipelineImageId: 미지정

공식 QA_PENDING Queue에서 저장 후보 1건을 검수한다. 새 이미지 생성/재생성을 하지 않는다. 성공은 실제 최종 QA → Approval → READY_FOR_UPLOAD → Reviewer activeClaim=false 재조회다. Production Claim, 3-B 업로드/DONE, 게시, 코드/DB/Contract/예약 변경은 수행하지 않는다.

현재 AGENTS.md 및 CONTENT.md → CONTENT_FACTORY.md → CONTENT_QUEUE.md, 최신 도구 schema와 현재 Task를 확인한다. claim_visual_review, 상태/receipt 조회, inspect_visual_source, record_visual_source_qa/reject_visual_source, 동일 후보 finalization용 Dispatch, 중복 조회, approve_visual_source/fail_visual_image가 필요하다. legacy/Producer Claim으로 대체하지 않는다.

## Claim과 저장 후보 복구

자기 requestId의 유효 미완료 Review Claim을 먼저 복구한다. 다른 실행 점유·eligibility 미충족은 공식 Queue에 따른다. Task 1건의 Reviewer Claim을 얻고 현재 Contract/Hash/소유권/만료와 reviewCandidate Job/source SHA/canonical SHA를 확인한다.

recoverableStaging이 유효한 같은 후보의 최종 derivative이면 그 자산 검사부터 재개한다. 이미 최종 렌더링된 자산에 Annotation을 다시 적용하지 않는다. Preflight이면 현재 reviewCandidate를 검사한다. 다른 Job의 최신순만으로 후보를 바꾸지 않는다. semantic 무효 자산은 재검사 루프에 넣지 않는다.

Native 입력 저장 확인과 Native 호출 감사는 Reviewer QA PASS를 대신하지 않는다. recoverableNativeInput은 제작자가 Staging해야 하는 입력이며 Reviewer가 승인할 후보가 아니다.

V5의 generationContract는 의미 기준이고 visualPolicy는 서버 공통 기준이다. V4는 기존 제한을 보존한다. 모든 must_show를 검사하고 일부 핵심만 골라 나머지를 PASS 처리하지 않는다. visual_objective/user_question만으로 온도·정상/비정상·재시동 성공·고장 원인 등 명시되지 않은 추상 상태를 FAIL Gate로 추가하지 않는다.

## 실제 검사와 사전 QA

inspect_visual_source가 반환한 실제 원본과 전체 390px image 블록을 모두 연다. functions.exec에서는 각 image(block)을 출력한다. 기술 metadata/decode/SHA만으로 Semantic/Mobile PASS하지 않는다.

필수·금지 대상, 공통 people 기준, 모델/근거 적용 범위, evidence level과 실제 제작 경로 일치를 확인한다. REQUIRED는 실제 Source 기반이며 Reference 재구성/full generation으로 대체할 수 없다. AI edit이면 실제 입력·출처와 최종 구조·표시·사실 보존을 확인한다.

실제 볼 수 없는 파일은 기술 실패로 보존한다. 실제 본 후보가 의미상 틀렸으면 정확한 Job/SHA와 사유로 reject_visual_source 후 공식 Claim 종료한다. 정상 후보는 최종 사용할 Annotation과 대상 위치를 먼저 결정한 뒤 현재 schema에 맞춰 record_visual_source_qa를 호출한다. 모든 check key는 현재 Contract 원문 문자열을 정확히 사용한다. sourceJobId와 sourceSha256은 서버의 원본 source identity이며 canonical SHA와 혼동하지 않는다. V5에서 최종 사용할 label Annotation을 선택하면 실제 대상 위치를 먼저 확인하고 annotationTargetChecks에 그 정확한 label text의 대상 검증을 기록한다. 아직 렌더링하지 않은 라벨의 최종 가독성을 PASS한 것으로 기록하지 않는다. 최종 라벨 픽셀 QA는 다음 최종 렌더링 검사에서 수행한다.

## 동일 후보 최종화

Preflight QA 통과 후 현재 executionProtocol의 동일 후보 Dispatch를 사용한다. 새로운 Source 선택이나 Native 호출을 하지 않는다. 기존 source URL/모델/PDF 페이지/Reference/prompt/method와 base crop/maxWidth를 유지하고 sourceJobId/sourceSha256에 결합해 이미 기록한 preStagingQa를 정확히 그대로 전달한다. 라벨을 뒤늦게 추가하거나 변경하면 먼저 대상 검증과 QA 기록을 갱신하고 그 기록과 일치하는 payload로 접수한다.

필요한 Annotation은 실제 확인 위치에 최소한으로 추가한다. 좌표는 이미 crop된 출력 기준이다. 저장 Source/PDF는 검증된 WebP를 재사용하고 Crop을 재적용하거나 PDF를 재렌더링하지 않는다. 기존 base crop/maxWidth 변경은 현재 복구 경로가 차단하므로 임의 재계산·원본 재취득으로 우회하지 않는다. Native/composition은 현재 동일 자산 resume protocol을 따른다.

최종 STAGED 자산을 실제 다시 검사한다. 원본과 390px에서 모든 must_show 식별, 금지 요소 없음, Annotation 정확성, provenance와 SHA를 확인한다. BODY에는 대표 이미지 Crop을 요구하지 않는다. THUMBNAIL/HERO/THUMBNAIL_HERO는 inspect가 반환한 실제 Card/Hero Crop을 해당 역할별로 열어 QA한다. 전체 390px를 보고 Crop PASS라고 기록하지 않는다.

ALT는 실제 이미지와 일치하고 AI/생성형·파일명/ID·근거 없는 수치 표현을 제거한다. 현재 공식 중복 검사와 승인 Gate를 수행한다. 모든 필수 QA가 실제 통과한 경우만 정확한 expected canonical SHA와 image/mobile/SEO 및 역할별 Crop 증거로 approve_visual_source를 호출한다.

Task와 receipt를 별도 재조회하여 READY_FOR_UPLOAD, stagingApproved=true, 승인 canonical SHA 일치, Reviewer activeClaim=false를 확인한다.

## 실패와 보고

Semantic 실패는 실제 확인한 후보만 반려하며 이력을 보존한다. 검사 전달·schema·Storage 등 기술 실패면 유효 Job/SHA를 보존하고 자기 Claim만 공식 종료한다. 기술 실패를 SOURCE_MISMATCH로 기록하지 않는다. 새 제작이 필요하면 Production으로, 유효 자산 기술 복구면 QA_PENDING 검수 재개로 전달한다.

보고: Task/requestId/전체 Hash, 후보·최종 Job/source SHA/canonical SHA, 실제 원본/390px/역할Crop/근거/ALT/중복 판정, Approval/최종 상태/activeClaim. 실패 시 정확한 오류·보존 자산·재개 지점 포함.

다음 담당/다음 작업을 반드시 명시한다. 성공 시 3-B, Semantic 반려 시 3-A 제작, 기술 복구 시 3-A 검수다.
