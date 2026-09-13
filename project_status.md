# SGM Plan Package experiment — project status

**Updated:** 2026-09-13
**Current state:** W01 is complete. W02 P1 is integrated in `main` via [PR #4](https://github.com/brandall10/sgm-plan-bootstrap/pull/4) at `864099f8`; W02 P2 and P3 are unstarted.
**Recommended next work:** begin W02 P2 when execution is requested.
**Active plan:** [W02 — Refine, accept, and reopen the same proposal](docs/plans/2026-09-13-01-proposal-acceptance/plan.md), with its checklist in root [status.md](status.md) and detailed evidence in [results.md](docs/plans/2026-09-13-01-proposal-acceptance/results.md).

## Roadmap

| ID | Outcome | State |
| --- | --- | --- |
| W01 | Open and refresh a saved Plan Package | Complete; [results](docs/plans/2026-09-12-01-package-viewer/results.md); PRs [#1](https://github.com/brandall10/sgm-plan-bootstrap/pull/1), [#2](https://github.com/brandall10/sgm-plan-bootstrap/pull/2), [#3](https://github.com/brandall10/sgm-plan-bootstrap/pull/3) integrated |
| W02 | Refine, accept, and reopen the same proposal | P1 integrated; P2/P3 unstarted; [plan](docs/plans/2026-09-13-01-proposal-acceptance/plan.md) and [results](docs/plans/2026-09-13-01-proposal-acceptance/results.md) |
| W03 | Retrieve phase context and predecessor results | Proposed; no plan yet |
| W04 | Use the workflow on a real change | Proposed; no plan yet |
| W05 | Connect the useful package to SGM | Conditional; no plan yet |

Roadmap rows are candidates, not automatic commitments or execution phases.

## Record ownership

- `project_status.md` is a compact roadmap and memory index. Keep current state, priorities, links, and only short durable decisions here.
- Root `status.md` is the single checklist for the current plan. Every plan’s checklist is represented there; never create a plan-local `status.md`.
- Each plan directory contains `plan.md` and, when needed, `results.md`. Detailed implementation outcomes, validation, decisions, and delivery history belong in `results.md`.
- `docs/specs/` is read-only design input. Planning or selecting work does not authorize implementation; accepted plans run through `status-next`.

## Durable decisions

- Preserve the accepted plan and its exact scope; changed obligations require a new proposal.
- Keep native annotations as the feedback mechanism; do not add a replacement transport.
- W02 P2 owns pinned history/comparison views. W02 P3 owns the native review trial and measurements; it requires an actual native annotation.
