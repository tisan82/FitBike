# Content

**Status:** Foundation

## Responsibility

FitBike Content는 사람들이 실제로 검색하고 궁금해하는 오토바이 DIY, 점검, 관리, 부품 이해, 모델 정보를 정확하고 읽기 쉽게 제공한다.

콘텐츠의 목적은 사용자를 무조건 차량 상세나 부품 상세로 이동시키는 것이 아니다. 한 콘텐츠 안에서 사용자의 질문에 충분히 답하는 것을 우선하며, 차량·부품 연결은 해당 정보가 다음 행동에 실제로 필요한 경우에만 제공한다.

인기, 추천, 랭킹, 판매 유도는 Content의 기본 목적이 아니다.

## Content Product Principles

1. **Question First** — Topic은 FitBike DB에 데이터가 있다는 이유가 아니라 사용자가 실제로 궁금해할 질문과 관리·DIY 필요에서 시작한다.
2. **Answer in Content** — 핵심 답변과 판단 기준을 본문 안에서 제공한다. 다른 서비스 화면으로 이동해야만 답을 얻을 수 있게 만들지 않는다.
3. **Optional Connection** — Bike/Part relation은 콘텐츠 이해 또는 후속 확인에 명확한 가치가 있을 때만 사용한다. Relation 존재 자체를 CTA 노출 근거로 사용하지 않는다.
4. **Official Facts for Model Content** — 특정 오토바이 모델의 제원·규격·정비 기준은 제조사 공식 웹사이트, Owner's Manual, Service/Technical 문서 등 공식 출처를 우선 근거로 사용한다. FitBike DB 값은 콘텐츠 사실의 원천으로 사용하지 않는다.
5. **No Fitment Content Factory** — FitBike DB의 Tire/Battery/Brake 관계가 존재한다는 이유만으로 모델별 호환·규격 콘텐츠를 자동 생성하지 않는다. 특히 `모델명 + 타이어 규격 가이드`를 FitBike fitment 데이터에서 자동 파생하지 않는다.
6. **Model-first Visual** — Model Guide의 대표 이미지는 해당 오토바이 모델 자체가 주 피사체여야 한다. 타이어·배터리·브레이크 제품 이미지를 Model Guide Hero/Thumbnail의 대체물로 사용하지 않는다. 검증된 모델 이미지가 없으면 잘못된 제품 이미지를 넣는 대신 대표 이미지를 생략한다.
7. **Useful DIY & Maintenance** — 콘텐츠 포트폴리오는 점검 방법, 관리 주기 이해, 이상 징후 판단, 소모품 상태 확인, 기본 DIY 준비와 절차, 규격 읽는 법 등 실제 유지관리 질문을 중심으로 확장한다.

## DB Tables

- `12_content`: article identity, publication state, images, and structured body blocks
- `13_content_bike_model`: optional content-to-bike-model relation
- `14_content_bike_model_year`: optional content-to-model-year relation
- `15_content_part_link`: optional content-to-part relation

Relations are metadata for relevance and contextual discovery. They do not mean that every article must render a bike or part CTA.

Database mutations are delivered through reviewed migrations; the application does not mutate content or Storage data.

## Routes

- `/contents`: published content discovery hub with search and content-type filtering
- `/contents/[contentKey]`: information-first article detail
- `/today/battery-check-before-replace`: permanent redirect to `/contents/battery-check-before-replace`

## Content Types

- `MAINTENANCE`: 상태 확인, 관리 방법, 이상 징후와 후속 판단
- `DIY`: 사용자가 직접 수행할 수 있는 작업의 준비, 절차, 결과 확인과 안전 조건
- `PARTS_GUIDE`: 부품 구조, 규격 표기, 차이와 선택 전에 이해해야 할 정보
- `MODEL_GUIDE`: 특정 모델 자체에 대해 공식 근거로 설명할 가치가 있는 정보. FitBike fitment DB를 콘텐츠화하는 유형이 아님

## Detail UX

콘텐츠 상세는 읽기 경험을 우선한다.

- Header: Content Type → Title → Summary → 공식 자료 우선 안내
- Hero: 콘텐츠 이해에 필요한 경우만 사용
- Body: 충분한 문단 간격, 명확한 H2/H3 계층, 읽기 쉬운 List/Step/Table, Tip/Warning 구분
- Footer: `/contents`로 돌아가 다른 정보를 찾을 수 있는 경로 제공
- 자동 `관련 바이크 → 모델 정보 보기` 섹션은 사용하지 않는다.
- 차량/부품 CTA는 향후 콘텐츠별 명시적 Editorial Intent가 정의된 경우에만 추가한다.

## Block Types

The supported `body_blocks` union is limited to `heading`, `paragraph`, `image`, `bullet_list`, `numbered_list`, `step`, `tip`, `warning`, and `table`. Blocks render as React elements without interpreting stored HTML.

## Publishing Rule

Public content must satisfy all of the following: `is_active = true`, `published_at IS NOT NULL`, and `published_at <= now()`. The directory order is `published_at DESC`, then `content_id DESC`.

`/contents` and Home's recent-guide gate use five-minute ISR. `/sitemap.xml` uses a dynamic Route Handler with a five-minute CDN response cache.

## Source Policy

### Generic maintenance / DIY / parts understanding

신뢰 가능한 기술 자료와 공식 자료를 조합할 수 있다. 안전, 정비 한계, 수치, 규격 등 Critical Fact는 검증되지 않은 상태로 게시하지 않는다.

### Model-specific content

특정 모델의 연식, 타이어 규격, 공기압, 배터리 규격, 정비 한계 등 모델 고유 사실은 공식 제조사 자료를 Source of Truth로 사용한다.

- Preferred: manufacturer model page, owner's manual, official technical/specification document
- Secondary sources may help discovery but cannot replace official verification for Critical Model Facts.
- FitBike Production DB may be used to identify an entity or relation for service functionality, but must not be cited or treated as the authoritative content source.
- Official evidence가 확보되지 않으면 해당 Model Fact를 생성하지 않고 Candidate를 HOLD/DROP한다.

## Autonomous Publishing Policy

Content Factory의 Autonomous Batch는 정상 Candidate마다 사람 승인을 요구하지 않고 Risk와 검증 Gate를 조합해 게시 여부를 결정한다. 다만 Candidate 생성 자체가 사용자 가치 기준을 통과해야 한다.

- `LOW`: 필수 Fact, Duplicate/Intent, Content, Image, Safety Gate가 모두 PASS이면 자동 게시한다.
- `MEDIUM`: 모든 필수 Gate와 Medium Auto Clearance Gate가 모두 PASS인 경우에만 자동 게시한다.
- `HIGH`: 자동 게시하지 않고 `HOLD`로 보낸다.

Risk와 관계없이 Source Conflict, Fact QA 실패, Critical Claim 검증 부족, Safety uncertainty, 지원되지 않는 수치·정비 한계, 기술적 오표현, Product/Model 불일치, 해결되지 않은 Duplicate 또는 Subject Drift, Image QA 실패, Production integrity uncertainty는 강제 `HOLD`다.

## Candidate Policy

Autonomous Batch의 부족한 Queue를 채우기 위해 FitBike DB의 모델별 Tire/Battery/Brake 보유 여부에서 Model Guide Candidate를 자동 생성하지 않는다.

새 Topic은 다음 우선순위를 따른다.

1. 실제 유지관리 과정에서 반복적으로 발생하는 질문
2. 사용자가 상태를 스스로 확인하고 다음 행동을 판단하는 데 도움이 되는 내용
3. 초보자가 이해하기 어려운 규격·부품·용어 설명
4. 안전하게 수행 가능한 DIY의 준비와 절차
5. 특정 모델에 대해 공식 자료로 설명할 충분한 사용자 가치가 있는 정보

단순히 `모델 + 부품명 + 규격` 조합을 대량 생성하는 것은 Topic 전략으로 사용하지 않는다.

## Image Policy

- Maintenance/DIY: 점검 위치, 작업 맥락, 상태 차이를 이해하는 Visual 우선
- Parts Guide: 구조·표기·차이를 설명하는 Educational Visual 우선. 실제 제품 표현이 필요할 때만 승인 Brand Asset 사용
- Model Guide: **Bike Model Representation 우선**. 해당 모델 자체가 Hero/Thumbnail의 중심이어야 한다.
- Model Guide에서 Tire/Battery/Brake Product Asset을 Hero/Thumbnail로 사용하지 않는다.
- 이미지가 정보 전달에 도움이 되지 않으면 `NO_VISUAL`을 허용한다.
- 생성 이미지는 실제 기술 구조, 규격, 제조사 사실처럼 오인되게 만들지 않는다.

## Existing Content Remediation

기존에 자동 생성된 `모델명 + 타이어 규격 가이드` 콘텐츠는 새 정책의 기준 콘텐츠로 간주하지 않는다. 별도 정리 단계에서 다음을 검토한다.

- 공식 제조사 근거 존재 여부
- 모델 이미지 사용 여부
- FitBike DB 기반 문구 제거 필요 여부
- 독립적인 사용자 검색 가치 존재 여부
- 가치가 낮거나 공식 근거가 부족하면 수정이 아니라 비활성화/통합 대상인지 판단

신규 Factory는 이 유형을 더 생성하지 않는다.
