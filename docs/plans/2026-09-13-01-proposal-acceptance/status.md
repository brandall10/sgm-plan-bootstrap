# W02 — Refine, accept, and reopen the same proposal

Source plan: [W02 plan](plan.md)

Results: [W02 results](results.md)

State: W02 P1 implemented and locally verified; PR delivery is pending.

Next action: push the scoped branch and open the W02 P1 PR. The active execution checklist is [root status.md](../../../status.md); this companion mirrors its current delivery state.

## P1 — Durable snapshots and explicit acceptance

- [x] P1-T1 — Define snapshot/acceptance contracts and separate integrity, acceptance, and planning blockers.
- [x] P1-T2 — Implement confined durable capture, atomic publication, and verified reopening.
- [x] P1-T3 — Implement explicit acceptance recording, provenance, retries, and history reading.
- [x] P1-T4 — Verify storage/CLI/runtime behavior and document usage and recovery.

## P1 delivery note

Implementation/verification are complete in `7a1dd15de47920ddd811296e88b14508d8c4463b`; review, merge, and integration remain pending.

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
