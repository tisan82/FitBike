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
- `/today/battery-check-before-replace`: permanent redirect to `/contents/battery-check-before-replace`

## Content Types

- `MAINTENANCE`
- `DIY`
- `PARTS_GUIDE`
- `MODEL_GUIDE`

## Block Types

The supported `body_blocks` union is limited to `heading`, `paragraph`, `image`, `bullet_list`, `numbered_list`, `step`, `tip`, `warning`, and `table`. Blocks render as React elements without interpreting stored HTML.

## Publishing Rule

Public content must satisfy all of the following: `is_active = true`, `published_at IS NOT NULL`, and `published_at <= now()`. The directory order is `published_at DESC`, then `content_id DESC`.

`/contents` and Home's recent-guide gate use five-minute ISR. `/sitemap.xml` uses a dynamic Route Handler with a five-minute CDN response cache so runtime publishing is reflected without disabling caching globally; the metadata sitemap convention is not used because its Production output was observed remaining bound to the deployment artifact.

## Autonomous Publishing Policy

Content Factory의 Autonomous Batch는 정상 Candidate마다 사람 승인을 요구하지 않고, Risk와 검증 Gate를 조합해 게시 여부를 결정한다. 기존 `L1`/`L2` 필드는 데이터 호환성과 분류 정보로 유지하지만, `L1` 자체를 무조건적인 Human Review 조건으로 사용하지 않는다.

- `LOW`: 필수 Fact, Duplicate/Intent, Content, Image, Safety Gate가 모두 PASS이면 자동 게시한다.
- `MEDIUM`: 모든 필수 Gate와 Medium Auto Clearance Gate가 모두 PASS인 경우에만 자동 게시한다.
- `HIGH`: 자동 게시하지 않고 `HOLD`로 보낸다.

Medium Auto Clearance는 Critical Fact가 `VERIFIED`이고 Source Conflict, Critical Unverified Claim, Unsupported Numeric Claim, Unsupported Service Limit, Technical Misrepresentation, Product/Model Mismatch, 별도 강제 Human Review 사유가 모두 없으며 Safety, Duplicate/Intent, Content, Image QA가 모두 PASS여야 한다. 하나라도 실패하거나 불확실하면 해당 Candidate만 `HOLD`하며 Batch는 다음 Candidate를 계속 처리한다.

Risk와 관계없이 Source Conflict, Fact QA 실패, Critical Claim 검증 부족, Safety uncertainty, 지원되지 않는 수치·정비 한계, 기술적 오표현, Product/Model 불일치, 해결되지 않은 Duplicate 또는 Subject Drift, Image QA 실패, Production integrity uncertainty는 강제 `HOLD`다. Human Review는 정상 흐름의 기본 단계가 아니라 이 Exception Queue를 처리한다.

중복 Candidate는 `KEEP`, `REDEFINE`, `DROP` 중 하나로 판정한다. `REDEFINE`은 한 번만 수행하고 Duplicate Gate에 다시 진입하며, 재정의된 Subject, Intent, Action, Coverage, Safety 특성으로 Risk를 다시 계산한다. Batch 완료 조건은 Candidate 생성 수가 아니라 새 `PUBLISHED` 수가 요청 Target에 도달하는 것이다.

## Current Scope

- Published content list and content-type filter
- Published content detail and structured block rendering
- Optional thumbnail and hero rendering from `content-assets` object paths
- Detail metadata, canonical URL, Open Graph fields, and Article JSON-LD based on stored values
- Missing, inactive, and unpublished content handled with Next.js `notFound()`
- Up to three published guides on a related Bike Model Detail page
- Related active bike cards on content detail, linked through the newest active model-year route
- Home discovery gate with up to three newest published guides and a `/contents` CTA
- `/contents` and every published content detail included in the sitemap
- Generic part-category relations may be stored without a specific product target; the migrated battery check article uses `BATTERY` / `CATEGORY`.

## Deferred Scope

- Part relation UI
- Related content
- Admin CRUD
- Content editor
- `/today` migration
