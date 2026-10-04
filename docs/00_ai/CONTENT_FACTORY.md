# FitBike Content Factory AI Policy

**Version:** v1.2
**Status:** Source of Truth for AI content production

## 1. Purpose

이 문서는 FitBike AI가 `16_content_topic`의 Topic을 실제 서비스 콘텐츠로 제작할 때 따르는 실행 정책이다.

제품 관점의 Content 원칙은 `docs/03_service_modules/CONTENT.md`가 우선한다. 이 문서는 그 원칙을 반복하지 않고 Research → Fact → Writing → Visual Planning → Image Production → QA → Publish 과정에서 AI가 어떻게 행동해야 하는지를 정의한다.

콘텐츠 제작 Task는 다음 순서로 읽는다.

1. `AGENTS.md`
2. `docs/00_ai/SOP.md`
3. `docs/01_product/SERVICE.md`
4. `docs/03_service_modules/CONTENT.md`
5. 이 문서 `docs/00_ai/CONTENT_FACTORY.md`
6. 현재 Topic과 관련 DB schema / 기존 Content

## 2. Core Production Rule

Content Factory는 콘텐츠 한 건을 하나의 Orchestration Context로 처리한다. Planner, Researcher, Writer, Visual Planner, Image Editor, Content Editor, Quality Judge는 별도 콘텐츠를 만드는 Agent가 아니라 같은 Job 안에서 순차적으로 수행되는 역할이다.

각 단계는 앞 단계의 구조화된 Artifact를 재사용한다. 이미 검증된 사실과 출처를 다음 단계에서 처음부터 다시 조사하지 않는다.

### Scheduled Pipeline State

예약 기반 Content Factory는 단계 간 상태를 채팅 문맥에 의존하지 않는다.

- `18_content_pipeline`: 콘텐츠 1건의 예약 Pipeline stage와 Planning/Research/Writer/Image/QA/Publish Artifact를 저장한다.
- `19_content_pipeline_run`: 각 예약 실행의 시작, PASS/HOLD/BLOCKED, 오류와 완료 시각을 기록한다.
- Queue 원장은 계속 `16_content_topic`이지만 예약 Pipeline은 기존 Work 진행 상태를 변경하지 않는다. Planning이 Candidate를 Claim해도 `16_content_topic.status`는 유지한다.
- 주제 소유권은 공유한다. `18_content_pipeline.ownership_state`가 `CLAIMED` 또는 `COMPLETE`인 Topic은 기존 Work Queue의 `content_factory_next_topic_v1` 대상에서 제외하여 같은 주제를 Work와 예약이 중복 제작하지 않는다.
- Research/Writer/Visual/QA/Publish 예약의 단계 상태와 HOLD/BLOCKED는 `18_content_pipeline`과 `19_content_pipeline_run`에서만 관리한다.
- 예약 게시는 기존 Work용 `content_factory_publish_v1`을 변경하거나 호출하지 않고 예약 전용 `content_pipeline_publish_v1`을 사용한다. 최종 서비스 원장(`12_content`, 관계 테이블, `17_content_asset_source`)은 동일하게 사용한다.
- `COMPLETE`는 DB insert만으로 기록하지 않고 실제 Production URL과 공개 Content 상태를 확인한 뒤 기록한다.
- Pipeline/Run 테이블과 예약 RPC는 내부 자동화용이며 `service_role` 전용이다. 공개 클라이언트에서 직접 접근하지 않는다.
- 예약 Planning Worker의 신규 Topic 진입점은 `content_pipeline_planning_next_v2()`를 사용한다. 이 함수는 기존 `content_pipeline_claim_planning_v1()`의 `FOR UPDATE SKIP LOCKED` 원자적 Claim을 그대로 위임하는 `service_role` 전용 wrapper다. v1은 호환성을 위해 유지하며, 예약/Work Prompt가 임의 `INSERT/UPDATE`로 Claim을 우회하지 않는다.
- 예약 Worker는 단계별 실행 시각을 서로 기다리지 않고 자신의 Ready Queue를 독립적으로 소비한다. Planning+Research는 RESEARCHED, Writer는 DRAFTED/Image Brief, Image Producer는 이미지 단위 준비 상태, Final QA는 모든 필수 이미지 준비 상태를 기준으로 Claim한다.
- Writer가 확정하는 이미지 수는 콘텐츠마다 가변이다. Image Producer는 콘텐츠 전체가 아니라 미완료 Image Brief를 처리하며 한 실행에서 최대 1건만 Claim하고 처리한다. 이미 성공한 Generation/Image QA/WebP 결과는 후속 실패 때문에 재생성하지 않는다.
- 예약 Image Producer는 `fitbike.co.kr` HTTP API를 경유하지 않는다. `content_pipeline_issue_asset_upload_ticket_v1`로 해당 Pipeline/Image에만 유효한 짧은 수명의 1회 Upload Ticket을 발급받은 뒤 Supabase Edge Function `content-pipeline-asset-upload`로 WebP를 직접 전송한다. Edge Function은 Ticket의 Pipeline, Content Key, Asset Key, 만료와 1회 사용 여부를 검증하고 Supabase 내부 `service_role`로 `content-assets`에 저장한 뒤 SHA-256을 재검증한다. 장기 `CONTENT_FACTORY_PUBLISH_TOKEN` 또는 `service_role`은 Prompt/Artifact/Worker에 노출하지 않는다. 일반 `anon`/`authenticated` Storage 쓰기 정책도 열지 않는다.
- 생성/외부/공식 이미지 모두 신규 권리 상태를 생성하지 않는다. 출처 기록 정책은 `CONTENT.md`를 따른다.


기본 흐름:

`TOPIC → PLAN → RESEARCH → FACT REGISTER → CONTENT OUTLINE → VISUAL PLAN → WRITE → ASSET RESEARCH → IMAGE BRIEF → CREATE/EDIT → ASSEMBLY → QA → PUBLISH GATE`

## 3. Topic to Plan

Topic 제목만 보고 바로 글을 쓰지 않는다. 먼저 다음을 확정한다.

- 사용자 질문과 해결하려는 문제
- 대상 독자와 필요한 사전 지식
- Content Type / Purpose Template
- 반드시 답해야 하는 질문
- 다루지 않아야 하는 범위
- Critical Facts
- Safety Risk
- 기존 콘텐츠와의 Intent 중복
- 텍스트보다 Visual이 더 효과적인 정보

Topic 정보가 부족해도 기존 정책과 조사로 안전하게 결정 가능한 것은 AI가 결정한다. 핵심 목적이 불명확하거나 고위험 판단이 필요한 경우에만 HOLD한다.

## 4. Research and Evidence

Research는 사용자 질문에 답하는 데 필요한 범위로 제한한다.

우선순위:

1. 제조사/브랜드 공식 페이지와 공식 문서
2. Owner's Manual / Service / Technical 자료
3. 신뢰 가능한 기술·정비 자료
4. 전문 매체와 실제 작업 자료
5. 블로그/개인 작업기/커뮤니티는 실제 접근 장면, 사용자 질문, 현장 맥락 발견에 활용

특정 모델의 규격, 수치, 정비 한계와 Safety Critical Claim은 `CONTENT.md`의 Source Policy를 따른다. 블로그 한 곳의 주장만으로 Critical Fact를 확정하지 않는다.

Research 결과는 Fact Register로 구조화한다. 최소한 claim, evidence URL, source type, verification state, critical 여부를 구분한다.

### Rider Experience Context

커뮤니티·포럼·블로그의 실제 경험은 사용자가 이 주제를 찾는 순간, 처음 발견하는 신호,
성급하게 하기 쉬운 오해와 현실적인 불편을 이해하는 Editorial Input으로 활용할 수 있다.
이는 기술 Fact의 Evidence나 사용자 후기 Database가 아니다.

- 개별 게시물 URL, 닉네임, Screenshot, 인용문, 개인별 경험 Record를 Source 원장이나 `17_content_asset_source`에 저장하지 않는다.
- 사용자 본문에 `한 라이더가`, `많은 라이더가`, `실제 후기에서는`처럼 출처가 있는 후기처럼 표현하지 않는다.
- 여러 맥락에서 공감 가능한 상황만 FitBike 고유 문장으로 일반화한다.
- 한 사례를 흔한 고장, 빈도, 확률 또는 원인으로 확대하지 않는다.
- 게시자의 진단, 수리 방법, 제품 선호, 모델별 수치와 안전 판단을 Fact로 채택하지 않는다.
- 기술 설명, 수치, 모델 절차와 운행 판단은 기존 Evidence 정책으로 별도 검증한다.
- 선정적이거나 제품 홍보성이 강하고 일반화할 수 없는 경험은 사용하지 않는다.

라이더 경험 조사 결과는 영구 Provenance Artifact로 관리하지 않는다. 최종 Content에는 개인
경험 자체가 아니라 `상황 → 관찰 → 오해하기 쉬운 부분 → 확인할 항목`만 남긴다.

## 5. Writing Standard

콘텐츠는 검색 유입용 분량 채우기가 아니라 사용자의 질문 해결을 목적으로 한다.

- 첫 화면에서 사용자가 무엇을 알게 될지 분명해야 한다.
- 요약과 첫 문단은 사용자의 검색 동기, 점검이 필요한 이유, 놓쳤을 때 생길 수 있는 구체적 영향을 먼저 설명한다. 콘텐츠 범위만 나열하는 상투적인 도입은 사용하지 않는다.
- 핵심 답을 불필요하게 뒤로 미루지 않는다.
- 설명 → 판단 기준 → 실제 확인 → 다음 행동의 흐름을 우선한다.
- 같은 의미를 다른 표현으로 반복해 길이를 늘리지 않는다.
- 실제 작업 콘텐츠는 위치, 접근, 작업, 완료 확인, 전문 점검 전환 기준을 구분한다.
- 전문 용어는 필요한 경우 사용하되 초보자가 행동할 수 있도록 설명한다.
- 추천, 랭킹, 과도한 구매 유도는 만들지 않는다.
- 이미지가 더 정확하게 전달하는 정보는 긴 문장으로 중복 설명하지 않는다.
- 섹션 제목은 사용자가 바로 이해할 수 있는 행동 중심 문장으로 작성한다. 대상과 행동이 불명확한 질문형·추상형 제목은 사용하지 않는다.
- 모든 콘텐츠에 반복되는 모델별 기준 안내는 도입부에 복제하지 않고 `참고 공식 자료` 아래의 공통 안내 영역에서 제공한다.
- 사용자가 행동에 필요한 일반 기준을 신뢰 가능한 근거로 확인할 수 있으면 그 기준을 먼저 제시하고, 모델·연식·사용 조건 차이는 기준을 조정하는 조건으로 뒤에 설명한다. `모델마다 다릅니다`만으로 답을 끝내지 않는다.
- 시간·거리·온도 같은 수치는 출처가 제시한 적용 범위를 함께 기록한다. 예: 커버 제조사의 `최소 10분 냉각` 안내를 일반 출발점으로 쓰되, 장거리·고속·고온 환경에서는 배기계가 아직 뜨거우면 더 기다리도록 상태 확인을 병행한다.
- 일반 콘텐츠라도 사용자가 자기 차량에 적용하는 모습을 이해하기 어렵다면 공식 자료가 충분한 대표 모델 한 대를 예시로 든다. 예시는 전체 차량에 대한 규칙으로 확대하지 않고, 차량 치수·장착 액세서리·배기 위치처럼 선택 판단이 달라지는 항목을 보여준다.
- 공감 가능한 라이더 상황이 질문을 이해하는 데 도움이 되면 도입, 놓치기 쉬운 점 또는 상태 판단 앞에 짧게 녹인다. 모든 콘텐츠에 별도 후기 섹션을 강제하지 않는다.
- 라이더 경험을 넣기 위해 가상의 인물, 감정, 사고 결과나 해결 성공담을 만들지 않는다.
- 경험 문장은 `상황 → 처음 관찰한 신호 → 오해하기 쉬운 부분 → 확인할 항목`으로 이어지고 실제 판단 정보로 연결되어야 한다.
- 특정 모델의 타이어·배터리·브레이크 규격을 별도 가이드로 다시 작성하지 않는다. 모델 고유 규격·호환 제품·특징·연식 차이는 Model + Year Detail 보강 대상으로 보내고, 공통 원리와 DIY 확인 방법만 Content가 소유한다.
- 신규 주제는 오토바이 DIY 관리와 액세서리의 선택·장착 전 확인·사용 중 점검을 우선한다. 안전 범위가 명확하지 않은 분해·조정 작업은 자동 제작하지 않는다.
- 모델/연식 규격 다음에 상품을 보여줄 필요가 있으면 규격 문자열만으로 상품을 추정하지 않는다. 해당 `bike_model_year_id`에 활성 mapping이 있는 FitBike Tire Product만 `/tire-detail/[tireProductId]`로 연결한다.

### User-facing Safety Language

내부 Risk Gate와 사용자에게 보여주는 문장을 구분한다. 내부적으로 `STOP`,
`HOLD`, `BLOCKED`를 사용하더라도 이를 제목·소제목·본문의 상투어로 복사하지 않는다.

- 일반 점검 안내는 `확인 → 상태 해석 → 다음 행동` 순서로 쓴다.
- 위험 근거가 특정되지 않은 상황에는 `중단` 대신 `추가 확인`, `조정·정비 필요`,
  `운행 전 전문 점검 권장`을 사용한다.
- 사용자가 직접 작업할 범위를 넘으면 `직접 분해하지 말고 전문 점검으로 전환`으로 안내한다.
- 전문 점검이 필요한 상태는 `점검 중단`으로 뭉뚱그리지 않고, 확인된 신호와 운행 판단, 정비소 문의 행동을 구분한다.
- 검증된 즉시 위험 상태에만 `이 상태에서는 운행하지 마세요`를 사용하고 이유를 함께 설명한다.
- QA는 특정 단어의 포함 여부만 보지 않고 위험 상태, 사용자 행동, 전환 기준이 서로 맞는지 판정한다.

## 6. Visuals Are Information

FitBike 콘텐츠에서 이미지는 장식물이 아니라 독립적인 정보 블록이다.

### Official Reference Presentation

- 작성에 사용한 공개 근거는 본문 마지막 `참고 공식 자료` H2 아래에만 둔다.
- 자료 표기는 `[자료명](https://공식-주소)` 형식의 목록을 사용한다. 화면에는 자료명만 보이고 URL 문자열은 직접 노출되지 않아야 한다.
- 링크가 없는 자료는 자료명만 쓰며 URL을 추정해 만들지 않는다.
- `확인에 참고한 자료`, `확인에 참고한 공식 자료`, `출처`처럼 콘텐츠마다 다른 제목을 만들지 않는다.
- Research/Fact Register와 내부 Source 원장에는 검증과 추적을 위해 원본 URL을 그대로 보존한다. URL 비노출 규칙은 사용자용 본문에 적용한다.

이미지는 최소 수량이나 최대 수량을 기준으로 계획하지 않는다. 서로 다른 사용자 질문을 해결한다면 한 콘텐츠에 다양한 이미지를 충분히 사용할 수 있다. 반대로 같은 정보를 반복하는 이미지는 수량을 채우기 위해 추가하지 않는다.

Visual Planner는 본문 작성과 별개로 다음 질문을 판단한다.

- 사용자가 실제로 무엇을 봐야 이해할 수 있는가?
- 실제 사진이 필요한가, 편집 이미지가 필요한가, 고객 점검 안내용 생성 이미지가 필요한가?
- 위치, 접근, 정상/이상, 측정, 작업, 완료 상태 중 무엇을 보여줘야 하는가?
- 모바일 390px 수준에서도 핵심을 식별할 수 있는가?

### Visual Roles

- `HERO`: 콘텐츠 주제와 실제 맥락을 즉시 이해
- `LOCATION`: 바이크 전체에서 부품/점검 위치 확인
- `ACCESS`: 시트, 커버, 외장 등을 어떻게 열어 접근하는지 이해
- `IDENTIFY`: 부품, 라벨, 규격, 단자 등 실제 대상 식별
- `NORMAL_ABNORMAL`: 정상과 점검 필요 상태 비교
- `ACTION`: 공구와 작업 지점을 우선하고, 동작 이해에 꼭 필요할 때만 손·팔을 포함
- `SEQUENCE`: 여러 단계의 순서 설명
- `MEASUREMENT`: 측정 위치, 접점, 계기 사용 맥락 설명
- `RESULT`: 완료 또는 정상 복구 상태 확인
- `WARNING`: 금지 행동, 위험 위치, 전문 점검 전환 또는 운행 금지 근거 설명
- `CONCEPT`: 실제 사진만으로 설명하기 어려운 원리와 판단 구조

Visual 하나는 최소 하나의 명확한 Role과 User Question을 가져야 한다.

타이어 규격의 `IDENTIFY` Visual은 실제 사이드월에서 제조사/브랜드, 제품 식별 정보와 규격 문자열이
함께 읽히는 승인 실사를 우선한다. 규격을 설명하면서 브랜드와 사이즈가 모두 보이지 않는 범용
타이어 이미지는 사용하지 않는다. MAXXIS 승인 공식 자산에 필요한 식별 정보가 선명하면 이를 먼저
활용하고, 보이지 않는 문자나 규격을 생성·합성해 실제 각인처럼 만들지 않는다.

## 7. Image Source Strategy

실제 구조와 상태를 설명하는 경우 실제 자료 탐색을 우선한다.

탐색 우선순위:

1. FitBike가 사용 가능한 MAXXIS, POWEROAD 등 승인 Brand Asset
2. 제조사/브랜드 공식 이미지와 기술자료
3. 블로그의 실제 작업/실차 이미지
4. 신뢰 가능한 전문 자료의 실제 이미지
5. 기타 현장 맥락을 확인할 수 있는 웹 자료
6. FitBike 점검 안내용 신규 생성 이미지

공식/블로그/웹 이미지는 단순 복사하여 FitBike 최종 자산으로 취급하지 않는다. 원본은 Research/Editorial Source로 기록하고, 서비스 목적에 맞는 정보 구조를 먼저 정의한 뒤 허용된 편집 또는 독립적인 FitBike 교육용 Visual 생성에 사용한다.

원본 페이지/자산 URL, Source Name, Author/Operator, Source Type, 확인 시점, Content/Visual Role과 편집 이력을 기록한다. 라이선스·권리 상태·허락 근거는 제작 필수값이 아니다.

권리 협의·판단 및 문제 이미지의 제외·삭제·수정은 운영자가 담당한다. AI는 출처만 기록하며 권리 대기/승인 상태를 만들지 않는다.

## 8. Watermark Policy

워터마크, 타 서비스 로고, 저작권 표식, 사진 판매/스톡 서비스 식별표가 포함된 이미지는 최종 FitBike 이미지의 편집 원본으로 사용하지 않는다.

- 워터마크를 제거하거나 가리는 편집을 하지 않는다.
- 워터마크 영역만 Crop하여 사실상 제거하는 방식도 사용하지 않는다.
- 해당 이미지는 사실/장면/Visual Requirement를 이해하기 위한 Research Reference로만 사용할 수 있다.
- 같은 정보를 보여주는 워터마크 없는 공식/블로그/실제 자료를 다시 탐색한다.
- 적절한 원본이 없으면 원본의 표현을 복제하지 않고, 검증된 사실과 Visual Requirement를 바탕으로 FitBike 목적의 독립적인 점검 안내 이미지를 신규 생성한다.

## 9. Real Asset vs Generated Visual

### Real Asset First

다음은 실제 이미지가 우선이다.

- 특정 차종의 실제 외형
- 실제 부품 위치
- 실제 커버/외장/배선 구조
- 실제 제품과 라벨
- 실제 마모, 손상, 부식, 누액 등 상태
- 실제 분해/접근 과정

생성 이미지가 특정 모델의 실제 구조나 실제 손상을 기록한 사진처럼 오인되게 만들지 않는다.

### Generated Guidance Visual

다음은 독립적인 고객 점검 안내용 생성 이미지가 효과적이다.

- 작동 원리
- 측정 원리와 접점
- 판단 흐름
- 작업 순서 요약
- 정상/주의/전문 점검 필요 상태의 개념 비교
- 실제 사진에 안전하게 표시하기 어려운 설명 구조

생성 이미지는 특정 제조사 공식 도면이나 특정 블로그 사진을 그대로 재현하지 않는다. Research에서 확인된 사실을 기반으로 FitBike만의 구도, 정보 계층, 라벨, 설명 목적을 가진 Visual을 만든다. 사람 표현과 alt/caption을 포함한 상세 제작 기준은 `CONTENT_EDITORIAL_VISUAL_STANDARD.md`를 따른다.

## 10. Image Editing Standard

사용 가능한 실제 이미지를 편집할 때 목표는 미관보다 정보 전달 개선이다.

허용되는 Editorial Transformation:

- 모바일 중심 Crop과 Composition
- 회전/원근/노출/화이트밸런스/선명도 보정
- 개인정보 및 번호판 등 필요한 Mask
- 핵심 위치 Outline / Highlight
- 접근 방향이나 작업 지점 Arrow
- 짧고 명확한 Label
- 비교 레이아웃과 단계 레이아웃
- FitBike 콘텐츠 화면에 맞는 여백/비율 최적화
- WebP 등 서비스 표준 포맷 변환

금지:

- 워터마크 제거/은폐
- 실제 제품 코드 변경
- 단자 방향 변경
- 실제 부품 위치 변경
- 손상/마모 상태 조작
- 서로 다른 실제 장면을 하나의 실제 사진처럼 합성
- 존재하지 않는 브랜드/부품을 실제 제품처럼 삽입
- 장식 목적의 과도한 텍스트/아이콘

## 11. Mandatory Image Brief

이미지 검색, 편집 또는 생성을 실행하기 전에 Visual Planner는 각 이미지마다 Image Brief를 만든다. `이미지 하나 만들어줘`와 같은 비구조적 요청은 금지한다.

필수 필드:

- `content_key`
- `image_id`
- `role`
- `user_question`
- `visual_objective`
- `subject`
- `must_show`
- `source_strategy`
- `generation_allowed`
- `annotations`
- `mobile_requirement`
- `prohibited`
- `fact_dependencies`
- `qa_requirement`

사람이 장면의 정보 전달에 필요한지, 화면에 어느 범위까지 보여야 하는지는
`human_presence`에도 기록한다. 허용 값은 `NONE`, `HANDS_ONLY`, `PERSON_REQUIRED`다.
기본값은 `NONE`이며 자세한 선택 기준은 `CONTENT_EDITORIAL_VISUAL_STANDARD.md`를 따른다.

예시:

```yaml
content_key: battery-check-before-replace
image_id: battery-terminal-condition-01
role: NORMAL_ABNORMAL
user_question: "이 배터리 단자 상태가 정상인가?"
visual_objective: "사용자가 정상 단자와 점검이 필요한 부식/오염 상태를 구분한다."
subject: motorcycle battery terminal
must_show:
  - positive/negative terminal context
  - clean connection state
  - corrosion or contamination inspection point
source_strategy: REAL_ASSET_FIRST
generation_allowed: CONCEPT_ONLY
annotations:
  - 정상 상태
  - 부식·오염 확인
mobile_requirement: "390px 화면에서 비교 차이를 즉시 식별"
prohibited:
  - fictional product branding
  - changed terminal geometry
  - exaggerated damage
  - long explanatory text
fact_dependencies:
  - verified terminal inspection facts
qa_requirement: "이미지만 보고 확인 위치와 차이를 설명할 수 있어야 한다."
```

Image Generator/Editor는 Brief의 `must_show`, `prohibited`, `fact_dependencies`를 임의 변경하지 않는다. 필요한 사실이 부족하면 생성 전에 Research 단계로 되돌린다.

## 12. Visual Diversity Standard

한 콘텐츠의 이미지를 같은 구도와 같은 역할로 반복하지 않는다. 필요에 따라 다음을 조합한다.

- 실제 전체 차량/환경 사진
- 접근 위치 사진
- 실제 부품 Close-up
- 정상/이상 비교
- 단계별 작업 Visual
- 측정 Visual
- Annotated Editorial Image
- 간단한 교육 Diagram
- 판단 Flow Visual
- 완료 상태 Visual

콘텐츠가 긴 경우 Visual Rhythm을 고려하여 사용자가 긴 텍스트 덩어리를 계속 읽지 않도록 한다. 단, 정보가 없는 장식 이미지로 문단을 분리하지 않는다.

## 13. Image QA Gate

모든 최종 이미지에 대해 다음을 검사한다.

- 명확한 User Question과 Visual Role이 있는가
- 본문 이해에 실제로 도움이 되는가
- 같은 정보를 다른 이미지가 반복하지 않는가
- 실제 자료와 생성 자료를 오인시키지 않는가
- Fact Dependency와 이미지 표현이 일치하는가
- 실제 구조, 위치, 제품, 손상을 왜곡하지 않았는가
- 워터마크/타 서비스 로고가 없는가
- 원본 출처가 필요한 경우 기록되어 있는가
- 모바일에서 핵심 대상과 Annotation을 식별할 수 있는가
- 긴 텍스트를 이미지 안에 넣지 않았는가
- 개인정보/번호판 등 불필요한 식별 정보가 처리됐는가

`WATERMARK`, `REALITY_MISMATCH`, `FACT_MISMATCH`, `MISLEADING_GENERATED_REALITY`는 Image QA FAIL이다.

## 14. Content Quality Judge

최종 Quality Judge는 최소 다음 축을 평가한다.

- `ANSWER`: 사용자의 질문에 본문 안에서 직접 답하는가
- `PRACTICAL`: 실제 바이크 앞에서 확인/행동할 수 있는가
- `EVIDENCE`: Critical Fact가 충분히 검증됐는가
- `SAFETY`: 위험, 운행 금지 근거, 전문 점검 전환 조건이 명확한가
- `SAFETY_LANGUAGE`: 위험도에 비해 과도한 중단 표현을 반복하지 않고 다음 행동이 구체적인가
- `STRUCTURE`: 질문 → 판단 → 행동 흐름이 자연스러운가
- `VISUAL`: 이미지가 독립적인 정보로 기능하는가
- `REFERENCE_PRESENTATION`: `참고 공식 자료`가 마지막 접힘 영역으로 작성되고 URL이 자료명 링크 뒤에 숨겨졌는가
- `REAL_WORLD`: 실제 위치, 접근, 상태 맥락이 충분한가
- `READABILITY`: 모바일에서 읽고 스캔하기 쉬운가
- `REDUNDANCY`: 텍스트와 이미지 모두 불필요한 반복이 없는가
- `UNIQUENESS`: 기존 FitBike 콘텐츠와 다른 사용자 Intent를 해결하는가

점수는 개선 우선순위 파악에 사용할 수 있지만 Critical Gate를 대체하지 않는다.

다음 중 하나라도 실패하면 총점과 관계없이 자동 게시하지 않는다.

- Critical Fact FAIL
- Safety FAIL
- Source Conflict
- Reality/Image Fact FAIL
- 지원되지 않는 모델 고유 Fact

이미지 출처는 `17_content_asset_source`에서 추적한다. 신규 rights_status는 NULL이며 이전 이력은 보존한다.

## 15. Machine QA vs AI QA

코드로 확정 가능한 항목을 AI에게 반복 판단시키지 않는다.

Machine QA 예:

- 필수 body block 구조
- 이미지 URL/Storage path
- 이미지 중복
- Source record 존재
- 지원하지 않는 block type
- 제목/content key 중복
- 이미지 파일 형식과 크기
- 모바일 렌더 구조의 기계적 검증

AI QA 예:

- 질문에 제대로 답하는지
- 설명이 실제 행동으로 이어지는지
- 이미지가 이해에 도움이 되는지
- 생성 Visual이 실제 사실을 오인시키는지
- 반복과 불필요한 분량이 있는지
- 위험한 설명이 있는지

## 16. HOLD / Failure

AI는 해결 가능한 품질 부족을 즉시 HOLD하지 않는다. Research 보강, 다른 Asset 탐색, Image Brief 재작성, Visual 재생성, 문장 편집 등 Job 내부에서 재시도한다.

다음과 같이 AI가 안전하게 해결할 수 없는 경우 HOLD한다.

- Critical Fact를 검증할 공식/신뢰 근거가 없음
- 상충하는 Source를 해소할 수 없음
- 안전상 핵심 작업 조건을 확인할 수 없음
- 특정 모델의 실제 구조를 확인하지 못했는데 실제 구조처럼 표현해야만 콘텐츠가 성립함
- 정책/DB schema 충돌

HOLD 시 `failed_stage`, `reason`, `what_was_tried`, `next_action`을 남긴다.

## 17. Publish Completion

게시 완료는 DB row 생성만을 의미하지 않는다.

가능한 실행 환경에서는 다음을 확인한다.

- Content DB 반영
- 필요한 Asset Storage 반영
- Source/Asset provenance 기록
- Production URL 접근
- 모바일 본문/이미지 렌더
- 이미지 깨짐 여부
- sitemap/discovery 반영 정책 충족
- Topic/Job 상태 갱신

Production mutation/deploy는 `AGENTS.md`의 승인 규칙과 현재 실행 환경 권한을 따른다.

## 18. Policy Learning Loop

사용자 피드백이 특정 콘텐츠 한 건의 취향 수정이 아니라 반복될 수 있는 품질 문제라면 해당 콘텐츠만 Patch하고 끝내지 않는다.

`Feedback → Root Cause → Missing/Weak Factory Rule → Source of Truth Update → Future Content 적용`

예:

- "이미지가 실제 점검에 도움이 안 된다" → Visual Role / Image Brief / Image QA 개선
- "본문이 반복된다" → Writing / Redundancy Gate 개선
- "실제 위치를 모르겠다" → LOCATION/ACCESS Visual requirement 개선

지속 정책은 채팅 기억이나 개별 Prompt에만 남기지 않는다. 이 문서 또는 상위 Content Source of Truth에 반영한다.

## 19. Work Production and Policy Improvement

### Official production mode

FitBike 콘텐츠는 일반 Chat 또는 예약 Chat에서 단계별로 실행할 수 있으며, Work는 개발·복구에 사용한다. 각 실행 환경의 도구와 binary transport를 실제 preflight로 검증한다. 외부 OpenAI API 자동 생성, 무인 생성 Schedule, API Key 또는 Model Variable은 Production 콘텐츠 제작의 필수 조건이 아니다. 저장소의 Provider·자동 실행 코드는 호환성과 실험 목적으로 남을 수 있지만, 정책과 완료 판정을 대신하지 않는다.

현재 Topic, 기존 Content, 공식 근거, Image Contract, QA 결과와 게시 영수증은 DB Artifact로 이어받으며 다른 Chat의 로컬 파일이나 대화 기억에 의존하지 않는다. 게시 완료는 제한 API를 통한 DB·Storage 반영과 공개 URL 검증까지 포함한다.

### Problem-driven policy improvement

정책은 추상적인 선호나 한 콘텐츠의 문장 수정만으로 바꾸지 않는다. 반복 가능성이 있는 문제는 다음 순서로 개선한다.

1. **Observed problem** — 실제 Topic, 본문, 이미지 또는 게시 결과에서 사용자가 이해하기 어려운 부분을 기록한다.
2. **User impact** — 어떤 질문에 답하지 못했는지, 어떤 오해·안전·검색 중복 문제가 생기는지 설명한다.
3. **Root cause** — Topic 정의, Research, Writing, Visual, QA, Publish 중 어느 규칙이 없거나 약한지 찾는다.
4. **Policy change** — 이 문서 또는 상위 `CONTENT.md`의 기존 절에 일반화된 규칙을 추가한다.
5. **Good / avoid examples** — 통과 예시와 피해야 할 예시를 같은 판단축으로 작성한다.
6. **QA translation** — 기계 검사가 가능하면 코드 QA에, 의미 판단이 필요하면 Work QA 체크리스트에 반영한다.
7. **Regression check** — 새 규칙을 기존 정상 콘텐츠에 적용했을 때 불필요하게 차단하지 않는지 확인한다.

새 정책을 별도 감사·보완 문서에 추가하지 않는다. 제품 원칙은 `docs/03_service_modules/CONTENT.md`, 제작 절차는 이 문서, 큐 선택은 `CONTENT_QUEUE.md`, 이미지 표현은 `CONTENT_EDITORIAL_VISUAL_STANDARD.md`의 기존 관련 절을 직접 수정한다.

### Current problem examples

| 문제 | 원인 | 개선 규칙 | 좋은 예시 | 피할 예시 |
|---|---|---|---|---|
| 모든 글의 도입과 소제목이 비슷함 | Template을 문장 양식으로 사용 | Template은 필수 판단 범위만 정하고 문장·블록 수는 Topic 질문에 맞춘다 | “키가 한 번에 돌아가지 않으면 힘을 더 주기 전에…” | “안전을 위해 반드시 점검해야 합니다” 반복 |
| 상태표가 있지만 행동 차이가 불분명함 | 상태만 나열하고 다음 행동이 없음 | 표는 상태·의미·다음 행동을 함께 제공한다 | 정상 유지 / 추가 확인 / 정비 전환 | 정상 / 비정상만 표시 |
| 이미지 수를 먼저 정함 | 정보 목적보다 수량을 목표로 함 | 서로 다른 User Question을 해결하는 이미지만 제작한다 | 위치 Hero + 균열 Close-up | 같은 구도의 Hero와 본문 반복 |
| 전문 점검 문구가 과도함 | 내부 Risk 용어를 사용자 문장에 복사 | 확인된 신호·이유·운행 판단·정비 행동을 구분한다 | “브래킷 균열이 보이면 탈락 위험 때문에 운행 전 정비” | 모든 문단에서 “점검을 중단하세요” |
| 모델 차이 안내가 상투적으로 반복됨 | 공통 안내와 Topic 고유 차이를 구분하지 않음 | 검증된 일반 기준을 먼저 주고 답을 바꾸는 모델 차이와 대표 모델 적용 예시를 뒤에 둔다 | “최소 10분 후 확인, 장거리·고온 주행은 열기가 남으면 더 대기” + GROM 적용 예시 | “정확한 시간은 모델마다 다릅니다”만 반복 |
| 모델별 타이어 규격 글이 공통 설명을 반복함 | Model Detail과 Content의 정보 소유권이 불명확함 | 공통 규격 읽기는 한 가이드, 모델·연식 규격과 연결 상품은 Model + Year Detail이 소유 | `타이어 규격 읽는 법` + 모델 상세의 앞/뒤 규격·실제 SKU 링크 | `모델명 + 타이어 규격 확인 방법` URL 반복 생성 |
| 규격 설명 이미지에서 식별 문자가 보이지 않음 | 타이어 형태만 맞는 범용 이미지를 사용함 | 브랜드/제품 식별과 실제 규격 각인이 읽히는 승인 공식 실사를 사용 | MAXXIS 공식 타이어 사이드월의 브랜드와 `120/70ZR17...` 각인이 함께 보임 | 브랜드·규격이 없는 검은 타이어 이미지 |

### Change acceptance

정책 변경은 다음을 모두 만족할 때 완료다.

- Source of Truth 원본 문서가 직접 수정됨
- 관련 Good / avoid example이 있음
- 기존 QA 또는 Work QA에 판정 방법이 연결됨
- Content Factory 저장소에 정책 전문 사본을 만들지 않음
- 실제 콘텐츠 한 건 이상에 새 기준을 적용해 결과를 확인함


## Scheduled Image Task Queue

Scheduled Visual 작업의 동시성 Source of Truth는 Content 단위 `18_content_pipeline`의 `image_manifest`만으로 관리하지 않는다.

- `21_content_pipeline_image`: Image 1건의 현재 Queue/Claim/단계 상태
- `23_content_pipeline_image_run`: 각 Image 처리 시도의 이력
- `content_pipeline_sync_images_v1`: Writer의 `image_briefs`(구형 Artifact는 `image_manifest`)를 활성 Image Task로 동기화하며 제외된 기존 Task는 `CANCELLED`로 이력과 함께 보존
- `content_pipeline_claim_image_v1`: 처리 가능한 Image 1건을 원자적으로 Claim한다. `PROCESSING` Claim은 20분 TTL이며 만료된 Claim은 다시 회수할 수 있다.
- `content_pipeline_complete_image_v1`: Generation, Image QA, WebP, Upload, Storage Verify와 Final Render Gate(`Storage SHA → HTTP 200 → image/webp MIME → RIFF/WEBP signature → actual decode`)가 모두 통과한 Image만 `DONE` 처리한다. HTTP 200/MIME만으로는 완료하지 않으며 Production `content-pipeline-image-verify`의 `decode=PASS`와 width/height를 Image Run metadata에 기록한다.
- `content_pipeline_fail_image_v1`: 실패 단계를 Image 단위로 `RETRY/HOLD/BLOCKED`에 기록하고 Content 전체를 불필요하게 HOLD하지 않는다.
- 각 Producer는 실행당 Image Task 최대 1건을 Claim한다. Complete/Fail RPC로 Claim을 닫으면 성공·실패와 관계없이 종료하며 두 번째 Image를 Claim하지 않는다.
- `SOURCE_BINARY_LOST`처럼 재생성 가능한 실행환경 문제는 `RETRY + REGENERATE`로 기록한다.
- Content의 `IMAGE_READY` 전환은 해당 Pipeline의 Image Task가 1개 이상 존재하고 모두 `DONE`일 때만 허용한다.
- `required_image_count`는 `CANCELLED`를 제외한 활성 Image Task 수, `ready_image_count`는 `DONE` Task 수로 계산한다. Writer가 재작성하여 제외한 Task는 실패 이력을 유지하고 `CANCELLED`로 보존한다.
- Final QA Worker는 `IMAGE_READY` Content만 처리하며 미완료 Visual Content를 HOLD시키지 않는다.


## Scheduled Worker Timing and RPC Contract

예약 기반 Content Factory의 표준 실행 시각은 KST 기준 매시간 `:00 → :10 → :20 → :35 → :50`이다. 시각은 처리 순서를 보조하지만 Worker는 다른 Worker를 기다리지 않고 자신의 Ready Queue만 소비한다.

| Worker | Time | Claim / Completion responsibility |
| --- | --- | --- |
| Planning + Research | :00 | `content_pipeline_claim_planning_v1` → Planning complete → 동일 `pipeline_id`를 `content_pipeline_claim_stage_by_id_v1(..., 'PLANNED', 'RESEARCHING')`로 Research claim → Research complete/fail |
| Writer + Visual Plan | :10 | `content_pipeline_claim_stage_v1('RESEARCHED','WRITING')` → Writer Artifact complete → `content_pipeline_sync_images_v1`로 Image Task 동기화 |
| Image Producer 1 | :20 | `content_pipeline_claim_image_v1('image-producer-1')` → 이미지 단위 complete/fail, 회당 최대 1개 처리 |
| Image Producer 2 | :35 | `content_pipeline_claim_image_v1('image-producer-2')` → 이미지 단위 complete/fail, 회당 최대 1개 처리 |
| Final QA + Assembly | :50 | `content_pipeline_claim_stage_v1('IMAGE_READY','QA')` → Assembly/QA → QA_PASS complete/fail |

Planning과 Research를 한 예약에서 연속 수행할 때 범용 Stage Claim으로 다른 `PLANNED` Item을 가져오지 않는다. 방금 Planning한 동일 Pipeline을 이어받기 위해 ID-scoped Claim RPC를 사용한다.

Writer의 완료 책임은 `WRITING → DRAFTED` 저장으로 끝나지 않는다. Writer Artifact의 `image_briefs`를 `21_content_pipeline_image`로 동기화하고, 동기화된 Task 수가 `required_image_count`와 일치하는지 확인해야 한다. Image Queue의 실행 상태 Source of Truth는 `21_content_pipeline_image`, 시도 이력은 `23_content_pipeline_image_run`이다.

Image Producer만 이미지 생성/확보, Image QA, WebP, Upload, Storage Verify를 수행한다. Final QA는 Upload Ticket 발급, 이미지 생성·재생성, Upload Retry를 수행하지 않는다. 외부 실사는 권리 상태를 새로 기록하지 않으며, 출처가 정확히 기록되고 Image QA·WebP·Storage Verify가 PASS이면 Image Task를 DONE으로 완료할 수 있다. 모든 Image Task가 DONE이면 Image Complete RPC가 Content를 `IMAGE_READY`로 전환하며, Final QA는 그 상태만 Claim한다.

Final QA는 `IMAGE_READY → QA → QA_PASS`까지만 담당한다. QA_PASS는 Publish 완료가 아니며 실제 Publish는 별도 Publish Queue의 책임이다. Final QA/Publish는 출처와 이미지 품질·무결성을 검증하며 라이선스/권리 상태를 기록하거나 Gate로 사용하지 않는다.


### Image Generation Contract

Image Producer는 Claim 시 반환되는 `generationContract`를 해당 Image Task의 유일한 생성/확보 입력으로 사용한다. Claim RPC는 broad Writer/Research Artifact 대신 정규화된 Contract와 SHA-256 `generationContractHash`를 반환하고 Run metadata에 동일 계약을 보존한다.

- Contract는 pipeline/content/image/asset 식별자, subject, visual objective, source strategy, generation allowed, must show/not show, fact/safety dependency, text/mobile 요구를 포함한다.
- 이전 Content, 이전 Image, 이전 생성 결과 또는 대화 컨텍스트의 Visual Prompt를 현재 작업에 상속하지 않는다.
- `generation_allowed=false`는 레거시 계약에서 Full Generation을 금지한다. 실제 구조를 보존하는 AI Editing 허용 여부는 `ai_edit_allowed`로 별도 판단한다.
- Contract와 다른 주제의 결과는 `BRIEF_MISMATCH`이며 업로드하지 않는다.
- Queue는 PENDING을 RETRY보다 우선할 수 있다. 반복 `BRIEF_MISMATCH` 2회 이상은 해당 Image에 60분 cooldown을 적용해 다른 Image Task가 진행될 수 있게 한다.
- `next_eligible_at` 이전 Task는 Claim 대상이 아니다.
- Producer 출력에는 Contract hash 일부를 포함해 어떤 입력 계약으로 처리했는지 추적할 수 있게 한다.
- 예약의 Image Generation 호출은 현재 Image Contract의 단일 콘텐츠 장면만 입력한다. 실행 결과 표, Worker 보고서, QA 대시보드, 이전 대화 이미지 등은 생성 입력이나 Production Asset이 아니다. 보고는 이미지 생성 완료 후 텍스트로만 작성한다.
- 생성 도구 결과를 설명하는 메시지와 실제 픽셀 파일을 구분한다. 원본 바이너리에 접근해 육안 QA, WebP 변환, SHA-256 계산, Upload 응답 및 Storage 객체 확인까지 끝내지 못하면 Image Complete를 호출하지 않는다. 파일 접근 불가 시 Claim을 Fail RPC로 닫고 `SOURCE_BINARY_UNAVAILABLE`을 기록한다.
- DB의 Image DONE 전환은 canonical `content-assets/contents/<content-key>/<asset-key>.webp` Storage 객체, WebP 메타데이터, 4MB 제한, 현재 Claim에 결합된 소비된 Upload Ticket이 있을 때만 허용한다. Worker의 PASS 문장만으로는 완료 상태를 증명하지 않는다.



## Visual Claim Ordering — Mandatory

3단계 Visual Image Producer의 실행 순서는 **Topic Queue 우선순위 → 하나의 Topic 고정 → Image ordinal 순차 처리 → Topic Image Complete → 다음 Topic**으로 고정한다.

- Topic 선택은 `16_content_topic.priority ASC → content_topic_id ASC → pipeline_id ASC`를 따른다.
- 선택된 최우선 미완료 Topic에 DONE이 아닌 Image가 하나라도 있으면 다른 Topic Image를 Claim하지 않는다.
- 같은 Topic 안에서는 `ordinal ASC`를 따른다. 앞 ordinal이 DONE이 아니면 뒤 ordinal을 먼저 Claim하지 않는다. 3-A에서는 앞 ordinal의 READY_FOR_UPLOAD를 제작 완료 경계로 인정하여 같은 Topic의 다음 Image를 제작할 수 있다. 3-B 등록과 콘텐츠 IMAGE_READY 판정은 여전히 DONE 기준이다.
- 앞 Image가 `RETRY`이고 `next_eligible_at`을 기다리는 중이어도 다음 Topic으로 넘어가지 않는다. 해당 실행은 Claim 없이 종료하고 다음 실행에서 같은 Topic을 다시 확인한다.
- 앞 Image가 유효한 `PROCESSING` Claim을 보유하고 있어도 다른 Topic으로 넘어가지 않는다.
- Claim 만료 시 같은 Image를 reclaim하고, 그 Image가 DONE된 뒤에만 다음 ordinal로 이동한다.
- Topic의 Required Image가 모두 DONE되어 Pipeline이 `IMAGE_READY`가 된 후에만 다음 Topic Queue로 이동한다.
- 따라서 여러 예약 Worker가 동시에 실행되더라도 서로 다른 Topic을 병렬 제작하는 것을 기본 동작으로 사용하지 않는다.

이 규칙은 프롬프트 권고가 아니라 `content_pipeline_claim_image_v1`에서 DB 레벨로 강제한다.

## Scheduled Visual Source Strategy

Writer는 Image Brief를 만들 때 **실제 외형 자체가 사용자 답의 Fact인지** 먼저 판단한다.

- 고객이 실제 바이크에서 찾아야 하는 위치, 실제 부품 형상, UI, 포트, 라벨, 각인, 배선, 마모/손상, 체결·장착 상태처럼 실제 외형 자체가 확인 정보이면 `REAL_ASSET_FIRST` / `generation_allowed=false`를 사용한다.
- 특정 모델·제품의 정확한 구조가 확인 정보는 아니지만 실제 바이크를 다루는 고객에게 점검 위치·대상·행동·관계를 보여줄 필요가 있으면 `GENERATED_GUIDANCE_VISUAL` / `generation_allowed=true`를 사용할 수 있다. 생성 결과도 실제 바이크 점검 맥락이어야 하며 추상 교육자료·대시보드·카드·보고서·장식 이미지로 만들지 않는다.
- 실제 외형 증거가 사용자 답에 필요할 때 Real Asset을 사용한다. 권리 검사를 제작 선택 조건으로 사용하지 않는다.
- 적합한 Real Asset은 출처·원본 URL·운영자/저작자·확인 시점·편집 이력을 기록하고 Image QA → WebP → Storage Verify까지 진행한다. 3-A/3-B 완료 경계를 유지한다.
- `NO_APPROVED_REAL_SOURCE`처럼 “승인된 권리 자산이 아직 없다”는 이유만으로 Visual Claim을 RETRY/HOLD/BLOCKED하지 않는다. Visual 실패는 Brief 충돌, 적합한 원본 부재, 바이너리 확보 실패, Image QA, WebP, Upload 또는 Storage Verify 실패처럼 제작 자체의 실패에 사용한다.
- Publish Queue는 출처 이력을 보존하며 권리 상태를 요구하거나 기록하지 않는다.
- Writer는 Source 후보를 찾기 전에 `고객이 실제 바이크에서 무엇을 확인해야 하는가`를 먼저 정의한다. 실제 외형·위치·상태가 확인 대상이면 Real Asset, 특정 구조가 Fact가 아니고 일반 점검 맥락을 안내하는 것이 목적이면 Generated Guidance를 검토한다. 실제 물체가 등장한다는 이유만으로 Real Asset을 선택하지 않는다.
- `must_show` 전체가 한 장의 이미지에서 동시에 관찰 가능한지 One Image Feasibility Check를 수행한다. 차량 전체+작은 부품 근접+내부 배선+키 상태처럼 서로 다른 시야 수준을 한 장에 강제하면 Brief를 축소하거나 분리한다.
- 실제 외형이 Fact가 아닌데 `generation_allowed=false`인 Brief는 Writer Self QA 실패다.
- Generated Guidance 기본 계약은 `1 Scene + 1 User Question + 1 Check Point/Relationship + No Text`다.
- Image Producer의 생성 요청 주변에는 다른 콘텐츠의 구체적인 Visual 예시를 넣지 않는다. 생성 도구가 대화 문맥을 참고할 수 있으므로 현재 `generationContract`의 subject/scene/objective/must-show/not-show만 생성 의도로 사용한다.
- Real Asset은 Production `content-pipeline-source-ingest` Edge Function을 사용한다. 현재 PROCESSING Image Claim에 결합된 `content_pipeline_issue_source_ingest_ticket_v1` 1회용 Ticket으로 외부 HTTP(S) 원본을 서버에서 확보하고, MIME/용량 검증 → ImageMagick WASM decode → 최대 2000px 리사이즈 → WebP → SHA-256 → `content-assets/contents/<content-key>/<asset-key>.webp` 업로드 → Storage 재검증까지 수행한다. Ticket은 15분 만료·1회 소비이며 장기 secret을 Worker에 노출하지 않는다. 적합한 후보 하나의 ingest가 실패하면 같은 URL을 반복하지 말고 다음 독립 후보를 시도한다. 모든 독립 후보가 실패한 경우에만 `SOURCE_BINARY_UNAVAILABLE + REACQUIRE_SOURCE`로 RETRY한다.


### Semantic Visual QA — Mandatory

Technical file validation is necessary but not sufficient. Before an Image Task can become DONE, the worker must inspect the **actual final rendered image itself**, not only the source page text, filename, alt text, metadata, HTTP response, or generation prompt.

PASS requires all of the following:

1. **Actual Render Inspection** — inspect the final Production asset pixels after conversion/upload.
2. **Visual Objective Match** — the visible scene directly supports `visual_objective`.
3. **Must-show Evidence** — every `must_show` item is visibly identifiable in the image at the required mobile viewing size.
4. **Must-not-show Absence** — no `must_not_show` item is visibly present.
5. **User Question Test** — when shown without surrounding article text, the image must materially help answer `user_question_supported`. A merely related motorcycle/product/lifestyle photo is FAIL.
6. **Information Density Test** — decorative scenery, brand splash/boot screens, generic parked-bike photos, or product beauty shots are FAIL when they do not expose the actual check point, state, location, relationship, or action the reader needs.
7. **Source Asset Verification** — for REAL_ASSET_FIRST, verify the exact selected asset/frame. A relevant official source page does not make every image on that page relevant.
8. **Mobile Test** — the intended check point must remain recognizable at approximately 390px viewport width.

If Semantic Visual QA fails:
- do not upload when failure is visible before upload;
- if already uploaded, do not mark DONE;
- if already DONE, reopen the Image Task for rework;
- record the semantic mismatch reason;
- do not weaken the Brief merely to make the existing asset pass.

The final gate is therefore:

`Semantic Render QA → Storage SHA → HTTP 200 → MIME → WebP Signature → Decode/Render → expected SHA → DONE`

The worker must never infer Semantic PASS solely from source metadata or technical verifier output.


## Generated Image Upload Transport — Mandatory

Generated Production Asset 업로드는 Worker의 직접 HTTP/DNS 접근성에 의존하지 않는다.

정식 경로는 다음 하나다.

`Final WebP → content_pipeline_begin_generated_asset_handoff_v1 → append_generated_asset_chunk_v1 → content_pipeline_dispatch_generated_asset_upload_v1 → DB pg_net → content-pipeline-asset-upload Edge → Storage SHA verify → finalize_dispatched_upload_v1 → DONE`

- Worker가 Supabase Edge Function URL에 직접 POST하는 방식은 정상 경로가 아니며 fallback으로 반복하지 않는다.
- Worker outbound DNS/HTTP 실패는 이미지 재생성 사유가 아니다. Final WebP와 SHA를 유지하고 Upload 단계부터 재개한다.
- Claim과 generated handoff의 기본 lease는 60분으로 운영한다. 긴 Visual QA/변환 때문에 20분 lease가 만료되어 정상 Asset을 재생성하는 문제를 방지한다.
- Upload 단계에서 실패하면 동일 Final WebP/SHA를 재사용하며 Source/Generation 단계로 회귀하지 않는다.
- dispatch 후에는 `upload_request_id`를 기준으로 서버 응답을 finalize하고, Edge가 반환한 Storage SHA가 Final WebP SHA와 일치해야 DONE 처리한다.


## 3-A / 3-B Persistent Visual Handoff (2026-09-30)

일반 Chat·예약 Chat을 콘텐츠 실행 환경으로 허용한다. Work는 코드/DB/배포 개발 및 복구에 사용한다. Chat이라고 도구나 파일 전달 기능이 자동으로 제공되지는 않는다. 실행 전 실제 연결된 GitHub/Supabase 도구, 이미지 픽셀 접근, WebP 변환/SHA 계산, **그 파일 binary를 RPC에 전달하는 기능**을 확인한다. 공개 링크, sandbox 파일명, 이미지 생성 완료 메시지, 문서상 지원만으로 binary transport PASS를 추정하지 않는다. 지원되지 않으면 Claim 전에 `CHAT_ASSET_BRIDGE_UNAVAILABLE`로 차단하고 이미지를 생성하지 않는다. 예약은 일반 Chat의 실제 E2E 검증 후에 등록한다.

| 담당 | 시작 RPC | 정상 종료 | 실패 복구 |
| --- | --- | --- | --- |
| 3-A Visual Image Producer | `content_pipeline_claim_visual_producer_v1(worker_key, optional_image_id)` | READY_FOR_UPLOAD | preservedStagingInput의 handoffId/qa를 재사용하여 Staging부터 재개 |
| 3-B Asset Publisher | `content_pipeline_claim_asset_publisher_v1(worker_key, optional_image_id)` | DONE | 동일 Private Staging Asset에서 Upload/Verify만 재개 |

Image Task status에는 READY_FOR_UPLOAD를 추가한다. PRODUCING/STAGING/UPLOADING/VERIFYING/RETURN_TO_IMAGE_PRODUCTION은 `handoff_phase`이며 별도의 Content stage나 중복 status enum이 아니다. 기존 PROCESSING/RETRY/HOLD/DONE/CANCELLED를 유지한다. Content는 두 단계 동안 VISUAL이며 전체 활성 Image DONE + 대표 이미지 역할 coverage를 만족할 때만 IMAGE_READY다.

3-A의 종료 체인: Claim → 현재 Contract → Source/Editing → 실제 Final 픽셀·390px·SEO QA → Final WebP → SHA → generated handoff begin/append/verify → `content_pipeline_dispatch_staging_v1` → 서버 Private Storage upload/read-back/decode → `content_pipeline_record_staging_v1` → READY_FOR_UPLOAD 재조회. 기존 atomic stage-and-dispatch-generated RPC는 **Production 단일 단계용 legacy 경로**이며 3-A에 사용하지 않는다.

3-B의 종료 체인: Claim → persisted staging metadata → `content_pipeline_dispatch_asset_publisher_v1` → 서버 Staging download/SHA/decode → content-assets upload/read-back → 공개 원본 URL HTTP/MIME/signature/decode/SHA → 기존 Complete RPC → DONE 재조회. 서버는 binary를 편집·재인코딩하지 않는다. 실제 콘텐츠 Publish/SSR SEO QA는 4단계다. Next.js image optimizer 응답은 변환될 수 있어 원본 binary SHA 비교 대상으로 사용하지 않는다.

`staging_asset`에는 bucket/path/SHA/bytes/mime/dimensions/contractHash와 QA·provenance·ALT·Caption·annotation/editing 여부를 저장한다. 3-A QA 입력은 imageQa/mobileQa/imageSeoQa/contractHash가 필수이며 대표 이미지에는 representativeImageQa 및 역할에 맞는 cardCropQa/heroCropQa가 필수다. PASS 값은 실제 픽셀 확인 결과만 입력한다. 서버의 WebP decoder는 의미·경고 위치·모바일 텍스트를 판정하지 않는다.

Claim token/lease는 단계별로 분리하고 60분 유지한다. Staging 실패 시 chunks를 지우지 않는다. `staging_input`으로 canonical handoff와 QA를 보존하고 다음 3-A Claim에서 동일 Contract hash에 한해 새 lease에 인계한다. 이미 READY_FOR_UPLOAD인 이미지는 3-A가 Claim하지 않는다. 3-A Claim은 검증 가능한 동일 Contract Staged Job → 미소비 생성 handoff → RETRY/만료 PROCESSING → PENDING 순으로 복구를 우선한다. 각 그룹 안에서는 Topic priority와 image ordinal 순서를 유지한다. HOLD/cooldown/유효 Claim/명시적 대상 ID는 우회하지 않는다.

업로드 후 완료 DB 트랜잭션 이전 실패는 새 자산 생성 사유가 아니다. 동일 immutable object를 검증하여 재사용한다. Source/이미지 내용 오류는 publisher가 `content_pipeline_return_image_production_v1`로 반환하고 staging identity를 Run 이력에 보존한다. 상태 문자열만 직접 UPDATE하여 Gate를 우회하지 않는다.

상태 조회: `content_pipeline_image_handoff_status_v1(optional_pipeline_id)`와 `/admin`의 이미지 제작·등록 현황. 조회 RPC는 service_role 전용이고 Admin API는 기존 관리자 인증 경계를 사용한다. 상태와 public Production 자산만 운영 화면에 표시하며 Private signed URL/token은 표시하지 않는다.

서버 전송 테스트 PASS는 일반 Chat 이미지 생성→원본 접근→WebP→Staging 성공을 증명하지 않는다. 두 결과를 분리 보고한다. 일반 Chat 시험에서는 첫 대상으로 지정한 1건의 실제 콘텐츠 이미지로 3-A와 별도 Chat의 3-B를 각각 확인한다. 내부 fixture는 게시하지 않는다.

### URL/PDF server-to-staging capability (2026-09-30)

Native Chat generated-file binary access and server URL/PDF ingestion are independent capabilities. Do not block all real-source tasks merely because native imagegen export is unavailable. Before Claim, determine whether the required method is supported: approved URL/PDF + deterministic crop/circle/arrow can use `content_pipeline_dispatch_source_stage_v1`; native AI Edit/Full Generation still requires a verified generated-file bridge through the official file-input handoff described below. Server editorial edits are `REAL_SOURCE_EDITORIAL_EDIT` / `OFFICIAL_PDF`, not evidence of AI Edit capability.

A capability probe calls this RPC with both image ID and claim token NULL. It creates only a source-stage job and a private `probes/<jobId>/<sha>.webp`; it never claims/changes a content image, creates a production asset, or makes READY_FOR_UPLOAD. Job STAGED means technical verification only; image/mobile/SEO QA remain PENDING. Use an internal fixture for coordinates, not a real task's unverified inspection arrows.

For a real 3-A Claim, the same RPC takes the current image ID/token and stores a candidate at its canonical staging path. Open the returned signed preview (one-hour expiry), inspect actual pixels at 390px, and verify must_show/structural accuracy/provenance/ALT before `content_pipeline_approve_source_stage_v1`. Approval requires the expected SHA, current PRODUCING Claim, matching Contract, explicit Image/Mobile/SEO PASS, required representative crop gates, no existing canonical staging, and a single-use approval receipt. Only approval makes READY_FOR_UPLOAD. Same-contract candidates can be reused by a fresh PRODUCING Claim after failure; never substitute a probe or regenerate solely for upload retry. Detailed spec/coordinates and public HTTPS safety checks are in API.md and the Edge implementation. There is no source-domain allowlist. Record source provenance only; license/rights/permission fields are not production inputs or approval gates. Label/Zoom Inset/AI Edit/Full Generation are not supported by this deterministic transport.


### Ordinary Chat dedicated 3-A transport

Use the authenticated tools in API.md once OAuth/operator configuration and Chat connection are verified. Do not claim this path is active merely because the Edge/RPC exists. For one execution, generate one requestId and retain it across retries. Read get_visual_claim_result after a lost response. A new request must resume an active same-user claim; do not claim a second task while PRODUCING/STAGING. Closed/expired receipts cannot authorize editing. Legacy active claims owned by a different Worker Key are not transferred by this tool. Platform denial is logged as TOOL_PRE_EXECUTION, never bypassed through SQL fallback.

After the connection is available, use dispatch_visual_source with one operationId per source/edit intent, get_visual_dispatch_result for lost-response recovery, get_visual_source_status for job state, inspect_visual_source for full-resolution lossless PNG decoded from the SHA-verified canonical WebP +390px PNG ImageContent, and approve_visual_source for READY_FOR_UPLOAD. Do not approve if ImageContent did not render or its pixels were not actually inspected. Technical inspection PASS is not image/mobile/SEO PASS. fail_visual_image re-reads closure. Source dispatch does not perform AI Editing or Full Generation; native ChatGPT output uses the separate file-input adapter below. Neither path replaces 3-B. A deployment without completed OAuth/operator configuration and Chat tool discovery is NOT_READY_FOR_CHAT.


### 3-A Source reuse preflight

Before editing a source in ordinary Chat, use the dedicated MCP `check_visual_source_usage` according to `docs/02_framework/API.md` (Authenticated 3-A MCP operations). Keep one Image Task claimed while switching unsuitable/404/duplicate sources; a failed candidate alone is not a task termination condition. Preserve candidate job/source/failure evidence and resume the last successful stage. Never bypass final source/SHA uniqueness guards.


### Source Stage async execution and failure diagnosis

Dispatch is not completion: poll the same Job using the returned pollAfterSeconds until STAGED or a confirmed terminal failure. Invoke pixel inspection only after STAGED. timedOut=true is an elapsed-time warning; use actual failureCode/transport evidence instead of inventing STALLED/TIMEOUT. Runtime546 resource failures are reconciled by the service status API documented in API.md. RETRY eligibility uses nextEligibleAt (ordinary failure cooldown5 minutes); Claim SKIP during cooldown is not a recovery defect. Never end normally at RUNNING, duplicate dispatch, infer QA PASS from a checkpoint, or change Task state directly to skip cooldown.

## Native ChatGPT Reference generation and file handoff (2026-10-02)

운영 기준은 **일반 ChatGPT 채팅 + 내장 이미지 생성/편집**이다. 외부 OpenAI API 호출과 API Key 설정을 사용하지 않는다. 서버는 생성 모델을 실행하지 않고 이미 생성된 파일의 접수·변환·보존만 담당한다. 이전 서버 Provider 경로는 제거했다. `get_visual_generation_capabilities`의 `referenceBasedGeneration=false`, `realSourceAiEdit=false`, `providerConfigured=false`는 서버 모델 호출이 없다는 뜻이며 내장 생성 차단 조건이 아니다. 내장 도구의 실제 가용성과 `nativeFileHandoff`/공식 fileParams 또는 업로드 UI 가용성을 별도로 확인한다. 파일 인계 경로를 확인하지 못하면 Claim 전에 BLOCKED로 보고하고 Source/DB RETRY/HOLD로 기록하지 않는다. 도구 자체가 없으면 `MCP_TOOL_UNAVAILABLE`이다.

- `get_visual_image_task(pipelineImageId)`로 지정한 1건의 상태·Contract를 Claim 전에 조회한다. Contract hash를 임의로 바꾸지 않는다. 준비 후 `claim_visual_image`는 지정 이미지 1건만 Claim한다.
- `REFERENCE_BASED_GENERATION`: `generation_allowed=true`, `real_source_required=false`, 그리고 `source_strategy=REFERENCE_FIRST_GENERATIVE` 또는 `reference_based_generation_allowed=true`인 경우 허용한다. 이때 `full_generation_allowed=false`도 검증된 Reference 생성은 허용한다. 무근거 Full Generation은 금지한다.
- `REAL_SOURCE_AI_EDIT`: `ai_edit_allowed=true`이고 실제 원본 binary를 내장 편집 입력으로 사용한 경우만 허용한다. 접수 시 `inputFile`과 Reference에 일치하는 `inputAssetUrl`이 필요하고 서버가 두 원본의 SHA 일치를 검증한다. 서버는 편집 자체를 수행하거나 실행 증거를 추정하지 않는다. 내장 편집에 원본을 사용했다는 사실은 작업자의 증거로 별도 기록한다.
- Reference는 실제 픽셀과 사실을 확인한 `sourcePageUrl`, `sourceOwner`, `verifiedFacts[]`, `pixelsInspected=true`, `checkedAt`을 포함한다. 확인한 경우만 `sourceAssetUrl`을 기록한다. 신규 생성은 검증 사실을 내장 생성 prompt에 반영하며 원본 binary를 입력했다고 보고하지 않는다.
- 내장 생성 결과의 자동 MCP 전달은 별도 일반 채팅 시험 전까지 `UNVERIFIED`다. 공식 `_meta["openai/fileParams"]`의 top-level `file`로 실제 PNG/JPEG/WebP를 전달한다. `dispatch_visual_generation`은 파일 접수 도구이며 모델을 호출하지 않는다. 사용자가 SHA나 public URL을 만들 필요가 없다.
- 자동 전달이 불가능하면 `open_visual_file_upload(requestId,operationId,spec)` 화면에서 생성 이미지를 선택하거나 다운로드 파일을 업로드한다. optional host 파일 기능이 없으면 이미지를 채팅에 첨부하여 공식 fileParams로 전달한다. 두 경로 모두 실제 파일 접수가 불가능하면 `NATIVE_FILE_HANDOFF_UNAVAILABLE`로 보고한다. 업로드 화면을 열었다는 사실만으로 파일 접수 PASS를 기록하지 않는다.
- 수동 대기 중 Claim이 만료되면 동일 이미지의 정상 reclaim 경로를 사용한다. 오래된 화면/receipt는 다른 이미지에 파일을 전달할 수 없다. Claim 유효기간을 임의 연장하거나 SQL로 Gate를 우회하지 않는다.
- 서버는 HTTPS/DNS/IP/redirect/MIME/signature/8MiB/8MP 제한과 실제 decode를 검증하고 WebP 변환·SHA 계산·private Staging 저장·read-back을 수행한다. 임시 파일 다운로드 URL은 모델 결과에 노출하지 않으며 완료/실패 시 Job spec에서 제거한다. fileId는 입력 identity로 보존한다.
- PNG/JPEG 입력은 먼저 정규화한 WebP로 보존한다. `generatedInput`은 서버에서 read-back 검증한 보존본이며 원본 PNG/JPEG binary 그 자체가 아니다. 같은 이미지·Contract·Worker·제작 방식·원 prompt·references·원본 URL로만 `resumeJobId`를 사용할 수 있고 Transform만 수정 가능하다. 새 AI 수정은 별도 후보다. 첫 영속 저장 실패 시 재사용을 보장하지 않는다.
- `requestId`/`operationId`를 응답 유실 후 재사용하고 먼저 `get_visual_dispatch_result`를 조회한다. 갱신된 임시 다운로드 URL만 달라진 동일 fileId/spec은 동일 작업으로 복구한다. 작업 발생 여부를 확인하기 전 새 operation으로 Dispatch하지 않는다.
- 기존 Job `PENDING → RUNNING → STAGED/FAILED` 후 `inspect_visual_source`로 canonical WebP·390px 픽셀을 확인하고 모바일·SEO QA를 완료한다. 명시적 증거와 expected SHA를 `approve_visual_source`에 전달한다. `READY_FOR_UPLOAD`와 Claim 해제 재조회만 3-A 완료다. 서버/fixture 테스트나 Work 실행은 일반 채팅 end-to-end PASS의 대체물이 아니다.
- 3-B Production 업로드·DONE과 4단계 Final QA/Publish는 별도로 유지한다. 생성 입력 보호와 Daily Staging Maintenance도 유지한다.

### 3-A execution ownership and staged inspection recovery

- One execution intent owns one `requestId`. Lost-response recovery replays that same ID.
  A different ID cannot automatically borrow an active Claim, even for the same account/Worker;
  `BUSY` means wait for the owner, not close it or copy its request ID. Closed and expired receipts
  cannot authorize mutations. Failure and approval recheck ownership atomically on the server.
- Before selecting a new Source, read `recoverableStaging` from the Task/Claim result. A same-contract
  STAGED Job with existing private storage resumes from Inspection. The Job is the durable candidate
  receipt; `staging_asset` remains reserved for QA-approved 3-B input. A non-null `stagingSha` therefore
  does not by itself mean QA passed; check `stagingApproved` and the Task status.
- Inspection returns image content and a fresh, short-lived `inspectionAccess.canonicalDownloadUrl`.
  If the host omits image content, download that exact file, verify `expectedSha` and byte count, inspect
  actual pixels, and derive the 390px mobile view from those same bytes. A signed URL is temporary
  transport, not persistent asset identity. Requery the same Job to renew it; do not regenerate solely
  because image content or a URL expired.
- RETRY records include recoverable Job/SHA/path/Contract metadata and the next stage. Storage cleanup
  continues to protect candidates referenced by unfinished Tasks. Technical decode/SHA checks do not
  replace semantic, mobile, SEO or role crop QA. A previously approved candidate returned for production
  correction is not advertised for reapproval unless it remains the Task's current approved asset.

### 3-A pixel and native generation reliability (2026-10-04)

- Inspection returns full-resolution lossless PNG and a 390px PNG by default, with original WebP SHA and content indices. Forward both image blocks to the model (`functions.exec`: `image(block)`). The display PNG has different bytes; compare storage identity against original WebP, not PNG. Metadata-only delivery is not QA PASS. Preserve job/SHA and resume Inspection rather than regenerate.
- Task/Claim status supplies `nativeGenerationContext` derived solely from the current immutable Contract. Use this prompt, attach only explicitly verified current-task references, and omit `num_last_images_to_include` for a new image. This is a task-scoped packet, not a guarantee of host session isolation. The server cannot call native generation or automated Vision QA.
- The native runtime must inspect required/forbidden Contract items after every generation. On content mismatch, correct the current-task prompt and regenerate up to three attempts under the same Claim; recheck ownership/expiry before each attempt and handoff. Never submit a rejected image or fake QA receipts. Only exhausted attempts or a verified technical blocker justify RETRY.
- Writer feasibility rejects identical normalized must_show/must_not_show items and contradictory production flags. If production_flexibility.exact_source_required=true, production_feasibility must contain source_evidence_url (HTTPS) and source_evidence_verified=true, recorded only after actual inspection. These fields are a evidence declaration, not automatic source availability or semantic verification. The existing WRITING→DRAFTED gate invokes the validator before saving.

### Inspection response integrity (2026-10-04)

Before serializing inspect_visual_source, validate the actual content array against canonical/mobile indices, PNG MIME/signature and original SHA. Missing blocks return isError + INSPECTION_IMAGE_BLOCK_MISSING with technicalVerification=FAIL, pixelDeliveryQa=FAIL and semantic/mobile BLOCKED, preserving same Job/SHA/inspectionAccess. technicalQa separately describes canonical decode. pixelDeliveryQa=PASS is scoped to SERVER_MCP_RESPONSE; clientPixelDelivery remains UNVERIFIED_REQUIRES_RENDERING. The server cannot detect downstream host stripping image blocks, so clients must count and forward actual image blocks before QA. Signed canonical download remains a verified-SHA client recovery path. If internal storage read fails, the server attempts its own same-origin signed canonical URL then one internal read retry, with bounded size and timeout; never reselect a source or regenerate for delivery failures. Native Vision remains a client/runtime responsibility.

### Semantic invalidation and pre-Staging visual gate (2026-10-04)

Technical inability to view pixels preserves the candidate for Inspection. Actual semantic FAIL uses reject_visual_source(requestId,jobId,expectedSha,reason,evidence): retain binary/history, exclude same Task/Contract/SHA from recovery and approval, keep the owned Claim active and select a replacement source. SOURCE_MISMATCH additionally fences the rejected source binary for that Task/Contract. Do not infer semantic FAIL from unavailable pixels.

A newly dispatched candidate without registered pre-Staging QA is automatically an unannotated preflight preview; it cannot be approved and is excluded from recoverable production Staging. Explicit spec.preflightOnly=true is also available after schema discovery. Inspect its actual canonical/390px images, then call record_visual_source_qa with current task/Contract/sourceJobId and inspection.sourceSha256, pixelsInspected=true,status=PASS,evidence, exact Contract-keyed mustShowChecks/mustNotShowChecks, and inspectionTargetVerified/annotationTargetChecks. The dedicated preStagingSourceSha256 identifies actual gate input bytes (normalized native output or unlabelled composition), separately from original/reference provenance SHA. Server checks bindings/attestation, not automatic Vision. All required/forbidden targets and requested annotation targets must be actually verified.

After recording candidate QA, dispatch the same source using a NEW operationId (native generation uses preserved resumeJobId). The worker checks downloaded bytes against the bound QA before annotations and keeps final canonical/Mobile/SEO/crop QA mandatory. Composition first renders without labels for the gate, then pins every panel SHA when rendering labels to reject changed source bytes.

Connector tool discovery must expose record_visual_source_qa and reject_visual_source before this production protocol is used. Cached approve_visual_source requires final PASS fields and must not be repurposed with fake PASS values for preliminary QA. Refresh tool discovery; server preflight protections remain active while discovery is stale. A preflight STAGED receipt is not Production READY_FOR_UPLOAD.
