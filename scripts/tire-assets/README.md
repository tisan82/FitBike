# Tire model image pipeline

## Purpose

MAXXIS 원본 이미지와 실제 `11_tire_model` 행을 대조하고, 승인 후 WebP 변환 및
Supabase 반영으로 이어가기 위한 운영 진입점이다. 신규 모델은 Source Gate부터
시작하며, 승인된 Production asset은 `FROZEN`으로 관리한다.

## Folder structure

```text
assets-source/tire-models/{brand}/
├─ original/  # 권리가 확인된 원본 보존
├─ review/    # Main/Sub01/Sub02 candidate와 사용자 검토본
└─ upload/    # 승인 후 Production filename으로 확정한 WebP

scripts/tire-assets/
├─ README.md
├─ dry-run.mjs
├─ execute-upload.mjs
├─ tire-image-map.csv
├─ tire-image-source-registry.csv
└─ tire-image-upload-result.csv
```

## Storage buckets

- `bike-assets`: Bike, Manufacturer, Bike Model asset
- `tire-assets`: Tire Model asset (public bucket, 생성 및 검증 완료)

Tire Model 경로는 다음 slot 규칙을 사용한다.

```text
tire-models/{brand}/{tire_model_key}/main.webp
tire-models/{brand}/{tire_model_key}/sub-01.webp
tire-models/{brand}/{tire_model_key}/sub-02.webp
```

2026-08-23 기준 MAXXIS active 22개 모델은 세 slot의 Storage/DB/Production 반영을
완료했다. 기존 asset은 재실행 대상이 아니며 신규 모델만 아래 운영 flow를 따른다.

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

## Rollout status

2026-08-23 Production QA 결과:

```text
MA-RS Reference Model: APPROVED
Production: PASS
3-image Standard: CONFIRMED
MAXXIS Active Tire Models: 22
Main: 22 / 22
Sub01: 22 / 22
Sub02: 22 / 22
Rollout: COMPLETE
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

## Legacy main upload script policy

다음 정책은 기존 `execute-upload.mjs`의 main-only 일괄 실행 범위다. 신규 3-image
운영 절차는 아래 Operating flow와 `TIRE_MODEL_IMAGE_STANDARD.md`를 따른다.

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

해당 legacy 실행 당시 제외 대상은 `M073_tube.png`(`SKIPPED_NOT_TIRE_MODEL`)였고,
MA-MT와 MA-RS는 main-only script 범위 밖에서 별도 승인 절차로 완료했다.

## Operating flow

```text
SOURCE
→ QUALITY GATE
→ MAIN / SUB01 CANDIDATE
→ USAGE CATEGORY / SUB02 CANDIDATE
→ USER VISUAL REVIEW
→ TARGETED REVISION
→ APPROVED FINAL WEBP
→ STORAGE / DB
→ SAMPLE PRODUCTION QA
→ FROZEN
```

Source Gate가 실패하면 같은 실행에서 탐색 범위를 확대하지 않는다. 별도 Official
Source Acquisition task로 전환하고, 원본을 `original/`에 보존한 뒤 Gate를 다시
실행한다.

## Source priority

1. `assets-source/tire-models/{brand}/original/`의 사용자 관리 original
2. 제조사 공식 source
3. 공식 distributor source
4. 사용 범위가 승인된 공식 asset

일반 쇼핑몰, 블로그, 커뮤니티 이미지는 Production product source로 사용하지 않는다.

## Rights Gate

- Production 가능: `OFFICIAL_APPROVED`, `USER_OWNED`, `RIGHTS_CLEARED`
- Production 불가: `REFERENCE_ONLY`, `USAGE_UNCLEAR`, `RIGHTS_UNKNOWN`,
  `DO_NOT_USE`

Source owner, page/asset URL, 승인 범위와 local file을 Registry에 기록한다. 기존
Production asset은 이 Gate를 반복하지 않고 `FROZEN` 상태를 유지한다.

## Main rule

- Actual Product, 1200×1200, WebP, sRGB, contain, white/light-neutral background
- 제품 전체 외곽과 tread, sidewall, profile을 보존한다.
- baked-in text, logo overlay, AI product reconstruction, generative upscale와 없는
  detail 생성은 금지한다.

## Sub01 rule

- Product / Feature visual, 1200×900, 실제 승인 product source 재사용
- Headline 1개, Supporting 1~2줄, Feature Chip 최대 3개
- DB·공식 source에 존재하는 제품 용도, 구성, 규격과 속성만 사용하고 같은 정보를
  반복하거나 성능 claim을 추론하지 않는다.

## Sub02 rule

- Riding / Usage visual, 1200×900, 이미지 내부 text 없음
- `TRACK`, `SPORT_ROAD`, `TOURING`, `ADVENTURE`, `OFF_ROAD`, `SCOOTER`,
  `URBAN`, `UNKNOWN` 중 검증된 category를 사용한다.
- 불확실하면 `UNKNOWN`이며 추측하지 않는다. product close-up보다 usage context를
  우선한다.

## Candidate, review, and final flow

Candidate는 바로 Production에 반영하지 않는다. `CANDIDATE → USER VISUAL REVIEW →
APPROVED → FINAL WEBP` 순서를 유지하고, 수정 대상만 Targeted Revision한다. 승인된
asset은 재생성·재인코딩·재분석하지 않는다.

## Storage and DB rule

- Bucket: `tire-assets`
- Object: `tire-models/{brand}/{tire_model_key}/{main|sub-01|sub-02}.webp`
- DB: `11_tire_model.main_image_url`, `sub_image_url_1`, `sub_image_url_2`
- DB에는 public URL이 아니라 object path만 저장한다.
- 기존 object나 DB 값은 자동 overwrite하지 않는다. Storage 검증을 통과한 모델만
  guarded DB update하고 read-back으로 확인한다.

## Batch workflow

```text
Inventory
→ Ready 모델만 Batch Candidate 생성
→ Contact Sheet / User Batch Review
→ 문제 모델만 Targeted Revision
→ 승인 Asset만 Batch Production
→ 전체 Storage/DB 자동 검증
→ 대표 Sample Production QA
```

## Failure and stop rule

예상 밖의 source, rights, file, Storage 또는 DB 충돌은 해당 모델을 `BLOCKED`/`HOLD`로
보고하고 멈춘다. 승인이나 권한 없이 overwrite, 삭제 또는 범위 확장을 하지 않는다.

## Codex fast execution rule

- 이미 PASS한 QA와 FROZEN asset을 다시 검사하지 않는다.
- Source, Candidate, Review, Revision, Storage/DB, Sample QA, Commit/Closeout을 별도
  task로 실행하고 각 task 완료 후 종료한다.
- 이미지 task에서 Production/Git을, Production task에서 Source 조사를 실행하지 않는다.
- 요청하지 않은 문서 검토, lint, build, test 또는 인접 작업을 추가하지 않는다.
