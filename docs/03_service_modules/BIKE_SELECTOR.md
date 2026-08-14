# Service Module --- Bike Selector

**Version:** v1.1\
**Status:** Baseline

## Goal

Brand → Model → Model Year를 낮은 인지/스크롤 부담으로 선택하고
`bikeModelYearId`를 다음 단계에 전달한다.

## Flow

Brand → Model → Model Year → Continue. 각 단계는 이전 선택 이후 순차
노출한다.

## Data

Brand는 `01_brand`, Model은 `02_bike_model`, Model Year는
`03_bike_model_year`를 기준으로 한다. 정확한 컬럼은
`04_database_schema`를 확인한다.

Known Brand fields: `brand_id`, `brand_key`, `brand_en`, `brand_ko`,
`logo_image_url`, `is_active`. Known Model fields: `bike_model_id`,
`model_key`, `model_name_en`, `model_name_ko`, `default_category`,
`engine_cc`.

`logo_image_url` 및 `generation_image_url`은 Storage object path일 수
있으므로 application layer에서 public URL로 해석한다.
`10_bike_model_year_image`는 다중/연식 이미지 Task에서 실제 schema를
확인하여 사용한다.

## UX

Mobile First, 최소 스크롤, 인지 가능한 브랜드 로고, 대량 모델의 검색
지원. 명시적 Product Rule 없이 popularity ranking을 만들지 않는다.

상단 진행 표시는 브랜드 선택, 모델 선택, 연식 선택의 단계명을 한 줄에
제공하는 compact pattern을 사용한다. 완료 단계는 Primary Blue check,
현재 단계는 Primary Blue 번호와 `aria-current="step"`, 예정 단계는 neutral
상태로 구분하며 단계 사이 connector로 진행 상태를 표시한다. 320px에서도
줄바꿈이나 가로 스크롤 없이 첫 브랜드 선택 영역을 가능한 한 빠르게 노출한다.
