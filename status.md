# W02 — Refine, accept, and reopen the same proposal

Source plan: [W02 plan](docs/plans/2026-09-13-01-proposal-acceptance/plan.md)

Results: [W02 results](docs/plans/2026-09-13-01-proposal-acceptance/results.md)

State: W02 P1 implemented and locally verified; PR #4 is approved and merge/integration is pending.

Next action: merge PR #4, then reconcile remote and local integration. W01 is complete; its outcomes remain in [W01 results](docs/plans/2026-09-12-01-package-viewer/results.md) and [project status](project_status.md).

## P1 — Durable snapshots and explicit acceptance

- [x] P1-T1 — Define snapshot/acceptance contracts and separate integrity, acceptance, and planning blockers.
- [x] P1-T2 — Implement confined durable capture, atomic publication, and verified reopening.
- [x] P1-T3 — Implement explicit acceptance recording, provenance, retries, and history reading.
- [x] P1-T4 — Verify storage/CLI/runtime behavior and document usage and recovery.

## P1 delivery note

- Implementation and required local verification passed in `7a1dd15de47920ddd811296e88b14508d8c4463b`, based on accepted plan/main `2411338f9f288fc31be67f9eb63d57ff21567220`.
- Review/merge: the user approved [PR #4](https://github.com/brandall10/sgm-plan-bootstrap/pull/4); merge is pending at head `d403f37656ec56a6c714250c7647828d126751fa`.
- Integration: not yet merged into local or remote `main`.

## P2 — Reopen and compare accepted proposals

- [ ] P2-T1 — Add snapshot/history APIs and shared stable-ID/content comparison.
- [ ] P2-T2 — Implement pinned routes, selection, provenance, and safe retained assets.
- [ ] P2-T3 — Present linked material changes with accessible navigation.
- [ ] P2-T4 — Verify both fixtures, restart/refresh, comparison, and integrity failures.

## P3 — Demonstrate the complete review/refinement loop

- [ ] P3-T1 — Demonstrate illustrative acceptance, later edits, and exact reopening.
- [ ] P3-T2 — Receive and resolve real native feedback with explicit stale-target handling.
- [ ] P3-T3 — Complete documentation, independent verification, and reopen/comparison measurements.

Potential execution dependency: P3 requires a real native annotation. No implementation checks or native trial have run for W02.
