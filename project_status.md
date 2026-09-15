# SGM Plan Package experiment — project status

**Updated:** 2026-09-14
**Current state:** W01 is complete. W02 P1 is integrated in `main` via [PR #4](https://github.com/brandall10/sgm-plan-bootstrap/pull/4) at `864099f8`; W02 P2 is integrated via [PR #6](https://github.com/brandall10/sgm-plan-bootstrap/pull/6) at `650fd12`; W02 P3 is integrated via [PR #7](https://github.com/brandall10/sgm-plan-bootstrap/pull/7) at `f798bd7`. W03 P1 is integrated via [PR #8](https://github.com/brandall10/sgm-plan-bootstrap/pull/8) at `3389b06`. W03 P2 is implemented and verified; its phase PR is pending.
**Recommended next work:** Review and accept W03 P2 before starting P3.
**Active plan:** [W03 — Retrieve phase context and predecessor results](docs/plans/2026-09-14-01-phase-context-results/plan.md), with its checklist in root [status.md](status.md) and durable phase summary in [results.md](docs/plans/2026-09-14-01-phase-context-results/results.md).

**Goal:** make saved plans dependable to view and refine, then test focused context and retained results for the execution handoff.

## Roadmap

| ID | Outcome | Scope / prerequisites | Relevant specs | State |
| --- | --- | --- | --- | --- |
| W01 | Open and refresh a saved Plan Package | Local package core, reusable viewer, coherent refresh, and native-surface probe | [Package](docs/specs/01-plan-package.md), [viewer/review](docs/specs/02-viewer-and-review.md) | Complete; [results](docs/plans/2026-09-12-01-package-viewer/results.md); PRs [#1](https://github.com/brandall10/sgm-plan-bootstrap/pull/1), [#2](https://github.com/brandall10/sgm-plan-bootstrap/pull/2), [#3](https://github.com/brandall10/sgm-plan-bootstrap/pull/3) integrated |
| W02 | Refine, accept, and reopen the same proposal | Snapshot/acceptance storage, pinned history/comparison, and native review trial; P1/P2 integrated | [Acceptance](docs/specs/01-plan-package.md#revisions-and-acceptance), [viewer/review](docs/specs/02-viewer-and-review.md#acceptance-and-comparison) | P3 implemented/verified/integrated; [PR #7](https://github.com/brandall10/sgm-plan-bootstrap/pull/7) merged at `f798bd7`; [plan](docs/plans/2026-09-13-01-proposal-acceptance/plan.md) and [results](docs/plans/2026-09-13-01-proposal-acceptance/results.md) |
| W03 | Retrieve phase context and predecessor results | Shared selector/CLI and demonstrable result handling; requires package/revision semantics, not an SGM graph | [Context selection](docs/specs/03-execution-and-integration.md#context-selection), [operations](docs/specs/03-execution-and-integration.md#operations), [readiness](docs/specs/03-execution-and-integration.md#readiness-and-revisions), [product results](docs/specs/03-execution-and-integration.md#durable-results-in-the-product) | P1 integrated via [PR #8](https://github.com/brandall10/sgm-plan-bootstrap/pull/8); P2 implemented/verified and pending review. [plan](docs/plans/2026-09-14-01-phase-context-results/plan.md) and [results](docs/plans/2026-09-14-01-phase-context-results/results.md) |
| W04 | Use the workflow on a real change | Thin adapters and a two-phase trial project with a fresh-session handoff; requires usable package/viewer/context capabilities | [Skill integration](docs/specs/03-execution-and-integration.md#planning-skill-integration), [verification](docs/specs/03-execution-and-integration.md#verification-and-completion), [correctness](docs/specs/03-execution-and-integration.md#correctness-and-usefulness), [performance](docs/specs/02-viewer-and-review.md#performance-and-proportionality) | Proposed; no plan yet |
| W05 | Connect the useful package to SGM | One real boundary/contract reference and alignment with broader SGM design; scope depends on trial findings | [Authority](docs/specs/01-plan-package.md#authority-and-content-ownership), [references](docs/specs/01-plan-package.md#references-and-identity), [SGM integration](docs/specs/03-execution-and-integration.md#sgm-integration) | Conditional; no plan yet |

Roadmap rows are candidates, not automatic commitments or execution phases.

## Durable decisions

- Preserve the accepted plan and its exact scope; changed obligations require a new proposal.
- Keep native annotations as the feedback mechanism; do not add a replacement transport.
- W02 P2 owns pinned history/comparison views. W02 P3 owns the native review trial and measurements; it requires an actual native annotation.
- `context-selection.v1` is opt-in; legacy v1 packages remain readable but report limited focused-context coverage.
