# W01 — Open and refresh a saved Plan Package

Source plan: [W01 — Open and refresh a saved Plan Package](docs/plans/2026-09-12-01-package-viewer/plan.md)

Results: [W01 results](docs/plans/2026-09-12-01-package-viewer/results.md)

State: P1 implemented, verified, and integrated in `main`; P2/P3 remain unstarted.

## P1 — Package core and coherent initial loading

- [x] P1-T1 — Establish the project, package contract, publication helper, validation, and core/server boundaries.
- [x] P1-T2 — Author the offline-recovery and save-outcome example packages and their declared designs/assets.
- [x] P1-T3 — Implement candidate loading, digest checks, immutable asset serving, confinement, and diagnostics.
- [x] P1-T4 — Verify malformed/partial/unsafe package cases and document format/publication/launch behavior.

## P2 — Reusable viewer and native-surface probe

- [ ] P2-T1 — Implement overview, phase navigation, criteria, decisions/questions, diagrams, and artifact frames.
- [ ] P2-T2 — Add safe narrative rendering, isolated prototypes, and accessible responsive presentation.
- [ ] P2-T3 — Probe the actual native presentation/annotation surface and record its supported or unavailable outcome.
- [ ] P2-T4 — Add browser checks for both packages, navigation, designs, diagnostics, and prototype isolation.

## P3 — Live refresh, recovery, and measured behavior

- [ ] P3-T1 — Watch declared package inputs and generation-fence candidate publication.
- [ ] P3-T2 — Expose accepted/rejected candidates, reconnect state, and navigation-preserving recovery.
- [ ] P3-T3 — Exercise valid, interrupted, invalid, overlapping, deletion, and disconnect/reconnect updates.
- [ ] P3-T4 — Measure opening/load/render/refresh behavior and finish usage/troubleshooting documentation.

## P1 delivery note

- Implementation: complete in `771070ecee3c6e1665bdf9a69ecadd18095aaa95`.
- Verification: typecheck, lint, build, and 16 unit/HTTP acceptance tests passed; see the linked results ledger.
- Review/merge: [PR #1](https://github.com/brandall10/sgm-plan-bootstrap/pull/1) merged into `main`.
- Integration: observed at merge commit `826a228423ae5b49b7b503b56295dfe4def3bdfd`; P1 is complete.

Current blocker / next action: W01 P1 is closed out. If work resumes, select P2 through `status-next`; do not start it as part of this merge-only request.
