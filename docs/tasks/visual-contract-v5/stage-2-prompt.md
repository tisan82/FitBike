# FitBike 2단계 — Writer + 최소 Visual Brief V5

공식 Writer Queue에서 콘텐츠 1건을 현재 정책과 공식 도구로 실제 처리한다. 콘텐츠 본문·Research Fact·SEO·이미지 배치 책임은 유지하며, 이미지 제작 방법과 QA 구현을 2단계에서 작성하지 않는다.

현재 AGENTS.md 및 CONTENT.md → CONTENT_FACTORY.md → CONTENT_QUEUE.md, 최신 Writer 도구 schema와 현재 Research Artifact를 확인한다. 도구가 없으면 Claim 전에 정확히 보고하고 없는 기능을 호출했다고 기록하지 않는다. 기존 미완료 자기 Claim을 먼저 복구하고 다른 실행의 Claim은 변경하지 않는다.

## Writer 처리

- Research의 실제 사실·CF ID·모델/연식·적용 범위와 Source를 사용한다. 근거·수치·CF ID·URL을 만들지 않는다.
- 고객 질문에 직접 답하는 본문과 현재 SEO 요구를 작성한다. 접근 위치·확인 방법·조건별 행동은 근거 범위 안에서 설명한다.
- 이미지가 필요한 경우 이미지마다 하나의 고객 질문과 실제 시각 대상을 정한다. 같은 피사체라도 보이지 않는 온도·재시동 성공·고장 원인을 이미지가 증명하도록 요구하지 않는다.

## 신규 image_briefs

각 신규 Brief는 다음 필드만 작성한다. wrapper/배열 이름은 현재 공식 Writer 저장 schema를 따른다.

contract_version: 5
image_id: IMG_01
asset_role: THUMBNAIL_HERO 또는 BODY 등 현재 허용 역할
user_question: 이미지가 답해야 하는 질문 하나
visual_objective: 실제로 보여줄 대상과 관계 한 문장
must_show: 실제로 식별해야 하는 필수 시각 대상 목록
must_not_show: 금지 대상·오인 표현 목록
evidence_requirement:
  level: NONE 또는 REFERENCE 또는 REQUIRED
  fact_ids: Research에 실제 존재하는 CF ID 배열, 해당 없으면 []
  evidence_ref: 실제 확보한 근거 배열, 없으면 생략 또는 []
alt_text_draft: 실제 시각 대상 중심 ALT 초안

evidence_ref 원소는 실제 HTTPS source_ref와 선택적 model_scope, supports만 사용한다. supports는 해당 자료가 뒷받침하는 구조/사실 설명이다. 문서 URL과 실제 이미지 파일 URL을 혼동하지 않는다. URL 전달은 픽셀 검사 완료가 아니다.

근거 level의 의미·제작 허용 범위는 CONTENT.md의 공통 정책을 따른다. 일반 장면은 NONE, 실제 확인한 형태를 재구성할 수 있는 경우 REFERENCE, 최종 자산이 검증된 실제/공식 Source 기반이어야 하는 경우 REQUIRED다. 근거를 확보하지 못했다고 REQUIRED를 NONE으로 낮추지 않는다.

source_strategy/source_priority/generation_allowed/ai_edit_allowed/full_generation_allowed/reference_based_generation_allowed/composition_plan/annotation_contract/people_mode/pixel_qa_contract/qa_criteria/mobile_requirement/production_feasibility/production_flexibility를 신규 V5 Brief에 작성하지 않는다. Pipeline/Task/asset 운영 식별자는 서버가 관리한다.

모든 must_show가 실제 시각 대상인지 확인한다. 필수·금지 목록의 동일 항목이나 사람 필수/금지 충돌을 제거한다. 사람·손·라이더가 필요하면 필수 목록에 명시하고 금지하면 금지 목록에 명시한다. 기본은 사람 없음이다. 구도/Inset/Source 탐색/편집 방식은 3-A가 선택한다. 이미지마다 핵심 질문 하나를 유지하되 제작이 어려운 요구를 QA 완화로 해결하지 않는다.

## 저장 및 완료

현재 공식 Writer 완료 경로로 본문 Artifact와 신규 V5 image_briefs를 저장하고 이미지 Task 동기화를 확인한다. 서버 schema/basic consistency 검사 성공을 픽셀 QA 또는 Source 확보 성공이라고 보고하지 않는다. 기존 활성 Claim·QA_PENDING·승인 자산·Contract Hash를 덮어쓰거나 자동 V5 변환하지 않는다.

최종 보고: Pipeline/Topic, Writer 최종 상태, 신규 V5 Task 수, evidence level 요약, 이미지 Task 동기화 확인, 자기 Claim 종료 결과. 실패하면 실제 오류와 재개 지점을 기록하고 공식 종료한다.

다음 담당: 3-A 제작. 다음 작업: 최신 Contract와 서버 visualPolicy 기준 후보 확보·Staging·검수 인계.
