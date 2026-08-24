# Content

**Status:** Foundation

## Responsibility

Provide published motorcycle maintenance, DIY, parts specification, and model guide articles. Content is information-first and does not introduce popularity, recommendation, or ranking.

## DB Tables

- `12_content`: article identity, publication state, images, and structured body blocks
- `13_content_bike_model`: content-to-bike-model relation
- `14_content_bike_model_year`: content-to-model-year relation
- `15_content_part_link`: content-to-part relation

The public implementation reads content and its bike-model relations. Database mutations are delivered through reviewed migrations; the application does not mutate content or Storage data.

## Routes

- `/contents`: published content directory with content-type filtering
- `/contents/[contentKey]`: published article detail

## Content Types

- `MAINTENANCE`
- `DIY`
- `PARTS_GUIDE`
- `MODEL_GUIDE`

## Block Types

The supported `body_blocks` union is limited to `heading`, `paragraph`, `image`, `bullet_list`, `numbered_list`, `step`, `tip`, `warning`, and `table`. Blocks render as React elements without interpreting stored HTML.

## Publishing Rule

Public content must satisfy all of the following: `is_active = true`, `published_at IS NOT NULL`, and `published_at <= now()`. The directory order is `published_at DESC`, then `content_id DESC`.

## Current Scope

- Published content list and content-type filter
- Published content detail and structured block rendering
- Optional thumbnail and hero rendering from `content-assets` object paths
- Detail metadata, canonical URL, Open Graph fields, and Article JSON-LD based on stored values
- Missing, inactive, and unpublished content handled with Next.js `notFound()`
- Up to three published guides on a related Bike Model Detail page
- Related active bike cards on content detail, linked through the newest active model-year route

## Deferred Scope

- Part relation UI
- Related content
- Admin CRUD
- Content editor
- `/today` migration
