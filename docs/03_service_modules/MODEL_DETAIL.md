# Model + Year Detail

## Purpose and Customer Flow

Model Detail의 공식 의미는 **Model + Year Detail**이며 기준 entity는 `bike_model_year`다. Bike Selector의 Brand → Model → Model Year 선택 완료 후 `bike_model_year_id`를 `/model-detail/[bikeModelYearId]`로 전달한다. Fitment Result는 별도 탐색 결과 화면으로 유지한다.

모델명과 모델+부품 검색 유입을 위한 `/motorcycles/[brandSlug]/[modelSlug]`는 별도 화면을 만들지 않고 같은 Model Detail을 사용한다. 이 URL은 해당 모델의 활성 연식 중 `start_year`, `bike_model_year_id` 최신순 첫 항목을 기본 선택하고 self-referencing canonical을 사용한다. 과거 연식은 기존 `/model-detail/[bikeModelYearId]`로 이동하며 최신 연식을 다시 선택하면 모델 대표 URL로 돌아온다.

## Data Contract

Core는 활성 Model-Year와 연결된 활성 Model/Brand, 동일 Model의 활성 연식 목록, 대표 이미지, 설명과 기본 부품 규격만 제공한다. Product는 실제 07/08/09 mapping과 활성 04/05/06 Product만 제공한다. 사용하지 않는 DB column은 노출하지 않고 NULL을 추정하거나 생성하지 않는다.

## Year Navigation and Model Information

동일 `bike_model_id`의 연식을 `start_year` 최신순으로 한 줄 horizontal scroll에 표시한다. 현재 연식은 Selected semantic state와 `aria-current`로 알린다. 이동 시 URL과 이미지, 특징, 변경사항, 규격, 상품이 새 ID 기준으로 갱신된다.

정보 순서는 Brand/Model → Year Navigation → 현재 Year → 대표 이미지 → 모델 특징 → 해당 연식의 주요 변경이다. `model_features`와 `major_changes`는 분리하며 NULL인 영역은 만들지 않는다.

`02_bike_model`의 요약·기본 카테고리·기본 배기량은 모든 연식에서 사용할 수 있다. `03_bike_model_year`에 같은 항목의 확인된 값이 있으면 현재 연식 값을 우선하고, 확장 제원·가격·규격은 선택한 연식의 값만 표시한다. 다른 연식의 값을 자동 상속하거나 복사하지 않는다. 고객 화면에서는 DB 소유 범위를 설명하는 내부 용어 또는 별도 배지를 노출하지 않고 하나의 자연스러운 모델 정보로 제공한다.

모델 특징, 연식별 변경점·특장점·활용도와 기본 타이어 규격은 Model + Year Detail이 소유한다. 같은
정보를 `모델명 + 타이어 규격 가이드` Content로 반복하지 않는다. 공식 근거로 확인된 설명이 부족하면
별도 Content URL을 만들기보다 이 화면의 모델 특징과 연식 변경 내용을 우선 보강한다.

## Image Priority

대표 이미지는 활성 `10_bike_model_year_image`의 `MAIN` 중 `is_primary` 내림차순, `display_order`와 `image_id` 오름차순으로 선택한다. 없으면 선택 연식의 `generation_image_url`, 모델의 `model_image_url`, 공통 준비중 asset 순서로 사용한다. 어떤 fallback 단계가 사용됐는지는 고객 화면에 표시하지 않는다. 공통 asset이 없으면 CSS placeholder를 표시한다. Storage object path는 공통 helper로 Public URL로 변환하고 DB에 Public URL을 쓰지 않는다. 실제 이미지는 비율 유지, `object-fit: contain`, crop 금지다.

## Tire, Battery, Brake and Product Connection

부품은 Tire → Battery → Brake 순서이며 **SPEC FIRST, PRODUCT SECOND**다. Tire와 Brake는 FRONT/REAR를 분리한다. Tire는 07→04, Battery는 `battery_standard_code` 기반 08→05, Brake는 09→06의 실제 활성 mapping만 사용한다. 특정 브랜드 전용 조건을 두지 않는다.

Product row는 Brand, Product, schema에 있는 보조 정보를 공통 패턴으로 표시한다. 기존 detail route가 있는 Tire/Battery는 전체 행 링크를 사용한다. Brake detail route가 없으면 허위 링크를 만들지 않는다. Battery와 Brake group은 처음 최대 3개, 나머지는 같은 영역에서 더보기/접기로 점진 공개한다. Tire Product는 Position 규격을 카드마다 반복하지 않고, 모바일에서는 해당 Position 내부의 가로 목록, 넓은 화면에서는 responsive grid로 전체 상품을 표시한다.

Tire Product의 브랜드 표시는 `brand_name`과 등록된 언어별 alias를 정규화한 공통 로컬 asset 경로를 사용하며, asset은 `public/images/brands/tire/{normalized-brand}.png`에 둔다. 로고가 없거나 로드에 실패하면 빈 이미지 영역이나 broken image 대신 기존 브랜드 텍스트를 표시한다. 로고는 상품 식별을 돕는 보조 정보로 제한하고 원본 비율을 유지한다. Tire Product 목록에는 별도의 "호환상품" label을 표시하지 않는다. 별도 pattern field가 없는 동안 Model Detail의 간결한 상품명은 브랜드명 바로 다음 토큰이 제한된 pattern 형식일 때만 사용하고, 불확실하면 원래 `product_name`으로 fallback한다.

모델/연식의 타이어 사이즈 설명 다음에는 같은 `bike_model_year_id`와 명시적으로 연결된 활성 Tire
Product만 표시한다. 각 상품은 실제 FitBike `/tire-detail/[tireProductId]`로 이동해야 하며, 사이즈가
같다는 이유로 다른 SKU를 대신 연결하지 않는다. 활성 mapping이 없으면 `등록 상품 없음` 상태를
보여주고 임의 추천이나 외부 상품 링크를 만들지 않는다.

## Loading and Empty State

Brand, Model, 현재 연식, Year List, 대표 이미지, 특징/변경사항, Parts Spec은 core priority다. Product list, 추가 이미지, 관련 콘텐츠는 deferred 대상이다. Product는 viewport 접근 시 요청하고 section skeleton을 쓰며 core 화면을 비우지 않는다. 규격이 없으면 `이 연식의 규격 확인 중`, 규격은 있지만 mapping이 없으면 `규격 확인 · 연결 상품 준비 중`으로 구분한다. 이미지 실패는 broken image 대신 준비중 placeholder를 표시한다.

## Related Guides

Model Detail reads published `12_content` rows through `13_content_bike_model` using the page's `bike_model_id`. It shows at most three guides ordered by `published_at DESC`, then `content_id DESC`. Content type, title, and summary link to `/contents/[contentKey]`; when no published relation exists, the entire section is omitted.

## Mobile UX and Accessibility

320–430px을 우선하며 연식은 줄바꿈 없는 horizontal navigation, 상품은 vertical list다. 현재 연식, section loading, Product link 이름, 이미지 alt와 native link/button semantics를 제공한다. 모든 시각 상태는 `SCREEN.md`의 semantic token과 Global Visual Standard를 따른다.
