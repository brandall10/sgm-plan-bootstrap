# W04 results
Source plan: [W04 — Exercise the workflow through a synthetic shift-handoff trial](plan.md)
State: P1 is locally complete; P1A is complete, with provider work integrated in `main` via [PR #13](https://github.com/brandall10/sgm-plan-bootstrap/pull/13) at `4c48caf` and matching target validation at `1ff73d6`; P2 is not started.
P1: Target `../sgm-shift-handoff-trial` at `4cf38d6`, provider `03343f3`; it delivered the attributed adapter and `interface.shift-handoff-v1` atomic persistence boundary.
Evidence: The target `plan-package/.plan-package/` retains `acceptance.synthetic-shift-handoff-p1` and `result.synthetic-shift-handoff-p1`, identifying the accepted snapshot and tested revisions.
P1A: `plan-cli-response` v1 is JSON-default; the target adapter validates and relays it, and retained `result.synthetic-shift-handoff-p1a-json` attributes the final revisions.
Validation: Provider typecheck/lint/test/build passed on the accepted PR head (76 tests); target lint/test/build, P1 fresh reopen, and migrated P2 context passed.
Measurement: [Context measurement](../../package/context-measurement.md) records matched JSON/Markdown payloads, bytes, and five-run timings; it makes no tokenizer or productivity claim.
Delivery: Provider [PR #13](https://github.com/brandall10/sgm-plan-bootstrap/pull/13), containing implementation `8d48590`, merged at `4c48caf`; target remains local `codex/w04-p1a-json-adapter` at `1ff73d6`, with no remote or PR.
Next: Run `status-next` for P2 from integrated main.
