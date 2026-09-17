<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# FitBike Codex Development Rules

**Version:** v1.3\
**Status:** Baseline

## Role

FitBike is a Motorcycle Knowledge & Fitment Platform. Implement the
requested Task while preserving product policy, database integrity, API
contracts, UX standards, and existing architecture. Do not redesign the
project from scratch.

## Required reading order

1.  `README.md`
2.  `docs/00_ai/README.md`
3.  `docs/00_ai/SOP.md`
4.  `docs/01_product/SERVICE.md`
5.  Relevant files under `docs/02_framework/`
6.  Relevant Service Module under `docs/03_service_modules/`
7.  For Content Factory/content production tasks, read `docs/03_service_modules/CONTENT.md`, then `docs/00_ai/CONTENT_FACTORY.md`, then `docs/00_ai/CONTENT_QUEUE.md`
8.  Current Task/result/changelog when relevant
9.  Existing implementation code
10. For DB work, `docs/04_database_schema/` is mandatory

Read only what is relevant to the Task. Do not repeatedly scan the whole
repository for small changes.

## Source of Truth

-   Product/Business: `SERVICE.md` > Service Module > Task > implementation
-   Content production execution: `CONTENT.md` (product/editorial policy) > `CONTENT_FACTORY.md` (AI production procedure) > `CONTENT_QUEUE.md` (queue reconciliation/execution) > Task > implementation
-   Cross-repository policy ownership: these FitBike documents are the only editable content-policy source. `tisan82/FitBike-Content-Factory` may contain links/pointers but must not mirror policy text. ChatGPT Work is the official production mode; optional OpenAI API provider configuration is not a Work-production prerequisite.
-   Database: current Supabase export in `docs/04_database_schema/` > `DATABASE.md` > Service Module > implementation
-   Architecture/API: `ARCHITECTURE.md` + `API.md` > Service Module > Task > implementation
-   UI/UX: `SCREEN.md` > Service Module > Task > implementation
-   Public SEO/GEO: `SEO_GEO.md` > Service Module > Task > implementation

Existing code is evidence of current behavior but does not override an explicit higher-level policy. If sources conflict, do not guess; report the conflict before a policy/schema-breaking change.

When changing a global customer-facing UI policy, update both the code and `SCREEN.md` in the same Task.

Before changing a customer-facing public page, review `SEO_GEO.md`. Update it with the code when a global SEO/GEO policy changes.

## Production deployment policy

-   GitHub `main` is the FitBike Production source branch.
-   Vercel Git integration is the default Production delivery path: merge/push to `main` → Vercel Production build → `fitbike.co.kr`.
-   Feature branches and pull requests must remain Preview deployments and must not become the normal Production source.
-   Do not add a duplicate GitHub Actions Vercel deploy pipeline while the native Vercel Git integration is healthy; duplicate pipelines can create redundant Production builds and unclear release ownership.
-   A change is not reported as Production complete until the Vercel deployment for the same `main` commit is `READY` and the affected Production URL is verified.
-   If GitHub `main` and the active Vercel Production commit differ, report `PRODUCTION DRIFT` and reconcile before starting the next release.
-   Manual Vercel promotion/direct deployment is reserved for recovery or an explicitly requested exceptional release; the resulting commit must still be reconciled back to `main`.

## Product guardrails

-   Fitment accuracy is the highest priority.
-   Model + Model Year is the core service axis.
-   Never invent fitment data. Unknown/unverified values remain `NULL`.
-   Information first; do not introduce ranking/recommendation unless explicitly requested.
-   Mobile First, Minimal Input, Progressive Disclosure.
-   Preserve Brand → Model → Model Year selection flow.

## Database guardrails

-   Create, rename, or drop a table/column only when the current Task requires it,
    the exact deployed schema is verified, and a safe migration path exists.
-   Mutate Production data only when it is necessary to complete the current
    Task, using exact targets and pre/post verification.
-   Use exact identifiers from the current Supabase schema.
-   Documentation examples are not schema truth.
-   Avoid `SELECT *` when required fields are known.
-   Preserve constraints and active-data policies.
-   Storage DB values may be object paths; do not hard-code environment-specific public URLs into DB data.

## API guardrails

-   `/api/v1` is the baseline public API version.
-   Preserve contracts unless the Task explicitly changes them.
-   Remove, rename, or change a field type only when the current Task requires
    it and affected consumers plus the migration/compatibility path are verified.
-   Keep business/data logic out of page components.

## Task execution

1.  Inspect current implementation.
2.  Check `git status` and `git diff`.
3.  Define minimum file scope.
4.  Modify only required files.
5.  Avoid unrelated refactoring.
6.  Reuse existing utilities/components.
7.  Run relevant validation.
8.  Review whether the Task established persistent development knowledge.
9.  Update the appropriate existing Source of Truth when required.
10. Report result.

## Execution level and efficiency

Choose the smallest execution level that can complete the Task safely. State
the chosen level only when work begins; do not ask the user to choose it.

-   `FAST`: one file, one record, one content asset, or a narrowly scoped
    correction with no contract/schema impact. Read only the owning policy and
    target implementation. Validate the changed artifact and its direct user
    path.
-   `STANDARD`: several related files or a customer-facing behavior change.
    Read the relevant Service Module and framework documents. Run targeted
    tests first, then broader checks only when the affected boundary requires
    them.
-   `AUDIT`: schema, authentication, security, shared architecture, migrations,
    bulk data changes, or broad regressions. Perform full dependency review,
    broader tests, and explicit rollback/Production verification.

The level may be raised when inspection reveals wider impact. Never lower
these quality gates:

-   Resolve the exact target and current state before mutation.
-   Preserve unrelated user changes and use recoverable changes.
-   Verify the affected user-visible path, not only the command exit code.
-   For runtime or Production data changes, verify the deployed commit/data and
    public result before reporting completion.
-   Treat failed checks, ambiguous ownership, or cross-cutting dependencies as
    reasons to expand inspection and validation.

Token and latency rules:

-   Use scoped `rg` searches and targeted file reads; do not dump or rescan the
    repository when the target is known.
-   Do not reread unchanged documents already loaded in the same logical Task.
-   Query only required database rows and columns; avoid broad payloads.
-   Use web research only for current, external, official, uncertain, or
    high-stakes facts. Prefer primary sources.
-   Summarize large command/tool output and retain only evidence needed for the
    decision.
-   Do not create a new policy document when an existing Source of Truth can be
    updated.
-   Keep progress updates event-based: scope decision, material finding,
    blocker, and completion. Do not narrate routine commands.
-   Do not delegate a small sequential Task. Parallelize only independent work
    whose saved time exceeds coordination cost.

Validation follows the execution level. Documentation-only `FAST` changes use
`git diff --check` plus a content review. Code changes use the narrowest
relevant lint/test first. Run the full build or regression suite for shared
runtime boundaries, release risk, or when targeted checks cannot establish
confidence.

## Agent orchestration

This repository uses one accountable Orchestrator with selectively invoked
roles. Role files under `.agents/` are execution playbooks, not new Sources of
Truth. Product, framework, service-module, and deployed-schema documents keep
their precedence.

1.  Read `.agents/00_orchestrator.md` for `STANDARD` and `AUDIT` Tasks, or when
    the request explicitly asks for agent orchestration.
2.  The Orchestrator selects only the roles required by the Task:
    `.agents/01_pm_agent.md`, `.agents/02_design_agent.md`,
    `.agents/03_dev_agent.md`, and `.agents/04_qa_agent.md`.
3.  A `FAST` Task normally stays with one agent and does not create role
    handoff documents.
4.  Parallel work is allowed only for independent scopes with non-overlapping
    write ownership. Sequential dependencies use compact handoffs instead.
5.  The Orchestrator owns the final scope, conflict resolution, integration,
    validation level, Production status, and user report.
6.  Role outputs are temporary unless they establish durable policy. Use one
    `docs/tasks/<task-slug>/WORK.md` for a normal persistent handoff and separate
    artifacts only for material `AUDIT` stages. Do not create ceremonial files.
7.  Use `.codex/agents/*.toml` for actual Codex custom-agent registration;
    `.agents/*.md` holds the detailed FitBike role playbooks.
8.  The user's build/fix/apply/publish/deploy request authorizes the necessary
    pipeline actions. Do not insert a second stage-approval checkpoint.

## Persistent development knowledge

After implementation and validation, determine whether the Task established a Product, UX/UI, Architecture, Data, or API rule that future Tasks must follow. Do not leave such policy only in code, conversation, or a Task result. Update the smallest appropriate existing Source of Truth document instead of creating a duplicate document.

Classify decisions before documenting them:

-   Global rules used across services belong in the relevant Product or Framework document.
-   Rules limited to one feature belong in its Service Module.
-   Implementation details such as local pixel values, debugging history,
    build output, and temporary fixes remain in code or the Task result.

Do not duplicate the same policy across Global and Service Module documents. If no persistent rule was established, report `Documentation Update: NONE`. When a major service gains durable Product/UX/Data contracts and has no Service Module, propose one; do not create it merely because a screen exists.

If a Task conflicts with an existing Source of Truth, report `POLICY CONFLICT` with the existing rule, requested rule, and impact. Apply the user's current instruction when it clearly changes that policy; otherwise preserve the higher-level Source of Truth. If code and documentation materially differ, report `DOCUMENTATION DRIFT` and follow the Source of Truth precedence above rather than guessing which is correct.

## Normal local validation

-   read/search files
-   `git status`, `git diff`
-   `npm run lint`
-   `npm run build`
-   existing project tests
-   local log inspection

These instructions do not override IDE/OS permission prompts.

## Autonomous execution authority

-   The user's current request is the authority for all necessary actions within
    its reasonable scope; do not ask for redundant confirmation between stages.
-   When completion clearly requires it, commit, push, deploy, migrate, mutate
    exact data/Storage targets, and verify Production autonomously.
-   Package or environment changes must be required by the Task, minimal, and
    verified; do not add dependencies for convenience alone.
-   Stop only for missing credentials/permissions, ambiguous targets, an
    unrecoverable destructive action, or unresolved policy/schema/security
    conflict. Report these as blockers rather than approval requests.

## Completion report

Report: goal/root cause, changed files, changes made, validation,
remaining issues, and policy/schema conflicts.

For Feature Tasks, also report a Persistent Knowledge Review with New Global
Rules, New Service-specific Rules, Documentation Updated, and Policy Conflict;
use `NONE` where applicable.
