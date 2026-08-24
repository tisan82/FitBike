# FitBike Content Factory v2 — Image Candidates

This review-first pipeline converts an approved Content Factory `image-plan.json` into local WebP candidates. It does not upload Storage objects, mutate the database, or publish content.

## Flow

`CONTENT PACKAGE → IMAGE PLAN → GENERATION REQUEST → IMAGE CANDIDATES → TECHNICAL QA → VISUAL REVIEW → REVIEW PACKAGE`

The image plan is authoritative. A thumbnail or hero is generated only when `required` is true, and the number of body candidates must equal `bodyImages.length`.

## Prepare generation requests

```bash
node scripts/content-factory/images/generate-images.mjs --content-dir content-work/motorcycle-battery-inspection-v2 --mode prepare
```

This writes `image-generation-request.json`. Use the available approved image-generation capability once per requested asset. Do not substitute web image search. Generated source files are intermediate inputs; the pipeline normalizes final dimensions, WebP format, and sRGB colourspace.

## Build candidates

Pass one source argument for every asset in the request. After visually checking the source against the role, text, logo, and unsupported-claim rules, record that review explicitly:

```bash
node scripts/content-factory/images/generate-images.mjs \
  --content-dir content-work/motorcycle-battery-inspection-v2 \
  --thumbnail-source C:/path/to/generated-thumbnail.png \
  --visual-review PASS
```

Body inputs use `--body-01-source`, `--body-02-source`, and so on. A hero uses `--hero-source`. Missing required sources fail the run; assets with `required=false` are not accepted or created.

## Outputs

Candidates are written under `content-work/{content-key}/images/`. The pipeline also writes `image-result.json` and a separate `content-package-with-images.json`; the original package remains unchanged. When at least two candidates exist, it creates `content-image-review-sheet.webp` with role labels only.

## Rules

- Thumbnail: 1200×675, 16:9, WebP, sRGB.
- Hero: 1600×900, 16:9, WebP, sRGB, only when required.
- Body: 1200×900, 4:3, WebP, sRGB.
- Long text, logos, watermarks, invented specifications, unsupported technical values, and advertising layouts are prohibited.
- Model guides reuse existing approved bike assets first. Real model replicas are not generated.
- Specific products reuse approved product assets first. Only generic educational visuals may be generated.

## Source priority

Use the first asset that is both approved and suitable for the content role: `APPROVED_BRAND_ASSET → APPROVED_GENERIC_ASSET → GENERATED_GENERIC → IMAGE_REVIEW_REQUIRED`. Approved Poweroad assets are preferred for battery content and approved MAXXIS assets for tire content, but brand availability never overrides role suitability. Do not recreate a real product with generation. Image review and publish approval record `sourceType` explicitly.

Technical QA checks file existence, format, exact dimensions, nonzero size, sRGB colourspace, and decodability. Visual QA checks text overload, unexpected logos, unsupported technical claims, and role alignment before `READY_FOR_VISUAL_REVIEW`.
