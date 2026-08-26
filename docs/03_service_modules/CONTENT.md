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

### Autonomous Image Execution and Resume

Autonomous Batch의 Image 단계는 계획 파일 생성만으로 PASS하지 않는다. `PRODUCT_REPRESENTATION`은 현재 Production 관계를 read-only로 조회해 Tire는 승인된 MAXXIS, Battery는 승인된 POWEROAD Asset을 선택하고, 대상 모델과의 관계 및 Storage 접근성을 확인한다. 승인 Brand Asset이 없는 Brake 표현은 Generic/Educational 정책을 적용한다. `EDUCATIONAL`은 생성 Prompt, 출력 파일, 역할/주제 제약 Metadata와 Image QA sidecar가 모두 존재해야 실행 완료로 인정하며, `MIXED`는 Brand Asset과 Educational Asset을 각각 검증한다. 정책상 이미지가 필요 없는 `NO_VISUAL`만 빈 Asset PASS를 허용한다.

Image QA는 Subject/Role 일치, Brand Asset First, Product/Model 일치, 기술적 오인, 근거 없는 수치, 위험 표현, 모바일 가독성, Asset 가용성과 Storage 준비 상태를 fail-closed로 검사한다. 이미지 생성 출력처럼 시스템 실행 능력이 아직 제공되지 않은 경우 Candidate는 `BLOCKED_SYSTEM`으로 체크포인트되며 Registry를 `BLOCKED`로 바꾸지 않는다. 출력과 QA sidecar를 준비한 뒤 동일 Batch ID와 `--retry-system true`를 사용하면 `ASSET_GENERATION_OR_SELECTION`부터 재개한다. 콘텐츠 자체의 불일치나 Image QA 실패는 `HOLD_CONTENT`이며, `PUBLISHED`와 `DROP`은 재실행하지 않는다.

`HOLD_CONTENT`는 해당 Candidate만 보류하고 Batch를 계속하지만, `BLOCKED_SYSTEM`은 현재 Candidate의 실패 단계와 완료 단계를 저장한 즉시 Batch 전체를 종료하며 이후 Candidate 평가와 Production Mutation을 금지한다. 동일 Batch 재개 시 완료된 단계를 반복하지 않고 실패 단계부터 진행하며, 재개 전 Published 수를 Target 계산에 그대로 포함한다.

Production Batch는 Candidate 평가 전에 DB read/write, Research, Content Generation, Image Generation/Output/QA, Storage write, Publish, Production HTTP QA, Sitemap QA와 Checkpoint Resume를 실제 Runtime 증거로 검사한다. 이 Global Preflight는 실행 엔진의 가용성만 판정하며 특정 Brand Asset의 존재 여부를 전역 필수 조건으로 사용하지 않는다. 필수 Capability 중 하나라도 E2E 검증되지 않으면 `BATCH_PREFLIGHT_BLOCKED`로 종료하며 Topic·Content·Publish Mutation을 시작하지 않는다. Image Runtime은 최신 생성 Artifact와 QA receipt를 요구하고, Storage write 검사는 disposable object를 업로드·readback한 뒤 즉시 삭제한다.

Brand Asset 존재 검사는 Visual Planning 이후 Candidate 단위로 수행한다. `EDUCATIONAL`과 `NO_VISUAL`은 Brand Asset을 요구하지 않고, `PRODUCT_REPRESENTATION`은 해당 제품 역할에 승인된 Brand Asset의 DB 관계·정확한 Bucket·Object 접근성을 검사하며, `MIXED`는 제품 역할의 Brand Gate와 Educational 생성 Gate를 각각 적용한다. Selector/Resolver 실행 장애는 `BLOCKED_SYSTEM`이지만, 특정 승인 Object 누락·경로 불일치·승인 Asset 부재는 `ASSET_DATA_ISSUE`, 제품/모델 관계 불일치는 `PRODUCT_MODEL_MISMATCH`로 해당 Candidate만 `HOLD_CONTENT` 처리한다. 정책이 명시적으로 허용하는 Generic/Educational fallback이 있을 때만 fallback을 사용할 수 있으며 임의의 유사 제품 Asset으로 대체하지 않는다.

Model-specific Content의 Critical Fact는 Production DB의 활성 Brand → Model → Model Year를 먼저 식별한 뒤 Subject별 기존 관계를 `FITBIKE_VERIFIED_DATA` Claim Matrix로 기록한다. Tire는 연식별 앞·뒤 규격과 Tube Type 및 실제 Tire Product 관계, Battery는 `battery_standard_code`·전압·실제 Standard Product Mapping, Brake는 실제 Model Year Brake Product 관계를 사용한다. 연식별 값은 단일 모델 값으로 일반화하지 않으며, 필수 값이나 관계가 없으면 `CRITICAL_CLAIM_UNVERIFIED`, 동일 범위의 Critical Claim이 충돌하면 `SOURCE_CONFLICT`로 해당 Candidate를 `HOLD_CONTENT` 처리한다.

Content QA의 문장 조각, `TOO_LIGHT`, 반복, 구조 연결 및 경미한 질문-본문 정렬 문제는 최대 2회까지 Evidence-only Auto Repair 후 같은 Gate로 재검사한다. Repair는 기존 Evidence에 없는 수치·규격·호환 Claim을 추가할 수 없다. Fact Conflict, Safety Uncertainty, Unsupported Numeric Claim, Subject Evidence 부족과 Critical Claim 미검증은 Auto Repair 대상이 아니며 기존 HOLD 정책을 유지한다.

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
