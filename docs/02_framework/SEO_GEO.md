# SEO / GEO Standard

## Purpose

FitBike Customer-facing 공개 페이지가 Google, Naver 및 AI 기반 검색에서 접근하고 이해할 수 있는 실제 정보 페이지가 되도록 하는 전역 기준이다. 검색 노출이나 Rich Result는 보장하지 않는다.

## Production Domain and Canonical Policy

Production origin은 `https://fitbike.co.kr`이며 공통 site config에서 관리한다. Localhost나 preview domain을 canonical로 사용하지 않는다. Indexable detail은 현재 stable ID route에 self-referencing canonical을 둔다.

## Index / Noindex Policy

실제 공개 정보와 고유 URL이 있는 Main, Bike Selector, 활성 Model + Year Detail은 index/follow 대상이다. Admin/Login/API와 query 기반 임시 결과 화면은 index 대상이 아니다. 비활성 또는 존재하지 않는 entity는 404로 응답한다.

## Metadata Standard

공개 페이지는 visible content와 일치하는 고유 title과 description을 제공한다. Root는 `metadataBase`, title template, application name, Open Graph, Twitter, robots 기본값을 제공한다. 숨은 keyword, doorway copy, 존재하지 않는 규격이나 설명은 만들지 않는다.

## Dynamic Metadata and Model-Year SEO

각 활성 `bike_model_year_id`는 crawlable URL과 고유 metadata를 가진다. Title과 H1은 실제 Brand, Model, Year Range를 포함한다. Description은 실제로 존재하는 spec만 선택적으로 포함한다. 모델·연식·특징·변경·기본 부품 규격은 초기 server-rendered HTML에 포함하고 Product/Gallery만 deferred 처리한다. 연식 navigation은 실제 anchor URL을 사용한다.

## Sitemap Policy

Sitemap은 `/`, `/bike-selector`, `/tire-models/maxxis`, 활성 Model-Year URL을 포함한다. Model-Year는 실제 `updated_at`을 `lastModified`로 사용하며 요청 시각을 임의로 사용하지 않는다. 현재 규모에서는 단일 sitemap을 사용하고 존재하지 않거나 비활성인 ID를 생성하지 않는다.

## Robots Policy

Admin과 API는 robots에서 제외하되 robots를 보안 수단으로 간주하지 않는다. Googlebot, Yeti 및 일반 crawler가 공개 페이지와 static asset에 접근할 수 있어야 하며 production sitemap URL을 제공한다.

## Structured Data Policy

JSON-LD와 화면에 표시되는 실제 데이터만 사용한다. DB 문자열은 `<`를 Unicode escape해 serialize한다. Root는 Organization과 WebSite를 사용하고 Model-Year는 Motorcycle을 사용한다. BreadcrumbList는 실제 visible breadcrumb navigation이 구현된 경우에만 사용한다. Offer, price, availability, review, rating, sameAs는 검증된 visible data가 없으면 생성하지 않는다.

## Image SEO and Internal Linking

대표 이미지는 Brand/Model/Year 기반의 간결한 alt를 사용한다. Placeholder를 실제 모델 이미지로 표현하지 않는다. OG image에는 absolute public URL만 사용한다. Model-Year 연식 링크와 실제 활성 모델을 보여주는 Brand/Model directory card는 crawler가 탐색 가능한 내부 링크다. 실제 Brand/Model directory가 없으면 SEO용 빈 page를 만들지 않는다.

## SEO-critical SSR and Performance

Brand, Model, Year, model features, major changes와 기본 fitment spec은 server-rendered HTML에 포함한다. SEO를 이유로 모든 Product를 core payload에 넣지 않는다. 대표 이미지 비율 영역을 확보하고 하단 Product 영역은 deferred loading을 유지해 LCP, CLS와 JS 비용을 관리한다.

## Google, Naver and AI / GEO

Robots, sitemap, canonical과 semantic HTML을 일관되게 제공한다. AI 전용 schema, hidden content, fake FAQ, 자동 생성 설명, keyword stuffing을 만들지 않는다. GEO는 명확한 entity, 신뢰 가능한 DB 데이터, semantic heading, textual spec과 crawlable link를 기반으로 한다.

## Validation and Future Page Rule

공개 페이지 변경 시 metadata, canonical, robots, sitemap 포함 여부, HTTP status, heading, alt, JSON-LD syntax와 visible content 일치를 확인한다. 모든 신규 Customer-facing 공개 페이지는 구현 전에 이 문서를 확인하고 index 여부를 명시한다.
