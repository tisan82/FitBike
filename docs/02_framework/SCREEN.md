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

## Bike Selection

Brand → Model → Model Year 순차 선택. 이전 단계가 결정되기 전 다음
단계가 시각적으로 경쟁하지 않게 한다. 브랜드는 인지 가능한 로고+텍스트를
활용하고, 모델은 수량이 많으면 검색을 제공한다. 모바일에서 과도한 세로
스크롤을 피한다. 추천/인기순은 명시적 정책 없이는 적용하지 않는다.

## Layout

Header → Content → Primary Action → Bottom Navigation(필요 시)

Fitment/specification 정보는 상업적 프로모션보다 우선한다.
