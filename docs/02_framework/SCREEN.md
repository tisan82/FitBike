# FitBike Screen Guide

**Version:** v1.1\
**Status:** Baseline

## Principles

1.  Mobile First
2.  One Hand Operation
3.  Minimal Input
4.  Progressive Disclosure
5.  Fast Decision
6.  초보자도 부담 없이 사용할 수 있지만 정보 신뢰성은 전문가 수준

## Global Visual Standard

Customer-facing Front Office의 기본 Theme은 **Light Base + Black
Typography + FitBike Blue**다. Dark Theme을 기본 화면 Theme으로 사용하지
않으며, White와 Light Neutral Surface의 차이로 정보 hierarchy를 구성한다.
Blue는 일반 Page Background로 남용하지 않고 주요 action과 상태 표현에
제한적으로 사용한다.

색상의 역할은 다음과 같다.

-   White: 기본 Page Background와 정보 탐색 공간
-   Black / Near Black: Primary Typography와 핵심 정보
-   Neutral Gray: Secondary Text, Border, Secondary Surface
-   FitBike Blue: Primary CTA, Active, Selected, Link, Progress, 주요
    Conversion 영역

### Semantic Color Tokens

Customer-facing UI는 다음 semantic token을 기준으로 구현한다. 개별 화면에서
같은 역할의 색상을 별도 이름이나 임의 색상으로 만들지 않는다.

-   `--background`: 기본 Page Background
-   `--surface`: 기본 Content/Card/Header Surface
-   `--surface-secondary`: Section 구분용 Light Neutral Surface
-   `--foreground`: Primary Typography
-   `--foreground-secondary`: Secondary Text
-   `--border`: Neutral Border
-   `--primary`: FitBike Blue Primary Action/Active/Link/Progress
-   `--primary-hover`: Primary hover/pressed state
-   `--primary-foreground`: Primary 위의 foreground
-   `--selected-background`: Selected 상태의 Light Blue Background
-   `--selected-border`: Selected 상태의 Blue Border

Primary CTA는 FitBike Blue Background와 White Text를 사용한다. Secondary
CTA는 White Background, Dark Text, Neutral Border를 사용한다. Selected
상태는 Blue Border와 Light Blue Background로 표현한다. Error 의미와
Active 의미를 같은 색상으로 혼용하지 않으며, StepIndicator의 Active 상태는
Primary Blue를 사용한다.

Header의 기본 Background는 White다. FitBike Logo는 원본 Black + Blue
색상을 유지하며 CSS filter 등으로 임의 변경하지 않는다. Blue Background는
페이지 전체가 아니라 중요한 Conversion 영역에 제한적으로 사용할 수 있다.

이 표준은 Main, Bike Selector, Model Detail, Fitment Result, Tire Detail,
Battery Detail 및 향후 신규 Customer-facing 화면에 공통 적용한다. 개별
Service Module은 특별한 Product/UX 근거가 없는 한 이 Global Visual
Standard를 override하지 않는다. Admin은 이 Front Office Theme 정책의
적용 범위에서 제외한다.

## Global Typography Standard

Customer-facing typography는 실제 모바일 사용을 먼저 설계하며 Desktop을
축소해 적용하지 않는다. 정보가 좁은 공간에 맞지 않으면 중복 정보 제거,
hierarchy 단순화, 자연스러운 줄바꿈, layout 조정을 글자 축소보다 먼저
적용한다.

FitBike의 기본 typography scale은 다음과 같다.

| Role | Size | Weight | Line height | Purpose |
|---|---:|---:|---:|---|
| Display / Model Identity | 30px | 700 | 1.2~1.3 | 바이크·모델의 핵심 identity |
| Page Title | 24px | 700 | 1.25~1.35 | 화면의 주 제목 |
| Section Title | 20px | 600~700 | 1.3~1.4 | 주요 정보 section |
| Card Title | 18px | 600~700 | 1.3~1.4 | 상품·모델·카드 제목 |
| Body / Important Value | 16px | 400~600 | 1.5~1.6 | 본문과 주요 규격 값 |
| Secondary / Metadata | 14px | 400~500 | 1.4~1.5 | 보조 설명과 label |

Primary body와 중요한 값은 원칙적으로 16px 이상, secondary와 metadata는
14px 이상을 사용한다. 14px 미만은 이해나 조작에 필요하지 않은 예외적
비핵심 정보에만 허용하며, 공간 확보를 위해 11px/12px를 사용하지 않는다.
Page identity와 section/card title은 Bold 또는 Semibold, 중요한 값은
Semibold, body와 secondary는 Regular 또는 Medium을 기본으로 한다. 작은
글자에 Bold를 일괄 적용해 hierarchy를 대신하지 않는다.

Primary text는 `--foreground`, secondary text는
`--foreground-secondary`를 사용하되 작고 얇고 연한 조합을 만들지 않는다.
한국어 본문은 압축된 line-height를 피하고, 긴 문자열은 핵심 정보를
말줄임하기 전에 wrapping 또는 layout 변경을 우선한다.

Bike Selector의 고객용 브랜드명은 `brand_ko`를 우선하고 없으면
`brand_en`을 사용한다. 두 이름을 기본 카드에 동시에 표시하지 않으며 DB와
API의 영문 값은 그대로 유지한다.

## Bike Selection

Brand → Model → Model Year 순차 선택. 이전 단계가 결정되기 전 다음
단계가 시각적으로 경쟁하지 않게 한다. 브랜드는 인지 가능한 로고+텍스트를
활용하고, 모델은 수량이 많으면 검색을 제공한다. 모바일에서 과도한 세로
스크롤을 피한다. 추천/인기순은 명시적 정책 없이는 적용하지 않는다.

## Layout

Header → Content → Primary Action → Bottom Navigation(필요 시)

Fitment/specification 정보는 상업적 프로모션보다 우선한다.
