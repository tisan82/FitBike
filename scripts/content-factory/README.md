# FitBike Content Factory v1

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

The generator follows `PLAN → EVIDENCE → DRAFT → RELATIONS → IMAGE PLAN → QA → PACKAGE`. It writes `plan.json`, `evidence.json`, `body-blocks.json`, `relations.json`, `image-plan.json`, `qa.json`, and `content-package.json` under `content-work/{contentKey}/`.

## Evidence Rules

The production database is read only. Duplicate keys and exact published titles stop generation. A targeted bike key must resolve to one active `02_bike_model`; active `03_bike_model_year` rows are recorded as facts. Missing evidence produces `BLOCKED_EVIDENCE`. Generic copy without model, fitment, specification, product, position, or performance claims may use `NOT_REQUIRED`.

## Output Files

All seven files are JSON and are intermediate review artifacts. `content-work/` is ignored by Git.

## QA Status

- `READY_FOR_REVIEW`: evidence is complete or not required, schemas and relations are valid, and no unsupported claim was found.
- `REVIEW_REQUIRED`: the package is structurally valid but copy or relation judgment remains.
- `BLOCKED_EVIDENCE`: required internal evidence is missing.

## Review Flow

Review evidence against every factual claim, edit copy if needed, approve relations and image concepts, then use a separate explicitly authorized publish task.

## Publish Deferred

There is no publish script, database mutation, Storage upload, scheduler, queue, or batch generation in v1.
