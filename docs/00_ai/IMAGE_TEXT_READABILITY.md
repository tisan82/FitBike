# FitBike Image Text Readability Standard

**Status:** Mandatory AI production rule  
**Scope:** Content Factory / Image Brief / Image Generation / Image QA

## Core Rule
이미지 내부 텍스트는 원본 파일에서 읽히는지가 아니라 **서비스의 실제 모바일 표시 폭에서 읽히는지**로 판정한다. 작은 글자를 많이 넣어 정보를 압축하지 않는다. 정보가 많으면 이미지를 분리한다.

## Mobile Baseline
기준 viewport는 390px이며, 콘텐츠 이미지의 실제 표시 폭은 약 358~390px 범위로 본다.

이미지 내부 텍스트의 최종 표시 크기 기준:
- 핵심 제목: 20px equivalent 이상
- 섹션/대상 라벨: 18px equivalent 이상
- 본문성 정보/점검 라벨: 16px equivalent 이상
- 보조 출처/짧은 주석: 14px equivalent 이상. 핵심 정보에는 사용 금지

원본 이미지에서 필요한 font-size는 `target_mobile_px × original_width / rendered_mobile_width`로 계산한다.

### 1200px 원본 / 390px 표시 예
- 제목: 62px 이상
- 섹션 라벨: 56px 이상
- 본문/점검 라벨: 50px 이상
- 보조 주석: 44px 이상

### 1600px 원본 / 390px 표시 예
- 제목: 83px 이상
- 섹션 라벨: 74px 이상
- 본문/점검 라벨: 66px 이상
- 보조 주석: 58px 이상

390px보다 좁게 렌더링되는 컴포넌트는 실제 rendered width로 다시 계산하며 위 숫자를 그대로 적용하지 않는다.

## Information Density
- 한 이미지에 텍스트가 위 최소 크기로 들어가지 않으면 글자를 줄이지 말고 이미지를 2장 이상으로 분리한다.
- 모바일에서 한눈에 읽어야 하는 라벨은 짧은 명사형을 우선한다: `타이어 / 휠`, `브레이크 / 조작계`, `등화 / 전기`, `유체 / 누유`, `차체 / 고정물`, `스탠드`.
- 장문 설명은 이미지 안에 넣지 않고 HTML 본문/Caption으로 제공한다.
- Hero는 세부 체크리스트를 모두 담는 문서가 아니다. 주제와 주요 영역을 빠르게 인지시키는 역할에 집중한다.

## Image Brief Requirement
모든 텍스트 포함 Image Brief에 다음을 추가한다.
- `source_canvas_width`
- `expected_mobile_render_width`
- `text_roles`: title / label / body / annotation
- `minimum_source_font_px`
- `mobile_equivalent_px`
- `density_split_required`

## QA Gate
게시 전 390px viewport 또는 실제 콘텐츠 폭으로 렌더링해 확인한다.
- 핵심 텍스트가 확대 없이 읽히는가?
- 본문/점검 라벨이 16px equivalent 이상인가?
- 제목/대상 라벨의 시각적 위계가 분명한가?
- 텍스트를 작게 만들어 한 장에 억지로 넣지 않았는가?
- 작은 보조 문구가 핵심 정보를 담당하지 않는가?

하나라도 실패하면 `IMAGE_TEXT_READABILITY_FAIL`이며 게시하지 않고 재구성한다.
