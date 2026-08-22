# Service Module --- Tire Model Image Standard

**Version:** v1.0
**Status:** MA-RS Reference Model approved

## Purpose

타이어 모델 상세의 세 이미지 slot을 실제 제품, 검증된 특징, 사용 맥락으로
분리한다. MA-RS를 첫 reference model로 사용하되, 같은 layout을 복제하고 모델별
사실을 복제하지 않는다. 이미지 제작은 FitBike의 정보 우선, 불확실성 보존,
fitment 정확성 원칙을 따른다.

이 문서는 제작 기준과 MA-RS Reference Model 명세를 정의한다. 개별 모델의 이미지
생성, Storage upload, DB update 또는 Production 변경은 각 작업의 명시적 승인을
별도로 받아야 한다.

## Source hierarchy

제품 이미지 source 탐색은 다음 순서로 진행한다.

1. `assets-source/tire-models/{brand}/original/`의 사용자 관리 original inventory
2. Local Quality Gate를 통과하지 못한 경우 별도 승인된 제조사 공식 asset search
3. 추가 공식 source 확보 또는 별도 촬영

Local Quality Gate에서는 filename, format, native dimensions, file size, aspect
ratio, 실제 제품 identity, 기존 source와의 동일성 및 실제 detail 개선 여부를
확인한다. 파일 용량이나 다른 filename만으로 신규 고품질 source로 판단하지 않는다.
Gate가 실패하면 기존 저해상도 source를 다시 확대해 새 candidate를 만들거나 같은
실행에서 자동으로 외부 검색을 이어가지 않는다.

별도 승인된 official source search에서는 Product Page HTML의 `img src`, `srcset`,
`picture/source`, gallery, CDN path, download/media asset과 thumbnail/large variant를
확인한다. 검색 결과나 cache URL은 discovery에만 사용하고 최종 `source_url`과
`image_url`은 MAXXIS 공식 운영 사이트 또는 검증된 공식 distributor asset이어야
한다. 확보한 원본은 resize, crop, 배경 제거, 색상 보정 또는 format 변환 없이
original 폴더에 저장한 뒤 Registry와 Local Quality Gate를 다시 통과한다.

이미지에 표현할 사실은 다음 순서로 확인한다.

1. 제조사 공식 제품 자료와 실제 제품 사진
2. 현재 Supabase의 `11_tire_model` 및 연결된 `04_tire_product` 값
3. 승인된 FitBike 콘텐츠

DB에 문구가 있어도 공식 근거가 연결되지 않은 compound, belt, 내부 구조, 성능
주장은 기술 시각화의 근거로 사용하지 않는다. 확인되지 않은 내용은 이미지에서
제외하고 `REVIEW_REQUIRED`로 둔다.

## Source rights policy

제품 identity 확인과 Production 사용 권리는 별개다. Main과 제품이 등장하는
Sub 01은 다음 Rights Gate를 통과해야 한다.

| Priority | Source | Production use |
|---|---|---|
| Level 1 | 사용자가 제공하고 사용 권한을 확인한 이미지 | 허용 |
| Level 2 | 제조사·수입사·유통사의 명시적 사용 승인 이미지 | 허용 |
| Level 3 | 재사용 조건이 Production 사용을 명시한 공식 asset | 허용 |
| Level 4 | 공식 source이나 사용 조건이 불명확한 이미지 | Reference only |
| Level 5 | 쇼핑몰·블로그·커뮤니티 등 제3자 이미지 | Reference only |

Usage status는 `RIGHTS_CLEARED`, `USER_OWNED`, `OFFICIAL_APPROVED`,
`REFERENCE_ONLY`, `USAGE_UNCLEAR`, `DO_NOT_USE`로 관리한다. 앞의 세 상태만
근거가 registry에 기록됐을 때 Production 사용을 허용한다. 기존 Production asset,
공식 사이트 게재, 로컬 파일 보유 또는 과거 업로드 성공만으로 권리를 확인하지
않는다. 근거가 없으면 `USAGE_UNCLEAR`로 차단한다.

과거 자산 inventory에는 조사 결과 `RIGHTS_UNKNOWN`을 사용할 수 있으며 신규
Production Gate에서는 `USAGE_UNCLEAR`와 동일하게 차단한다. Source와 권리 근거는
`scripts/tire-assets/tire-image-source-registry.csv`에서 asset 단위로 관리한다.
CSV는 현재 최소 운영 형식이며 DB schema가 아니다.

Quality Gate를 통과한 하나의 product source는 승인 범위 안에서 Main과 Sub 01에
공통 사용한다. Main 정확도와 source 품질을 우선하며, 별도 이미지를 억지로 섞거나
Sub 01용 제품을 생성형으로 다시 만들지 않는다. Sub 02는 Usage Specification 기반
별도 pipeline과 Human Review Gate를 유지한다.

2026-08-21 사용자 확인에 따라 MAXXIS 본사 공식 웹사이트, 공식 catalogue 및
공식 media asset은 FitBike 운영상 `OFFICIAL_APPROVED`로 관리한다. 현지 공식
distributor asset은 본사 asset과 동일함을 확인했거나, 출처·소유자·사용 범위가
registry에 기록된 상태에서 사용자가 해당 asset을 명시적으로 승인한 경우 이 승인
범위를 적용한다. 어느 조건도 충족하지 않은 distributor asset과 제3자 이미지는
기존 gate를 유지한다.

## Image roles

| Slot | 답해야 하는 질문 | 콘텐츠 | Canvas |
|---|---|---|---|
| `main_image_url` | 이 제품은 어떻게 생겼는가? | 실제 제품 대표 이미지 | 1200×1200 |
| `sub_image_url_1` | 주요 특징은 무엇인가? | Product / Feature visual | 1200×900 |
| `sub_image_url_2` | 어떤 주행에 사용하는가? | Riding / Usage visual | 1200×900 |

세 slot은 같은 제품 사진을 반복하지 않는다. Main은 identity, Sub 01은 검증된
feature, Sub 02는 검증된 usage context를 담당한다.

## Main standard

- 실제 해당 모델 제품 사진만 사용한다. 생성형 모델이나 유사 제품 대체는 금지한다.
- 제품의 tread, sidewall, profile, 비율을 변경하지 않는다.
- 허용 편집은 배경 정리, canvas 정렬, 비파괴적 밝기·색·선명도 보정, scale과
  여백 조정, WebP 최적화다.
- crop, upscale, 형태 생성, 배경 장면 생성, 로고 재현, 기술 요소 추가는 금지한다.
- 텍스트, badge, 성능 claim, 별도 브랜드 로고를 넣지 않는다.
- 1:1 `object-fit: contain` Hero에서 제품 전체가 보여야 한다.

## Sub 01 standard

- 실제 제품 외형과 검증된 DB/제조사 정보를 사용한 Product / Feature visual이다.
- 우선 후보는 tread 외형, front/rear 구성, profile, 실제 SKU 구성, 검증된 사용
  성격이다.
- 내부 layer, compound 단면, belt 구조, 열·접지압·배수 simulation, 마찰 계수,
  성능 graph, 제동거리, 수명 또는 경쟁 제품 비교는 공식 자료 없이 표현하지 않는다.
- 제품이 등장하면 실제 제품 사진을 합성 기반으로 사용한다. 생성형 제품을 실제
  모델처럼 크게 노출하지 않는다.
- Headline은 하나, supporting text는 한두 줄로 제한한다. 핵심 정보는 이미지에만
  두지 않고 상세페이지 HTML text에도 존재해야 한다.

## Sub 02 standard

- 모델의 검증된 riding/usage context를 보여주는 장면이다. 성능을 증명하는 장면이
  아니다.
- 환경과 motorcycle은 생성할 수 있지만, 생성형 tire를 실제 제품처럼 식별 가능하게
  강조하지 않는다.
- 레이싱 전용, 서킷 전용, 빗길, 최고속, 극한 코너링, 최고 접지력 같은 표현은
  근거가 있을 때만 사용하며 근거 범위를 확대하지 않는다.
- 위험한 주행, 공도 과속, 경쟁 우위 또는 수치 성능을 암시하지 않는다.
- Headline은 선택 사항이고 supporting text는 한 줄을 기본으로 한다.
- Reference Model의 기본 구도는 subject를 우측 또는 중앙 우측에 두고 좌측·좌측
  상단에 HTML editorial copy용 negative space를 확보한다. 텍스트는 기본적으로
  이미지에 삽입하지 않는다.
- 이 구도를 모든 모델에 강제하지 않는다. Track, Sport Road, Touring, Adventure,
  Off-road, Scooter, Urban 등 검증된 모델 성격에 따라 환경과 subject 위치를
  조정하되 product close-up 없이 usage context가 먼저 읽혀야 한다.

## Generative image policy

### Product-containing visuals

실제 제품 사진을 reference로 포함하지 못하면 제품 생성 작업을 시작하지 않는다.
reference가 있어도 tread, sidewall lettering, profile, front/rear shape를 보존한다.
생성 결과는 실제 사진과 나란히 비교해 사람이 승인해야 한다.

### Usage visuals

환경·motorcycle·라이더는 생성할 수 있다. 브랜드 로고나 특정 tire의 sidewall을
생성하지 않으며, tire는 작게 또는 비식별 상태로 둔다. 장면은 모델의 검증된 사용
범위를 전달할 뿐 성능 증거로 보이면 안 된다.

## Visual standard

### Canvas and composition

| Rule | Main | Sub 01 / Sub 02 |
|---|---|---|
| Canvas | 1200×1200 | 1200×900 |
| Ratio | 1:1 | 4:3 |
| Safe area | 각 변 72px 이상 | 각 변 72px 이상 |
| Background | white 또는 light neutral | white/light neutral 또는 절제된 실제 맥락 |
| Product scale | canvas의 약 72~82%, 전체 제품 유지 | 실제 제품 사용 시 약 45~65% |
| Object fit | contain | contain |
| Border | 이미지 내부 border 없음 | 이미지 내부 border 없음 |
| Logo | 별도 삽입 없음 | 별도 삽입 없음 |

제품마다 원본 구도가 다르므로 scale 수치는 강제 crop 기준이 아니라 visual balance
범위다. 원본 제품 전체 노출과 형태 보존이 우선한다.

### Typography

- Main: 텍스트 없음.
- Sub headline: 48px, 700 weight, 최대 두 줄.
- Sub supporting text: 28~30px, 400~500 weight, 최대 두 줄.
- 텍스트 영역은 canvas 너비의 약 38% 이내, safe area 내부에 둔다.
- 검정/near-black text와 충분한 contrast를 사용하며 작은 각주를 넣지 않는다.
- 이미지 텍스트는 보조 정보다. DB/HTML 콘텐츠를 대체하지 않는다.

## File naming and storage

```text
tire-assets/
└─ tire-models/{brand}/{tire_model_key}/
   ├─ main.webp
   ├─ sub-01.webp
   └─ sub-02.webp
```

DB mapping:

| File | `11_tire_model` column |
|---|---|
| `main.webp` | `main_image_url` |
| `sub-01.webp` | `sub_image_url_1` |
| `sub-02.webp` | `sub_image_url_2` |

DB에는 전체 public URL이 아니라 `tire-models/...` object path를 저장한다.

## Current UI contract

- Hero에서 Main을 1:1 container와 `object-fit: contain`으로 표시한다.
- Sub 01/02는 4:3 container와 `object-fit: contain`으로 표시한다.
- 표시 순서는 Hero → SKU → Features → Sub 01 → Tire Size Guide → Sub 02다.
- Sub URL이 없거나 load가 실패하면 해당 section을 숨긴다. Main은 공통 fallback을
  사용한다.
- 모바일 page gutter는 16px이며 Sub container에도 contain padding이 적용된다.

현재 UI는 세 slot의 ratio와 fallback을 지원한다. 다만 Sub 이미지의 headline 및
supporting text가 이미지 내부에만 있으면 별도 HTML 설명이 생기지 않으므로,
접근성·SEO에 필요한 핵심 문구는 기존 Summary/Description/Features와 일치시켜야
한다. 이번 분석에서는 UI 변경을 제안하지 않는다.

## MA-RS verified data snapshot

조회 기준일: 2026-08-21

### Tire model

| Field | Value |
|---|---|
| `tire_model_id` | `1` |
| `tire_model_key` | `MAXXIS_MA_RS` |
| `brand_name` | `맥시스` |
| `model_name` | `MA-RS` |
| `display_name` | `MA-RS (SLICK)` |
| `category_type` | `NULL` |
| `riding_type` | `NULL` |
| `is_active` | `true` |
| `created_at` | `2026-08-19 11:29:25.745348+00` |
| `updated_at` | `2026-08-19 11:41:20.640427+00` |
| `main_image_url` | `NULL` |
| `sub_image_url_1` | `NULL` |
| `sub_image_url_2` | `NULL` |

Current content:

| Field | Value |
|---|---|
| Summary | 서킷 주행을 위한 고그립 레이스 슬릭 타이어 |
| Description | 트랙 주행에 특화된 슬릭 레이스 타이어. 고그립 레이싱 컴파운드와 강화된 타이어 구조로 정밀한 핸들링과 코너링 안정성 확보. 타이어 워머 사용 권장, 트랙 전용. |
| Feature 1 | 트랙 전용 슬릭 / 트랙 주행을 위해 설계된 슬릭 타이어. 높은 접지력과 핸들링, 코너링 안정성에 초점을 둔 설계. |
| Feature 2 | 레이싱 컴파운드 / Super Racing Compound 카본 소재 적용. 타이어와 트랙의 접촉 성능 강화. |
| Feature 3 | 정밀한 코너링 / Mono-Spiral Steel Breaker 구조 적용. 타이어 강성을 높여 정밀한 코너링과 안정적인 핸들링 지원. |

### SKU snapshot

모든 연결 SKU는 active, 17inch, TL이다. FRONT 2개, REAR 3개, BOTH 0개다.

| Position | Size | Load/Speed | Price |
|---|---|---|---:|
| FRONT | 100/70R17 M/C 49H TL | 49H | 170,000 |
| FRONT | 110/70R17 M/C 54H TL | 54H | 180,000 |
| REAR | 120/70R17 M/C 58W TL | 58W | 200,000 |
| REAR | 140/70R17 M/C 66H TL | 66H | 210,000 |
| REAR | 150/60R17 M/C 66H TL | 66H | 220,000 |

`120/70R17`도 현재 DB에서는 `REAR`다. 이미지나 문구가 일반적 size 관행을 근거로
이를 FRONT로 재분류해서는 안 된다.

## MA-RS content review

### Official evidence reviewed (2026-08-21)

- MAXXIS Taiwan `2025-2026 MOTORCYCLE CATALOGUE`: MA-RS를 `SUPERMAXX RACE
  SLICK`과 Competition/Track 용도로 분류하고, 트랙 설계, 접지, 밸런스,
  핸들링 및 코너링 안정성 문구와 DB의 5개 규격을 확인했다.
- MAXXIS Malaysia 제품 페이지: 위 제품 성격과 규격 외에 Super Racing
  Compound의 carbon material, Mono-Spiral Steel Breaker, tire warmer 권장 및
  `Track Use Only` 문구를 확인했다. 이 페이지는 현지 공식 유통사 자료로
  분류하며 제조사 카탈로그보다 보조적인 근거로 사용한다.
- 공식 페이지에 게시된 제품 컷과 기술 이미지는 MA-RS 식별 근거로 사용할 수
  있으나 별도의 재사용 허가를 확인하지 못했으므로 `USAGE_UNCLEAR` 및
  `REFERENCE_ONLY`로 관리한다. 공식 사이트 게재 사실만으로 제작 권리를
  추정하지 않는다.

### Assessment

- Summary의 `고그립`은 공식 카탈로그와 현지 공식 제품 페이지에서 확인된다.
- Description은 Summary와 중복되고 compound, 구조, handling, warmer 권장을 한
  문단에 결합한다.
- Feature 2/3의 compound와 breaker 설명은 현지 공식 제품 페이지에서 확인된다.
  다만 원본 기술 이미지를 사용할 권리는 확인되지 않았고, 생성형 단면으로
  재현하면 실제 구조로 오인될 위험이 있으므로 이미지 제작 근거와 권리는 별개로
  심사한다.
- `category_type`과 `riding_type`은 NULL이다. Usage scene은 이 두 필드를 추정해
  만들지 않고 현재 명시된 track/slick 콘텐츠와 SKU name 범위만 사용한다.

### Suggested content (DB update not approved)

공식 제품 자료의 의미와 범위를 보존한 제안:

- Summary: `서킷 주행용 고그립 레이스 슬릭 타이어`
- Description: `트랙 주행에 맞춰 설계된 레이스 슬릭 타이어입니다. Super Racing Compound와 Mono-Spiral Steel Breaker 설계로 접지, 코너링 및 핸들링을 지원하며 제조사 자료는 타이어 워머 사용을 권장하고 Track Use Only로 안내합니다.`
- Feature 1: `트랙 설계 레이스 슬릭` / `접지와 밸런스, 핸들링 및 코너링 안정성을 고려한 트랙용 슬릭 모델입니다.`
- Feature 2: `Super Racing Compound` / `카본 소재를 적용한 레이싱 컴파운드로 트랙 접촉 성능을 지원합니다.`
- Feature 3: `Mono-Spiral Steel Breaker` / `타이어 강성과 정밀한 코너링, 핸들링 안정성을 지원하는 구조입니다.`

위 문구는 콘텐츠 제안일 뿐이며 이번 작업에서는 DB를 변경하지 않는다. `Track Use
Only`와 워머 문구는 현지 공식 제품 페이지 근거임을 유지한다.

## MA-RS image production specification

### MAIN

```text
Purpose: 실제 MA-RS 제품 외형을 정확히 보여주는 대표 이미지
Source: 사용 승인된 MAXXIS 공식 유통사 MA-RS 제품 합성 사진
Composition: 제품 전체를 중앙 또는 약간 좌측에 배치, 1:1 canvas, 충분한 외곽 여백
Background: white 또는 light neutral 단색
Product position: 전체 제품이 safe area 안에 들어오며 긴 변 기준 약 78%
Text: 없음
Allowed editing: 배경 정리, 정렬, scale, 노출/화이트밸런스/선명도 보정, WebP 변환
Forbidden editing: tread/sidewall/profile 생성·변형, crop, upscale, 로고 재생성
Target filename: main.webp
```

승인된 하나의 제품 source를 Main과 Sub 01에 공통 사용한다. 제품을 분리하거나
재구성하지 않고 원본의 front/rear 합성 구조를 유지한다. MA-RS V2는 사용자 시각
검토와 Production QA를 통과한 첫 Reference Model이다.

### SUB 01

```text
Purpose: MA-RS의 슬릭 성격과 실제 전·후륜 SKU 구성을 빠르게 설명
Feature: SLICK 표기, 17inch, DB 기준 FRONT 2종 / REAR 3종, 모두 TL
Headline: 트랙을 위한 슬릭 구성
Supporting text: 17인치 전륜 2종 · 후륜 3종의 튜브리스 SKU
Visual concept: 실제 MA-RS 제품 사진을 사용한 절제된 front/rear product composition과 간단한 구성 label
Product usage: 실제 사진만 사용하고 tread 및 profile 유지
Background: light neutral, 정보 영역과 제품 영역을 명확히 분리
Forbidden representation: compound 단면, belt/layer, 접지압·열·마찰 simulation, 성능 graph
Target filename: sub-01.webp
```

`120/70R17`은 DB에 따라 REAR에 둔다. 제조사 확인 없이 위치를 바꾸지 않는다.

Rights-cleared Main source는 승인 범위 안에서 동일 source를 Sub 01에도 사용한다.
Layout은 1200×900, 72px safe area, 제품 영역 우측 52~58%, 제품
긴 변 기준 canvas의 48~58%, 텍스트 영역 좌측 34~40%를 기본값으로 한다. Headline
48px/최대 2줄, supporting 28~30px/최대 2줄로 한다. 전·후륜 SKU 수는 supporting
text에 두고 chip은 최대 3개를 기본으로 한다. MA-RS는 Product Type, Size Attribute,
Tube Attribute를 나타내는 `SLICK`, `17 INCH`, `TUBELESS`를 사용한다. Supporting의
17인치와 chip의 `17 INCH`는 각각 SKU 구성과 제품 속성을 담당하므로 함께 사용할 수
있다. 핵심 제품과 문구는
중앙 80% 영역에 유지해 모바일 contain 표시에서도 식별 가능해야 한다.

### SUB 02

```text
Purpose: MA-RS의 현재 콘텐츠가 명시하는 track-only usage context 전달
Riding context: 폐쇄된 서킷의 통제된 트랙 주행
Scene: 코너 진입 전 또는 안정적인 주행 자세의 wide/medium shot
Motorcycle type: 무브랜드 스포츠 모터사이클
Road/environment: dry closed circuit, barrier와 runoff가 보이는 일반적 track 환경
Headline: 서킷 주행을 위한 선택
Supporting text: 트랙 사용 맥락을 보여주는 레이스 슬릭 모델
Forbidden representation: 공도 주행, 극한 lean, 최고속, 충돌 위험, 빗길 우위, 생성형 MA-RS close-up
Target filename: sub-02.webp
```

Sub 02는 사용 맥락이며 접지력이나 lap performance의 증거처럼 연출하지 않는다.

## Prompt drafts

다음 prompt는 권리 및 제작 승인 후 사용한다. Sub 02 생성 지시는 이번 Task의
review candidate에 적용했다.

### Main editing instruction

```text
Use only the supplied, verified MAXXIS MA-RS product photograph. Preserve every
visible tread/slick surface, sidewall marking, tire profile, proportion, and
product edge exactly. Remove only the existing background and place the entire
product on a clean white-to-light-neutral 1200x1200 canvas with at least 72px
safe margin. Make small non-destructive exposure, white-balance, and sharpness
corrections. Do not crop, upscale, reshape, reconstruct, add tread, recreate
logos, invent sidewall text, add shadows that change the silhouette, or add
marketing text. Output is a faithful product cutout, not a redesigned tire.
```

### Sub 01 generation/edit instruction

```text
Create a 1200x900 product-feature layout using only supplied verified MAXXIS
MA-RS product photographs. Preserve product tread/slick surface, sidewall,
profile, and proportions exactly. Use a light-neutral background and a clear
product area plus one restrained text area. Headline: "트랙을 위한 슬릭 구성".
Supporting text: "17인치 전륜 2종 · 후륜 3종의 튜브리스 SKU". Represent the
configuration as labels, not as an engineering diagram. Do not depict internal
layers, compound sections, belt construction, pressure, heat, drainage,
friction, braking distance, lifespan, performance graphs, or competitor
comparisons. Treat 120/70R17 as REAR according to the supplied DB data.
```

### Sub 02 generation instruction

```text
Create a realistic 1200x900 riding-context image of an unbranded sport
motorcycle on a dry, closed racing circuit in a controlled, non-extreme riding
moment. Use a wide or medium composition where the environment communicates
track use. Keep tires small and non-identifiable; do not generate a close-up
tire and do not imply that a generated tread or sidewall is the real MAXXIS
MA-RS. No public road, rain-performance claim, top-speed cue, extreme lean,
lap-time claim, race victory, brand logo, or technical overlay. Optional
headline: "서킷 주행을 위한 선택". Supporting text: "트랙 사용 맥락을 보여주는
레이스 슬릭 모델".
```

## Active 22-model image status

DB field 기준 상태다. Storage에 DB와 연결되지 않은 object가 있는지 여부는 별도
검증 대상이며, MA-RS prefix에는 현재 object가 없다.

| tire_model_key | model_name | main | sub01 | sub02 | required |
|---|---|---|---|---|---:|
| MAXXIS_M186 | M186 | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_M6017 | M6017 | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_M6024 | M6024 | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_M6029 | M6029 | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_M6135 | M6135 | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_M6233 | M6233 | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_M6234 | M6234 | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_M6240 | M6240 | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_MA_ADV | MA-ADV | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_MA_AT | MA-AT | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_MA_CT1 | MA-CT1 | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_MA_HS | MA-HS | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_MA_MT | MA-MT | MISSING | MISSING | MISSING | 3 |
| MAXXIS_MA_PRO | MA-PRO | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_MA_R1 | MA-R1 | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_MA_RACE | MA-RACE | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_MA_RS | MA-RS | MISSING | MISSING | MISSING | 3 |
| MAXXIS_MA_SC | MA-SC | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_MA_SP | MA-SP | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_MA_ST2 | MA-ST2 | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_MA_ST3 | MA-ST3 | EXISTS | MISSING | MISSING | 2 |
| MAXXIS_S98 | S98 | EXISTS | MISSING | MISSING | 2 |

Workload:

```text
Active models: 22
Existing main: 20
Missing main: 2
Existing sub01: 0
Missing sub01: 22
Existing sub02: 0
Missing sub02: 22
Total new images required: 46
```

## 22-model expansion rule

- 공통: canvas, safe area, typography, filename, Storage path, DB mapping, QA.
- 모델별: verified product source, feature headline/support, SKU configuration, usage
  context, product placement balance.
- 한 모델의 feature나 scene을 다른 모델에 복제하지 않는다.
- 각 모델은 `11_tire_model` 콘텐츠와 연결 SKU를 다시 조회하고 공식 product source를
  확인한 뒤 production spec을 승인받는다.
- `category_type`/`riding_type` NULL을 장면 생성으로 보완하지 않는다.

## 22-model source strategy

Registry 결과에 따라 다음 그룹으로 운영한다.

- Group A: 권리 근거가 기록된 기존 Main source. Main 재편집과 Sub 01 재사용 후보로
  진행할 수 있으나 asset별 시각 검수는 유지한다.
- Group B: Production Main과 local source는 있으나 권리 근거가 없다. 현재 20개
  MAXXIS Main이 여기에 해당하며 운영 중인 Main을 자동 삭제하지는 않지만 신규
  파생 제작과 Sub 01 재사용은 차단한다.
- Group C: 제품 source 자체가 없거나 공식 reference만 있고 권리가 불명확하다.
  MA-MT와 MA-RS Main이 해당하며 사용자 보유 source, 공급사 승인 asset 또는 별도
  촬영 source를 확보해야 한다.
- Group D: 제품을 식별 가능하게 표현하지 않는 Usage Visual. 검증된 usage spec을
  바탕으로 생성 후보를 만들 수 있지만 asset 권리 검토와 Human Visual Review 및
  Production Approval은 별도로 통과한다.

MA-RS Main source 확보 우선순위는 (1) 사용 권한이 확인된 사용자 보유 이미지,
(2) MAXXIS 공급사·유통사의 명시적 승인 asset, (3) 제조사 media asset의 사용 조건
확인, (4) 별도 제품 촬영이다. 1번은 가장 빠르고 비용이 낮지만 모델별 보유 여부에
좌우되고, 2·3번은 22-model 확장성이 높지만 승인 범위와 응답 시간이 변수다. 4번은
권리 통제가 가장 명확하지만 촬영·제품 확보 비용이 가장 크다. 공식 이미지를
reference로만 사용한 생성형 제품 대체는 선택지가 아니다.

## Automation boundary

### AUTO

- source file 존재, checksum, format, dimensions, alpha/background 후보 상태 inventory
- registry 필수 필드와 허용 status 검증
- DB/Storage image status inventory
- approved folder and filename creation
- canvas/format validation and WebP optimization
- approved Storage upload path generation
- object existence, MIME, dimensions and HTTP verification
- guarded DB path update and read-back verification

### REVIEW_REQUIRED

- source 소유자, 제공 경로, 승인 범위와 증빙 검토
- product source provenance
- current Summary/Description/Feature accuracy
- feature selection and headline/supporting copy
- usage scene and motorcycle/environment choice
- front/rear labels when source data is unusual
- image text readability and role separation

### MANUAL

- Rights Gate 최종 승인 및 예외 판단
- actual product versus image comparison
- tread, sidewall, profile and proportion inspection
- generated scene technical-fact and safety review
- claim substantiation review
- mobile and desktop visual QA
- final approval before Storage/DB mutation

## QA checklist

### Product fidelity

- [ ] 실제 제품 source와 일치한다.
- [ ] tread/slick surface 왜곡이 없다.
- [ ] sidewall과 lettering 왜곡·생성이 없다.
- [ ] profile과 제품 비율이 정상이다.
- [ ] crop 또는 불필요한 upscale이 없다.

### Content integrity

- [ ] 검증되지 않은 기술 구조나 성능 표현이 없다.
- [ ] 과장·비교·수치 claim이 없다.
- [ ] SKU position과 size가 실제 DB와 일치한다.
- [ ] Main/Sub 01/Sub 02 역할이 중복되지 않는다.
- [ ] 핵심 정보가 HTML content에도 존재한다.

### Visual and delivery

- [x] Main은 1200×1200, Sub는 1200×900이다.
- [x] 모바일과 desktop에서 text와 제품이 safe area 안에 있다.
- [x] WebP format과 파일 크기를 검증했다.
- [x] filename과 Storage path가 표준에 맞는다.
- [x] DB에는 object path만 저장했다.
- [x] Next Image가 올바른 `tire-assets` URL을 사용한다.
- [x] 원본과 optimized URL에 404/403이 없다.

## MA-RS approval gates and next step

1. 현재 콘텐츠의 제조사 근거 확인 및 수정안 승인
2. 실제 MA-RS product source 확보와 권리 확인
3. MA-RS production specification 승인
4. Main 제작 및 실제 제품 대조
5. Sub 01 제작 및 feature/SKU 검수
6. Sub 02 제작 및 usage/safety 검수
7. 모바일/desktop visual QA
8. WebP와 dimensions 검증
9. 별도 승인 후 Storage upload
10. 별도 승인 후 DB path update 및 Production QA
11. MA-RS 결과 승인 후 22-model rollout

MA-RS는 2026-08-23 모든 gate를 통과해 `REFERENCE_MODEL_APPROVED`로 확정됐다.
Main/Sub 01/Sub 02의 Storage object와 DB path, 공개 URL, Next Image Optimizer,
390×844 모바일 및 1440px desktop 표시를 검증했다. 22-model rollout 기준은
`READY`이나 다른 21개 모델 실행은 별도 승인 작업에서 시작한다.

Rights-cleared source 확보 후 Main/Sub 01 후보 제작 capability는 `AVAILABLE`이다.
비생성형 배경 정리, contain canvas 구성, 노출·색상 보정, WebP 변환, FitBike 자체
텍스트/chip layout과 자동 dimension QA까지 수행할 수 있다. 복잡한 edge 처리는
사람이 검수하며 tread, sidewall, profile, lettering을 생성형으로 재구성하지 않는다.
