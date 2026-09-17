# Task Handoff Files

This directory stores only Task-specific handoffs that must persist across
agents or sessions. It is not a Product, Framework, Service Module, or schema
Source of Truth.

## When to create a Task folder

- `FAST`: do not create one.
- `STANDARD`: create `docs/tasks/<task-slug>/WORK.md` only when two or more roles
  need a durable handoff.
- `AUDIT`: create separate `PLAN.md`, `DESIGN_SPEC.md`, or `QA_REPORT.md` only
  when that stage has material information worth retaining.

## WORK.md template

```markdown
# <Task title>

## State
- Level:
- Current stage:
- Status:

## PM
- Decision:
- Evidence/owner:
- Acceptance criteria:
- Risk/blocker:

## Design
- Decision:
- Components/states:
- Mobile/accessibility:
- Risk/blocker:

## Development
- Change:
- Files/data:
- Validation:
- Risk/blocker:

## QA
- Result:
- Checks:
- Production state:
- Required next action:
```

Omit unused sections. Link owning documents instead of copying them. Do not
paste full logs, full database payloads, or unchanged policy text.
