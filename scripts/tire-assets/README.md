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

현재 MAXXIS 실행에서는 `main.webp`만 반영했다.

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
