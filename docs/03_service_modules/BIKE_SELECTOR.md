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
