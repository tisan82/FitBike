# FitBike Content Image Storage Policy

**Status:** Mandatory

## Production rule

All images referenced by active Production content must be served from the managed `content-assets` Supabase Storage bucket. Repository `public/` paths are not valid long-term Production content image delivery paths.

Allowed:
- `content-assets` Storage object paths used by Hero, Thumbnail, and Body blocks.

Not allowed for active content delivery:
- external HTTP/HTTPS hotlinks
- `editorial-reference/**` reference-library paths
- repository-local `/content-guides/**`, `/images/contents/**`, `/content-assets/**` public paths

Local repository assets may exist as source/reference files, but before an active content record uses them they must be copied to `content-assets`, verified, and the DB path changed to the Storage object path.

## Approved official manufacturer sources

The operator has confirmed FitBike usage rights for official Honda, Yamaha, and BMW website information and images. When used:

- record `source_type=OFFICIAL`, `source_owner`, source page URL, source asset URL, and the content-specific edit description
- set the rights state to the schema-supported approved value and note that operator approval was confirmed
- preserve factual model/year/trim labeling
- convert the selected asset to a content-specific WebP derivative
- serve only the derivative from `content-assets`; never hotlink the manufacturer URL

Approval does not extend to dealer, marketplace, press re-upload, or unrelated third-party images merely depicting those brands.

## Pending external-source rights

Dealer, marketplace, press, blog, community, workshop, or other third-party images may be technically suitable even when operator rights confirmation is still pending.

- record the original page URL, actual asset URL, source owner/author when known, checked time, edit history, and the schema-supported pending rights state
- `PENDING_OPERATOR_APPROVAL` does not block source acquisition, content-specific editing, WebP conversion, upload to `content-assets`, Storage verification, or Image Task DONE
- Storage presence is an internal Production Asset state and does **not** itself authorize public publication
- never relabel a pending third-party source as `OFFICIAL_APPROVED`, `OPERATOR_APPROVED`, or FitBike-created
- the Publish Gate must verify that any pending external-source asset has moved to a publication-allowed rights state before the content becomes publicly active
- rights-pending alone is not a Visual failure code; Visual failures remain technical/information failures such as source mismatch, binary acquisition failure, Image QA failure, WebP failure, upload failure, or Storage verification failure

## Required flow

웹 실사 Real Asset은 `content_pipeline_issue_source_ingest_ticket_v1` → `content-pipeline-source-ingest`를 사용한다. Source Ingest는 현재 Image Claim에 결합된 15분/1회 Ticket을 소비하고, 외부 HTTP(S) 원본의 MIME·용량을 검증한 뒤 ImageMagick WASM으로 WebP를 만들고 SHA-256과 Storage 객체를 재검증한다. `PENDING_OPERATOR_APPROVAL`은 이 기술적 ingest를 막지 않는다.

생성 이미지나 Worker가 이미 보유한 WebP는 기존 `content_pipeline_issue_asset_upload_ticket_v1` → `content-pipeline-asset-upload` 경로를 유지한다.

`source/reference asset → content-specific review → source ingest or asset upload → content-assets Storage → verify object → DB path replacement → Production QA`

## QA gates

Production image QA fails when any active content contains:
- `EXTERNAL_HOTLINK`
- `LOCAL_PUBLIC_IMAGE_REF`
- `REFERENCE_ASSET_DIRECTLY_SERVED`
- `MISSING_STORAGE_OBJECT`
- `BROKEN_IMAGE_RESPONSE`

Completion requires all active content Hero/Thumbnail/Body image references to resolve to managed Storage objects, with zero external hotlinks and zero local public image references.
