# FitBike Content SEO & Search Intent Standard

**Version:** v1.0
**Status:** Content Factory Search Standard

## 1. Purpose

FitBike 콘텐츠의 목표는 단순 게시 수 증가가 아니라 사용자가 Google/NAVER에서 실제 질문을 검색했을 때 적절한 FitBike 문서를 발견하고, 문서에서 질문을 해결하도록 하는 것이다.

검색 순위나 1페이지 노출은 보장할 수 없다. Factory는 검색엔진을 조작하기 위한 키워드 반복 대신 검색 의도 적합성, 고유 정보, 기술적 색인 가능성, 내부 연결, 사용자 만족도를 개선한다.

## 2. Production Flow Change

기존 Content Factory 흐름 앞에 Search Intent Planning을 추가한다.

`TOPIC → SEARCH INTENT PLAN → DUPLICATION/CANNIBALIZATION CHECK → PLAN → RESEARCH → FACT REGISTER → CONTENT OUTLINE → VISUAL PLAN → WRITE → SEO QA → ASSEMBLY → CONTENT QA → PUBLISH GATE → SEARCH MONITORING`

Search Intent Plan 없이 신규 콘텐츠를 바로 작성하지 않는다.

## 3. Search Intent Plan

각 콘텐츠는 제작 전에 다음을 정의한다.

- `primary_query`: 사용자가 가장 직접적으로 입력할 대표 검색어 1개
- `secondary_queries`: 같은 문제를 다른 표현으로 검색하는 관련 질의
- `search_intent`: 사용자가 실제로 해결하려는 질문/행동
- `answer_goal`: 이 문서를 읽은 뒤 사용자가 알거나 판단할 수 있어야 하는 것
- `content_type`: 일반 정보 / DIY 확인 / 문제 상황 / 모델 정보 등
- `unique_value`: 기존 FitBike 문서와 구별되는 고유 정보
- `related_contents`: 내부 링크 후보
- `cannibalization_check`: 기존 문서와 동일 검색 의도를 경쟁하는지 여부

Primary Query는 글 안에 반복 삽입하기 위한 키워드가 아니다. Title, H1, 첫 답변, 섹션 구조가 동일한 사용자 질문에 일관되게 답하도록 만드는 기준이다.

## 4. Query Cluster Example

Topic: 오토바이 타이어 교체 시기

- Primary: `오토바이 타이어 교체 시기`
- Secondary: `오토바이 타이어 교체 주기`, `바이크 타이어 교체 시기`, `오토바이 타이어 마모`, `오토바이 타이어 수명`, `오토바이 타이어 교체 기준`
- Intent: 현재 타이어를 계속 사용해도 되는지 판단 기준을 알고 싶음
- Answer Goal: 마모한계, 손상, 균열, 편마모, 노화 등 실제 확인 기준을 이해함

## 5. SEO Content QA

Publish Gate 전에 다음을 검사한다.

### Search Intent
- Title/H1이 Primary Query의 사용자 의도와 직접 대응하는가
- 첫 문단에서 핵심 답을 불필요하게 미루지 않는가
- Secondary Query가 별도 억지 문장이 아니라 자연스럽게 필요한 하위 질문으로 다뤄지는가
- 검색 유입용 분량 채우기나 키워드 반복이 없는가

### Metadata / HTML
- 페이지별 고유 Title
- 페이지별 고유 Description
- H1 1개 및 내용 일치
- self canonical
- index/follow
- HTTP 200
- 주요 본문이 서버가 반환하는 HTML에서 읽을 수 있음
- 의미 있는 내부 링크가 표준 링크로 연결됨
- 구조화 데이터가 페이지 실제 내용/URL과 일치함

### Content Quality
- 기존 FitBike 콘텐츠와 검색 의도가 중복되지 않음
- 문서 고유 정보가 충분함
- 동일 템플릿 문장 반복을 최소화함
- 표/이미지/체크 항목이 검색 질문 해결에 실제 정보를 제공함
- 이미지 alt는 이미지가 전달하는 정보를 설명하며 키워드 나열용으로 사용하지 않음

SEO QA 실패는 사실성/안전성 실패와 별도로 기록한다. 검색 최적화를 위해 검증되지 않은 정보나 과장된 표현을 추가하지 않는다.

## 6. Existing Content Audit

기존 Published 콘텐츠도 다음 컬럼으로 전수 Audit할 수 있어야 한다.

| Field | Description |
|---|---|
| URL | 공개 콘텐츠 URL |
| Content Title | 현재 제목 |
| Primary Query | 대표 검색 질의 |
| Secondary Queries | 관련 검색 질의 |
| Search Intent | 검색 목적 |
| Title/H1 Alignment | 제목과 H1의 의도 대응 |
| Description | 검색 설명 적합성 |
| Unique Value | 문서 고유 정보 |
| Internal Links | 관련 콘텐츠/서비스 연결 |
| Image/Alt | 정보 이미지와 alt 상태 |
| Cannibalization | 다른 FitBike 문서와 의도 중복 여부 |
| Indexability | canonical/robots/status 등 기술 상태 |
| Improvement | 수정 필요사항 |
| Last SEO Review | 마지막 점검일 |

우선순위는 `색인 안 됨 → 노출 없음 → 노출 있으나 클릭 없음/낮음 → 검색 의도 불일치 → 구조 개선` 순으로 진단하되, 실제 Search Console/Search Advisor 데이터가 없는 경우 순위나 원인을 추정값으로 확정하지 않는다.

## 7. Model-specific Content

모델명 + 부품 규격 검색은 중요한 검색 의도지만, `CONTENT_FACTORY.md`의 제품 정책을 우선한다. 특정 모델의 타이어/배터리/브레이크 규격을 유사한 별도 콘텐츠로 대량 복제하지 않는다.

모델 고유 규격/연식 차이는 가능한 경우 Model + Year Detail의 고유 데이터로 강화하고, 검색 가능한 Title/Description/HTML/내부 링크를 제공한다. 별도 모델 콘텐츠가 이미 Published 상태라면 삭제를 자동 결정하지 말고 색인, 유입, 중복성, 연결 구조를 Audit한 후 유지/통합/리디렉션을 별도 결정한다.

## 8. Search Monitoring

게시 후 검색 성과는 다음 단계로 본다.

`INDEXED → IMPRESSION → CLICK → QUERY FIT → CONTENT IMPROVEMENT`

가능한 경우 Google Search Console과 NAVER Search Advisor에서 다음을 기록한다.

- indexed state
- impressions
- clicks
- CTR
- 실제 유입 query
- observation period
- last checked date

`NAVER 1페이지` 또는 특정 순위를 자동 성공 조건으로 사용하지 않는다. 순위는 외부 검색엔진이 결정하며 변동한다. 대신 색인, 노출, 클릭, 검색 의도 적합성의 개선을 운영 KPI로 사용한다.

## 9. Update Loop

성과가 약한 콘텐츠는 새 콘텐츠를 즉시 추가하기 전에 다음 순서로 검토한다.

1. 색인 가능성과 실제 색인 여부
2. Primary Query와 Search Intent 적합성
3. Title/H1/첫 답변
4. 문서 고유 정보와 충분성
5. 기존 문서와 Cannibalization
6. 내부 링크
7. 이미지/표 등 정보 구조
8. 실제 노출 Query와 기대 Query 차이
9. 필요한 경우 콘텐츠 업데이트 및 `Last SEO Review` 갱신

검색 성과가 약하다는 이유만으로 제목을 반복 변경하거나 키워드를 과도하게 삽입하지 않는다.
