# MA-RS Image Generation Package

Status: REFERENCE_MODEL_APPROVED
Prepared: 2026-08-21
Production approved: 2026-08-23

## Approved product source

- Source: `assets-source/tire-models/maxxis/original/MAXXIS_MA_RS_official_distributor_hd.png`
- Source page: `https://www.maxxis.com.my/SUPERMAXX-RACE-SLICKMA-RS-59`
- Source owner: MAXXIS official distributor (Daytona Sport)
- Source type: `OFFICIAL_DISTRIBUTOR_PRODUCT_IMAGE`
- Native dimensions: 1111x1220 PNG
- Usage status: `OFFICIAL_APPROVED`
- Review status: `SOURCE_APPROVED`
- Source SHA-256: `0951f72d34a3c071dc983f876737177098d02a379db2aceb3f150a34d2cb7874`

The user approved this official distributor gallery original as the shared
product source for Main V2 and Sub 01 V2. Its front/rear composite structure is
preserved. Headquarters-asset identity was not independently proven, so the
provenance remains official distributor product gallery. The source quality is
`MEDIUM` under the strict 1200px product-pixel threshold, while passing the
practical 800px Main/Sub 01 source gate.

The previous official catalogue front and rear cuts remain in the original
inventory and V1 candidates remain available for comparison. They were not
modified or deleted.

## Candidate disposition

### Main V2

- Candidate: `main-candidate-v2.webp`
- Target: 1200x1200 WebP, sRGB, white background, no text/logo/border.
- Method: approved source -> uniform Lanczos downscale -> centered contain
  composition -> WebP.
- Product structure: original front/rear composite preserved.
- Product long edge: 980px (81.7% of canvas).
- Crop: none.
- Generative processing: none.
- AI upscale, reconstruction, sharpening and invented detail: none.
- Production asset: `assets-source/tire-models/maxxis/upload/MAXXIS_MA_RS/main.webp`
- Storage object: `tire-models/maxxis/MAXXIS_MA_RS/main.webp`
- Status: `APPROVED_FOR_PRODUCTION`.

V1 `main-candidate.webp` remains `REVISE_LOW_RES_SOURCE` and is preserved for
visual comparison.

### Sub 01 V2

- Reviewed candidate: `sub-01-candidate-v2.webp`
- Final candidate: `sub-01-candidate-final.webp`
- Target: 1200x900 WebP, sRGB, light-neutral background.
- Headline: `트랙을 위한 슬릭 구성`
- Supporting: `17인치 전륜 2종 · 후륜 3종의 튜브리스 SKU`
- Feature chips: `SLICK`, `17 INCH`, `TUBELESS`
- Product source: same approved source as Main V2.
- Method: uniform Lanczos downscale and position adjustment only; original
  front/rear composite preserved.
- Forbidden technical diagrams or performance claims: none included.
- SKU QA: FRONT 2, REAR 3, all 17-inch and TL; `120/70R17` remains REAR.
- Minor revision: `FRONT / REAR` -> `17 INCH`; all other visual properties preserved.
- Production asset: `assets-source/tire-models/maxxis/upload/MAXXIS_MA_RS/sub-01.webp`
- Storage object: `tire-models/maxxis/MAXXIS_MA_RS/sub-01.webp`
- Status: `APPROVED_FOR_PRODUCTION`.

V1 `sub-01-candidate.webp` remains
`REVISE_LOW_RES_SOURCE_AND_INFORMATION` and is preserved for comparison.

### Sub 02

- Candidate: `sub-02-candidate.webp`
- Role: Riding / Usage visual.
- Visual approval: yes.
- Production approval: yes.
- Production asset: `assets-source/tire-models/maxxis/upload/MAXXIS_MA_RS/sub-02.webp`
- Storage object: `tire-models/maxxis/MAXXIS_MA_RS/sub-02.webp`
- Status: `APPROVED_FOR_PRODUCTION`.
- This task did not crop, resize, recolor, regenerate or otherwise modify it.

## V1 versus V2

- Main V1 uses low-resolution catalogue extractions; Main V2 uses the approved
  1111x1220 official distributor source and preserves its native composite.
- Sub 01 V1 uses a low-resolution product cut and five repetitive chips; final
  Sub 01 uses the approved source and three product-attribute chips.
- V2 improves sidewall, wheel, product-edge and overall visual clarity without
  generating new detail.
- Remaining limitation: the approved source is a single distributor composite,
  not separate high-resolution front and rear originals.

## Three-image role QA

- Main answers what the MA-RS product looks like.
- Sub 01 explains the verified slick, front/rear and tubeless configuration.
- Sub 02 communicates the controlled closed-circuit usage context.
- Role duplication: none; Main/Sub 01 are product-led while Sub 02 is
  context-led.
- Storage verification: 3/3 PASS (`image/webp`, HTTP 200).
- DB verification: 3/3 exact object paths, mismatch 0.
- Production route: `/tire-detail/model/MAXXIS_MA_RS`, HTTP 200.
- Next Image Optimizer: 3/3 HTTP 200.
- Mobile QA: 390x844 PASS; no horizontal overflow, crop or broken image.
- Desktop QA: 1440px PASS.
- Production approval: `YES`.
- Reference status: `REFERENCE_MODEL_APPROVED`.
- 22-model rollout: `READY`; execution was not started in this task.

No application code deployment was required because the existing detail page
reads the three DB paths dynamically and resolves `tire-models/*` through the
public `tire-assets` bucket.
