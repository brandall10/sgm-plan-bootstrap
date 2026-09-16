# SGM Plan Package experiment — project status

**Updated:** 2026-09-15
**Current state:** W01–W03 are integrated; W04 P1/P1A are complete. The documentation amendment is integrated via [PR #12](https://github.com/brandall10/sgm-plan-bootstrap/pull/12) at `5d023cf`; P1A provider work is integrated via [PR #13](https://github.com/brandall10/sgm-plan-bootstrap/pull/13) at `4c48caf` with target validation at `1ff73d6`. P2 is implemented and independently verified in target commit `621633c`; its bootstrap record PR is pending.
**Recommended next work:** Review and accept the W04 P2 bootstrap record PR; the target remains local with no remote.
**Active plan:** [W04 — Exercise the workflow through a synthetic shift-handoff trial](docs/plans/2026-09-14-02-synthetic-shift-handoff-trial/plan.md), with its root [checklist](status.md) and [results](docs/plans/2026-09-14-02-synthetic-shift-handoff-trial/results.md).

**Goal:** make saved plans dependable to view and refine, then test focused context and retained results for the execution handoff.

## Roadmap

| ID | Outcome | Scope / prerequisites | Relevant specs | State |
| --- | --- | --- | --- | --- |
| W01 | Open and refresh a saved Plan Package | Local package core, reusable viewer, coherent refresh, and native-surface probe | [Package](docs/specs/01-plan-package.md), [viewer/review](docs/specs/02-viewer-and-review.md) | Complete; [results](docs/plans/2026-09-12-01-package-viewer/results.md); PRs [#1](https://github.com/brandall10/sgm-plan-bootstrap/pull/1), [#2](https://github.com/brandall10/sgm-plan-bootstrap/pull/2), [#3](https://github.com/brandall10/sgm-plan-bootstrap/pull/3) integrated |
| W02 | Refine, accept, and reopen the same proposal | Snapshot/acceptance storage, pinned history/comparison, and native review trial; P1/P2 integrated | [Acceptance](docs/specs/01-plan-package.md#revisions-and-acceptance), [viewer/review](docs/specs/02-viewer-and-review.md#acceptance-and-comparison) | P3 implemented/verified/integrated; [PR #7](https://github.com/brandall10/sgm-plan-bootstrap/pull/7) merged at `f798bd7`; [plan](docs/plans/2026-09-13-01-proposal-acceptance/plan.md) and [results](docs/plans/2026-09-13-01-proposal-acceptance/results.md) |
| W03 | Retrieve phase context and predecessor results | Shared selector/CLI and result handling; requires package/revision semantics | [Context selection](docs/specs/03-execution-and-integration.md#context-selection), [operations](docs/specs/03-execution-and-integration.md#operations), [readiness](docs/specs/03-execution-and-integration.md#readiness-and-revisions), [results](docs/specs/03-execution-and-integration.md#durable-results-in-the-product) | Complete/integrated through PRs #8–#11; [plan](docs/plans/2026-09-14-01-phase-context-results/plan.md), [results](docs/plans/2026-09-14-01-phase-context-results/results.md) |
| W04 | Use the workflow on a real change | Two-phase separate synthetic trial; insert bounded provider JSON contract/adapter correction before fresh-session recovery; requires preserved P1 evidence | [Skill integration](docs/specs/03-execution-and-integration.md#planning-skill-integration), [verification](docs/specs/03-execution-and-integration.md#verification-and-completion), [correctness](docs/specs/03-execution-and-integration.md#observable-correctness-and-usefulness), [performance](docs/specs/02-viewer-and-review.md#performance-and-proportionality) | P2 implementation/verification complete in target `621633c`; bootstrap record PR pending. Target has no remote/PR. [Plan](docs/plans/2026-09-14-02-synthetic-shift-handoff-trial/plan.md), [results](docs/plans/2026-09-14-02-synthetic-shift-handoff-trial/results.md) |
| W05 | Connect the useful package to SGM | One real boundary/contract reference and alignment with broader SGM design; scope depends on trial findings | [Authority](docs/specs/01-plan-package.md#authority-and-content-ownership), [references](docs/specs/01-plan-package.md#references-and-identity), [SGM integration](docs/specs/03-execution-and-integration.md#sgm-integration) | Conditional; no plan yet |

Roadmap rows are candidates, not automatic commitments or execution phases.

## Durable decisions

- Preserve the accepted plan and its exact scope; changed obligations require a new proposal.
- Keep native annotations as the feedback mechanism; do not add a replacement transport.
- W02 P2 owns pinned history/comparison views. W02 P3 owns the native review trial and measurements; it requires an actual native annotation.
- `context-selection.v1` is opt-in; legacy v1 packages remain readable but report limited focused-context coverage.
- W04 P1 is a local automated-only synthetic trial; its completion is established by the accepted target snapshot, attributed adapter invocation/result, durable handoff checks, and local validation, not by GitHub or a PR.

- Versioned JSON is the canonical CLI interface; Markdown is optional presentation. W04 P1A implements, validates, and adapter-consumes v1.
