# FitBike Generated Image Reference Library Policy

**Status:** Mandatory AI production rule  
**Scope:** ChatGPT/Image Generation 결과물, 대시보드형 합성 이미지, 콜라주, UI mockup, 콘텐츠 기획 참고 이미지

## 1. Purpose

ChatGPT와 대화 중 생성된 이미지 중 일부는 실제 서비스 화면에 바로 노출하기 위한 자산이 아니라, 이후 Content Factory가 **새로운 서비스용 이미지를 생성할 때 참고하는 Reference Asset**이다.

특히 대시보드, 콜라주, 여러 콘텐츠 화면을 한 장에 합친 이미지, 개선 전/후 비교판, UI mockup은 서비스 콘텐츠의 Hero/본문 이미지로 직접 사용하지 않는다.

이 자산의 목적은 다음과 같다.

- 콘텐츠별 이미지 구도 아이디어 참고
- 어떤 부품/위치/행동을 시각화해야 하는지 참고
- FitBike의 시각적 톤과 정보 밀도 참고
- 생성형 AI용 Image Brief 작성 시 reference input으로 활용
- 과거에 승인된 시각 표현 패턴 재사용

## 2. Storage Classification

생성형 AI 참고 자산은 Production Content Asset과 물리적/논리적으로 구분한다.

권장 경로:

```text
content-assets/
└─ editorial-reference/
   ├─ generated/
   ├─ dashboards/
   ├─ collages/
   ├─ ui-mockups/
   └─ concept-boards/
```

기존 `editorial-reference/generated/*` 자산도 동일 정책을 적용한다.

## 3. DO NOT SERVE DIRECTLY

`editorial-reference/**` 경로의 자산은 **서비스 콘텐츠에 직접 노출하지 않는다.**

금지 대상:

- `12_content.hero_image_storage_path`
- `12_content.thumbnail_image_storage_path`
- `12_content.body_blocks[].storagePath`
- 상품 상세의 Production 이미지
- 모델 상세의 Production 이미지
- `/contents` Hub Thumbnail
- SEO/OpenGraph용 대표 이미지

대시보드형/콜라주형 이미지는 한 화면 안에 여러 문맥과 작은 텍스트가 들어 있어 모바일 콘텐츠 이미지로 적합하지 않다.

## 4. How AI Should Use Reference Assets

Content Factory의 Image Editor는 Reference Asset을 **복사하거나 그대로 Crop해서 게시하는 용도**로 사용하지 않는다.

다음 순서로 활용한다.

```text
Reference Asset 조회
→ 현재 Topic에 필요한 시각 정보 추출
→ 실제 사용자 질문 기준으로 Image Brief 재작성
→ 필요한 부품/위치/행동을 1 Visual = 1 Purpose로 재구성
→ 실사 우선 여부 판단
→ 실사 확보 또는 생성형 AI로 신규 이미지 생성
→ 모바일 가독성/사실성 검토
→ WebP 최적화
→ Production 전용 Storage 경로에 저장
→ Production Content에서 신규 Asset만 호출
```

즉 Reference Asset은 **Generation Input / Visual Planning Source**이고, Production Delivery Asset이 아니다.

## 5. Reference Extraction Rule

대시보드나 콜라주에서 다음 요소는 참고할 수 있다.

- 특정 부품을 어떤 각도에서 보여주는지
- 어느 위치에 Callout이 필요한지
- 단계별 이미지 구성 방식
- 정상/이상 비교 방식
- 모바일에서 필요한 정보 우선순위
- FitBike UI/정보 톤

하지만 다음은 그대로 재사용하지 않는다.

- 대시보드 전체 화면
- 작은 패널을 Crop한 저해상도 이미지
- 작은 글자가 포함된 패널
- 여러 정비 상황이 한 이미지에 섞인 장면
- 사실 관계가 검증되지 않은 mockup 속 수치/규격/가격

## 6. Generated Image Production Rule

Reference Asset을 기반으로 새 이미지를 생성할 때 Image Brief에 최소 다음을 포함한다.

- `source_reference_asset`: 참고한 Storage path
- `purpose`: 이 이미지가 답할 사용자 질문
- `inspection_target`: 보여줄 부품/영역
- `inspection_point`: 어디를 집중해서 봐야 하는지
- `real_photo_required`: 실제 구조 확인이 필요한지
- `generation_type`: PHOTO_RECONSTRUCTION / EDUCATIONAL_VISUAL / CALLOUT / COMPARISON
- `mobile_readability_target`: 390px 기준 인지 조건
- `do_not_copy_layout_verbatim`: true

Reference Asset을 그대로 복제하는 것이 아니라 해당 콘텐츠 목적에 맞게 새로운 Visual로 재설계한다.

## 7. Metadata Rule

`17_content_asset_source`에서 Reference Asset은 다음 원칙을 사용한다.

```text
asset_role = REFERENCE
source_type = GENERATED
source_owner = FitBike
used_in_service = false
```

FitBike가 생성한 자산이면 권리 상태는 검증 후 `OWNED_APPROVED`로 관리할 수 있다.

이 자산을 기반으로 새 Production Asset을 만들면 새 Asset record를 별도로 생성한다. Reference record를 Production record로 재사용하지 않는다.

## 8. Production Asset Separation

Production용 신규 이미지 경로는 Reference 경로와 분리한다.

예:

```text
Reference:
editorial-reference/dashboards/content-image-optimization-dashboard-v1.webp

Production:
contents/motorcycle-chain-maintenance/chain-slack-check.webp
contents/motorcycle-chain-maintenance/sprocket-wear-check.webp
```

이렇게 해야 Content Factory가 '참고 이미지'와 '실제 서비스 이미지'를 혼동하지 않는다.

## 9. QA Gate

Production QA에서는 다음을 검사한다.

- `editorial-reference/**`가 Content DB에 직접 연결되어 있지 않은가?
- Reference Asset을 Crop만 해서 Production에 사용하지 않았는가?
- 새로운 Production Visual이 현재 Topic의 목적에 맞게 재구성됐는가?
- 실사 필요 항목을 생성 이미지가 실제 사진처럼 대체하지 않았는가?
- 이미지 내 텍스트가 모바일에서 읽히는가?

다음 상태는 FAIL이다.

- `REFERENCE_ASSET_DIRECTLY_SERVED`
- `DASHBOARD_USED_AS_CONTENT_IMAGE`
- `REFERENCE_CROP_USED_AS_REAL_PHOTO`
- `REFERENCE_FACTS_NOT_REVALIDATED`

## 10. Operational Principle

ChatGPT/Image Generation으로 생성한 이미지 중 서비스에 바로 적합하지 않은 자산도 버리지 않는다.

**Reference Library에 보존 → Content Factory가 필요 시 검색 → Image Brief 참고 → 신규 Production Asset 생성** 흐름으로 사용한다.

Reference Library는 '이미지 창고'가 아니라 **FitBike 전용 Visual Knowledge Base**로 관리한다.
