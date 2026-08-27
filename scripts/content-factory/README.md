# FitBike Content Factory v1.2

## Purpose

Generate one review package for the existing Content System. Version 1 never inserts database rows, uploads Storage objects, or publishes content.

## Input

Required: `--topic` and `--type`. Optional: `--part` and `--bike-model-key`.

Production operation should select a `PLANNED` row from `16_content_topic` instead of starting from unrestricted free text. Direct topic input remains a controlled development interface.

## CLI Usage

```bash
node scripts/content-factory/generate-content.mjs --topic "오토바이 타이어 공기압 확인 방법" --type MAINTENANCE --part TIRE
```

```bash
node scripts/content-factory/generate-content.mjs --topic "PCX125 타이어 관리 가이드" --type MODEL_GUIDE --part TIRE --bike-model-key HONDA_PCX125
```

## Pipeline

The generator follows `REQUEST → NORMALIZE INTENT → CHECK EXISTING CONTENT → PLAN → EVIDENCE → SELECT TYPE STRATEGY → GENERATE BODY → QUALITY QA → IMAGE PLAN → PACKAGE`. It writes `plan.json`, `evidence.json`, `body-blocks.json`, `relations.json`, `image-plan.json`, `qa.json`, and `content-package.json` under `content-work/{contentKey}/`.

## Evidence Rules

The production database is read only. Existing active content is indexed by key, title, summary, type, part relation, and bike relation before body generation. A targeted bike key must resolve to one active `02_bike_model`; active `03_bike_model_year` rows are recorded as facts. Missing evidence produces `BLOCKED_EVIDENCE`. Generic copy without model, fitment, specification, product, position, or performance claims may use `NOT_REQUIRED`.

## Output Files

All seven files are JSON and are intermediate review artifacts. Exact and near duplicates stop before body generation and write only `duplicate-report.json`. `content-work/` is ignored by Git.

## QA Status

- `READY_FOR_REVIEW`: evidence is complete or not required, schemas and relations are valid, no unsupported claim was found, semantic duplication and incomplete procedures are absent, information priority passes, and information density is `GOOD`.
- `REVIEW_REQUIRED`: the package is structurally valid but copy or relation judgment remains.
- `BLOCKED_EVIDENCE`: required internal evidence is missing.
- `DUPLICATE_CONTENT`: the normalized request intent matches an existing content item.
- `DUPLICATE_REVIEW_REQUIRED`: the same entity and action substantially overlap an existing item and generation stops for review.

## Quality Rules

- Do not repeat the same semantic theme as a separate section after it has already been explained. A short reference inside a required procedure is allowed.
- Maintenance and DIY procedures must cover preparation, checking, evaluation, and follow-up without ending midway through the task.
- Each major section needs enough explanation to help the reader act; heading-heavy, explanation-light output is `TOO_LIGHT` and cannot be ready for review.
- Core information and the actual procedure take priority over warnings and optional tips.
- `NOT_REQUIRED` content cannot introduce exact pressure or temperature values, model-specific specifications, or performance claims without evidence.

## Type Strategies

- `MAINTENANCE`: what to check, preparation, check procedure, evaluation, follow-up, and reference warning. Procedure QA applies to inspection, replacement, and maintenance actions.
- `DIY`: prerequisites, tools and parts, ordered work, result verification, and safety warning. Procedure QA always applies.
- `PARTS_GUIDE`: definition, reading or understanding, key elements, comparison example, and application. Explanation blocks take priority over forced steps.
- `MODEL_GUIDE`: model context, year or generation distinctions, verified part data, data use, and related checks. A bike key and model/year Evidence are required; procedure QA applies only to procedural actions.

## Review Flow

Review evidence against every factual claim, edit copy if needed, approve relations and image concepts, then use a separate explicitly authorized publish task.

## Topic registry

Supabase `16_content_topic` is the production queue and duplicate-prevention registry. It stores normalized intent, priority, lifecycle status, and the resulting `12_content.content_id`. Anonymous public access is disabled.

```bash
node scripts/content-factory/topic-registry.mjs --operation register-topic --topic-key {key} --topic "{topic}" --content-type MAINTENANCE --part-type BATTERY --dry-run true
node scripts/content-factory/topic-registry.mjs --operation get-next-topic
node scripts/content-factory/topic-registry.mjs --operation update-topic-status --topic-key {key} --status GENERATING --dry-run true
```

Queue order is priority ascending and then creation time ascending. Allowed lifecycle transitions are enforced by the CLI. Publishing requires an `APPROVED` registry topic and atomically changes it to `PUBLISHED` with the new content ID. Failed publishing must not mark a topic published.

## Publish Deferred

Approved packages use the final operating flow: `SOURCE / TOPIC → GENERATE → QA → IMAGE → REVIEW → APPROVE → PUBLISH`. Publishing is a separate explicit command and never follows `READY_FOR_REVIEW` automatically.

```bash
node scripts/content-factory/publish-content.mjs --content-dir content-work/{content-key} --mode preflight
node scripts/content-factory/publish-content.mjs --content-dir content-work/{content-key} --mode publish
```

The publish command requires `publish-approval.json`, rechecks Production duplicates and Storage conflicts, verifies every required approved thumbnail, hero, and body image, uploads without overwrite, then inserts content and relations in one database transaction. Approved body images are mapped to `contents/{contentKey}/body-NN.webp` and inserted as existing-schema image blocks near the most relevant section (or at the explicit image-plan placement). Re-running an equivalent published package returns `ALREADY_PUBLISHED` instead of inserting duplicates.

Content images use a brand-asset-first policy. Tire thumbnails and product representation default to approved MAXXIS assets; battery equivalents default to approved POWEROAD assets. Product/part representation cannot use a generated generic substitute. A usage/action visual may fall back only with a recorded brand-unsuitability reason, while an educational body diagram may be generated when it avoids invented structure, specifications, and performance claims. Prepared image metadata records the selected source, brand check, result, and fallback reason.

## Automation policy v2

Autonomous Batch의 최종 게시 판단은 Risk와 Fact, Safety, Duplicate/Intent, Content, Image, Auto Clearance Gate의 조합으로 결정한다. `L1`/`L2`는 기존 Registry 데이터 호환성을 위해 유지하지만, `L1`은 더 이상 단독으로 Human Approval을 강제하지 않는다. 제품 정책의 Source of Truth는 `docs/03_service_modules/CONTENT.md`다.

Risk is fail-closed:

- `LOW`: generic explanatory or visual-inspection content without model data, technical numbers, or safety-critical work; eligible for L2.
- `MEDIUM`: model guides, pressure/diagnostic/replacement-timing topics, battery inspection, and brake maintenance; L1.
- `HIGH`: DIY, disassembly, wheel removal, electrical work, torque, or other safety-critical procedures; L1 with strict human review.

LOW Risk는 모든 필수 Gate가 PASS이면 자동 게시한다. MEDIUM Risk는 Critical Fact `VERIFIED`, Source Conflict 없음, Critical Unverified Claim 없음, Unsupported Numeric Claim과 Unsupported Service Limit 없음, Safety QA PASS, Technical Misrepresentation 없음, Product/Model Mismatch 없음, Duplicate/Intent·Content·Image QA PASS, 별도 강제 Human Review 사유 없음이 모두 충족되어 `AUTO_CLEARANCE_PASS`가 된 경우에만 자동 게시한다. HIGH Risk는 항상 `HOLD`다.

Pre-generation Candidate는 Published Content의 Subject, User/Search Intent, Coverage, Action을 비교해 `KEEP`, `REDEFINE`, `DROP`으로 판정한다. `REDEFINE`은 최대 한 번이며 새 Subject, Intent, Action, Coverage, Safety 특성으로 Duplicate Gate에 재진입하고 Risk를 다시 평가한다. Topic 15의 “브레이크 패드 교체 전 확인할 것”은 이 일반 규칙의 Acceptance Case로서 기존 마모 확인 콘텐츠와 높은 중복을 감지하고, 교체용 패드의 구매 전 호환 규격 확인 Intent로 재정의된다.

Source Conflict, Fact QA 실패, Critical Claim 검증 부족, Safety uncertainty, 지원되지 않는 수치 또는 정비 한계, 기술적 오표현, Product/Model 불일치, 해결되지 않은 Duplicate/Subject Drift, Image QA 실패, Production integrity uncertainty는 Risk와 관계없이 강제 `HOLD`다. HOLD는 해당 Candidate만 Exception Queue로 보내며 Batch 전체를 중단하지 않는다.

Automatic attempts are capped at two. A failed run records `last_error`; after two failures the topic remains `BLOCKED` for human action. Publish failures never advance a topic to `PUBLISHED`. Registry rows store only `automation_level`, `risk_level`, `attempt_count`, and `last_error`; detailed prompts and run artifacts remain in ignored `content-work/`.

### Classification source of truth

`16_content_topic.risk_level` and `16_content_topic.automation_level` are the stored classification source of truth. L1/L2는 최종 게시 승인값이 아니며 Autonomous Batch가 Risk와 현재 Gate 결과를 함께 평가한다. Runtime classifier가 저장값보다 제한적이면 더 높은 Risk Gate를 적용하고 Registry를 조용히 변경하지 않는다. 저장 분류가 없으면 fail-closed한다. 명시적 재분류는 기본 Dry Run이다: `node scripts/content-factory/topic-registry.mjs --operation classify-topic --topic-key {key}`. 승인된 단일 Topic Registry 변경에만 `--apply true`를 추가한다. REDEFINE은 별도 원자적 Registry 갱신 후 새 Intent 기준 분류를 저장한다.

`run-next-topic.mjs`는 단일 Topic 운영 호환 인터페이스다. Autonomous Batch는 `autonomous-batch.mjs`를 사용한다. Batch Target은 새로 게시된 Content 수이며 기본 Max Candidate는 `max(target × 3, target + 10)`이다. 제한 내에서 Target을 충족하지 못하면 `PARTIAL`로 종료한다.

```bash
node scripts/content-factory/autonomous-batch.mjs --target 3 --mode dry-run --dry-run true
node scripts/content-factory/autonomous-batch.mjs --target 20 --mode production --batch-id production-20
```

Dry Run은 Production Registry와 Published Content를 읽어 Candidate, Duplicate/Re-definition, Research 계획, Visual 결정, 예상 Risk를 계산하지만 DB, Storage, Publish를 변경하지 않는다. Production 실행은 기존 generation, image preparation/QA, publish pipeline을 호출하며 승인된 산출물과 모든 Gate를 다시 확인한다.

Batch checkpoint는 Git에 포함되지 않는 `content-work/autonomous-batches/{batch-id}.json`에 Candidate별로 기록한다. 같은 `batch-id` 재실행 시 `PUBLISHED`와 `DROP`은 건너뛰고, `HOLD`는 기본적으로 건너뛴다. 정책 또는 원인이 해결된 HOLD만 `--retry-hold true`로 재시도한다. 중간 상태의 오류는 해당 Candidate를 HOLD로 기록하고 다음 Candidate를 계속 처리한다.

Registry Queue만으로 Max Candidate를 채우지 못하면 active `02_bike_model`과 `03_bike_model_year`의 실제 non-null Tire/Battery/Brake 데이터가 있는 조합에서 Model Guide Candidate를 보충한다. Dry Run에서는 제안만 계산하며 Registry를 변경하지 않는다. Production에서는 Duplicate Gate를 통과한 보충 Candidate만 Registry에 등록하고 저장 분류를 계산한다. Fitment 값이나 존재하지 않는 모델·부품 관계를 추정해 Candidate를 만들지 않는다.

```bash
node scripts/content-factory/autonomous-batch.mjs --target 20 --mode production --batch-id production-20 --retry-hold true
```

Content/topic/image execution remains runtime data and is not committed. Only Factory, schema, and policy changes belong in Git.

### Image execution handoff and resume

Production Image 단계는 `images/generate-images.mjs --mode prepare` 뒤 `images/asset-executor.mjs`를 실행한다. 승인 제품 이미지는 Production DB 관계를 read-only로 조회하여 MAXXIS 또는 POWEROAD 원본을 확인·선택하고, Educational 이미지는 `content-work/{contentKey}/image-execution-request.json`에 생성 Prompt와 출력 위치 및 QA sidecar 요구사항을 남긴다. Codex image generation이 지정된 `image-sources/{assetId}.{png|webp|jpg|jpeg}`와 `{assetId}.qa.json`을 준비한 후 다음 명령으로 Asset 단계부터 재개한다.

```bash
node scripts/content-factory/autonomous-batch.mjs --target 3 --mode production --batch-id {same-batch-id} --retry-system true
```

Publish 완료 후 `PRODUCTION_QA`에서 중단된 System Checkpoint는 `--retry-system true`로 재개한다. 이 경로는 Production DB의 Content/Registry 연결과 로컬 Publish receipt를 먼저 대조하고, 이미 게시된 Content에는 Publish나 Asset Upload를 다시 실행하지 않은 채 Production QA만 재시도한다. QA PASS 후 Checkpoint와 Published Counter는 정확히 한 번 완료된다.

`BLOCKED_SYSTEM`은 시스템 실행 대기 상태로 Topic Registry를 변경하지 않고, 체크포인트 저장 직후 Batch 전체를 중단하여 이후 Candidate 평가와 Mutation을 막는다. 동일 Batch ID와 `--retry-system true`로 실패한 Asset 단계부터 재개하며 이전 Published 수를 Target에 포함한다. `HOLD_CONTENT`는 `ASSET_DATA_ISSUE`, 제품/모델 불일치, Image QA 실패 등 Candidate 자체의 검토 상태이며 기존 `--retry-hold true` 정책에 따라 다음 Candidate 처리를 계속한다. Asset Selector API/Resolver 자체의 예외는 `BLOCKED_SYSTEM`이고, 특정 승인 Object 누락이나 경로·관계 문제는 Batch 전체 장애가 아니다.

승인 MAXXIS/POWEROAD Asset은 다운로드 후 `brand-asset-visual-qa.mjs`가 기존 Image QA Sidecar 형식으로 무결성, 관계 기반 Product Identity, Thumbnail/Hero/Body 역할, 시각 품질, 기술적 오인 및 Brand Asset First를 자동 판정한다. PASS는 Image normalization으로 계속하고, Asset 자체 문제는 Candidate `HOLD_CONTENT`, QA Runtime 실행·저장 문제는 `BLOCKED_SYSTEM`으로 분류한다. Brand Asset이라는 이유만으로 QA를 생략하거나 자동 PASS하지 않는다.

`PARTIAL` Checkpoint의 Hold Candidate는 `--retry-hold true`가 있을 때만 다시 평가한다. Content QA Hold는 검증된 기존 Runtime Artifact를 복원해 Content QA/Repair부터, Critical Fact Hold는 Research/Evidence부터 재개한다. 플래그가 없으면 Hold 상태를 유지하고 `PUBLISHED`/`DROP`은 재처리하지 않으며, 기존 Published Count는 Target 계산에 유지한다.

Retry-Hold가 Publish Gate까지 통과하면 Topic Registry는 전용 복원 동작으로 기존 합법 경로 `BLOCKED → GENERATING`을 거친 뒤 게시 준비 상태로 진행한다. `BLOCKED → REVIEW_REQUIRED` 직접 전이는 사용하지 않는다. Stage Adapter 예외는 실제 실행 Stage를 Checkpoint하며, 과거 Canary의 해당 전이 오류로 `RESEARCH`가 잘못 기록된 Checkpoint는 오류 서명이 일치할 때만 `PUBLISH` 재개 대상으로 정규화해 기존 QA Artifact를 재사용한다.

Auto-Repair 이후 `qa.json`을 Content QA Source of Truth로 사용하고, 수정된 `content-package.json`과 함께 `content-package-with-images.json`에 동기화한다. Synchronizer는 기존 Image Metadata를 덮어쓰지 않고 Evidence Hash 및 Risk·Approval 입력을 기록하며 원자적으로 Package를 교체한다. Publish 직전 stale Package를 다시 검사해 안전하게 동기화할 수 있으면 최신화하고, Image 충돌이나 필수 Artifact 누락이면 Validator 우회 없이 `PUBLISH` 단계에서 `BLOCKED_SYSTEM` 처리한다.

Production 모드는 Candidate를 읽기 전에 `production-capabilities.mjs` Preflight를 실행한다. DB read/write, Research, Content Generation, Image Generation/Output/QA, Storage write, Publish, Production HTTP QA, Sitemap QA, Checkpoint Resume의 12개 Runtime Capability가 모두 `IMPLEMENTED_AND_E2E_VERIFIED`일 때만 Queue 처리를 시작하며, 하나라도 준비되지 않으면 `BATCH_PREFLIGHT_BLOCKED`와 `mutation: NONE`을 반환한다. 단순 파일 존재나 Mock 결과는 READY 근거로 사용하지 않는다.

Global Preflight는 실행 Capability만 검사하며 Brand Asset 존재 여부는 포함하지 않는다. Brand Asset Gate는 Visual Planning 이후 Candidate에 적용한다. `EDUCATIONAL`/`NO_VISUAL`은 Brand Asset 비의존, `PRODUCT_REPRESENTATION`은 해당 승인 Brand Asset을 검사하고, `MIXED`는 Product Brand Gate와 Educational 생성 Gate를 모두 통과해야 한다. 승인 Asset 부재 시 정책상 허용된 fallback만 사용할 수 있고, 그렇지 않으면 해당 Candidate를 `ASSET_DATA_ISSUE`로 `HOLD_CONTENT` 처리한다.

Model Guide Research는 활성 Model/Year를 먼저 Resolve하고 Tire·Battery·Brake의 기존 Production 관계를 구조화된 `FITBIKE_VERIFIED_DATA` Claim Matrix로 저장한다. 필수 관계가 없거나 연식별 Coverage가 부족하면 VERIFIED로 승격하지 않는다. Content QA에서 자동 수정 가능한 문장 조각과 정보 밀도·구조 문제만 최대 2회 Evidence-only Repair하며, 새 수치나 호환 Claim을 만들지 않고 Re-QA를 통과한 결과만 다음 Gate로 보낸다.

## System and content ownership

- GitHub stores application and Factory code, rules, block and database schema migrations, and operating documentation.
- Supabase Database stores Topic Registry rows, generated/review/publish status, published content, and relations.
- Supabase Storage `content-assets` stores Production content images under `contents/{content_key}/`.
- Local `content-work/` stores temporary generation, Evidence, QA, image candidate, approval, and publish artifacts and is always Git-ignored.

Factory/schema/rule/UI/API changes require Git commits. Topic registration, content generation, image review, approval, status changes, and publishing never create Git commits. New schema uses migrations in Git; new Topic or Content data is written at runtime and must not be added as seed migrations. Historical content migrations remain unchanged.
