# W04 — Exercise the workflow through a synthetic shift-handoff trial

Source plan: [W04 plan](docs/plans/2026-09-14-02-synthetic-shift-handoff-trial/plan.md)

Results: [W04 results](docs/plans/2026-09-14-02-synthetic-shift-handoff-trial/results.md)

State: W04's documentation amendment is integrated in `main` via [PR #12](https://github.com/brandall10/sgm-plan-bootstrap/pull/12) at `5d023cf`. P1 is locally complete with recorded verification; P1A is implemented and locally verified at provider `8d48590` and target `1ff73d6`, with [PR #13](https://github.com/brandall10/sgm-plan-bootstrap/pull/13) review pending. P2 waits for P1A integration.

Prior active checklist: W03 is complete; see its [results](docs/plans/2026-09-14-01-phase-context-results/results.md).

Next action: Review and accept [P1A provider PR #13](https://github.com/brandall10/sgm-plan-bootstrap/pull/13); P2 waits for its integration.

Progress: Target `../sgm-shift-handoff-trial` is at `4cf38d6e6485310a42d6755814f65a14b57f6fcd`; snapshot acceptance and result `result.synthetic-shift-handoff-p1` are retained. Prior local records report lint, build, provider-bound tests, fresh-process recovery and result recording passed; see results for attribution and evidence limits.

## P1 — Record a durable handoff through attributed phase context

- [x] P1-T1 — Initialize `../sgm-shift-handoff-trial`, define its two-phase package and cross-phase consumer criterion, then publish and obtain explicit acceptance of the concrete target snapshot.
- [x] P1-T2 — Add a target-local adapter that forwards explicit context/result requests to a pinned provider checkout and rejects implicit or invalid handoffs.
- [x] P1-T3 — Implement validated, atomic handoff persistence with explicit outcomes, deterministic actions, and an open-handoff command.
- [x] P1-T4 — Verify the real provider invocation, cross-phase criterion, provider revision, failure paths, and fresh process; record the attributable P1 result.

## P1A — Establish the JSON CLI contract and migrate the trial adapter

Prerequisites satisfied: preserved P1 evidence and accepted, integrated bootstrap amendment. The local target needs no remote/PR; its review/integration facts remain as recorded.
Execution order is P1 → P1A → P2; target package phase IDs are unchanged.

- [x] P1A-T1 — Define the versioned public response contract, runtime validation, field presence, diagnostics, readiness, coverage and budget semantics.
- [x] P1A-T2 — Assemble one resolved response for JSON-default and explicit JSON/Markdown rendering across all three read operations.
- [x] P1A-T3 — Migrate the existing trial adapter/tests to validated JSON, preserving explicit identity, provider streams and exit status.
- [x] P1A-T4 — Verify the real protocol boundary and P1 compatibility, update current usage with implementation, and record attributable results and bounded serialization measurements.

## P2 — Freshly recover, complete, and independently verify the handoff

Depends on P1's accepted package snapshot, persisted interface/result and application record, plus completed P1A. The fresh executor invokes the migrated adapter itself.

- [ ] P2-T1 — From a fresh target worktree/session, retrieve explicit P2 context and prove it identifies P1's recorded interface without draft or copied-chat substitution.
- [ ] P2-T2 — Implement deterministic, atomic resume/close behavior with explicit unavailable and conflict outcomes.
- [ ] P2-T3 — Independently verify every P2 criterion against its actual revision; supersede stale evidence only after an actual repair.
- [ ] P2-T4 — Recover retained P1/P2 context and results through `--store`, then record bounded measurements and limitations without transcripts or screenshots.
