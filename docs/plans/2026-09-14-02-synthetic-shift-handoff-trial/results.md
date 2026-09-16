# W04 results

Source plan: [W04 — Exercise the workflow through a synthetic shift-handoff trial](plan.md)

State: P1 locally complete with recorded verification; P1A is a proposed documentation amendment, not implemented or accepted by this record. Original P2 remains unstarted.
Next: Review/accept the documentation-only amendment PR; after integration, `status-next` can select P1A, subject to its predecessor-delivery reconciliation. No execution is initiated by this documentation pass.

## Reconciled P1 evidence

- Provider `main` at `2550b1cd3266208736ac32b053431508ffe2da7a` still said unstarted. Local branch `codex/w04-p1-shift-handoff` at `42ed8e7` retained the completed checklist and verification ledger, following `03343f3` (package gate) and `dc5b626` (verification/delivery). This documentation branch carries those commits forward; the original branch is preserved.
- Target `../sgm-shift-handoff-trial` is clean at `4cf38d6e6485310a42d6755814f65a14b57f6fcd` on `codex/w04-p1-handoff`. Its `main` remains `684818f`; it has no configured remote. Implementation is committed, not merged to target main. The retained result says `not-reviewed` / `not-integrated`; no target PR exists. The later local reconciliation at `42ed8e7` permits local trial completion without a target GitHub PR; that does not establish review or integration.
- Package `synthetic-shift-handoff`, snapshot `34fcda850f1302363c4938a13392fdd71a98823a18ac8b2fae2eba86d800a0c5`, has non-illustrative record `acceptance.synthetic-shift-handoff-p1` under the target's `plan-package/.plan-package/acceptances/`. It records explicit user acceptance for W04 P1 at `2026-09-15T21:13:52.939Z`. No new acceptance was written during reconciliation.
- Retained `plan-package/.plan-package/results/result.synthetic-shift-handoff-p1.json` attributes activity `verify` to target `4cf38d6` and provider `03343f3f40ca61c4e53cd164f1f483d7ad2bcbba`. That provider revision exists locally; its product source matches provider `main`. Its recorded interface is `interface.shift-handoff-v1`: stable identity, next owner, ordered actions, validated state and atomic local-file persistence. The actual target-owned `state/current-handoff.json` remains present.
- Prior ledger reports `npm run lint`, `npm run build`, provider-bound `npm test`, fresh P1 context and P2 prerequisite context passed. Retained observations cover READY accepted context including `criterion.p2-reopen-close`, fresh-process reopen, distinct `recorded`/`unchanged`/`invalid`/`unavailable` outcomes and preservation of valid bytes on interrupted replacement. These remain observations of the named Markdown-era revisions, not tests of a JSON interface.
- Evidence limits: this pass inspected records/source/Git rather than rerunning P1 tests. The retained record provides no test count or separate independent-verifier identity, and does not establish whether the provider checkout was clean at the historical invocation. Its context-command locator omits required provider arguments, while the test locator/environment names the pinned provider. Do not manufacture those missing details, treat producer observations as independent findings, or restart P1 to fill documentary gaps. P1A requires new targeted compatibility evidence at identifiable revisions.

## Design amendment

Markdown was a useful initial prompt/debug renderer. A typed source should expose a structured public contract to adapters; this is a deliberate design revision, not a defect in W03's faithful implementation. Proposed order is bootstrap **P1 → P1A → P2**; target IDs `phase.handoff-record` / `phase.handoff-recover` remain unchanged.

Inspection of the accepted snapshot's manifest and captured README/source contract found no Markdown-only adapter obligation. No target snapshot amendment/reacceptance is needed solely for serialization. Preserve existing snapshots/results and predecessor compatibility; any later necessary package amendment needs concrete acceptance and must not reattribute old evidence.

P1A's proposed versioned response, explicit section states, separate acceptance/readiness/coverage/completeness, shared renderers, runtime validation and parseable failure/budget policy are specified in the active plan. Current CLI/adapter behavior and usage guides remain unchanged until implementation. W03's full-package JSON versus selected Markdown measurement remains historical content-selection evidence, not an equivalent-payload serialization benchmark.
