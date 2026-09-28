# Analytics, Advertising and Consent

**Version:** v1.0  
**Status:** Baseline

## Purpose and Ownership

이 문서는 FitBike의 분석·광고 운영 계약을 정의한다. 이 영역은 GA4, Google Tag Manager,
Tracking Spec, Search Console 성과 분석, Google AdSense, CMP, Consent Mode와 관련
Production QA를 소유한다.

SEO의 metadata, canonical, JSON-LD, sitemap, SSR, 내부 링크 구현은
`docs/02_framework/SEO_GEO.md`와 02. 서비스 UI/UX·개발 영역이 소유한다. 이 문서는 검색
유입과 색인 성과를 측정하고 개선 우선순위를 도출하지만, 분석 결과만으로 SEO 구현 정책을
임의 변경하지 않는다.

## Current Production Integration

- Root layout은 Google Tag Manager container `GTM-MCBXG4GH`를 로드한다.
- GA4 Google tag와 Measurement ID는 GTM의 게시된 container version에서 관리한다. 코드나
  과거 대화를 기준으로 Measurement ID를 추정하지 않고 현재 게시 상태를 확인한다.
- Google AdSense publisher는 `ca-pub-4192027701878971`이며 root metadata와 AdSense script에
  동일하게 사용한다.
- Consent Mode 기본값은 EEA, 영국, 스위스 대상 region에서만 광고·분석 storage를 `denied`로
  설정한다. 한국 사용자를 대상으로 별도의 강제 거부 기본값이나 CMP 메시지를 만들지 않는다.
- 개인정보처리방침은 분석, 쿠키, 광고 및 해외 이용자 동의 범위를 실제 구현과 일치시킨다.

설치된 script가 있다는 사실만으로 수집 정상, 동의 정상 또는 광고 승인 상태를 의미하지 않는다.
GTM published version, network request, GA4/AdSense/CMP 관리 화면과 Production 동작을 함께 확인한다.

## Tracking Contract

이벤트 이름은 `snake_case`를 사용하고 동일 행동에 중복 이벤트를 만들지 않는다. 이벤트와
parameter는 사용자를 직접 식별할 수 있는 이름, 전화번호, 이메일, 주소, 검색 자유문 또는 기타
민감정보를 전송하지 않는다. 내부 DB row 전체나 화면 문구를 payload로 보내지 않고 분석에 필요한
안정적인 key만 사용한다.

현재 기준 이벤트 계약은 다음과 같다.

| Event | Trigger | Required parameters |
| --- | --- | --- |
| `bike_selector_start` | 사용자가 내 바이크 찾기 Flow를 시작 | `source` |
| `brand_select` | 브랜드 선택 완료 | `brand_key`, `brand_name` |
| `model_select` | 모델 선택 완료 | `brand_key`, `model_key`, `model_name` |
| `year_select` | 연식 선택 완료 | `model_key`, `year` |
| `model_detail_view` | 유효한 모델·연식 상세 도달 | `model_key`, `year` |
| `part_select` | 타이어·배터리·브레이크 영역 선택 | `part_type` |
| `product_view` | 활성 상품 상세 조회 | `product_type`, `product_id`, `brand` |
| `purchase_link_click` | 외부 판매처 CTA 실행 | `product_id`, `destination` |
| `content_view` | 공개 콘텐츠 상세 조회 | `content_key`, `category` |
| `content_cta_click` | 콘텐츠에서 다음 행동 CTA 실행 | CTA 목적을 나타내는 승인된 parameter |

`content_cta_click`의 구체 parameter 이름과 허용값은 구현 Task에서 Tracking Spec으로 확정한 뒤
코드와 이 문서를 함께 갱신한다. 확정 전 임의의 이름이나 자유문 값을 Production에 추가하지 않는다.

다음 규칙을 적용한다.

- 한 사용자 행동에 GTM click trigger와 application event가 동시에 발화하지 않게 한다.
- Page View와 SPA route change의 중복 수집 여부를 확인한다.
- View event는 잘못된 ID, loading, error 또는 404 상태에서 발화하지 않는다.
- 외부 구매 event는 실제 외부 이동 직전에 한 번만 발화한다.
- parameter 추가·이름 변경·타입 변경은 Tracking Spec 변경이며 관련 report와 consumer 영향을 확인한다.
- GA4 conversion 지정은 event 구현과 별도 운영 결정으로 관리한다.

## Funnel and Reporting

핵심 분석 Funnel은 다음과 같다.

1. Home 또는 Content의 `bike_selector_start`
2. `brand_select`
3. `model_select`
4. `year_select`
5. `model_detail_view`
6. `part_select`
7. `product_view`
8. `purchase_link_click`

콘텐츠 Flow는 `content_view`에서 시작하여 `content_cta_click`, Bike Selector, Model Detail,
Product Detail 또는 정비소 이동으로 이어지는 경로를 본다. 데이터가 적은 초기 단계에서는 작은
표본의 비율 변화를 확정적 결론으로 표현하지 않는다.

보고는 최소한 기간, 비교 기간, 사용자/세션 또는 event 기준, 포함·제외 조건, 주요 변화와 가능한
원인, 확인이 더 필요한 항목을 명시한다. 데이터가 없는 것과 실제 발생이 0인 것을 구분한다.

## Search Console Boundary

Search Console 작업은 query, page, country, device, click, impression, CTR, average position과
indexing/sitemap 상태를 확인한다. Google과 Naver의 수집, 색인, 노출, 클릭 단계를 구분하고
`site:` 검색 결과만으로 전체 색인 상태를 단정하지 않는다.

분석 결과 SEO 구현 수정이 필요하면 02 Work에 다음 정보를 전달한다.

- 영향받는 실제 URL과 query
- 현재 click/impression/CTR/position 및 비교 기간
- 수집·색인·랭킹 중 확인된 문제 단계
- metadata, canonical, SSR, 내부 링크 등 확인할 구현 지점
- 변경 후 측정 기간과 성공 기준

색인 요청, sitemap 제출과 Search Console 상태 확인은 운영 업무다. 구현만으로 색인 또는 상위 노출을
보장한다고 보고하지 않는다.

## AdSense Policy

FitBike는 정보 탐색을 방해하지 않는 범위에서 광고를 운영한다. 광고가 Fitment 결과, 공식 정보,
상품 추천 또는 FitBike 자체 CTA처럼 보이게 만들지 않는다.

자동 광고 제외 대상은 다음과 같다.

- `/`
- `/bike-selector`
- `/shops`
- `/about`
- `/privacy`
- `/terms`
- `/contact`

현재 수익화 대상은 다음 공개 정보 영역으로 제한한다.

- `/contents/*`
- `/model-detail/*`

새로운 URL 체계나 화면을 수익화 대상에 추가하는 것은 자동 승계하지 않는다. 광고 정책과 UX 영향을
검토하고 명시적으로 확정한다. 제외 URL과 수익화 URL은 AdSense 관리 화면의 현재 설정과 실제
Production 노출을 함께 확인한다.

광고는 핵심 CTA, 표, 규격, 경고, 모델 선택, 구매 CTA와 시각적으로 혼동되거나 이를 가리지 않아야
한다. 모바일에서 CLS, 스크롤 방해, accidental click 위험과 Core Web Vitals 영향을 확인한다.

## CMP and Consent Mode

Google CMP는 EEA, 영국, 스위스 대상 메시지만 활성화한다. 한국 전용 CMP 메시지는 만들지 않는다.
동의 메시지는 다음 선택지를 제공한다.

- 동의하지 않음
- 동의
- 옵션 관리

대상 지역의 최초 진입에서는 `ad_storage`, `ad_user_data`, `ad_personalization`,
`analytics_storage`의 기본 `denied`가 태그보다 먼저 적용되어야 한다. 사용자가 선택하면 CMP가
해당 consent state를 업데이트한다. 자체 UI로 Google CMP 선택을 흉내 내거나 동의를 미리 부여하지
않는다.

CMP/Consent QA는 다음을 구분한다.

- 대상 지역 최초 진입의 default denied
- 동의 후 granted update
- 거부 유지
- 옵션별 선택 반영
- 재방문 시 선택 유지 및 변경 경로
- GTM, GA4, AdSense와 Consent Mode의 중복·충돌

지역 검증 환경을 확보하지 못했으면 PASS로 보고하지 않고 `UNVERIFIED`와 원인을 기록한다.

## Validation

### Analytics

- Production HTML의 GTM script와 noscript
- GTM published container/version
- Network의 `collect` 또는 `g/collect`
- GA4 Realtime event와 parameter
- 중복 event와 잘못된 route 발화
- DebugView는 진단 수단이며 필수 성공 조건은 아니다.

### Advertising

- AdSense publisher metadata, script와 `ads.txt`
- AdSense 승인·정책 상태
- 제외 URL에서 광고가 노출되지 않음
- 허용 URL에서만 의도한 광고 동작
- 모바일 layout, CLS와 핵심 CTA 간섭 없음

### Consent

- region별 default state
- CMP 메시지와 3개 선택지
- 선택 전후 consent update
- 분석·광고 request가 동의 상태를 준수
- 개인정보처리방침과 실제 동작 일치

### Search Performance

- Search Console property와 Production domain
- sitemap 제출/처리 상태
- query/page 단위 성과와 비교 기간
- 수집·색인·노출·클릭 단계 구분
- 수정 후 재측정 기준

## Change and Documentation Rules

- 이벤트 계약 변경은 이 문서와 구현을 함께 갱신한다.
- 전역 SEO 구현 정책은 `SEO_GEO.md`에서 관리하고 여기에 중복 정의하지 않는다.
- 광고/CMP 화면 변경이 고객 UI 전역에 영향을 주면 `SCREEN.md`도 함께 검토한다.
- 개인정보·쿠키·외부 처리 내용이 바뀌면 `/privacy`와 실제 동작을 함께 갱신한다.
- GTM/GA4/AdSense/CMP Dashboard 설정만 변경한 경우 설정값, 게시 시각, 검증 결과를 Task 기록에 남긴다.
- ID, 승인 상태, 이벤트 수집 상태, 광고 노출 상태를 과거 대화만으로 추정하지 않는다.

