# W04 — Exercise the workflow through a synthetic shift-handoff trial

## Goal and inputs

Demonstrate that the accepted Plan Package workflow can guide a real, bounded
two-phase change across a provider/consumer repository boundary and from a
fresh executor session. The target is a deliberately synthetic Git repository,
`sgm-shift-handoff-trial`, containing a **shift-handoff ledger** rather than a
new illustrative viewer fixture or a production integration. It will make a
small, observable state transition: record an unresolved handoff in phase one,
then recover and close that handoff in phase two.

Design inputs: [execution context](../../specs/03-execution-and-integration.md#context-selection), [operations](../../specs/03-execution-and-integration.md#operations), [verification and completion](../../specs/03-execution-and-integration.md#verification-and-completion), [planning-skill integration](../../specs/03-execution-and-integration.md#planning-skill-integration), [correctness and usefulness](../../specs/03-execution-and-integration.md#observable-correctness-and-usefulness), and [performance/proportionality](../../specs/02-viewer-and-review.md#performance-and-proportionality). W03's completed selection, snapshot, result, CLI, runtime, and recovery work is the required baseline; see its [results](../2026-09-14-01-phase-context-results/results.md).

The trial package must be explicitly published and accepted at a concrete
snapshot before either execution phase receives context. The user remains the
authority for that package acceptance; accepting this repository plan does not
implicitly accept the trial package or activate an implementation phase.

## Scope and boundaries

Create `sgm-shift-handoff-trial` as a separate synthetic Git repository at
`../sgm-shift-handoff-trial` relative to this bootstrap checkout, never nested
in or tracked by it. It needs no pre-existing Plan Package adoption. It
contains a small Node ESM application, focused automated tests, a two-phase
Plan Package, and a target-repository adapter. The application persists JSON
handoffs through an atomic local-file boundary and exposes an explicit command
for opening and resuming the current handoff.

Phase one records exactly one open handoff with a stable ID, next-owner label,
and ordered action list. Its write result distinguishes `recorded`,
`unchanged`, `invalid`, and `unavailable`; it never treats a message as proof
that a file is durable. Phase two reopens that persisted record in a new
process, displays the unresolved actions deterministically, and closes one
named action without overwriting a changed or malformed record. The trial
package declares the phase-two recovery criterion applicable to phase one, so
the phase-one context contains the exact cross-phase outcome contract.

This bootstrap repository remains the tool provider. The target adapter is
deliberately thin: with an explicit provider root, provider commit, package or
store path, snapshot, phase, and activity, it invokes the provider's
`npm run plan -- context` operation and forwards a separately authored record
through `npm run record-result`. It must not select a latest snapshot, parse or
rewrite package semantics, accept a proposal, infer readiness, modify an
installed skill/cache, or claim that a context CLI installation proves use.
The provider root is local configuration, never a committed personal path; the
observed provider revision belongs in the result evidence. This validates
source-checkout invocation across repositories, not npm/global-CLI distribution.
Tests and retained results must show the actual invocation, provider revision,
identity, and governing criterion delivered to the executor.

Non-goals: a reusable agent orchestrator, editing an installed execution skill,
an SGM graph/link publication, migration of existing Markdown plans, a browser
application, remote storage, authentication, a production handoff product,
automatic acceptance, automatic PR/merge discovery, or a productivity claim.
The target remains separate from both this repository's product source and its
`examples/` fixtures, and its README must label it synthetic.

No new trial-product UI, browser behavior, or layout work is in scope. All
W04 acceptance checks are **automated-only** (CLI/process, filesystem, and
repository evidence); no PR-visual review or screenshot/video attachment is
required. If a browser surface becomes necessary, it requires a new proposal
that names reviewer states, viewports, still captures, and the GitHub
`gh pr edit --attach` delivery path.

## Architecture and durable decisions

Keep the synthetic application, target package, and provider distinct:

| Component | Responsibility | Constraint |
| --- | --- | --- |
| `sgm-shift-handoff-trial/app` | Validate, write, reopen, and transition local handoff records | Native Node APIs only; atomic replace; no access to `.plan-package` internals |
| `sgm-shift-handoff-trial/plan-package` | Declared two-phase obligations, source document reference, and stable IDs | Its accepted snapshot is the execution authority, not the working draft |
| `sgm-shift-handoff-trial/tools/phase-adapter.mjs` | Forward explicit context and result-record requests to a pinned provider checkout | Preserve stdout/stderr/provenance; never duplicate selector or result logic |
| `sgm-shift-handoff-trial/test` | Process-level and domain checks, including a fresh process handoff | Assert observable output and bytes; do not retain raw agent conversations |
| this bootstrap repository | Provide the supported `plan` and `record-result` commands at a named Git revision | No target-code ownership, target-package mutation, or hidden path discovery |

The app's persisted handoff document is a target-owned format, distinct from
the Plan Package's ignored `.plan-package/` history. A phase result records
the target code revision, provider revision, commands/checks, observed facts,
produced interface, unresolved findings, and delivery facts against the
accepted target-package snapshot. It is evidence of an observation, not
automatic phase completion. The root `status.md`, `project_status.md`, and
this plan remain this repository's own Markdown memory; they are not copied
into the target package or trial app.

Execution requires this plan's accepted baseline and, before P1, an explicitly
accepted target-package snapshot. Initialize the target at
`../sgm-shift-handoff-trial` with its own Git root and baseline commit. The
provider checkout must be pinned to a resolvable revision with its dependencies
available. An executor then authors the target package from this plan,
publishes it, and pauses for that acceptance before forwarding context. Before
P2, a different or fresh executor session invokes the adapter itself with the
explicit provider and target/store locations; it must not receive a hand-copied
P1 summary as a substitute for attributed context.

## P1 — Record a durable handoff through attributed phase context

Objective: establish the selected trial package and use its phase-one context
to implement the storage boundary that phase two will actually consume.

- **P1-T1:** Initialize the separate `sgm-shift-handoff-trial` Git repository
  and add its baseline app, README, and source contract under
  `plan-package/`. Define stable IDs for two phases, implementation/verification
  tasks, the phase-two consumer criterion, its explicit applicability to P1, a
  graph-free repository reference, and any necessary blocking questions.
  Publish the complete target package and obtain an explicit acceptance record
  for its concrete snapshot before forwarding context to an executor.
- **P1-T2:** Add target-local `phase-adapter.mjs` with separate `context` and
  `record` operations. Require an explicit provider root/revision,
  snapshot/phase/activity identity, and result input; invoke the provider's
  supported `plan` and `record-result` commands rather than importing private
  persistence code. Return nonzero, labelled failures for an unavailable or
  revision-mismatched provider, unaccepted, blocked, incomplete, or malformed
  handoffs.
- **P1-T3:** Implement the phase-one handoff model, schema validation, atomic
  JSON persistence, deterministic action ordering, and open-handoff command.
  Return the declared outcome values and ensure retry/no-op behavior is
  distinguishable from a successful first durable write.
- **P1-T4:** Add domain and spawned-process tests that inspect the adapter's
  real provider invocation/output. Verify that it identifies the accepted
  snapshot, P1, the phase-two consumer criterion, and the pinned provider
  revision; verify invalid input, an unavailable/revision-mismatched provider,
  interrupted/failed writes, duplicate input, and a reopened process. Record a
  non-illustrative P1 implementation result only after the checks run against
  the named target and provider revisions.

P1 acceptance: a fresh process reads exactly the durable handoff created by a
context-bearing P1 invocation; its outcome contract and phase-two consumer
criterion are visible in the supplied context. The adapter has no draft,
latest-snapshot, or implicit-provider fallback, and its result record is
attributable to the accepted target-package snapshot and tested target/provider
revisions.

## P2 — Freshly recover, complete, and independently verify the handoff

Depends on P1's accepted package snapshot, persisted P1 interface/result, and
the application record created by P1.

Objective: prove that a new executor can obtain bounded, attributable P2
context, use the predecessor's observed interface rather than its proposed
approach, and deliver the recovery behavior with independent evidence.

- **P2-T1:** Start from a fresh executor session in a clean target worktree and
  call the adapter's explicit P2 `context` operation, passing the preserved
  package store when live source is unavailable or changed. Inspect the
  returned provider/source identity, governing criteria, prerequisite
  interface/result, blockers, and requested expansions before changing target
  code. Demonstrate in an automated integration check that the delivered P2
  context names the recorded P1 interface; do not substitute copied chat text
  or a mutable draft.
- **P2-T2:** Implement the resume/close command against P1's persisted format.
  It must emit a stable ordered view of open actions, atomically close one
  named action, preserve other actions, and report explicit unavailable or
  conflict outcomes for missing, malformed, or concurrently changed records.
  Do not alter the P1 persistence contract merely to simplify P2.
- **P2-T3:** Independently verify every applicable P2 criterion against the
  actual P2 code revision using domain and spawned-process checks. Preserve a
  failed, blocked, or unavailable disposition where one occurs. If a repair is
  needed after verification, record the obsolete result as stale and publish a
  superseding result for the repaired revision; never fabricate a repair just
  to create history.
- **P2-T4:** Reopen the accepted trial package and P1/P2 result history from a
  fresh process after the live package source is unavailable or changed, using
  the supported `--store` path. Confirm that the selected P2 context, result
  records, and evidence revisions agree with the adapter/test observations.
  Record compact trial measurements: context characters, expansions requested,
  command elapsed time, rework/intervention count, and limitations. Keep raw
  prompts, tool transcripts, and screenshots out of the repository.

P2 acceptance: a fresh executor receives an accepted-snapshot P2 context that
identifies P1's actual interface and the exact recovery criterion, then closes
the intended action without corrupting or silently replacing the record. Each
criterion has a truthful disposition tied to the inspected revision, and the
fresh recovery path never inherits a stale pass or substitutes the live draft.

## Validation and recovery constraints

Use focused native Node tests and the target repository's declared lint, test,
and build commands for each phase, plus `git diff --check` in the repository
whose files changed. Separately verify the provider checkout revision and run
its actual `plan`/`record-result` operations against the target package; do not
claim npm/global-CLI installation coverage. Validate the target package through
its actual publish/accept/context/record operations, not a hand-built
equivalent.

There is no schema migration. Rollback reverts only the relevant target source
and adapter change; it must not rewrite or delete accepted package snapshots
or result records. A later changed target package requires a new snapshot and
explicit acceptance, while a repaired candidate requires new evidence tied to
its own target and provider revisions.
