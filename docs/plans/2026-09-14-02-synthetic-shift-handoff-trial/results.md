# W04 results
Source plan: [W04 — Exercise the workflow through a synthetic shift-handoff trial](plan.md)
State: Documentation amendment approved/integrated via [PR #12](https://github.com/brandall10/sgm-plan-bootstrap/pull/12) at `5d023cf`; P1 locally complete; P1A accepted/ready, P1A/P2 not started.
P1: Target `../sgm-shift-handoff-trial` at `4cf38d6`, provider `03343f3`; delivered the attributed adapter and `interface.shift-handoff-v1` atomic persistence boundary.
Evidence: Target `plan-package/.plan-package/` retains `acceptance.synthetic-shift-handoff-p1` and `result.synthetic-shift-handoff-p1`, identifying the accepted snapshot and tested revisions.
Validation: Prior records report lint, build, provider-bound tests, fresh-process reopen and P2 prerequisite context passed; this documentation pass did not rerun them. Independent-verifier identity and historical provider cleanliness are not established.
Delivery: P1 records recovered from provider branch `codex/w04-p1-shift-handoff` at `42ed8e7`; target remains on `codex/w04-p1-handoff`, without a remote, review or integration. Local trial completion does not require a target PR.
Amendment: P1 → P1A → P2; JSON contract and adapter migration are specified in the plan. Serialization alone needs no target snapshot reacceptance; historical results remain unchanged.
Next: On a separate execution request, run `status-next` for P1A; the preserved local P1 evidence satisfies its predecessor prerequisite.
