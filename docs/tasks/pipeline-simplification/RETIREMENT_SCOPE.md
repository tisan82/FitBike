# 구형 경로 사용 중단 범위와 제작·검수 연결 전환

기준: 2026-10-12 KST 운영 재조회 / main 14a13cfa51d523eae96a7ed8bceaabd97c170638. 예약 설정·Supabase 프롬프트 변경 없음. 1·2단계는 일반 채팅이며 예약은 3-A부터 시작한다.

## 확정 범위

| 경로 | 신규 실행 결정 | 기존 건 처리 / 서버 상태 |
| --- | --- | --- |
| Planning → Research → Writer 별도 실행 / claim_planning_v1·planning_next_v2 | 신규는 claim_authoring_v1 → complete_authoring_v1 한 실행·한 산출물 사용 | 구형 API 서버 호환은 아직 유지. 기획/조사/집필 단계 미완료0건. 이후 통합 실제 검증 후 별도 신규 Claim 진입 차단 가능. |
| planning_artifact/research_artifact 중복 산출물 | 통합 실행에서 쓰지 않음; writer_artifact.authoringContext가 단일 저장 위치 | 구형 컬럼과 기존 산출물 읽기·최종 QA·게시 유지. NOT NULL empty-object 기본값 유지. |
| begin_generated_asset_handoff / append_generated_asset_chunk 분할 Native 수신 | 신규 3-A 표준은 actual file → dispatch_visual_generation → 기존27.generatedInput checkpoint | 25에9건/유효 미소비0건;26에0건. 구형 SQL·handoff CLI·Staging worker 참조가 남으므로 서버 차단/제거는 아직 미적용. 받은 바이트가 없는 file_ref를 복구 성공으로 간주하지 않음. |
| Source Stage → table28 검사 조각 쓰기 | 중단 완료: canonical Storage MCP 이미지/동일 SHA 다운로드 사용 | v31 STAGED 진단 결과 조각0건. 기존904행 조회·정리 경로 유지; 실제 조회 RPC/정리 함수가 남아 DROP하지 않음. |
| legacy claim_visual_image / 제작·검수 shared 도구 | 표준에서 사용 중단: 역할별 endpoint + claim_visual_production / claim_visual_review 사용 | 기존 shared 연결의 서버 호환은 유지. 연결 전환과 실제 역할 검증이 선행돼야 하며 기존 shared 연결은 호환용이며 표준은 신규 역할 연결이다. |
| typed record_visual_inspection_delivery | 후보는 최소 record_visual_pixel_inspection 표준 사용 | 환경 Probe와 구형 runtime 미결합 receipt의 호환용으로 필요. 전체 폐기 대상 아님. eventId 조회·recovery 유지. |
| table31 Native scaffold | 삭제 대상으로 확정하지 않음 | 0행이나 배포된 content-pipeline-native-asset v1에 실제 조회·upsert 확인. 과거 미사용 분류를 정정. 외부 Edge 작성자를 이관하기 전 삭제 불가. |
| Claim/request/run/Job/SHA 및 3-B·4단계 | 유지 | 소유권·응답 유실 복구·동일 후보·승인 binary 업로드·최종 게시에 필요. |

## 제작·검수 두 연결

새 서버를 두 벌로 복제하지 않는다. 기존 같은 서버와 operator 인증을 유지하고 역할별 URL에서 노출과 호출을 제한한다.

| 기존 App | 연결 URL | 완료 확인 |
| --- | --- | --- |
| FitBike Visual Producer_02 | https://farjyjcvduthawpdjuqe.supabase.co/functions/v1/content-pipeline-visual-mcp?role=PRODUCER | connectedRole=PRODUCER; Reviewer Claim/승인 도구 미노출·호출 거부 |
| FitBike Visual Reviewer_01 | https://farjyjcvduthawpdjuqe.supabase.co/functions/v1/content-pipeline-visual-mcp?role=REVIEWER | connectedRole=REVIEWER; Producer Claim/Native 제작·handoff 미노출·호출 거부 |

2026-10-12 계정에서 검수 전용 Reviewer_01과 제작 전용 Producer_02를 등록한 뒤 실제 capability와 callable 목록을 재조회했다. Producer_02=PRODUCER/26도구/검수 Claim·승인 제외; Reviewer_01=REVIEWER/22도구/제작 Claim·Handoff 제외. 기존 Producer_01·Reviewer_02는 SHARED이므로 새 표준에서는 사용하지 않는다. 기존 App ID의 URL을 수정했다고 보고하지 않으며 새 역할 연결의 성공을 기록한다. 예약 설정·Supabase 프롬프트는 변경하지 않았다.

## 전체 검증을 한 번에 수행

부분 시험마다 기존 후보를 새로 만들지 않는다. 개발·연결 전환을 완료한 뒤 콘텐츠 1건을 정해 현재 상태부터 마지막 COMPLETE까지 실제 수행한다. 이미 작성된 본문·Contract·승인 자산은 재작성하거나 Hash를 임의 변경하지 않는다.

1. 통합1·2단계의 연구 근거/본문/V5 Brief 단일 저장과 이미지 Task 확인. 기존 작성 콘텐츠는 기존 저장 경로임을 구분; 이 건의 후속 성공이 신규 통합 쓰기 증명은 아니다.
2. 해당 콘텐츠의 남은3-A Task를 공식 Claim → 기존 후보/입력 우선 복구 → 실제 픽셀 관찰 기록 → QA_PENDING 인계 → activeClaim=false까지 수행.
3. Reviewer endpoint로 같은 Job/Contract 검사·QA/승인 → READY_FOR_UPLOAD → Reviewer activeClaim=false 확인.
4. 승인 binary 그대로3-B 업로드/read-back SHA → DONE. 모든 필수 이미지 완료 뒤4단계 QA·게시·실제 Production 확인 → COMPLETE.
5. 단계별 실제 최종 receipt를 한 결과로 정리. 재개/다른 Task 동시 실행/Native 최초 전달/저장 Native 복구는 실행한 경우만 별도 증거를 표기.

전환 전 조회에서는 실제 콘텐츠9건이 VISUAL이며 HOLD2건 중 하나는 진단 fixture, 하나는 QA 재개 건이었다. 동시에 예약이 상태를 바꿀 수 있으므로 위 수량·대상은 Claim 직전 다시 읽는다. 역할 전환 후 실행한 실제 E2E 결과는 WORK.md에 기록했다. 실제 실행과 서버 차단·물리 삭제는 구분한다.
