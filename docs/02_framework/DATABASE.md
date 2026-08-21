# FitBike Database Guide

**Version:** v1.2\
**Status:** Baseline

## Principles

Database First / Fitment Accuracy / Data Integrity / Null Preservation /
No inferred fitment values.

## Current Known Core Tables

  Entity                       Table
  ---------------------------- ------------------------------------
  Brand                        `01_brand`
  Bike Model                   `02_bike_model`
  Bike Model Year              `03_bike_model_year`
  Tire Product                 `04_tire_product`
  Battery Product              `05_battery_product`
  Brake Product                `06_brake_product`
  Tire Mapping                 `07_bike_model_year_tire_product`
  Battery Standard / Mapping   `08_battery_standard_product`
  Brake Mapping                `09_bike_model_year_brake_product`
  Model-Year Image             `10_bike_model_year_image`
  Tire Model                   `11_tire_model`

`03_bike_model_year`가 Fitment의 핵심 Entity다.

타이어 commerce에서 `11_tire_model`은 공통 모델 identity이고
`04_tire_product`는 판매 SKU다. 애플리케이션은
`11_tire_model.tire_model_key`로 모델을 조회하고
`04_tire_product.tire_model_id`로 해당 SKU를 조회한다. 정확한 FK와 index
정의는 `docs/04_database_schema/`의 최신 export만을 따른다.

SKU의 Bike Model + Year Fitment는 기존
`07_bike_model_year_tire_product` 관계만 사용한다. 타이어 모델 또는 규격
문자열을 기준으로 별도 Fitment 관계를 만들거나 추정하지 않는다.

## Identifier Policy

정확한 컬럼은 `docs/04_database_schema/`의 현재 export를 확인한다.

알려진 실제 컬럼 예: - Brand: `brand_id`, `brand_key`, `brand_en`,
`brand_ko`, `logo_image_url` - Model: `bike_model_id`, `model_key`,
`model_name_en`, `model_name_ko`, `default_category`, `engine_cc`

문서상의 generic alias(`brand`, `bike_model`, `brand_name`,
`model_name`, `category`, `cc`)를 실제 DB identifier로 추정 사용하지
않는다.

## Storage Path

DB 이미지 필드는 전체 URL이 아니라 Storage object path일 수 있다.

예: - `manufacturers/aprilia/logo.jpg` -
`model/001/100082/10008201_MAIN.png`

애플리케이션이 `bike-assets` public URL로 변환한다. DB에 환경 종속
absolute URL을 저장하는 방식으로 임의 변경하지 않는다.

타이어 모델 이미지는 `tire-assets` bucket에 저장한다. DB에는
`tire-models/{brand}/{tire_model_key}/{slot}.webp` object path를 저장하고,
애플리케이션은 `tire-models/` prefix를 `tire-assets` public URL로 변환한다.
그 외 기존 asset path는 계속 `bike-assets`를 사용한다.

## Schema Rule

Schema 변경은 사용자 승인 없이 수행하지 않는다. Production query는
필요한 컬럼을 명시하는 것을 기본으로 한다.

## Tire Position Policy

`04_tire_product.position_type`은 상품 자체의 공식 장착 위치 검증 상태를
나타낸다.

-   `FRONT`: 공식 Front 전용
-   `REAR`: 공식 Rear 전용
-   `BOTH`: 공식 Front/Rear 모두 사용 가능
-   `COMMON`: Legacy 또는 Position 미검증
-   `NULL`: 위치 정보 없음

`UNKNOWN`은 Product DB 저장값이 아니며 Review workflow에서만 사용한다.
