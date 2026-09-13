# W01 — Open and refresh a saved Plan Package

Source plan: [W01 — Open and refresh a saved Plan Package](docs/plans/2026-09-12-01-package-viewer/plan.md)

Results: [W01 results](docs/plans/2026-09-12-01-package-viewer/results.md)

State: P1 is integrated in `main`; P2 is implemented and locally verified on its dedicated branch, with PR delivery pending; P3 remains unstarted.

## P1 — Package core and coherent initial loading

- [x] P1-T1 — Establish the project, package contract, publication helper, validation, and core/server boundaries.
- [x] P1-T2 — Author the offline-recovery and save-outcome example packages and their declared designs/assets.
- [x] P1-T3 — Implement candidate loading, digest checks, immutable asset serving, confinement, and diagnostics.
- [x] P1-T4 — Verify malformed/partial/unsafe package cases and document format/publication/launch behavior.

## P2 — Reusable viewer and native-surface probe

- [x] P2-T1 — Implement overview, phase navigation, criteria, decisions/questions, diagrams, and artifact frames.
- [x] P2-T2 — Add safe narrative rendering, isolated prototypes, and accessible responsive presentation.
- [x] P2-T3 — Probe the actual native presentation/annotation surface and record its supported or unavailable outcome.
- [x] P2-T4 — Add browser checks for both packages, navigation, designs, diagnostics, and prototype isolation.

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

## P2 delivery note

- Implementation: complete in this phase's feature commit on `feat/package-viewer-phase-p2-viewer`; its revision is recorded in the linked results ledger after the commit.
- Verification: `npm run typecheck`, `npm run lint`, `npm test` (20 tests), `npm run test:e2e` (5 browser checks), `npm run build`, and `git diff --check` passed.
- Native host probe: [unavailable/unverified, not successful](docs/native-surface-probe.md); no custom feedback transport was added.
- Review/merge: P2 PR is pending creation.
- Integration: not yet merged into `main`.

Current blocker / next action: deliver P2's scoped PR and wait for its review/merge before selecting P3.
