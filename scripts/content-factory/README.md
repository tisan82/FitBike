# FitBike Content Factory v1.2

## Purpose

Generate one review package for the existing Content System. Version 1 never inserts database rows, uploads Storage objects, or publishes content.

## Input

Required: `--topic` and `--type`. Optional: `--part` and `--bike-model-key`.

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

## Publish Deferred

Approved packages use the final operating flow: `SOURCE / TOPIC → GENERATE → QA → IMAGE → REVIEW → APPROVE → PUBLISH`. Publishing is a separate explicit command and never follows `READY_FOR_REVIEW` automatically.

```bash
node scripts/content-factory/publish-content.mjs --content-dir content-work/{content-key} --mode preflight
node scripts/content-factory/publish-content.mjs --content-dir content-work/{content-key} --mode publish
```

The publish command requires `publish-approval.json`, rechecks Production duplicates and Storage conflicts, verifies every required approved image, uploads without overwrite, then inserts content and relations in one database transaction. Re-running an equivalent published package returns `ALREADY_PUBLISHED` instead of inserting duplicates.

Image source priority is `APPROVED_BRAND_ASSET → APPROVED_GENERIC_ASSET → GENERATED_GENERIC → IMAGE_REVIEW_REQUIRED`. Approved, role-suitable Poweroad assets are preferred for battery content and MAXXIS assets for tire content. Brand availability never overrides content suitability, and real products are not recreated with generation.
