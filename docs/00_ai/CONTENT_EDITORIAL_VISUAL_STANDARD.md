# FitBike Content Editorial & Visual Standard

**Status:** Mandatory AI production rule  
**Scope:** Content Factory의 Writing / Visual Planning / Image QA

## 1. Core Rule
콘텐츠는 사용자가 **무엇을 점검하고, 어디를 확인하고, 어떤 상태면 중단해야 하는지** 빠르게 이해하도록 만든다. 같은 정보를 문장·표·이미지로 반복하지 않는다.

## 2. Heading Naming
H2/H3는 행동형 장문보다 **대상 + 목적**을 우선한다. 예: `타이어 / 휠 점검`, `브레이크 / 조작계 점검`, `유체 / 누유 점검`. `합니다/봅니다` 반복보다 `점검/확인/정상/이상/STOP`을 사용한다.

## 3. No Repetition
- Hero와 동일 이미지를 본문에 재사용하지 않는다.
- 동일 콘텐츠 안에서 같은 Production Asset을 두 번 사용하지 않는다.
- 다른 콘텐츠의 이미지는 정보 목적과 inspection target이 정확히 일치할 때만 재사용한다. 단순히 Storage에 있다는 이유로 재사용하지 않는다.
- 이미지가 정보를 전달하면 본문은 확인 위치·항목·정상/이상·다음 행동만 보완한다.

## 4. Real Image First
실제 부품의 위치·형태·마모·누유·조작부를 알아야 하는 콘텐츠는 실사를 우선한다. 타이어 손상, 브레이크, 스로틀, 등화장치, 누유 위치, 포크 씰, 체인/벨트, 스탠드 등은 실제 구조가 식별되어야 한다. 적합한 실사가 없으면 무관한 기존 사진으로 채우지 않는다.

## 5. Image Must Teach
각 이미지는 다음 중 최소 하나를 명확하게 가르쳐야 한다: `어디를 볼 것인가`, `무엇을 확인할 것인가`, `어떤 상태가 문제인가`. 모바일 390px에서 핵심 대상이 식별되지 않거나 사진만 보고 확인 목적을 설명할 수 없으면 `IMAGE_INFORMATION_VALUE_FAIL`이다.

## 6. Image Brief — Mandatory Before Generation
모든 Production 이미지에는 생성/확보 전에 독립 Image Brief가 있어야 한다.

- `asset_role`: HERO | BODY
- `inspection_target`
- `inspection_point`
- `information_goal`
- `normal_abnormal`
- `real_photo_required`
- `term_explanation`
- `duplicate_check`
- `reference_assets`: 참고만 할 Reference Asset 목록
- `production_output`: 최종 한 장이 전달해야 하는 장면

**절대 규칙: `1 Image Brief = 1 Generation/Acquisition = 1 Production Asset`.**

여러 콘텐츠, 여러 섹션, 여러 판단 단계를 한 번의 Production 이미지 생성 요청에 합치지 않는다.

## 7. Reference Asset vs Production Asset
`editorial-reference/**`의 대시보드, 콜라주, ChatGPT 생성안, UI mockup은 **Visual Knowledge Base**다. 생성형 AI가 구도·점검 위치·정보 구조를 참고할 수 있지만 서비스에 직접 노출하지 않는다.

Reference Asset을 활용할 때는:
`Reference 분석 → 현재 섹션의 단일 Image Brief → 새 독립 이미지 생성/실사 확보 → Production QA → contents/<content-key>/** 저장`

다음은 금지한다.
- Reference 대시보드 전체를 Hero/본문에 연결
- 대시보드의 작은 패널을 crop하여 실사처럼 사용
- 3개 콘텐츠용 이미지를 한 장으로 생성
- 한 장에 여러 섹션을 축소 배치해 모바일 가독성을 희생
- Reference Asset path를 Production DB에 저장

## 8. Dashboard / Composite Detection Gate
이미지 생성 직후 **Production Storage 업로드 전에** 결과를 판정한다.

다음 중 하나라도 해당하면 `REFERENCE_ONLY`로 강등하고 Production 진입을 차단한다.
- 둘 이상의 콘텐츠 제목/번호가 한 이미지에 존재
- 독립 카드/패널이 3개 이상인 대시보드·콜라주 구조
- 한 이미지가 여러 Image Brief를 동시에 해결하려 함
- 모바일에서 각 패널의 핵심 대상이 작아 식별 불가
- 웹페이지/대시보드/프레젠테이션 화면처럼 생성됨
- Production output과 다른 장면이 포함됨

실패 코드: `DASHBOARD_COMPOSITE_OUTPUT`, `MULTI_BRIEF_IMAGE`, `REFERENCE_ASSET_DIRECTLY_SERVED`.

실패 시 자동 행동:
1. 해당 결과를 `editorial-reference/generated/**`에 Reference Asset으로 저장 가능
2. `used_in_service=false`
3. Production DB 연결 금지
4. Image Brief를 변경하지 말고 **한 장씩 다시 생성**
5. 새 결과가 Gate를 통과할 때까지 게시 이미지로 승인하지 않음

## 9. Production Asset Uniqueness Gate
게시 직전 Hero/Body asset 목록을 비교한다.
- Hero == Body path → FAIL
- 동일 Body path 2회 이상 → FAIL
- 같은 콘텐츠의 perceptually same image/동일 원본 변형 반복 → FAIL
- 다른 콘텐츠에서 가져온 범용 이미지가 현재 inspection target을 직접 보여주지 않음 → FAIL

실패 코드: `DUPLICATE_IMAGE`, `HERO_BODY_DUPLICATE`, `GENERIC_ASSET_REUSE`, `INSPECTION_TARGET_MISMATCH`.

## 10. Production Image Delivery
웹 이미지는 Research Source이지 Production Delivery URL이 아니다.

`External/Official/Blog Source → provenance → 편집 → Resize → WebP → FitBike Storage → DB Storage path → Lazy Loading → Production QA`

- 외부 Hotlink 금지
- `/public` 로컬 콘텐츠 이미지 직접 호출 금지
- Production은 FitBike Storage Asset 사용
- 사진형 본문 장변 약 1200px, WebP 우선
- 본문은 대체로 100–300KB 목표(정보 손실 시 예외)
- Hero/LCP 후보만 필요 시 우선 로딩, 나머지 본문은 lazy loading
- responsive sizes를 제공해 모바일 과다운로드 방지

## 11. Mobile Text Inside Images
390px 화면에서 일반 설명 약 16px CSS-equivalent, 보조 정보 약 14px 이상을 목표로 한다. 1200px 원본 기준 일반 설명 약 49px+, 핵심 라벨 55px+, 제목 68px+를 기본 시작점으로 한다. 글이 많으면 글자를 줄이지 말고 이미지를 분리하거나 HTML로 이동한다.

## 12. Production Image QA Gate
### Editorial / Information
- 이미지마다 단일 Image Brief가 존재하는가?
- Dashboard/Composite Gate를 통과했는가?
- Hero와 Body가 중복되지 않는가?
- 동일 콘텐츠 내 중복 이미지가 없는가?
- 현재 주제의 실제 inspection target을 직접 보여주는가?
- 이미지 하나만 봐도 확인 목적이 설명 가능한가?
- 실사가 필요한 물리적 점검은 실제 구조가 식별 가능한가?
- 모바일에서 핵심 대상과 텍스트가 인지 가능한가?

### Delivery
- 외부 hotlink 0인가?
- `/public` 직접 이미지 0인가?
- `editorial-reference/**` 직접 서비스 0인가?
- 모든 Production 이미지가 FitBike Storage에 존재하는가?
- WebP/Resize가 적용됐는가?
- Hero 외 본문은 기본 lazy loading인가?
- 깨진 asset/layout shift가 없는가?

### Blocking Fail Codes
`DASHBOARD_COMPOSITE_OUTPUT`, `MULTI_BRIEF_IMAGE`, `REFERENCE_ASSET_DIRECTLY_SERVED`, `DUPLICATE_IMAGE`, `HERO_BODY_DUPLICATE`, `GENERIC_ASSET_REUSE`, `INSPECTION_TARGET_MISMATCH`, `IMAGE_INFORMATION_VALUE_FAIL`, `EXTERNAL_HOTLINK`, `LOCAL_PUBLIC_IMAGE_REF`, `UNOPTIMIZED_ORIGINAL`, `MOBILE_TEXT_UNREADABLE`, `BROKEN_ASSET`, `EAGER_LOAD_OVERUSE`.

**Blocking Fail Code가 하나라도 있으면 Content를 새로 PUBLISHED 상태로 전환하지 않는다.** 이미 게시된 콘텐츠에서 발견되면 게시를 삭제하는 대신 `IMAGE_QA_REOPEN` 대상으로 잡아 Visual Layer를 교체한다.
