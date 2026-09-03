# FitBike Content Editorial & Visual Standard

**Status:** Mandatory AI production rule  
**Scope:** Content Factory의 Writing / Visual Planning / Image QA

## 1. Core Rule

콘텐츠는 사용자가 **무엇을 점검하고, 어디를 확인하고, 어떤 상태면 중단해야 하는지** 빠르게 이해하도록 만든다. 설명 분량을 늘리기 위해 같은 정보를 문장·표·이미지로 반복하지 않는다.

## 2. Heading Naming

H2/H3는 행동을 길게 지시하는 문장보다 사용자가 스캔하기 쉬운 **대상 + 목적** 명칭을 우선한다.

- 권장: `타이어 / 휠 점검`, `브레이크 / 조작계 점검`, `등화 / 전기장치 점검`, `유체 / 누유 점검`, `차체 / 스탠드 점검`
- 지양: `타이어와 휠부터 보세요`, `브레이크와 조작계는 직접 움직여 확인하세요`

`합니다`, `봅니다`, `살펴봅니다` 같은 서술형 문구를 반복하지 않는다. 정보 라벨은 `점검`, `확인`, `정상`, `이상`, `STOP`처럼 명시적으로 표현한다.

## 3. No Repetition

- Hero와 동일 이미지를 본문 첫 이미지로 다시 노출하지 않는다.
- 같은 체크리스트를 인포그래픽 → 본문 목록 → 별도 요약 이미지로 반복하지 않는다.
- 이미지가 확인 위치와 상태를 충분히 전달하면 본문은 `확인 위치 / 확인 항목 / 정상·이상 기준 / 다음 행동`만 보완한다.
- 하나의 섹션은 하나의 사용자 질문을 해결한다.

## 4. Real Image First for Physical Inspection

실제 부품의 위치·형태·마모·누유·조작부를 알아야 하는 점검 콘텐츠는 **실사 우선**이다.

실사 우선 대상:

- 타이어 표면, 마모한계선, 이물질, 휠
- 브레이크 디스크·캘리퍼·레버·페달
- 스로틀 그립과 실제 조작 위치
- 전조등·방향지시등·제동등·계기판
- 엔진·호스·리저버·주차면의 누유 확인 위치
- 차체 고정물·체인/벨트·사이드/센터 스탠드

실사를 확보할 수 없으면 생성 이미지를 실제 사진처럼 대체하지 않는다. 생성 이미지는 원리·판단 흐름·개념 비교에만 사용한다.

## 5. Image Must Teach the Inspection Point

실사 이미지는 단순히 부품을 보여주는 것으로 끝내지 않는다. Caption 또는 허용된 편집으로 다음 중 필요한 정보를 제공한다.

1. **어디를 볼 것인가** — 실제 확인 위치
2. **무엇을 확인할 것인가** — 마모, 균열, 이물질, 작동, 누유 등
3. **어떤 상태가 문제인가** — 정상/이상 또는 STOP 기준

모바일 390px에서 핵심 부품이 식별되지 않는 원거리 사진은 사용하지 않는다. 긴 텍스트를 이미지 내부에 넣지 않는다.

## 6. Term Explanation

초보자가 모를 수 있는 용어는 실제 이미지 바로 옆에서 짧게 정의한다.

예: `스로틀 = 오른쪽 핸들의 회전식 그립. 회전해 가속하고 손을 놓으면 정상적으로 원위치로 복귀해야 한다.`

용어 설명을 별도 장문 문단으로 반복하지 않는다.

## 7. Checklist Content Structure

출발 전 점검과 같은 CHECKLIST 콘텐츠는 다음 구조를 기본으로 한다.

`짧은 목적 설명 → 영역별 점검(H2) → 해당 영역 실사 → 확인 항목 → STOP 기준 → 최종 GO/STOP`

별도의 `실제로 볼 것` 섹션을 만들어 앞의 내용을 다시 요약하지 않는다. 각 영역 안에서 바로 실사와 확인 포인트를 결합한다.

## 8. Image Brief Additions

Physical Inspection용 Image Brief에는 기존 필드에 더해 다음을 반드시 명시한다.

- `inspection_target`: 사용자가 실제로 찾을 부품/영역
- `inspection_point`: 이미지에서 집중해서 볼 위치
- `normal_abnormal`: 정상/이상 구분이 필요한지
- `term_explanation`: 스로틀 등 초보자 용어 설명 필요 여부
- `real_photo_required`: 실제 구조 확인이 목적이면 `true`
- `duplicate_check`: Hero 또는 다른 본문 이미지와 정보가 겹치는지

## 9. Production Image Delivery — Mandatory

웹에서 발견한 이미지는 **Research Source**이지 Production Delivery URL이 아니다. FitBike Production 콘텐츠는 외부 이미지 원본을 직접 hotlink하지 않는다.

필수 흐름:

`External/Official/Blog Source → provenance 기록 → 필요한 편집/Crop → Resize → WebP 최적화 → FitBike Storage 업로드 → Content DB에는 FitBike Storage path/URL 사용 → Lazy Loading → Production QA`

### 9.1 No External Hotlink in Production

- `commons.wikimedia.org`, 제조사 사이트, 블로그, 기타 외부 CDN URL을 `hero_image_storage_path`, `thumbnail_image_storage_path`, `body_blocks[].storagePath`의 최종 Production 값으로 직접 저장하지 않는다.
- 원본 URL은 `17_content_asset_source` 등 provenance/source record에 보존한다.
- 이미 게시된 콘텐츠에 외부 hotlink가 발견되면 Asset Migration 대상으로 분류한다.
- 외부 URL이 일시적으로 표시된다는 이유로 QA PASS 처리하지 않는다.

### 9.2 FitBike Storage Asset

Production에서 표시하는 이미지는 FitBike가 관리하는 Storage Asset을 기본으로 한다.

- 동일 원본/동일 편집본은 중복 업로드하지 않고 기존 Asset을 재사용한다.
- Storage object path는 콘텐츠/역할을 식별할 수 있도록 일관된 naming을 사용한다.
- DB가 object path를 저장하는 구조라면 환경별 public URL을 DB에 하드코딩하지 않는다. 현재 schema/renderer 계약을 우선한다.

### 9.3 Resize / Format / File Weight

서비스에 필요한 표시 크기보다 과도하게 큰 원본을 그대로 저장하지 않는다.

기본 목표:

- 본문 실사: 장변 약 `1200px` 기준. 확대 정보가 실제로 필요한 경우에만 더 큰 Variant 허용.
- Hero: 서비스 Hero 비율에 맞춘 별도 Variant 사용을 우선한다.
- Thumbnail: Hero 원본을 그대로 내려받게 하지 말고 목록 노출에 적합한 소형 Variant를 우선한다.
- 사진형 Asset: `WebP` 우선.
- 투명도/그래픽 특성상 다른 포맷이 더 적합한 경우에만 예외 허용.
- 본문 사진은 품질을 훼손하지 않는 범위에서 대체로 `100–300KB` 수준을 목표로 한다. 정보 식별에 더 큰 용량이 필요한 경우 Quality Judge가 예외 사유를 남긴다.
- 원본 파일 크기/해상도를 그대로 Production에 전달하지 않는다.

파일 크기 목표는 절대적인 PASS 기준이 아니라 Delivery Budget이다. 핵심 부품 식별이 손상되면 더 높은 품질을 사용하되 이유를 기록한다.

### 9.4 Loading Priority / Lazy Loading

첫 화면에 필요하지 않은 본문 이미지를 초기 페이지 로드와 동시에 모두 요청하지 않는다.

- Hero/LCP 후보: 의도적으로 우선 로딩할 수 있다.
- Above-the-fold의 첫 핵심 Visual: 실제 UX상 필요한 경우에만 우선순위를 부여한다.
- 나머지 본문 이미지: 기본 `lazy loading`.
- 여러 이미지에 무분별하게 `priority`/eager loading을 적용하지 않는다.
- 이미지 컴포넌트는 가능한 경우 명확한 display size / responsive `sizes` 정보를 제공해 모바일에서 불필요하게 큰 Variant를 받지 않도록 한다.

### 9.5 Mobile Text Inside Images

이미지 안 텍스트는 원본 canvas의 px가 아니라 **실제 모바일 표시 크기**를 기준으로 판정한다.

- 390px 화면에서 일반 설명 텍스트는 최소 약 `16px CSS-equivalent`를 목표로 한다.
- 보조 정보도 약 `14px CSS-equivalent` 아래로 내려가지 않도록 한다.
- 원본 1200px 이미지를 약 390px 폭으로 표시한다면 일반 설명 텍스트는 대략 `49px` 이상, 핵심 라벨은 약 `55px` 이상, 이미지 제목은 약 `68px` 이상을 기본 시작점으로 한다.
- 원본 1600px 이미지를 약 390px 폭으로 표시한다면 일반 설명 텍스트는 대략 `66px` 이상, 핵심 라벨은 약 `74px` 이상, 이미지 제목은 약 `90px` 이상을 기본 시작점으로 한다.
- 텍스트가 많아 최소 크기를 지킬 수 없으면 글자를 줄이지 말고 이미지를 여러 Visual로 분리하거나 HTML 본문으로 이동한다.

## 10. Production Image QA Gate

게시 전 다음을 모두 확인한다.

### Editorial / Information QA

- 동일 이미지가 Hero와 본문에 중복 노출되지 않는가?
- 같은 내용을 문장/목록/이미지에서 반복하지 않는가?
- Heading만 읽어도 섹션 목적이 즉시 이해되는가?
- 물리적 점검 대상은 실사로 식별 가능한가?
- 스로틀·스탠드 등 초보자가 모를 수 있는 대상을 이미지로 이해할 수 있는가?
- 이미지마다 확인 위치와 확인 항목이 연결되어 있는가?
- 모바일에서 이미지의 핵심 대상이 충분히 크게 보이는가?
- 문체가 `합니다/봅니다`의 반복보다 `점검/확인/STOP` 중심으로 정보화되어 있는가?

### Delivery QA

- Production Content DB에 외부 hotlink가 남아 있지 않은가?
- 모든 Production 이미지가 FitBike Storage에서 정상 응답하는가?
- 원본 대비 필요한 Resize/최적화가 수행됐는가?
- 사진형 이미지는 WebP Variant가 사용되는가?
- Hero/Thumbnail/본문의 역할에 맞는 크기 Variant가 사용되는가?
- Hero 외의 본문 이미지가 기본 lazy loading 되는가?
- 여러 이미지가 불필요하게 eager/priority 처리되지 않았는가?
- 모바일에서 과도하게 큰 원본을 다운로드하지 않는가?
- 이미지 내부 텍스트가 모바일 최소 가독성 기준을 충족하는가?
- 이미지 깨짐, layout shift, 잘못된 aspect ratio가 없는가?

`EXTERNAL_HOTLINK`, `UNOPTIMIZED_ORIGINAL`, `MOBILE_TEXT_UNREADABLE`, `BROKEN_ASSET`, `EAGER_LOAD_OVERUSE`가 발견되면 Production Image QA는 FAIL이다.

하나라도 실패하면 Image/Content QA를 PASS하지 않는다.
