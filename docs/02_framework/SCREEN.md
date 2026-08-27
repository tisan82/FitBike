# FitBike Screen Guide

**Version:** v1.3  
**Status:** Baseline

## Principles

1. Mobile First
2. One Hand Operation
3. Minimal Input
4. Progressive Disclosure
5. Fast Decision
6. 초보자도 부담 없이 사용할 수 있지만 정보 신뢰성은 전문가 수준

## Global Visual Standard

Customer-facing Front Office의 기본 Theme은 **Light Base + Black Typography + FitBike Blue**다. Dark Theme을 기본 화면 Theme으로 사용하지 않으며, White와 Light Neutral Surface의 차이로 정보 hierarchy를 구성한다. Blue는 일반 Page Background로 남용하지 않고 주요 action과 상태 표현에 제한적으로 사용한다.

색상의 역할은 다음과 같다.

- White: 기본 Page Background와 정보 탐색 공간
- Black / Near Black: Primary Typography와 핵심 정보
- Neutral Gray: Secondary Text, Border, Secondary Surface
- FitBike Blue: Primary CTA, Active, Selected, Link, Progress, 주요 Conversion 영역

### Semantic Color Tokens

Customer-facing UI는 다음 semantic token을 기준으로 구현한다. 개별 화면에서 같은 역할의 색상을 별도 이름이나 임의 색상으로 만들지 않는다.

- `--background`: 기본 Page Background
- `--surface`: 기본 Content/Card/Header Surface
- `--surface-secondary`: Section 구분용 Light Neutral Surface
- `--foreground`: Primary Typography
- `--foreground-secondary`: Secondary Text
- `--border`: Neutral Border
- `--primary`: FitBike Blue Primary Action/Active/Link/Progress
- `--primary-hover`: Primary hover/pressed state
- `--primary-foreground`: Primary 위의 foreground
- `--selected-background`: Selected 상태의 Light Blue Background
- `--selected-border`: Selected 상태의 Blue Border

Primary CTA는 FitBike Blue Background와 White Text를 사용한다. Secondary CTA는 White Background, Dark Text, Neutral Border를 사용한다. Selected 상태는 Blue Border와 Light Blue Background로 표현한다. Error 의미와 Active 의미를 같은 색상으로 혼용하지 않으며, StepIndicator의 Active 상태는 Primary Blue를 사용한다.

Header의 기본 Background는 White다. FitBike Logo는 원본 Black + Blue 색상을 유지하며 CSS filter 등으로 임의 변경하지 않는다. Blue Background는 페이지 전체가 아니라 중요한 Conversion 영역에 제한적으로 사용할 수 있다.

이 표준은 Main, Bike Selector, Model Detail, Fitment Result, Tire Detail, Battery Detail 및 향후 신규 Customer-facing 화면에 공통 적용한다. 개별 Service Module은 특별한 Product/UX 근거가 없는 한 이 Global Visual Standard를 override하지 않는다. Admin은 이 Front Office Theme 정책의 적용 범위에서 제외한다.

## Global Typography Standard

Customer-facing typography는 실제 모바일 사용을 먼저 설계하며 Desktop을 축소해 적용하지 않는다. 정보가 좁은 공간에 맞지 않으면 중복 정보 제거, hierarchy 단순화, 자연스러운 줄바꿈, layout 조정을 글자 축소보다 먼저 적용한다.

FitBike의 기본 typography scale은 다음과 같다.

| Role | Size | Weight | Line height | Purpose |
|---|---:|---:|---:|---|
| Display / Model Identity | 30px | 700 | 1.2~1.3 | 바이크·모델의 핵심 identity |
| Page Title | 24px | 700 | 1.25~1.35 | 화면의 주 제목 |
| Section Title | 20px | 600~700 | 1.3~1.4 | 주요 정보 section |
| Card Title | 18px | 600~700 | 1.3~1.4 | 상품·모델·카드 제목 |
| Body / Important Value | 16px | 400~600 | 1.5~1.6 | 본문과 주요 규격 값 |
| Secondary / Metadata | 14px | 400~500 | 1.4~1.5 | 보조 설명과 label |

Primary body와 중요한 값은 원칙적으로 16px 이상, secondary와 metadata는 14px 이상을 사용한다. 14px 미만은 이해나 조작에 필요하지 않은 예외적 비핵심 정보에만 허용하며, 공간 확보를 위해 11px/12px를 사용하지 않는다. Page identity와 section/card title은 Bold 또는 Semibold, 중요한 값은 Semibold, body와 secondary는 Regular 또는 Medium을 기본으로 한다. 작은 글자에 Bold를 일괄 적용해 hierarchy를 대신하지 않는다.

Primary text는 `--foreground`, secondary text는 `--foreground-secondary`를 사용하되 작고 얇고 연한 조합을 만들지 않는다. 한국어 본문은 압축된 line-height를 피하고, 긴 문자열은 핵심 정보를 말줄임하기 전에 wrapping 또는 layout 변경을 우선한다.

Bike Selector의 고객용 브랜드명은 `brand_ko`를 우선하고 없으면 `brand_en`을 사용한다. 두 이름을 기본 카드에 동시에 표시하지 않으며 DB와 API의 영문 값은 그대로 유지한다.

## Bike Selection

Brand → Model → Model Year 순차 선택. 이전 단계가 결정되기 전 다음 단계가 시각적으로 경쟁하지 않게 한다. 브랜드는 인지 가능한 로고+텍스트를 활용하고, 모델은 수량이 많으면 검색을 제공한다. 모바일에서 과도한 세로 스크롤을 피한다. 추천/인기순은 명시적 정책 없이는 적용하지 않는다.

## Layout

Header → Content → Primary Action → Bottom Navigation(필요 시)

Fitment/specification 정보는 상업적 프로모션보다 우선한다.

### Home Discovery Hierarchy

Home의 Primary Gate는 `내 바이크 찾기`다. FitBike의 Model-Year Driven 원칙에 따라 Hero에서 Brand → Model → Model Year 선택으로 이어지는 `/bike-selector`를 가장 강한 Primary CTA로 제공한다. 콘텐츠 탐색 CTA는 Primary CTA와 경쟁하지 않는 Secondary Action으로 제공한다.

Home은 Bike Finder가 왜 필요한지 이해할 수 있도록 `브랜드 선택 → 모델·연식 확인 → 부품 정보 확인`의 짧은 3단계 설명을 제공할 수 있다. 이 설명은 실제 Selector를 Home에 복제하거나 추가 입력을 요구하지 않는다.

Home의 콘텐츠 영역은 공개된 최신 정보 콘텐츠 일부를 보여주는 `바이크 가이드` Gate다. 전체 콘텐츠를 Home에 나열하거나 추천·인기 순위를 만들지 않는다. 기본 노출은 최신 공개 콘텐츠 최대 3건이며 `/contents` 전체 보기 CTA를 항상 함께 제공한다.

Guide card는 `/contents/{contentKey}`로 직접 연결한다. 저장된 Thumbnail이 있으면 카드 상단에 사용하고, 없으면 이미지 영역 자체를 생략한다. Home을 위해 별도 임의 이미지를 생성하지 않는다. 카드에는 Content Type, Title, Summary를 HTML로 제공하며 모바일에서도 카드 전체가 충분한 tap target이 되고 가로 overflow를 만들지 않아야 한다.

Home 하단은 콘텐츠 탐색 이후에도 Model-Year 기준 확인으로 복귀할 수 있도록 Bike Finder CTA를 다시 제공한다. 일반적인 관리 정보와 실제 차량 규격을 동일한 것으로 표현하지 않는다.

### Content Hub Discovery Hierarchy

`/contents`는 전체 공개 콘텐츠를 탐색하는 Hub다. 콘텐츠 수가 증가해도 사용자가 전체 카드 목록을 순차적으로 훑는 방식에 의존하지 않아야 한다.

Hub의 탐색 우선순위는 `검색 → 검증된 Content Type 선택 → 결과 목록`이다. 검색은 현재 Content 데이터가 소유하는 Title과 Summary를 대상으로 하며, 존재하지 않는 keyword/tag/category 관계를 추정해서 만들지 않는다.

Content Type은 `점검/관리`, `교체/DIY`, `부품 규격`, `모델 가이드`의 기존 검증된 값을 사용한다. 각 유형은 단순 chip이 아니라 의미 설명과 현재 공개 콘텐츠 수를 함께 제공해 초보자가 선택 기준을 이해할 수 있게 한다. 추천순·인기순·임의 ranking은 제공하지 않는다.

검색과 유형 선택은 함께 적용할 수 있어야 하며 현재 결과 수를 명확히 표시한다. 결과가 없을 때는 빈 Grid만 보여주지 않고 검색 조건을 초기화해 전체 콘텐츠로 돌아갈 수 있는 Action을 제공한다.

Guide card는 Content Type → Title → Summary hierarchy를 유지하고 저장 Thumbnail이 있을 때만 이미지 영역을 제공한다. Thumbnail의 accessible text는 콘텐츠 제목과 연결한다. Hub에서도 일반 정보와 실제 차량 규격이 다를 수 있음을 안내하며 차량별 확인은 Bike Selector가 담당한다.

향후 Topic/Part/Model 관계 기반 탐색은 DB에 검증된 taxonomy 또는 relation이 추가된 이후 확장한다. 현재 문자열을 임의 분류해 taxonomy처럼 취급하지 않는다.

## Tire Model Detail Disclosure

타이어 모델 상세는 모델 이해 후 판매 규격을 선택하는 Gate다. 규격명, 고객용 장착 위치, 가격을 위치별로 묶어 표시하고 선택하면 해당 SKU Detail로 이동한다. 상세 제원, Fitment, 구매 CTA는 Model Detail에서 펼치지 않고 SKU Detail에서 제공한다.

SKU Detail은 선택 규격, 역방향 Fitment, 구매 CTA 순서를 우선한다. Fitment가 많으면 초기 5~10개만 표시하고 명시적인 전체 보기 control로 확장한다. Fitment가 0건이면 실제 장착 불가로 단정하지 않고 Section을 숨긴다. 공통 `타이어 규격 보는 법`은 기본적으로 접힌 상태로 제공한다.

Model/SKU Hero는 1:1 `object-fit: contain`을 사용하고 저장 이미지가 없거나 로드에 실패하면 공통 Tire no-image asset을 사용한다. Tire Model의 headline, supporting copy, feature, 규격 정보는 접근 가능하고 반응형인 HTML이 소유한다. 텍스트가 포함된 기존 `sub_image_url_1`은 DB/Storage에는 보존하되 Model Detail UI에서 표시하지 않는다. `sub_image_url_2`는 주행 환경 visual로 별도 Section에 표시하며 URL이 없거나 로드에 실패하면 해당 Section을 숨긴다.

Tire Model Detail의 모바일 disclosure 순서는 Hero → 주요 특징 → 제품 정보/규격 안내 → SKU 선택 → 주행 환경 visual → 브랜드 모델 목록 CTA다. Model Detail에는 SKU 관계로 확인되지 않은 호환 바이크 정보를 만들지 않는다.

SKU 선택은 모바일 horizontal swipe card와 명확한 selected state를 사용한다. 선택한 SKU의 저장 제원을 바로 아래에 표시하고 호환 바이크는 해당 SKU mapping만 보여준다. 호환 row에서는 이미 선택 영역에 표시한 position과 tire size를 반복하지 않는다.

모바일 Tire Detail은 16px page gutter, Hero 이미지와 정보 사이 약 20px, 주요 Section 사이 28~32px, 제목과 콘텐츠 사이 14~16px을 기준으로 한다. 규격 가이드는 compact Utility accordion, Fitment는 제조사 horizontal navigation과 divider 기반 compact list, 다른 판매 규격은 Product selection card로 구분해 같은 카드 표현을 반복하지 않는다.

## Tire Model Directory

`/tire-models/maxxis`는 활성 MAXXIS 타이어 모델을 `model_name` 오름차순으로 보여주는 탐색 page다. 모바일은 2열, 넓은 화면은 3~4열 card grid를 사용하며 각 card는 실제 대표 이미지, 모델명, 저장된 summary와 Model Detail link를 제공한다. 추천, 인기순, 임의 ranking을 만들지 않는다. 분류 filter는 실제 DB의 검증된 category/riding 값이 있을 때만 제공하고 NULL 모델은 항상 전체 결과에 남긴다.
