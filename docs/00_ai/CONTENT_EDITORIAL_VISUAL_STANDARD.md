# FitBike Content Editorial & Visual Standard

**Version:** v1.3
**Status:** Mandatory AI production rule  
**Scope:** Content Factory의 Writing / Visual Planning / Image QA

## 1. Core Rule
콘텐츠는 사용자가 **무엇을 점검하고, 어디를 확인하고, 상태에 따라 다음에 무엇을 해야 하는지** 빠르게 이해하도록 만든다. 같은 정보를 문장·표·이미지로 반복하지 않는다.

## 2. Heading Naming
H2/H3는 행동형 장문보다 **대상 + 목적**을 우선한다. 예: `타이어 / 휠 점검`, `브레이크 / 조작계 점검`, `유체 / 누유 점검`. `합니다/봅니다`를 반복하지 않되 내부 상태 코드인 `STOP`, `BLOCKED`, `HOLD`를 사용자 소제목에 사용하지 않는다.

## 3. No Repetition
- Hero와 동일 이미지를 본문에 재사용하지 않는다.
- 동일 콘텐츠 안에서 같은 Production Asset을 두 번 사용하지 않는다.
- 다른 콘텐츠의 이미지는 정보 목적과 inspection target이 정확히 일치할 때만 재사용한다. 단순히 Storage에 있다는 이유로 재사용하지 않는다.
- 이미지가 정보를 전달하면 본문은 확인 위치·항목·정상/이상·다음 행동만 보완한다.

## 4. Real Image First
실제 부품의 위치·형태·마모·누유·조작부를 알아야 하는 콘텐츠는 실사를 우선한다. 타이어 손상, 브레이크, 스로틀, 등화장치, 누유 위치, 포크 씰, 체인/벨트, 스탠드 등은 실제 구조가 식별되어야 한다. 적합한 실사가 없으면 무관한 기존 사진으로 채우지 않는다.

## 4.0 Source Discovery Priority and Persistence Gate

Image Producer의 Source 탐색 목표는 후보 N개를 시도하는 것이 아니라 **현재 Generation Contract를 만족하는 Production Asset 1개를 확보하는 것**이다.

Source 우선순위는 다음과 같다.

1. 제조사·공식 브랜드의 고해상도 실제 작업/부품 사진
2. 제조사 공식 웹페이지·보도자료·기술 페이지의 고해상도 실사
3. 공식 딜러·정비 기술자료의 실사
4. 신뢰 가능한 전문 매체·정비 자료의 출처가 명확한 실사
5. 기타 provenance가 명확하고 Contract를 직접 만족하는 실제 사진
6. **공식 PDF/매뉴얼 페이지는 최하순위 fallback**

- 403/404/timeout/download failure는 해당 후보 하나의 실패일 뿐 Source Discovery 전체 실패가 아니다. 같은 실패 URL을 반복하지 말고 즉시 다른 asset/source route로 전환한다.
- 후보 1~2건 또는 임의의 소수 후보 실패만으로 RETRY/HOLD/BLOCKED/SOURCE_CANDIDATES_EXHAUSTED 처리하지 않는다.
- 가능한 서로 다른 획득 전략을 충분히 탐색하고 Contract를 만족하는 자산 확보를 계속한다.
- PDF는 공식 자료라는 이유만으로 웹 실사보다 우선하지 않는다. 실사 획득 경로를 충분히 탐색한 뒤 최후 fallback으로만 사용한다.
- PDF를 사용하는 경우 **페이지 전체 단순 렌더를 Production Asset으로 채택하지 않는다.** 필요한 사진·도해 영역을 충분한 해상도로 추출/crop하여 390px 모바일에서 inspection target과 inspection point가 직접 식별될 때만 허용한다.
- PDF page render에서 핵심 대상이 작거나 문서 여백·본문이 대부분을 차지하면 IMAGE_INFORMATION_VALUE_FAIL 또는 INSPECTION_TARGET_MISMATCH로 FAIL한다.
- Source metadata, PDF 본문 설명 또는 기술적 변환 성공만으로 Semantic/Mobile QA를 PASS하지 않는다. 최종 WebP 픽셀을 실제로 확인한다.
- SOURCE_CANDIDATES_EXHAUSTED는 공식 웹 실사, 다른 공식 페이지, 공식 딜러/기술자료, 신뢰 가능한 전문 실사, PDF fallback 등 **적용 가능한 서로 다른 탐색 전략을 소진한 사실과 실패 사유를 기록한 경우에만** 허용한다.

## 4.1 Approved Manufacturer Assets

제조사 공식 자산을 우선 탐색하며 특정 브랜드 whitelist를 두지 않는다. 사용 권리의 협의·판단은 운영자가 담당한다. 신규 권리 상태는 기록하지 않으며 출처 기록 정책은 `CONTENT.md`를 따른다.

- 특정 모델 외형·부품 위치·차량 크기 예시는 생성 이미지보다 해당 제조사의 공식 실사를 우선한다.
- 원본 페이지 URL, 원본 이미지 URL, 제조사, 확인 일자, 편집 내용과 사용 콘텐츠를 Asset Source에 기록한다.
- 공식 자산의 실제 브랜드 표식은 보존한다. 제3자 워터마크를 제거하지 않는다.
- 외부 hotlink는 금지하며 콘텐츠별 WebP로 변환해 FitBike Storage에서 제공한다.
- 공식 이미지라도 다른 연식·트림을 현재 예시인 것처럼 표시하지 않는다.
- 제조사 및 제3자 자산 모두 출처 페이지·원본 자산 URL·운영자/저작자·확인 시점·편집 이력을 기록한다.
- QA를 통과한 자산은 3-A Staging → 3-B Production 경로로 처리한다.
- 라이선스·권리·사용/편집 허락은 자동 제작/QA/Publish의 필수값이나 Gate가 아니다. 운영자가 별도로 관리한다.

## 5. Image Must Teach
각 이미지는 고객이 실제 바이크를 다룰 때 다음 중 최소 하나를 명확하게 확인할 수 있게 해야 한다: `어디를 볼 것인가`, `무엇을 확인할 것인가`, `어떤 상태가 문제인가`. 모바일 390px에서 핵심 대상이 식별되지 않거나 사진만 보고 확인 목적을 설명할 수 없으면 `IMAGE_INFORMATION_VALUE_FAIL`이다.

### 5.1 Tire sidewall identification

타이어 규격 확인 Visual은 검은 타이어의 형태만 보여주는 이미지로 통과하지 않는다. 실제 사이드월에서
제조사/브랜드 또는 제품 식별 정보와 규격 문자열이 함께 읽혀야 한다. 사용 승인이 확인된 MAXXIS
공식 실사를 우선하며, 브랜드·규격 표기가 흐리거나 보이지 않으면 다른 승인 자산을 선택한다.

- 실제 각인과 다른 숫자·브랜드·패턴을 생성하거나 합성하지 않는다.
- 설명용 강조선과 라벨은 원본 각인을 가리지 않는다.
- 모바일에서 규격 문자열을 읽을 수 있도록 필요한 범위만 고해상도로 crop할 수 있다.
- 본문 HTML은 실제 각인을 그대로 옮겨 설명하고, 이미지에서 확인되지 않는 값을 추가하지 않는다.

브랜드/제품 식별과 규격 문자열 중 하나라도 확인할 수 없으면 `TIRE_SIDEWALL_IDENTITY_MISSING`으로
Production 사용을 차단한다.

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
- `human_presence`: NONE | HANDS_ONLY | PERSON_REQUIRED

**절대 규칙: `1 Image Brief = 1 Generation/Acquisition = 1 Production Asset`.**\n\n### 6.1 Model-Independent Location Contract Gate

Visual Planner는 **모델 비종속 콘텐츠에서 제조사·모델·연식에 따라 달라지는 위치를 사실 조건으로 고정하지 않는다.** Writer 본문이 특정 모델을 다루지 않는다면 Image Contract도 임의의 특정 모델 위치를 일반화하지 않는다.

- 특정 모델에서만 성립하는 부품 위치, 경고등 위치, 단자 위치, 커넥터 위치, 퓨즈박스 위치, 에어클리너 접근 위치 등을 `must_show`의 필수 사실로 요구하지 않는다.
- 먼저 `정확한 위치 안내`와 `점검 대상/상태 확인 안내`를 구분한다. 모델 비종속 콘텐츠의 기본값은 사용자가 **무엇을 확인해야 하는지**를 보여주는 점검 대상/상태 안내다.
- 특정 위치 자체가 콘텐츠의 필수 정보라면 Contract에 `brand`, `model`, `model_year` 또는 동일 수준의 검증 가능한 `target_vehicle_id`를 반드시 포함한다. 이 식별자가 없으면 특정 모델 위치를 `must_show`, `inspection_point`, annotation 좌표의 사실 조건으로 요구하지 않는다.
- `model_dependency=HIGH` 표기만으로 특정 모델 위치 요구가 정당화되지 않는다. 대상 식별자가 없으면 Contract를 모델 비종속 표현으로 다시 작성한다.
- 계기판 경고는 특정 아이콘의 위치를 요구하는 대신 **실제 계기판에서 경고 표시 유무·메시지를 확인한다는 행동**을 보여줄 수 있다. 특정 아이콘/위치를 강조하려면 대상 모델 식별과 공식 근거가 필요하다.
- 배터리·퓨즈·커넥터·에어클리너처럼 위치가 모델별로 다른 항목은 대상 식별자가 없을 때 부품 자체, 접근 전 확인 행동, 매뉴얼 확인 필요성, 상태 확인 포인트를 시각화한다. 임의 바이크의 위치를 전체 바이크 공통 위치처럼 표시하지 않는다.
- Visual Planner Self QA에서 `model_specific_location_required=true`인데 검증 가능한 대상 식별자가 비어 있으면 Writer 완료 및 Image Sync를 차단하고 Contract를 재작성한다.

이 Gate는 Writer 본문을 특정 모델 기준으로 바꾸라는 규칙이 아니다. **Visual Planner / Image Contract 생성 책임**에서 모델 비종속 본문을 모델 종속 시각 사실로 과도하게 구체화하지 않도록 막는 규칙이다.


여러 콘텐츠, 여러 섹션, 여러 판단 단계를 한 번의 Production 이미지 생성 요청에 합치지 않는다.

## 6.1 Generation Input Isolation Gate

Image Producer는 실제 생성 호출 직전에 **현재 Claim의 Generation Contract만으로** 최종 Generation Instruction을 새로 구성한다. 이전 Image Task, 이전 생성 Prompt, 과거 대화의 이미지 설명, 다른 Topic의 Visual Brief 또는 생성 결과를 상속하거나 재사용하지 않는다.

생성 직전 다음 값을 현재 Claim과 다시 대조한다.

- `pipelineImageId`
- `topicKey`
- `imageId`
- `assetKey`
- `generationContractHash`
- `visual_objective`
- `must_show`
- `must_not_show`
- `user_question_supported`
- `mobile_requirement`

최종 Generation Instruction은 반드시 다음 순서로 현재 Contract에서 새로 만든다.

`CURRENT TASK ONLY → visual_objective → must_show → must_not_show → mobile_requirement`

- 최종 instruction의 장면, 대상, 행동, 부품, 배경 중 하나라도 현재 Contract에서 직접 유도되지 않으면 생성 호출을 중단하고 Contract를 다시 읽는다.
- `generationContractHash`가 Claim 시점 값과 다르거나 확인할 수 없으면 이미지를 생성하지 않고 Claim/Contract 상태를 재검증한다.
- 이미지 생성 도구가 이전 문맥을 참조할 가능성이 있더라도 현재 Contract 밖의 장면을 추가하지 않는다.
- 생성 직후 실제 픽셀을 현재 Contract와 다시 비교하고 Semantic Visual QA를 통과하기 전에는 Storage에 업로드하지 않는다.
- Contract와 다른 결과는 재사용·수정하여 억지로 통과시키지 않고 폐기한 뒤 현재 Contract에서 다시 독립 생성한다.

### Single-Scene Generation Gate

Generation Contract가 한 장면의 행동·상태 전달을 요구하고 별도 annotation/text 요구가 없으면 **기본 출력은 단일 실사형 장면**으로 고정한다.

- 기본 생성 형식: `ONE REALISTIC SCENE / NO TEXT / NO PANELS / NO INSETS / NO INFOGRAPHIC / NO STEP NUMBERS`.
- Contract가 직접 요구하지 않은 제목, 설명문, 체크리스트, 단계 번호, 카드 UI, 분할 화면, 확대 inset, 아이콘 범례를 생성하지 않는다.
- Contract가 직접 요구하지 않은 계기판·경고등·부품 확대, 진단 결과, 고장 원인, 점검 순서를 추가하지 않는다.
- `must_not_show`에 계기판 합성·복잡한 인포그래픽 등이 있으면 이를 최종 생성 instruction의 명시적 negative constraint로 다시 작성한다.
- 위치 표시가 필요한 경우에도 `Mobile Text Inside Images` 정책에 따라 Writer의 Image Brief/Contract가 요구한 최소 annotation만 허용한다. 요구가 없으면 annotation을 추가하지 않는다.
- 생성 도구가 설명형 poster/infographic을 반환하면 장면의 주제가 맞더라도 `DASHBOARD_COMPOSITE_OUTPUT` 또는 `MULTI_BRIEF_IMAGE`로 FAIL하고 Storage에 올리지 않는다.
- 재시도 instruction은 실패 결과의 시각 요소를 묘사해 상속하지 않고, 원래 Contract의 단일 장면과 negative constraint만으로 새로 구성한다.

### Fresh Asset Selection Gate

각 Image Claim은 **독립된 Source Selection 세션**으로 취급한다. 이전 Image Task에서 선택한 source page, source asset URL, Storage path, SHA, 생성 결과 또는 검색 후보를 현재 Task의 기본값으로 상속하지 않는다.

- Claim 직후 source candidate 상태는 EMPTY에서 시작한다.
- 현재 Claim의 `generationContractHash`, `visual_objective`, `must_show`, `must_not_show`, `user_question_supported`를 읽은 뒤에만 source 탐색을 시작한다.
- `sourceAssetUrl`은 현재 Contract를 만족하는지 실제 asset을 확인한 뒤 현재 Task에 새로 결합한다.
- 이전 Task의 sourceAssetUrl을 복사하거나 직전 성공 asset을 편의상 다음 assetKey로 다시 ingest하지 않는다.
- 같은 source page에서 여러 사진을 사용할 수는 있지만 각 Image Task마다 **서로 다른 실제 asset**을 독립 선택하고 각각 Semantic QA한다.
- 현재 Contract가 명시적으로 동일 자산 재사용을 요구하는 예외가 없다면 동일 Topic의 다른 DONE Image와 같은 sourceAssetUrl 또는 같은 SHA를 사용하지 않는다.
- Source fetch가 실패하면 실패 URL을 반복하지 않고 다른 asset/source route로 전환하되, 이전 Image Task의 성공 자산으로 fallback하지 않는다.

이 Gate의 목적은 이전 실행 결과가 다음 Claim의 입력으로 남는 **cross-task source carry-over**를 차단하는 것이다.

### Same-Topic Duplicate Asset Gate

Image Task DONE 직전에 같은 pipeline의 기존 DONE Image와 현재 후보를 비교한다.

- 동일 SHA-256 → `DUPLICATE_VISUAL_ASSET`로 FAIL.
- 동일 sourceAssetUrl → `DUPLICATE_SOURCE_ASSET`로 FAIL.
- SHA가 달라도 crop/resize 등으로 실질적으로 같은 장면이며 서로 다른 Visual Contract를 해결하려는 경우 → Semantic QA FAIL.
- 실패 시 현재 Image Task만 RETRY하고 기존 정상 DONE Image는 변경하지 않는다.
- DB Complete RPC도 동일 SHA와 동일 sourceAssetUrl을 거부하여 Worker 판단 누락이 DONE으로 전파되지 않게 한다.

## 7. Human Presence and Representation

이미지는 바이크, 부품, 점검 위치와 공구를 주 피사체로 삼고 사람은 기본적으로
포함하지 않는다. 인물이 분위기만 만들거나 화면을 가리면 정보 밀도와 재사용성이
떨어지므로 `human_presence: NONE`을 사용한다.

- 동작 방향, 공구를 잡는 위치, 접촉 지점을 손 없이 설명하기 어려울 때만 `HANDS_ONLY`를 사용한다.
- 손·팔만으로도 설명 가능한데 얼굴이나 전신을 추가하지 않는다.
- 보호 자세나 탑승 자세처럼 몸 전체가 정보인 경우에만 `PERSON_REQUIRED`를 사용한다.
- 사람이 필요하면 한국 서비스 맥락에 자연스러운 동아시아 성인을 기본으로 표현한다.
- 국적·인종이 사실 판단에 관련된다는 의미를 만들지 않으며 고정관념, 과장된 외모, 성별 역할을 사용하지 않는다.
- 피부 노출, 장신구, 헐렁한 소매 등 작업 안전을 해치는 요소를 피하고 필요한 보호장비를 정확히 표현한다.
- 사람의 얼굴, 감정, 패션이 바이크나 점검 대상을 압도하면 QA FAIL이다.

## 8. Alt Text and Caption

alt는 보이지 않는 사용자가 이미지의 정보 목적을 이해하도록 `대상 + 위치/행동 +
확인 포인트`를 짧게 설명한다. caption은 본문을 반복하지 않고 이미지에서 확인할
핵심 또는 다음 행동을 보완한다.

- 사용자용 alt/caption에는 `생성형`, `생성 이미지`, `AI 이미지`, `AI로 생성`,
  `인공지능 생성`처럼 제작 방식을 설명하는 표현을 넣지 않는다.
- `교육 이미지입니다`, `교육용 이미지입니다`, `비교 이미지입니다`처럼 이미지의 제작·용도를 고지하는 상투 문구도 넣지 않는다. FitBike Visual은 교육자료가 아니라 실제 바이크의 점검 위치·부품·상태·확인 행동을 안내하는 정보 자산으로 설계한다. 화면에는 대상, 확인 지점과 판단에 필요한 정보만 쓴다.
- `생성`, `생성된`을 기계적으로 금지하지는 않지만 자산 제작 과정을 뜻하는 문맥에는 사용하지 않는다.
- `이미지`, `사진`만으로 시작하지 말고 실제 정보 대상을 먼저 쓴다.
- 시각적으로 확인되지 않는 규격·원인·진단 결과를 alt/caption에 추가하지 않는다.
- 생성 여부, 모델, provenance는 사용자 설명문이 아니라 내부 Source/Asset metadata에 기록한다.

좋은 예: `오른쪽 핸들 주변 브레이크 레버와 유격 확인 위치`

피할 예: `AI로 생성된 오토바이 브레이크 점검 이미지`

## 9. Reference Asset vs Production Asset
`editorial-reference/**`의 대시보드, 콜라주, ChatGPT 생성안, UI mockup은 **Visual Knowledge Base**다. 생성형 AI가 구도·점검 위치·정보 구조를 참고할 수 있지만 서비스에 직접 노출하지 않는다.

Reference Asset을 활용할 때는:
`Reference 분석 → 현재 섹션의 단일 Image Brief → 새 독립 이미지 생성/실사 확보 → Production QA → contents/<content-key>/** 저장`

다음은 금지한다.
- Reference 대시보드 전체를 Hero/본문에 연결
- 대시보드의 작은 패널을 crop하여 실사처럼 사용
- 3개 콘텐츠용 이미지를 한 장으로 생성
- 한 장에 여러 섹션을 축소 배치해 모바일 가독성을 희생
- Reference Asset path를 Production DB에 저장

## 10. Dashboard / Composite Detection Gate
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

## 11. Production Asset Uniqueness Gate
게시 직전 Hero/Body asset 목록을 비교한다.
- Hero == Body path → FAIL
- 동일 Body path 2회 이상 → FAIL
- 같은 콘텐츠의 perceptually same image/동일 원본 변형 반복 → FAIL
- 다른 콘텐츠에서 가져온 범용 이미지가 현재 inspection target을 직접 보여주지 않음 → FAIL

실패 코드: `DUPLICATE_IMAGE`, `HERO_BODY_DUPLICATE`, `GENERIC_ASSET_REUSE`, `INSPECTION_TARGET_MISMATCH`.

## 12. Production Image Delivery
웹 이미지는 Research Source이지 Production Delivery URL이 아니다.

`External/Official/Blog Source → provenance → 편집 → Resize → WebP → FitBike Storage → DB Storage path → Lazy Loading → Production QA`

- 외부 Hotlink 금지
- `/public` 로컬 콘텐츠 이미지 직접 호출 금지
- Production은 FitBike Storage Asset 사용
- 사진형 본문 장변 약 1200px, WebP 우선
- 본문은 대체로 100–300KB 목표(정보 손실 시 예외)
- Hero/LCP 후보만 필요 시 우선 로딩, 나머지 본문은 lazy loading
- responsive sizes를 제공해 모바일 과다운로드 방지

## 13. Mobile Text Inside Images
이미지 내부 텍스트·Arrow·Circle·Label·Zoom Inset 같은 Annotation은 **항상 넣는 요소가 아니다**. 실사만으로 inspection target과 inspection point가 충분히 식별되면 추가하지 않는다. 고객이 실제 바이크에서 위치를 찾기 어렵거나 작은 단자·볼트·밸브·체결부를 오인할 가능성이 있을 때만 정보 전달을 위해 사용한다.

- 위치 안내가 필요하면 검증된 실제 위치에 `ARROW`, `CIRCLE/MARKER`, `SHORT_LABEL`, `ZOOM_INSET` 등을 최소한으로 적용할 수 있다.
- `ZOOM_INSET`은 동일한 inspection target의 **Context + Detail**을 보여줄 때만 허용한다. 서로 다른 Image Brief를 한 장에 합치는 용도로 사용하지 않는다.
- Annotation은 실제 Source에서 확인된 사실만 강조한다. 확인되지 않은 단자 극성, 부품명, 체결부, 커버 개방 방향, 손상·누유·마모·균열, 수치·규격을 새로 만들어 표시하지 않는다.
- 텍스트가 필요하지 않으면 넣지 않는다. 텍스트를 넣는 경우에는 짧은 부품명·확인 지점 중심으로 작성하고 긴 설명은 HTML 본문 또는 caption으로 이동한다.
- **이미지 내부 텍스트는 최종 서비스의 모바일 390px 화면에서 실제로 읽을 수 있는 크기여야 한다.** 원본 이미지에서 크게 보이는 것만으로 통과시키지 않고 실제 모바일 표시 크기를 기준으로 QA한다.
- 390px 화면에서 일반 설명 약 16px CSS-equivalent, 보조 정보 약 14px 이상을 목표로 한다. 1200px 원본 기준 일반 설명 약 49px+, 핵심 라벨 55px+, 제목 68px+를 기본 시작점으로 한다.
- 글이 많으면 글자를 줄여 억지로 넣지 말고, 필요 시 이미지를 분리하거나 HTML로 이동한다.
- Arrow/Marker/Label은 inspection target을 가리거나 실제 구조를 가리지 않아야 하며, 390px에서도 대상과 표시의 연결 관계가 명확해야 한다.
- 모바일에서 텍스트나 위치 표시를 판독할 수 없으면 `MOBILE_TEXT_UNREADABLE` 또는 정보 목적에 따라 `IMAGE_INFORMATION_VALUE_FAIL`로 처리한다.

## 14. Production Image QA Gate
### Editorial / Information
- 이미지마다 단일 Image Brief가 존재하는가?
- Dashboard/Composite Gate를 통과했는가?
- Hero와 Body가 중복되지 않는가?
- 동일 콘텐츠 내 중복 이미지가 없는가?
- 현재 주제의 실제 inspection target을 직접 보여주는가?
- 이미지 하나만 봐도 확인 목적이 설명 가능한가?
- 실사가 필요한 물리적 점검은 실제 구조가 식별 가능한가?
- 모바일에서 핵심 대상과 텍스트가 인지 가능한가?
- 불필요한 얼굴·전신이 정보 대상을 가리거나 시선을 빼앗지 않는가?
- 사람이 필요하다면 `human_presence` 선택과 실제 구성이 일치하는가?
- alt/caption이 정보 목적을 설명하며 제작 방식 표현이나 근거 없는 진단을 포함하지 않는가?

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

타이어 규격 확인 Visual에는 `TIRE_SIDEWALL_IDENTITY_MISSING`도 Blocking Fail Code로 적용한다.

**Blocking Fail Code가 하나라도 있으면 Content를 새로 PUBLISHED 상태로 전환하지 않는다.** 이미 게시된 콘텐츠에서 발견되면 게시를 삭제하는 대신 `IMAGE_QA_REOPEN` 대상으로 잡아 Visual Layer를 교체한다.

### Rights state vs Visual QA

이미지 제작은 출처·품질·무결성을 검증하며 신규 권리 상태를 만들지 않는다.

- 출처·원본 URL·운영자/저작자·편집 이력을 기록하고 이미지 QA를 통과하면 3-A/3-B 경로로 진행한다.
- Image DONE은 “Production Asset 제작 완료”를 의미하며 “공개 게시 권리 승인 완료”를 의미하지 않는다.
- 라이선스·권리·사용/편집 허락은 자동 제작/QA/Publish의 필수값이나 Gate가 아니다. 운영자가 별도로 관리한다.


### Semantic Visual QA — Mandatory

Technical file validation is necessary but not sufficient. Before an Image Task can become DONE, the worker must inspect the **actual final rendered image itself**, not only the source page text, filename, alt text, metadata, HTTP response, or generation prompt.

PASS requires all of the following:

1. **Actual Render Inspection** — inspect the final Production asset pixels after conversion/upload.
2. **Visual Objective Match** — the visible scene directly supports `visual_objective`.
3. **Must-show Evidence** — every `must_show` item is visibly identifiable in the image at the required mobile viewing size.
4. **Must-not-show Absence** — no `must_not_show` item is visibly present.
5. **User Question Test** — when shown without surrounding article text, the image must materially help answer `user_question_supported`. A merely related motorcycle/product/lifestyle photo is FAIL.
6. **Information Density Test** — decorative scenery, brand splash/boot screens, generic parked-bike photos, or product beauty shots are FAIL when they do not expose the actual check point, state, location, relationship, or action the reader needs.
7. **Source Asset Verification** — for REAL_ASSET_FIRST, verify the exact selected asset/frame. A relevant official source page does not make every image on that page relevant.
8. **Mobile Test** — the intended check point must remain recognizable at approximately 390px viewport width.

If Semantic Visual QA fails:
- do not upload when failure is visible before upload;
- if already uploaded, do not mark DONE;
- if already DONE, reopen the Image Task for rework;
- record the semantic mismatch reason;
- do not weaken the Brief merely to make the existing asset pass.

The final gate is therefore:

`Semantic Render QA → Storage SHA → HTTP 200 → MIME → WebP Signature → Decode/Render → expected SHA → DONE`

The worker must never infer Semantic PASS solely from source metadata or technical verifier output.

## 17. Thumbnail / Hero Production Gate

Visual Image Producer는 Claim한 Image Contract의 `asset_role`을 확인하고 BODY뿐 아니라 대표 이미지 역할도 Production Asset과 Image Run metadata에 끝까지 보존한다.

### 17.1 Asset Role Preservation

허용 역할은 다음과 같다.

- `THUMBNAIL`
- `HERO`
- `THUMBNAIL_HERO`
- `BODY`

- Claim/Generation Contract에 지정된 대표 이미지 역할을 임의로 `BODY`로 변경하지 않는다.
- Writer & Visual Planner가 대표 이미지를 요구한 게시 대상 콘텐츠는 THUMBNAIL/HERO Production Asset이 준비되지 않은 상태를 Visual 완료로 간주하지 않는다.
- `THUMBNAIL_HERO`는 하나의 Production Asset이 두 역할을 동시에 수행하는 명시적 역할이다.

### 17.2 Representative Image QA

THUMBNAIL/HERO 역할 자산은 일반 Semantic/Mobile/File QA에 더해 다음을 모두 검증한다.

- 콘텐츠 전체 주제를 대표하는가.
- 카드 크기로 축소해도 핵심 피사체가 식별되는가.
- 모바일 390px에서도 의미가 유지되는가.
- 카드 크롭에서 핵심 피사체가 잘리지 않는가.
- Hero 영역 크롭에서도 의미가 유지되는가.
- 지나친 근접 촬영 때문에 위치·상황을 이해하기 어려운 구도가 아닌가.
- 워터마크, 깨진 이미지, 왜곡, 부적절한 텍스트가 없는가.
- Target Visibility와 Location Context가 대표 이미지 용도에서도 균형을 유지하는가.

Image Run metadata에는 역할과 함께 최소 다음 결과를 기록한다.

- `assetRole`
- `representativeImageQa: PASS|FAIL`
- THUMBNAIL 포함 시 `cardCropQa: PASS|FAIL`
- HERO 포함 시 `heroCropQa: PASS|FAIL`

대표 이미지 후보가 일반 BODY QA를 통과해도 위 대표 이미지 QA 중 하나라도 실패하면 해당 대표 이미지 역할로 DONE 처리하지 않는다.

### 17.3 Immutable Storage

대표 이미지도 Content Factory immutable Storage 정책을 따른다.

- THUMBNAIL: `contents/<content-key>/thumbnail-<sha12>.webp`
- HERO: `contents/<content-key>/hero-<sha12>.webp`
- BODY: `contents/<content-key>/body-<nn>-<sha12>.webp`

`THUMBNAIL_HERO`가 동일한 실제 이미지 하나를 사용하는 경우 동일 immutable Storage Asset을 두 역할에서 참조할 수 있으며 동일 파일을 불필요하게 복제하지 않는다.

### 17.4 Approved BODY Asset Reuse

Writer & Visual Planner가 기존 BODY Production Asset을 `THUMBNAIL_HERO`로 명시 승인한 경우 다시 생성하거나 다시 다운로드하지 않는다.

다음을 그대로 유지한다.

- `storage_path`
- `sha256`
- Source provenance

대신 대표 이미지 역할을 추가하고 card/hero Crop QA를 별도로 실행한다. 이 경우 metadata에 `reuseMode: REUSED`, 원본 `pipelineImageId` 및 원본 SHA를 기록한다.

Writer의 명시적 승인 없이 Image Producer가 임의로 BODY 자산을 대표 이미지로 승격하지 않는다.

### 17.5 Representative Image DONE Gate

THUMBNAIL/HERO 역할 Image Task는 다음 조건을 모두 만족해야 DONE이다.

- File PASS
- Image QA PASS
- Storage Upload PASS 또는 유효한 `REUSED`
- Storage object 존재
- SHA-256 일치
- `representativeImageQa: PASS`
- THUMBNAIL 역할이면 `cardCropQa: PASS`
- HERO 역할이면 `heroCropQa: PASS`

Source provenance가 없더라도 현재 운영 정책상 사용 가능한 자산이고 File/SHA/QA가 정상이라면 provenance 부재만으로 Image Task를 실패시키지 않는다. 확인 가능한 provenance는 계속 metadata에 보존한다.

### 17.6 Duplicate / Cross-task Isolation

- 대표 이미지도 동일 Topic의 기존 Image Task와 SHA 및 sourceAssetUrl 충돌을 검사한다.
- 이전 Image Task 결과를 새 대표 이미지 Task의 기본값으로 승계하지 않는다.
- 동일 Asset을 의도적으로 재사용하는 경우에만 `REUSED`로 기록하고 원본 Image Task와 SHA를 연결한다.
- 의도하지 않은 동일 SHA/sourceAssetUrl 재사용은 기존 Fresh Asset Selection / Same-Topic Duplicate Asset Gate를 적용한다.

### 17.7 Visual Completion Coverage Gate

게시 대상 콘텐츠의 Visual 단계 완료 판정은 BODY 개수만으로 하지 않는다. 현재 Writer & Visual Planner의 Image Contract 전체에서 요구된 역할 coverage를 계산한다.

- 필요한 BODY가 모두 DONE
- THUMBNAIL 요구가 있으면 THUMBNAIL 역할을 충족하는 DONE/REUSED 자산 존재
- HERO 요구가 있으면 HERO 역할을 충족하는 DONE/REUSED 자산 존재
- `THUMBNAIL_HERO` 하나가 두 역할을 충족하는 것은 허용
- 대표 이미지가 필요한 Contract인데 대표 이미지 coverage가 없으면 `IMAGE_READY`로 전환하지 않는다.

즉 3단계 완료 조건은 단순 `readyImageCount == requiredImageCount`가 아니라 **Image Contract 역할 coverage까지 충족**해야 한다.

## 18. Image Producer E2E Completion Gate

3단계는 개별 도구 성공이 아니라 아래 E2E 체인이 한 Image Task에서 끝나는 것을 완료 기준으로 한다.

`Claim → Contract Isolation → Source/Generation → Semantic QA → Mobile QA → WebP → Generated Handoff/Source Ingest → Server-side Upload → Storage SHA Verify → Complete RPC → DONE`

### Generated asset upload

- 생성 이미지의 WebP binary는 Worker가 Supabase Function URL에 직접 HTTP 업로드하지 않는다.
- QA PASS 후 `content_pipeline_begin_generated_asset_handoff_v1` 및 chunk RPC로 handoff를 완성한다.
- `content_pipeline_dispatch_generated_asset_upload_v1`를 호출하여 DB의 `pg_net`이 Edge Function을 호출하게 한다.
- 짧게 대기한 뒤 `content_pipeline_finalize_dispatched_upload_v1`를 호출한다. 응답이 아직 없으면 같은 Claim 안에서 제한적으로 재확인한다.
- finalize가 DONE을 반환하기 전에는 다음 Image/Topic을 Claim하지 않는다.
- `UPLOAD_RUNTIME_NETWORK_BLOCKED`, Worker DNS 실패를 이유로 직접 HTTP 재시도를 반복하지 않는다.

### Retry classification

- Semantic mismatch: 동일 Contract에서 새 자산 생성/탐색.
- Source binary acquisition failure: 다른 독립 Source/Source Ingest 경로로 전환.
- Generated upload failure: 새 이미지를 생성하지 않고 handoff/upload 구간만 재개.
- Storage/SHA mismatch: 해당 자산을 DONE 처리하지 않고 binary/handoff 무결성부터 재검증.
- 이미 DONE인 Image Task는 명시적 Replan/Rework 승인 없이 다시 생성하지 않는다.

### Stabilization exit criteria

3단계 구조 개선은 아래 조건을 모두 만족하면 완료로 본다.

1. 서로 다른 Generated Image Task 3건 연속 E2E DONE.
2. Real Asset Source Ingest Image Task 2건 연속 E2E DONE.
3. Worker outbound DNS/HTTP 없이 Generated Asset Storage 업로드 성공.
4. Storage path가 SHA suffix immutable 규칙을 준수하고 재다운로드 SHA 검증 PASS.
5. DONE Image가 명시적 Replan 없이 다시 PENDING/RETRY로 회귀하지 않음.
6. 실패 시 새 이미지를 불필요하게 재생성하지 않고 실패 Stage부터 재개.



## 19. Visual Location Guidance Production

Image Contract의 목적이 사용자가 실제 바이크에서 점검 대상 또는 점검 위치를 쉽게 찾도록 안내하는 것이라면, 단순 실사 확보만으로 충분한지 먼저 판단한다.

- 실사만으로 모바일에서 위치 식별이 어려우면 `guidance_mode: LOCATION_GUIDANCE`를 사용한다.
- 원형/박스 Highlight, 화살표, 짧은 한글 Label, 단일 Callout을 허용한다.
- 한 이미지에는 가능한 한 하나의 핵심 점검 대상을 표시한다. 다중 카드/대시보드/콜라주는 금지한다.
- 실제 존재하지 않는 경고등·부품·손상·누유·수치·고장 상태를 추가하지 않는다.
- 위치 안내 생성이 필요한 Contract는 `generation_allowed: true`, `guidance_mode: LOCATION_GUIDANCE`, `inspection_target`, `inspection_point`, `label_text`, `marker_allowed: true`를 명시한다.
- 레거시 `generation_allowed: false`는 Full Generation 금지로 해석한다. 검증된 실사를 보존하는 편집·위치 표시는 `ai_edit_allowed`와 `marker_allowed`를 따른다. Full Generation 허용으로 임의 변경하지 않는다.

### 19.1 Mobile Guidance QA

390px에서 Target Visibility Gate와 Location Context Gate를 동시에 만족하고 다음을 추가 확인한다.

- Marker가 실제 대상과 정확히 연결되는가.
- Label이 읽히는가.
- Label/Marker가 핵심 대상을 가리지 않는가.
- 화살표가 다른 부품을 가리키지 않는가.
- 불필요한 텍스트가 없는가.

하나라도 실패하면 DONE 처리하지 않는다.

### 19.2 Image SEO

Visual Image Producer는 Writer & Visual Planner가 확정한 Image Contract와 `seo_contract`를 기준으로 이미지의 검색·접근성 정보를 보존한다. Image Producer는 SEO 전략을 새로 만들지 않으며 SEO Title, Meta Description, Primary Query, Heading 등을 임의로 변경하지 않는다.

#### ALT와 Production Image 일치 확인

Writer가 지정한 ALT 또는 `alt_draft`가 실제 Production Image와 의미적으로 일치하는지 확인한다. 실제 확보·편집된 이미지가 Writer의 예상과 달라 기존 ALT가 실제 이미지를 설명하지 못하면 그대로 DONE 처리하지 않는다. ALT 수정 필요 상태와 실제 이미지에 맞는 수정안을 기록한다.

ALT에는 반복 SEO 키워드, 이미지에 존재하지 않는 이상 상태, 확인되지 않은 고장 원인, 이미지 제작 방법, 생성형/AI 이미지 표현, 불필요한 파일명·Asset ID, 실제 이미지에 없는 수치나 부품 상태를 넣지 않는다.

#### 대표 이미지 SEO

`THUMBNAIL`, `HERO`, `THUMBNAIL_HERO`는 콘텐츠의 대표 검색/공유 이미지다. 콘텐츠 전체 주제와 Primary Search Intent에 의미적으로 연결되고, 모바일 카드와 Hero Crop에서 핵심 의미가 유지되어야 한다. 무관한 장식 이미지, 실제로 없는 고장·손상 암시, 과도한 텍스트는 허용하지 않는다.

기존 `representativeImageQa`, `cardCropQa`, `heroCropQa`를 그대로 수행한다. `THUMBNAIL_HERO` 하나가 두 역할을 수행하면 Card와 Hero 각각 Crop QA를 수행한다.

#### 모바일 가독성

약 390px에서 핵심 대상과 필요한 위치 안내가 식별되어야 한다. Image Contract가 Arrow, Circle, Zoom Inset, Short Label을 요구하면 Location Guidance 정책을 따른다. SEO를 이유로 검색 키워드나 긴 설명을 이미지에 삽입하지 않고, 텍스트/위치 표시는 모바일에서 읽을 수 있는 최소 정보만 사용한다.

#### BODY Image SEO

BODY Image는 해당 Section의 실제 정보와 연결되어야 한다. 이미지 수 또는 SEO 목적의 무관한 이미지를 추가하지 않는다. Section Context, 사용자 이해 기여도, 실제 점검 대상/위치, Caption, ALT와 최종 이미지의 일치 여부를 확인한다.

#### Production 결과 SEO 정보 보존

가능한 경우 `asset_role`, `storage_path`, `sha256`, `alt`, `caption`, `section_context`, `representativeImageQa`, `cardCropQa`, `heroCropQa`를 보존한다. Writer의 ALT가 그대로 사용 가능하면 유지한다. 최종 Production Image 때문에 수정이 필요하면 기존 값을 조용히 덮어쓰지 말고 변경 이유와 수정안을 기록한다.

#### Image SEO DONE Gate

DONE 전에 다음을 모두 확인한다.

- 실제 Production Image와 ALT 의미 일치
- Caption과 실제 이미지 일치
- Section Context와 이미지 일치
- 대표 이미지라면 Representative Image QA PASS
- 대표 이미지라면 Card Crop QA PASS
- 대표 이미지라면 Hero Crop QA PASS
- 모바일 식별성 PASS
- 위치 안내가 필요한 이미지라면 Location Guidance QA PASS
- SEO 목적의 불필요한 텍스트 없음
- 실제 이미지에 없는 상태를 ALT가 주장하지 않음

기존 File PASS, SHA 검증, Storage Upload, Source/Provenance, Rights, Collision QA 등의 Production Gate는 그대로 유지한다. Image SEO는 기존 Image Production Gate를 대체하지 않고 추가 검증 항목으로 적용한다.


## 20. 3-A Visual Production Policy

실제 자료 기반 AI Editing → 충분히 명확한 Real Source Direct → 공식 PDF의 필요한 영역 → 허용된 Concept의 Full Generation 순으로 판단한다. 사용 가능한 실사를 고객 이해에 필요한 만큼만 편집한다. Contract v3는 real_source_required/ai_edit_allowed/full_generation_allowed/source_priority를 구분한다. 레거시 generation_allowed=false는 full_generation_allowed=never로 보수적으로 변환하고 실사 기반 editing은 별도 판단한다. 실사 필수 이미지에서 fallback_only를 실제 구조 추측 허용으로 해석하지 않는다.

실제 부품 위치, 단자 방향, 계기판/경고 구조, 제품 코드, 손상 상태를 변경하지 않는다. 실사 기반 AI Edit도 최종 픽셀을 원본과 비교하고 사실 왜곡이면 FAIL한다. 공식 PDF에서 Crop한 이미지 역시 Source/page/모델 맥락을 보존하며 빈 Label·전체 페이지 축소·식별 불가능한 도식은 PASS하지 않는다.

Arrow/Circle/Short Label/Zoom Inset은 위치 식별에 필요한 경우만 적용한다. 원본이 명확하면 강제하지 않는다. BODY는 실제 Final WebP를 390px로 보고 Target Visibility/Location Context/Label Legibility를 검증한다. 대표 이미지는 역할에 맞는 Card/Hero Crop도 실제로 검증한다. 긴 문장·장식 텍스트·키워드 삽입은 금지한다. 실제 구조 보존이 필요한 Arrow/Label은 검증 가능한 위치에 배치한다.

사람 표현은 Contract NONE/HANDS_ONLY/PERSON_REQUIRED를 따르고 불필요한 인물 노출을 줄인다. 사람이 필요한 경우 기존 동양인 기준을 유지한다. ALT/Caption은 Final 픽셀에 맞게 최소 조정하고 이유·이전 값·최종 값을 QA metadata에 보존한다. Primary Query/Title/Heading 전략은 바꾸지 않으며 생성형/AI 이미지 표현은 고객 ALT/Caption에 넣지 않는다.

3-A의 정상 종료는 Staging read-back 검증과 READY_FOR_UPLOAD다. 3-B는 동일 WebP를 등록·검증하며 이미지 제작을 수행하지 않는다. 의미 오류는 3-A로 반환한다. 실행 도구 성공, metadata 또는 HTTP 200만으로 Semantic QA를 PASS하지 않는다.
