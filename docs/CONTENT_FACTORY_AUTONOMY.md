# Content Factory autonomous operation

## Runtime contract

1. Claim the next eligible PLANNED candidate through `content_factory_next_topic_v1`.
2. Reject a candidate when its topic key already belongs to an active/published content lifecycle.
3. Run Research → Writing → Image → QA → Publish → Production QA.
4. A candidate-level failure is recorded on that candidate and MUST NOT stop selection of the next candidate.
5. Only `GLOBAL_FATAL` failures stop the batch. Global fatal means infrastructure/integrity failures such as database/auth/storage unavailable or schema mismatch.
6. Published content is automatically discoverable through the dynamic `/sitemap.xml` and `/rss.xml` routes.

## Admin boundary

Operations Admin may access content/queue/image/source operational data only. Member data and raw bike/model/year fitment mappings are outside the Content Factory/Admin operational boundary.

## Operator actions

- FAILED / CANDIDATE_FAILED / BLOCKED: inspect `last_error`, retry within attempt policy, or archive.
- DUPLICATE: exclude from production queue; do not regenerate.
- REVIEW_REQUIRED: operator approval is required before publish.
- GLOBAL_FATAL: stop the batch and repair infrastructure before resume.

## Completion criteria

Autonomous operation is complete only when candidate failure isolation, duplicate prevention, publish, Production QA, sitemap/RSS discovery, and next-candidate continuation are verified in Production. The Admin dashboard is observability/control; it is not itself the worker runtime.

## Implementation helpers

`src/lib/content-factory/failure-policy.ts` is the canonical application-level failure classifier. `src/lib/content-factory/duplicate-guard.ts` is the canonical topic-key duplicate guard. Workers/orchestrators must import these helpers instead of defining divergent failure or duplicate rules.
