# W04 results
Source plan: [W04 — Exercise the workflow through a synthetic shift-handoff trial](plan.md)
State: P1 is locally complete; P1A is implemented and verified at provider `8d48590` and target `1ff73d6`; provider review is pending and P2 is not started.
P1: Target `../sgm-shift-handoff-trial` at `4cf38d6`, provider `03343f3`; it delivered the attributed adapter and `interface.shift-handoff-v1` atomic persistence boundary.
Evidence: The target `plan-package/.plan-package/` retains `acceptance.synthetic-shift-handoff-p1` and `result.synthetic-shift-handoff-p1`, identifying the accepted snapshot and tested revisions.
P1A: `plan-cli-response` v1 is JSON-default; the target adapter validates and relays it, and retained `result.synthetic-shift-handoff-p1a-json` attributes the final revisions.
Validation: Provider typecheck/lint/test/build and target lint/test/build passed; P1 fresh reopen and migrated P2 context passed.
Measurement: [Context measurement](../../package/context-measurement.md) records matched JSON/Markdown payloads, bytes, and five-run timings; it makes no tokenizer or productivity claim.
Delivery: Provider [PR #13](https://github.com/brandall10/sgm-plan-bootstrap/pull/13), containing implementation `8d48590`, awaits review; target is local `codex/w04-p1a-json-adapter` at `1ff73d6`, with no remote or PR.
Next: Review and accept the P1A provider PR, then execute P2 from integrated main.
