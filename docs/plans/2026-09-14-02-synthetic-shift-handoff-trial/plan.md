# W04 — Exercise the workflow through a synthetic shift-handoff trial

## Goal and inputs

Demonstrate that the accepted Plan Package workflow can guide a real, bounded
two-phase change across a provider/consumer repository boundary and from a
fresh executor session. The target is a deliberately synthetic Git repository,
`sgm-shift-handoff-trial`, containing a **shift-handoff ledger** rather than a
new illustrative viewer fixture or a production integration. It will make a
small, observable state transition: record an unresolved handoff in phase one,
then recover and close that handoff in phase two. Between those domain phases,
establish a versioned JSON provider CLI contract and migrate the existing
consumer adapter; this is a bounded protocol correction within the same trial.

Design inputs: [execution context](../../specs/03-execution-and-integration.md#context-selection), [operations](../../specs/03-execution-and-integration.md#operations), [verification and completion](../../specs/03-execution-and-integration.md#verification-and-completion), [planning-skill integration](../../specs/03-execution-and-integration.md#planning-skill-integration), [correctness and usefulness](../../specs/03-execution-and-integration.md#observable-correctness-and-usefulness), and [performance/proportionality](../../specs/02-viewer-and-review.md#performance-and-proportionality). W03's completed selection, snapshot, result, CLI, runtime, and recovery work is the required baseline; see its [results](../2026-09-14-01-phase-context-results/results.md).

The trial package must be explicitly published and accepted at a concrete
snapshot before either execution phase receives context. The user remains the
authority for that package acceptance; accepting this repository plan does not
implicitly accept the trial package or activate an implementation phase.

## Scope and boundaries

Maintain the existing `sgm-shift-handoff-trial` as a separate synthetic Git repository at
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
`npm run --silent plan -- context --format json` operation after P1A and forwards a separately authored record
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
| `sgm-shift-handoff-trial/tools/phase-adapter.mjs` | Forward explicit context and result-record requests to a pinned provider checkout | Validate public JSON identity/version; preserve stdout/stderr/exit status; never duplicate selector or result logic |
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
publishes it, and pauses for that acceptance before forwarding context. After P1A, before
P2, a different or fresh executor session invokes the migrated adapter itself with the
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

## P1A — Establish the JSON CLI contract and migrate the trial adapter

Order: **P1 → P1A → P2**. Local planner/status-next instructions select the
first incomplete phase in checklist order and impose no numeric-only ID rule;
P1A preserves established bootstrap P1/P2 references. Target package IDs remain
`phase.handoff-record` and `phase.handoff-recover`. P1A is not a third domain
phase or a new target snapshot.

Depends on the preserved P1 application, acceptance, interface, and result.
Do not redo P1's implementation. Markdown was a useful initial prompt/debug
renderer; exposing a structured interface from a typed source is a deliberate
design revision, not a defect in W03's execution of its original requirement.

- **P1A-T1:** Define a small independent public response type, its runtime
  validator, and one detailed package-reference contract. Follow the decisions
  below, documenting operation-specific presence and failure semantics without
  serializing the overlapping internal `ContextSelection` wholesale.
- **P1A-T2:** Separate loading/resolution, public response assembly, and two
  renderers for `current`, `context`, and `expand`. Default to JSON and support
  explicit `--format json|markdown`. Move result history, predecessor details,
  routes, comparisons, and diagnostics currently assembled in `renderContext`
  into the shared model; neither renderer resolves references or readiness.
  Preserve exact governing text, author order, current acceptance selection,
  explicit context identity, retained `--store` sources, snapshot-bound explicit
  expansion, and separately labelled `--compare-draft` information.
- **P1A-T3:** Migrate the existing target adapter and process assertions. Require
  explicit provider root/revision and target package/store, snapshot, phase,
  and activity. Invoke `npm run --silent plan -- context --format json`; parse
  the entire stdout and validate the public envelope and returned identity.
  Forward valid provider stdout/stderr and exit status, including structured
  failures, without banners or prose wrappers. Put adapter diagnostics on
  stderr; distinguish launch/protocol errors from valid blocked responses.
  Use fields/codes, never Markdown parsing, and do not recompute selection,
  readiness, or predecessor compatibility. Preserve supported result recording.
  Reject or explicitly identify dirty provider state; it is not the clean HEAD.
- **P1A-T4:** Verify the public launcher and real provider-to-adapter boundary,
  run affected provider/target gates, and independently assess the criteria
  below. Update README package operations, runtime/package reference, diagnostic
  and exit guidance, budget examples, and affected measurement producer/tests
  with implementation. Keep one detailed response reference and link to it.
  Record actual provider/target revisions and bounded matched-payload JSON vs
  Markdown measurements; preserve historical observations and immutable results.

### Public contract decisions

The proposed envelope uses `format: "plan-cli-response"`, `format_version:
"1"`, `operation`, `request`, `source`, `outcome`, `diagnostics`, `coverage`,
`completeness`, `readiness`, and operation-specific `data`. Its version is
independent of the Plan Package schema. Runtime validation checks required
fields, discriminants, identities, diagnostics, and the fields adapters consume;
unsupported versions fail closed, unknown additive fields are tolerated. Reuse
existing domain types/validation patterns, without a general RPC/schema stack.

`request` retains the explicit package/store selection, snapshot, phase,
activity, requested expansion IDs and interpreting options (format, budget,
repository root, comparison). On argument errors preserve known inputs with a
nullable operation/source instead of inventing resolved identity. `source`
identifies the package/plan, proposal revision, snapshot, acceptance status,
selected source IDs, and actual result IDs/code revisions used. Diagnostics
carry stable codes, severity, explanatory messages, and applicable item/path/
reference identifiers; prose is never a parser delimiter.

Use a small section-state representation for collections that can be absent:
`state: not_requested|resolved|unavailable` and `items` only when resolved.
Resolved empty is `items: []`; no applicable tasks can additionally report
informational `no_tasks_for_activity`. Missing legacy task declarations instead
report limited coverage. Partial expansion keeps each requested item's resolved
or unavailable state and reference diagnostic. Do not wrap every scalar.

`outcome: ok|error` describes operation success. `coverage:
complete|limited|unavailable` concerns declared obligations; `completeness:
complete|incomplete|unavailable` concerns the delivered response. `readiness`
has `ready|blocked|not_evaluated` plus structured blockers. Acceptance remains
source metadata. A blocked phase can have a complete resolved response; a
limited or budget-incomplete response cannot claim a complete ready handoff.
Budget fallback uses `not_evaluated` readiness and an explicit diagnostic,
without erasing known blockers. Operation success alone does not grant execution.

| Operation | Data/presence rules |
| --- | --- |
| `current` | Accepted baseline identity, phase states, blockers and available current/historical results; no draft fallback. Phase-specific context and expansions are not requested. |
| `context` | One copy of goal/scope, phase map, selected phase/tasks, exact applicable obligations, references/assets, governing source IDs, prerequisite interfaces/findings and result history. Comparison is not requested unless selected; expose limitations and available expansion IDs. |
| `expand` | Requested IDs in meaningful request/author order, retained content or attributable binary/visual routes and per-item diagnostics. Context selection and phase readiness are not evaluated. A route is not proof of inspection. |
| Handled failure | Same versioned envelope with known request/source, stable diagnostics and explicit unavailable sections; no invented empty success payload. |

JSON stdout is exactly one complete response plus an optional newline;
incidental logs go to stderr. Explicit help may remain text. Preserve exit
codes `0` for successful usable operations, `1` for unavailable/blocked/
unaccepted/incomplete outcomes, `2` for argument errors. Document existing
operation-specific nuances instead of silently changing them: expansion can
return `0` for successful inspection of an unaccepted snapshot, and legacy
limited coverage alone does not currently force a nonzero context exit. Neither
case establishes a complete executable handoff. Cover missing/invalid arguments, stores and
snapshots, and expected runtime failures in default/explicit JSON mode.

For `context`/`expand`, `--max-chars` counts Unicode code points in the complete
selected-format serialization including its trailing newline (not UTF-8 bytes
or tokens); `current` retains its existing rejection of that option. Never
slice JSON or drop obligations while claiming completeness. On overflow return
a complete minimum envelope with `budget_exceeded`, request/source identity,
known blockers, full serialized count, requested limit, and useful expansion/
raise-budget next steps. That minimum diagnostic response can exceed a tiny
limit and must disclose this exception. Markdown applies the same policy to
its own serialized length. Tests must cover non-ASCII text and tiny budgets.

### Acceptance and verification

All three operations expose the documented versioned JSON default and explicit
Markdown. Both renderers preserve the same exact governing wording, source and
result identities, prerequisite observations, diagnostics and expansion meaning.
Machine-readable failures, unavailable required material, blocked readiness,
limited coverage, and exceeded budgets cannot masquerade as complete ready
context. The real adapter consumes validated fields/codes without implementing
the provider's semantics. Existing accepted packages, retained results and P1
persistence continue working; P2 can start through the corrected interface.

- Spawn all three operations through the supported silent npm launcher; parse
  whole stdout for default/explicit JSON and runtime-validate it. Exercise
  argument/source/store/snapshot failures and documented exits, accepted-but-
  blocked, legacy-limited and ready contexts, not-requested/resolved-empty/
  no-applicable-task/unavailable states, and malformed/version/identity adapter
  rejection. Do not strip npm banners or search for the first JSON brace.
- Compare decoded JSON values and Markdown for exact governing wording, IDs,
  selected scope, predecessor interfaces/findings, result revisions, comparison
  separation, reference diagnostics and immutable visual/binary routes. Cover
  snapshot isolation, explicit expansions and retained `--store` recovery.
- Exercise both renderers' overflow/tiny-budget paths. Prove P1's persisted
  record still reopens and P2 context names `interface.shift-handoff-v1` and
  exact `criterion.p2-reopen-close` through the migrated real adapter. Respect
  existing predecessor-result compatibility rules and keep producer claims
  separate from independent findings.
- Run relevant provider tests, typecheck, lint and build; affected target tests,
  lint/build; and `git diff --check` in both changed repositories. Existing
  consumers include `src/server/plan-cli.test.ts`, `p4-recovery.test.ts` and the
  `src/server/measure-runtime.ts` measurement producer. Browser tests are needed only for an affected
  shared path or an existing required gate; no screenshots/browser review.
- Compare representative context and expansion from the same resolved model
  and snapshot: characters, UTF-8 bytes, encoding/response version and relevant
  rendering/invocation timing. Include necessary expansions in total context
  cost. Name a tokenizer only if actual counts are available; no token estimates
  presented as measurements. W03 measured full JSON package vs selected
  Markdown, a selection observation rather than equal-payload serialization.
  Retain its numbers/conditions; claim no productivity gain or required JSON win.

The accepted target snapshot has no Markdown-only obligation. Serialization
alone requires no package reacceptance. If execution finds incompatible accepted
instructions, propose only that necessary amendment and obtain explicit
acceptance of the concrete new snapshot; preserve old snapshots/results and
never reattribute earlier observations. Do not redesign `record-result`,
storage, schema, viewer, MCP or scheduling.

Use a provider phase branch/PR and a separate target branch with attributable
commits. The local target has no remote; preserve local evidence without
inventing a target PR. Reconcile predecessor delivery before phase activation;
review and integration are distinct from tests. New compatibility results name
the actual new revisions, never overwrite P1's recorded provider revision.

## P2 — Freshly recover, complete, and independently verify the handoff

Depends on P1's accepted package snapshot, persisted P1 interface/result, the
application record created by P1, and completed P1A provider/adapter correction.

Objective: prove that a new executor can obtain bounded, attributable P2
context, use the predecessor's observed interface rather than its proposed
approach, and deliver the recovery behavior with independent evidence.

- **P2-T1:** Start from a fresh executor session in a clean target worktree and
  call the migrated adapter's explicit P2 `context` operation, passing the preserved
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

There is no schema migration. Rollback reverts the relevant provider CLI and
target adapter changes together, or the affected domain source change; it must not rewrite or delete accepted package snapshots
or result records. A later changed target package requires a new snapshot and
explicit acceptance, while a repaired candidate requires new evidence tied to
its own target and provider revisions.
