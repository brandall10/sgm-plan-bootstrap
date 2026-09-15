# W04 — Exercise the workflow through a synthetic shift-handoff trial

Source plan: [W04 plan](docs/plans/2026-09-14-02-synthetic-shift-handoff-trial/plan.md)

Results: [W04 results](docs/plans/2026-09-14-02-synthetic-shift-handoff-trial/results.md)

State: Accepted and active; W04 P1 is implemented and verified, with target PR delivery blocked by the missing remote.

Prior active checklist: W03 is complete; see its [results](docs/plans/2026-09-14-01-phase-context-results/results.md).

Next action: Configure or authorize a remote for `../sgm-shift-handoff-trial`, then push `codex/w04-p1-handoff` and create its PR before starting P2.

Progress: Target `../sgm-shift-handoff-trial` is at `4cf38d6e6485310a42d6755814f65a14b57f6fcd`; snapshot acceptance and result `result.synthetic-shift-handoff-p1` are retained. PR delivery remains unresolved because no target remote exists.

## P1 — Record a durable handoff through attributed phase context

- [x] P1-T1 — Initialize `../sgm-shift-handoff-trial`, define its two-phase package and cross-phase consumer criterion, then publish and obtain explicit acceptance of the concrete target snapshot.
- [x] P1-T2 — Add a target-local adapter that forwards explicit context/result requests to a pinned provider checkout and rejects implicit or invalid handoffs.
- [x] P1-T3 — Implement validated, atomic handoff persistence with explicit outcomes, deterministic actions, and an open-handoff command.
- [x] P1-T4 — Verify the real provider invocation, cross-phase criterion, provider revision, failure paths, and fresh process; record the attributable P1 result.

## P2 — Freshly recover, complete, and independently verify the handoff

Depends on P1's accepted package snapshot, persisted interface/result, and application record.

- [ ] P2-T1 — From a fresh target worktree/session, retrieve explicit P2 context and prove it identifies P1's recorded interface without draft or copied-chat substitution.
- [ ] P2-T2 — Implement deterministic, atomic resume/close behavior with explicit unavailable and conflict outcomes.
- [ ] P2-T3 — Independently verify every P2 criterion against its actual revision; supersede stale evidence only after an actual repair.
- [ ] P2-T4 — Recover retained P1/P2 context and results through `--store`, then record bounded measurements and limitations without transcripts or screenshots.
