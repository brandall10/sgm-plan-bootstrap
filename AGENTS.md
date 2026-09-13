# Repository instructions for agents

## Document ownership

- `project_status.md` is a compact roadmap and memory index. Keep current state,
  priorities, roadmap context, short durable decisions, and links to results.
  Do not append planning or execution journals, task checklists, validation
  transcripts, or one entry per commit/event.
- Root `status.md` is the single active checklist for the current plan. Every
  plan's checklist is represented there; when the selected plan changes,
  reconcile that root file. Never create a plan-local `status.md`.
- Each plan directory contains `plan.md` and, when needed, `results.md`.
  Detailed implementation outcomes, validation, decisions, and delivery history
  belong in `results.md`.
- `docs/specs/` is read-only design input.
- `README.md` is a user-facing quickstart/reference, not a required wholesale
  context load. Read only the relevant section when a task needs it.

## Planning and execution

- Planning or selecting work does not authorize implementation. Accepted plans
  execute through `status-next`, one phase per branch and pull request.
- Preserve roadmap context in `project_status.md`: each candidate keeps its
  outcome, scope/prerequisites, relevant specification links, and state.
- Keep `project_status.md` roughly under 500 words and 100 lines. If an update
  would exceed that budget, compress the index or move detail to the plan's
  `results.md` before committing.
- Before committing documentation changes, verify that no
  `docs/plans/**/status.md` exists and that the active checklist and results
  links remain valid.
