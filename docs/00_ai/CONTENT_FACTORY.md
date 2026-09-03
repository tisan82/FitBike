# FitBike Content Factory AI Policy

**Version:** v1.0  
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

## 5. Writing Standard

콘텐츠는 검색 유입용 분량 채우기가 아니라 사용자의 질문 해결을 목적으로 한다.

- 첫 화면에서 사용자가 무엇을 알게 될지 분명해야 한다.
- 핵심 답을 불필요하게 뒤로 미루지 않는다.
- 설명 → 판단 기준 → 실제 확인 → 다음 행동의 흐름을 우선한다.
- 같은 의미를 다른 표현으로 반복해 길이를 늘리지 않는다.
- 실제 작업 콘텐츠는 위치, 접근, 작업, 완료 확인, 중단 조건을 구분한다.
- 전문 용어는 필요한 경우 사용하되 초보자가 행동할 수 있도록 설명한다.
- 추천, 랭킹, 과도한 구매 유도는 만들지 않는다.
- 이미지가 더 정확하게 전달하는 정보는 긴 문장으로 중복 설명하지 않는다.

## 6. Visuals Are Information

FitBike 콘텐츠에서 이미지는 장식물이 아니라 독립적인 정보 블록이다.

이미지는 최소 수량이나 최대 수량을 기준으로 계획하지 않는다. 서로 다른 사용자 질문을 해결한다면 한 콘텐츠에 다양한 이미지를 충분히 사용할 수 있다. 반대로 같은 정보를 반복하는 이미지는 수량을 채우기 위해 추가하지 않는다.

Visual Planner는 본문 작성과 별개로 다음 질문을 판단한다.

- 사용자가 실제로 무엇을 봐야 이해할 수 있는가?
- 실제 사진이 필요한가, 편집 이미지가 필요한가, 교육용 생성 이미지가 필요한가?
- 위치, 접근, 정상/이상, 측정, 작업, 완료 상태 중 무엇을 보여줘야 하는가?
- 모바일 390px 수준에서도 핵심을 식별할 수 있는가?

### Visual Roles

- `HERO`: 콘텐츠 주제와 실제 맥락을 즉시 이해
- `LOCATION`: 바이크 전체에서 부품/점검 위치 확인
- `ACCESS`: 시트, 커버, 외장 등을 어떻게 열어 접근하는지 이해
- `IDENTIFY`: 부품, 라벨, 규격, 단자 등 실제 대상 식별
- `NORMAL_ABNORMAL`: 정상과 점검 필요 상태 비교
- `ACTION`: 손, 공구, 작업 지점과 행동 설명
- `SEQUENCE`: 여러 단계의 순서 설명
- `MEASUREMENT`: 측정 위치, 접점, 계기 사용 맥락 설명
- `RESULT`: 완료 또는 정상 복구 상태 확인
- `WARNING`: 금지 행동, 위험 위치, 중단 조건 설명
- `CONCEPT`: 실제 사진만으로 설명하기 어려운 원리와 판단 구조

Visual 하나는 최소 하나의 명확한 Role과 User Question을 가져야 한다.

## 7. Image Source Strategy

실제 구조와 상태를 설명하는 경우 실제 자료 탐색을 우선한다.

탐색 우선순위:

1. FitBike가 사용 가능한 MAXXIS, POWEROAD 등 승인 Brand Asset
2. 제조사/브랜드 공식 이미지와 기술자료
3. 블로그의 실제 작업/실차 이미지
4. 신뢰 가능한 전문 자료의 실제 이미지
5. 기타 현장 맥락을 확인할 수 있는 웹 자료
6. FitBike 교육용 신규 생성 이미지

공식/블로그/웹 이미지는 단순 복사하여 FitBike 최종 자산으로 취급하지 않는다. 원본은 Research/Editorial Source로 기록하고, 서비스 목적에 맞는 정보 구조를 먼저 정의한 뒤 허용된 편집 또는 독립적인 FitBike 교육용 Visual 생성에 사용한다.

원본 URL, Source Name, Author/Operator(확인 가능한 경우), Source Type, 발견 시점, 사용된 Content, Visual Role, 편집/재구성 목적과 권리 상태를 `17_content_asset_source`의 현재 schema가 지원하는 범위에서 기록한다. schema에 없는 필드를 임의 추가하지 않는다.

권리 협의와 최종 권리 판단은 운영자가 관리한다. AI는 출처를 숨기거나 원본을 자체 제작물로 오인시키지 않는다.

## 8. Watermark Policy

워터마크, 타 서비스 로고, 저작권 표식, 사진 판매/스톡 서비스 식별표가 포함된 이미지는 최종 FitBike 이미지의 편집 원본으로 사용하지 않는다.

- 워터마크를 제거하거나 가리는 편집을 하지 않는다.
- 워터마크 영역만 Crop하여 사실상 제거하는 방식도 사용하지 않는다.
- 해당 이미지는 사실/장면/Visual Requirement를 이해하기 위한 Research Reference로만 사용할 수 있다.
- 같은 정보를 보여주는 워터마크 없는 공식/블로그/실제 자료를 다시 탐색한다.
- 적절한 원본이 없으면 원본의 표현을 복제하지 않고, 검증된 사실과 Visual Requirement를 바탕으로 FitBike 목적의 독립적인 교육 이미지를 신규 생성한다.

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

### Generated Visual Preferred

다음은 독립적인 교육용 생성 이미지가 효과적이다.

- 작동 원리
- 측정 원리와 접점
- 판단 흐름
- 작업 순서 요약
- 정상/주의/중단 조건의 개념 비교
- 실제 사진에 안전하게 표시하기 어려운 설명 구조

생성 이미지는 특정 제조사 공식 도면이나 특정 블로그 사진을 그대로 재현하지 않는다. Research에서 확인된 사실을 기반으로 FitBike만의 구도, 정보 계층, 라벨, 설명 목적을 가진 Visual을 만든다.

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
- `SAFETY`: 위험, 중단 조건, 전문 점검 전환 조건이 명확한가
- `STRUCTURE`: 질문 → 판단 → 행동 흐름이 자연스러운가
- `VISUAL`: 이미지가 독립적인 정보로 기능하는가
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

이미지 권리 상태 자체의 운영 판단은 `17_content_asset_source`에서 추적하며 운영자가 관리한다. AI는 출처 누락을 허용하지 않는다.

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
