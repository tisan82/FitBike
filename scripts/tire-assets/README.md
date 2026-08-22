# Tire model image pipeline

MAXXIS 원본 이미지와 실제 `11_tire_model` 행을 대조하고, 승인 후 WebP 변환 및
Supabase 반영으로 이어가기 위한 관리 파일이다.

## Storage buckets

- `bike-assets`: Bike, Manufacturer, Bike Model asset
- `tire-assets`: Tire Model asset (public bucket, 생성 및 검증 완료)

Tire Model 경로는 다음 slot 규칙을 사용한다.

```text
tire-models/{brand}/{tire_model_key}/main.webp
tire-models/{brand}/{tire_model_key}/sub-01.webp
tire-models/{brand}/{tire_model_key}/sub-02.webp
```

기존 MAXXIS 일괄 실행에서는 `main.webp`만 반영했다. MA-RS는 2026-08-23 별도
승인 작업에서 `main.webp`, `sub-01.webp`, `sub-02.webp` 3개를 모두 반영했다.

## Source and rights registry

`tire-image-source-registry.csv`는 원본 존재, 현재 Production 반영 상태와 이미지
사용 권리를 분리해 기록한다. 로컬 파일 보유나 과거 업로드 성공은 권리 확인
근거가 아니다.

- Main 및 제품이 등장하는 Sub 01은 `RIGHTS_CLEARED`, `USER_OWNED` 또는
  `OFFICIAL_APPROVED` 근거가 있어야 신규 Production 후보로 사용할 수 있다.
- `REFERENCE_ONLY`, `USAGE_UNCLEAR`, `RIGHTS_UNKNOWN`, `DO_NOT_USE`는 신규
  Production 사용을 차단한다.
- `RIGHTS_UNKNOWN`은 기존 자산 조사 상태이며 권리 승인이 아니다.
- `review_status`는 시각·운영 검토 상태이고 `usage_status`를 대체하지 않는다.
- 권리 상태 변경 시 owner, URL, 승인 범위 또는 내부 증빙을 함께 기록한다.
- 사용자 확인에 따라 MAXXIS 본사 공식 웹사이트·catalogue·media asset은
  `OFFICIAL_APPROVED`로 기록할 수 있다. 현지 distributor 이미지는 동일한 본사
  asset임을 확인했거나 출처·사용 범위를 기록하고 사용자가 명시적으로 승인한
  경우에만 승인할 수 있다.

## MA-RS Reference Model

2026-08-23 Production QA 결과:

```text
MA-RS Reference Model: APPROVED
Production: PASS
3-image Standard: CONFIRMED
22-model rollout: READY (execution not started)
```

전용 검증·반영 스크립트는 `ma-rs-production.mjs`이며 기본 실행은 read-only
preflight, `--execute`는 기존 object/DB 값과 로컬 파일을 검증한 뒤 MA-RS 한 행만
guarded update한다. HTTP와 browser QA는 각각 `ma-rs-http-qa.mjs`,
`ma-rs-browser-qa.mjs`로 수행한다.

## Dry run

```powershell
node scripts/tire-assets/dry-run.mjs
```

- `.env.local`의 기존 `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 사용해 공개된 active MAXXIS 모델만 읽는다.
- 현재 DB의 MAXXIS `brand_name` 실제 값은 `맥시스`이므로 이 값으로 범위를 제한한다.
- 파일명은 `M<관리번호>_<모델명>.<확장자>` 형식으로 해석한다. 관리번호는 경로나
  DB key에 사용하지 않는다.
- 모델명은 `11_tire_model.model_name`과 대소문자를 제외하고 정확히 일치해야 한다.
- `UNMATCHED`, `DUPLICATE`, `MISSING_TIRE_MODEL_KEY`가 하나라도 있으면 종료 코드
  `2`로 중단한다.
- 결과는 `tire-image-map.csv`에 기록한다. Credential은 기록하지 않는다.

## 실행

```powershell
node scripts/tire-assets/execute-upload.mjs
```

최초 `tire-assets` bucket 생성이 별도로 승인된 실행에서는 다음 옵션을 사용한다.

```powershell
node scripts/tire-assets/execute-upload.mjs --create-bucket --reuse-webp
```

`--create-bucket`은 bucket이 없을 때만 public `tire-assets`를 생성하고 재조회해
검증한다. `--reuse-webp`은 기존 변환 파일의 format, size, dimensions를 검증한 뒤
재인코딩 없이 업로드한다.

실행 전 `tire-image-map.csv`가 `MATCHED` 20개와
`M073_tube.png` 단일 `UNMATCHED`인지 다시 검증한다. 기존 프로젝트의
Supabase 환경변수와 런타임 credential을 사용하며 credential은 코드, 로그, CSV에
기록하지 않는다. 실행 결과는 `tire-image-upload-result.csv`에 기록한다.

## 변환 및 반영 정책

- 원본은 수정하지 않는다.
- `sharp`의 WebP 변환을 사용하되 crop, 형태 보정, 배경 생성 및 upscale을 하지
  않는다.
- 투명 PNG의 alpha를 유지한다.
- 로컬 출력은
  `assets-source/tire-models/maxxis/upload/{tire_model_key}/main.webp`이다.
- Storage 대상은 `tire-assets` bucket의
  `tire-models/maxxis/{tire_model_key}/main.webp`이다.
- Bike asset은 기존 `bike-assets`를 유지하고, `tire-models/*` object path만
  Production에서 `tire-assets`로 해석한다.
- Storage 업로드와 object 확인이 성공한 뒤에만 `main_image_url`을 변경한다.
  `sub_image_url_1/2`는 변경하지 않는다.
- 기존 `main_image_url`은 신규 object path와 비교해 별도로 보고하고, 명시적 승인
  없이 덮어쓰지 않는다.

재실행할 때 기존 Storage object 또는 기존 `main_image_url`이 있으면 덮어쓰지 않고
각각 `SKIPPED_EXISTING_OBJECT`, `SKIPPED_EXISTING_URL`로 기록한다.

제외 대상은 `M073_tube.png`(`SKIPPED_NOT_TIRE_MODEL`)이며, 원본이 없는 MA-MT와
별도 제작 예정인 MA-RS는 이 파이프라인에서 변경하지 않는다.
