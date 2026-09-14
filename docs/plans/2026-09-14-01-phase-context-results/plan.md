# W03 — Retrieve phase context and predecessor results

## Goal and inputs

Provide a local, deterministic way to recover the accepted scope for one
implementation or verification phase without loading an entire plan, and retain
compact phase outcomes that later work can use without mistaking them for the
accepted proposal. The same source identity must drive the package core, local
CLI, runtime projection, and viewer.

Design inputs: [phase meaning and dependencies](../../specs/01-plan-package.md#phase-meaning-and-dependencies), [references and identity](../../specs/01-plan-package.md#references-and-identity), [viewer/core boundaries](../../specs/02-viewer-and-review.md#application-boundaries), [execution context](../../specs/03-execution-and-integration.md#context-selection), [operations](../../specs/03-execution-and-integration.md#operations), [readiness and revisions](../../specs/03-execution-and-integration.md#readiness-and-revisions), [durable product results](../../specs/03-execution-and-integration.md#durable-results-in-the-product), and [observable correctness](../../specs/03-execution-and-integration.md#observable-correctness-and-usefulness). W02's retained snapshots, acceptance records, comparison API, and immutable asset routes are the required baseline; see [W02 results](../2026-09-13-01-proposal-acceptance/results.md).

Scope includes a shared context-selection model, explicit activity-aware CLI
operations, append-only execution-result records, runtime/viewer result
projections, and fixture-based proof of a fresh handoff. It preserves the
bootstrap's existing Markdown memory ownership: this repository continues to
use `project_status.md` and root `status.md`; product records are not a
migration of those files.

Non-goals: scheduler or manager-agent behavior, model routing, an MCP wrapper,
global CLI installation, hosted storage/accounts, a database, in-browser
result authoring, automatic Git/PR discovery, automatic acceptance or phase
activation, a graph database/SGM migration, skill changes, and W04's live
execution-skill trial. W05 remains conditional on that trial.

## Architecture and behavior

### Context-capable package semantics

Extend the shared package contract with a small, versioned context-selection
capability rather than deriving hidden relationships from prose. Add stable,
activity-tagged phase tasks and optional explicit applicability for a criterion;
an omitted criterion applicability defaults to its owning phase. A downstream
criterion can therefore declare that it constrains a prerequisite, allowing the
selector to deliver its exact wording to the earlier phase without including
the downstream phase's unrelated narrative. Validate every new stable ID,
activity value, and applicability target with the existing global-ID and
relationship rules.

The core selector begins from an immutable, identified snapshot plus a phase
and `implement` or `verify` activity. It returns a structured selection that
contains the plan identity, exact goal/scope, a brief phase map, shared
constraints, applicable exact criteria, current-phase objective/approach/tasks,
decisions, questions, governed references/assets, relevant prerequisite
outputs, and compact provenance for every selected item. It follows declared
applicability, dependency edges, and explicitly declared consumer obligations;
it does not recursively include predecessor plans. Ordering is stable by the
package's declared order, then stable ID where an order is not declared.

The selector distinguishes governing material from expandable material. It
must preserve governing wording exactly. It may omit only explicitly
expandable supporting narratives, older superseded result records, and
unselected historical material; their stable IDs and source snapshot stay in
the response. A character-budget option can return a clearly marked
over-budget/incomplete handoff with required omitted IDs and expansion
instructions. It must not silently truncate a criterion, report character
counts as tokens, or claim readiness after omitting a required obligation.

Existing v1 snapshots remain readable. A package that lacks the new capability
may be inspected, but a selector cannot claim complete consumer-obligation
coverage where that package supplies no explicit context metadata. New fixture
content declares the capability; old accepted bytes are never rewritten.

### Result records and readiness

Store result records beside snapshots and acceptance records under
`<package-root>/.plan-package/results/`. They are versioned, append-only,
immutable JSON records published through the same confined atomic-write
discipline as acceptance records. A record names the package, exact snapshot,
phase, activity, author/recorded time, code revision, relevant environment,
and related item IDs. It separately carries intended work, observed facts,
inferences, unverified claims, produced interfaces, consequential deviations,
unresolved findings, evidence links, and review/PR/integration facts. A record
can explicitly supersede earlier records; it never modifies plan bytes,
acceptance provenance, or another result.

The store validates that the snapshot reopens, belongs to the package, and
contains the named phase and item IDs before publishing a result. Duplicate
immutable record input is idempotent; conflicting reuse of a record ID fails.
Malformed, corrupt, mismatched, or stale records remain diagnosed and cannot
become evidence of completion. An illustrative fixture record stays visibly
illustrative. A real non-illustrative acceptance is necessary for a ready
handoff, while even a valid result record is an attributed observation—not
proof that a phase is implemented, verified, reviewed, or integrated.

For a selected phase, readiness requires a real accepted snapshot, available
governing reference/design bytes, no applicable blocking question, and no
declared prerequisite whose current retained result is missing, incompatible,
or unresolved. The selector surfaces those conditions individually. It does
not infer readiness from a merged revision, an acceptance record, a result
record, or the current draft. If an optional comparison with newer draft
content is requested, it is labelled as newer material and uses W02's
snapshot-comparison semantics rather than blending it into the accepted
baseline.

### Local operations and projections

Add a package-local command entry point while keeping `npm run dev` as the
viewer launcher. It exposes the specified `current`, `context`, and `expand`
operations, plus an explicit result-recording command. `context` requires a
concrete snapshot, phase ID, and activity; `current` can resolve the latest
non-illustrative accepted snapshot only as a display default and reports an
unaccepted package instead of substituting a draft. Each readable Markdown
response carries machine-addressable provenance: package and snapshot IDs,
selected phase/activity, selected item IDs, result-record IDs/revisions,
unavailable required material, readiness blockers, and available expansions.

`expand` accepts only explicit IDs resolved from the same snapshot. It returns
retained textual material exactly where safe and exposes governing visual or
binary material through a snapshot-bound, immutable viewer/runtime route with
its media type and provenance. A mutable working path alone never counts as
asset availability or inspection. The CLI has no write path except the
explicit result-record command and never scans roadmap prose to choose work.

Extend the runtime's read-only model/history projection with verified result
records and per-phase result availability. The viewer reuses that projection to
show a compact finding/result panel with source snapshot, code revision,
evidence label, and limitation/claim distinctions. It must keep selected
accepted content pinned while drafts or later records change, and it must not
turn absence of a result into a success label.

## P1 — Model declared obligations and deterministic selections

Objective: make phase-focused selection a shared, testable core capability
whose coverage claims are tied to declared package semantics.

- **P1-T1:** Extend `src/core/package.ts` with the minimal versioned task and
  cross-phase criterion applicability contract, capability validation, stable
  IDs, activity handling, compatibility behavior, and diagnostics. Update the
  two illustrative manifests only where needed to declare real consumer
  obligations rather than encoding them in selector heuristics.
- **P1-T2:** Add a pure `src/core` context-selection model that resolves an
  identified package/snapshot, phase, and activity into governing versus
  expandable material with deterministic provenance and exact authoritative
  wording. Include dependency-result slots and distinct readiness blockers;
  do not add Node, HTTP, browser, or filesystem authority to the core.
- **P1-T3:** Cover ordinary phase selection, a future consumer constraint
  reaching its prerequisite, task/activity filtering, answered/deferred/open
  questions, unknown IDs, invalid applicability, dependency cycles, and v1
  compatibility. Assert that unrelated narratives do not appear by default and
  that no incomplete selection is labelled ready.

Acceptance: a pure selection of either fixture has stable IDs/order and the
same accepted plan identity later exposed by the runtime. The persistence
phase receives the recovery phase's declared outcome constraint exactly, while
the recovery layout narrative remains expandable. Existing retained W01/W02
snapshots still parse, and missing context semantics produce an explicit
coverage limitation rather than invented obligations.

## P2 — Retain phase outcomes independently of proposal bytes

Depends on P1's phase/item and activity contracts.

Objective: persist compact, attributable implementation and verification
observations that a fresh selector can safely consume.

- **P2-T1:** Define and validate the result-record model in the shared core,
  including snapshot/package/phase identity, provenance, code/environment,
  interfaces, findings, evidence, delivery facts, statement disposition, and
  explicit supersession. Preserve the distinction among intended, observed,
  inferred, and unverified content.
- **P2-T2:** Extend `SnapshotStore` with confined atomic result publication,
  idempotent/conflicting retries, verified list/open operations, corruption
  diagnostics, and retention rules. Validate records against reopened retained
  snapshots, never working files, and preserve prior records on all failures.
- **P2-T3:** Add the explicit local result-record command and a read-only
  `CandidateStore`/runtime projection for current, historical, and per-phase
  records. Resolve current versus superseded records deterministically while
  keeping history expandable and labels honest.
- **P2-T4:** Test restart after draft/source removal, concurrent/idempotent
  writes, bad record IDs, package/snapshot/phase mismatch, corrupt records,
  missing predecessor output, incompatible declared interface, stale evidence,
  and illustrative fixture labelling. Verify result creation cannot mutate a
  manifest, acceptance record, or selected snapshot.

Acceptance: a fresh process retrieves a result record with its exact accepted
snapshot and phase identity after the draft files are unavailable. A later
phase sees a prerequisite's retained interface and unresolved discrepancy, not
the predecessor's proposed approach. Conflicting record reuse and corrupt
history fail visibly; no result alone changes acceptance or readiness.

## P3 — Deliver attributable CLI context and expansion

Depends on P1's selector and P2's verified result projection.

Objective: make `current`, `context`, `expand`, and explicit result recording
usable locally without recreating package semantics in a separate CLI.

- **P3-T1:** Implement strict command parsing, selected-package/root handling,
  snapshot/phase/activity requirements, readable Markdown rendering, exit
  behavior, and compact provenance from the shared selection model. Preserve
  the existing viewer command and document the supported local invocation.
- **P3-T2:** Implement `current` accepted-snapshot inspection and `context`
  readiness reporting. Include exact governing text, current result records,
  prerequisite interfaces/findings, blocking questions, unavailable required
  bytes, stale/newer-draft distinctions where requested, and no unlabelled
  fallback to a draft or another snapshot.
- **P3-T3:** Implement same-snapshot explicit expansion, including safe
  textual reference delivery and snapshot-bound visual/asset inspection
  handles. Enforce a declared character budget with an explicit incomplete
  result and expansion list; never assert an exact token count without an
  actual tokenizer.
- **P3-T4:** Add command-level tests for accepted/unaccepted/illustrative
  packages, malformed arguments, pinned restart behavior, deterministic output,
  required unavailable inputs, over-budget selection, explicit expansion, and
  attempted cross-snapshot/cross-package access.

Acceptance: `current`, `context`, and `expand` identify the same package,
snapshot, criteria, references, and result-record revisions as the shared
model. A caller can retrieve the governing visual/design content from retained
bytes instead of a mutable filename. An incomplete, blocked, or unaccepted
handoff is explicit and never printed as executable context.

## P4 — Demonstrate fresh recovery and inspectable product results

Depends on P2 and P3.

Objective: demonstrate that a later executor or verifier can use the retained
context and evidence without reconstructing the original planning session.

- **P4-T1:** Add an execution/result panel to the existing overview and phase
  views using the runtime's read-only projection. Keep result claims, evidence,
  limitations, snapshot provenance, and implementation/verification/integration
  labels distinct; preserve keyboard use, focus, wrapping, and narrow layouts.
- **P4-T2:** Extend representative fixture scenarios with a real declared
  consumer constraint, a compact illustrative predecessor result, a changed or
  missing governed input, and a verification record after a repair. Exercise a
  fresh runtime/CLI process, pinned accepted context, result supersession, and
  viewer/CLI agreement without claiming that the fixture product was delivered.
- **P4-T3:** Document context and result-record use, source identity,
  readiness limits, asset inspection, recovery, and result retention. Measure
  matched full-versus-selected context on the representative fixture over a
  small documented set of runs, recording character counts, elapsed time,
  expansion use, and limitations without extrapolating a productivity claim.
- **P4-T4:** Run independent core/runtime/CLI/browser verification. Confirm
  exact criteria survive selection, a repaired candidate does not inherit an
  obsolete verification pass, unavailable inputs block a ready claim, and
  ordinary document references work without an SGM graph.

Acceptance: a fresh session can recover the accepted goal, selected phase
obligations, prerequisite interface/result, unresolved finding, and linked
evidence from retained source identities. The viewer and CLI agree on that
identity and selected material. The demonstration clearly separates fixture
claims from observed product execution and reports its measurement conditions.

## Prerequisites, validation, and recovery

W03 requires the W02 snapshot/acceptance interfaces, Node and npm, writable
package-local history storage, and a local browser for the existing Playwright
checks. No new external service is required. Result record creation requires
the same actual user authority as any other local write; a record can document
authorization/provenance but cannot confer it.

The established validation suite is `npm run typecheck`, `npm run lint`,
`npm test`, `npm run test:e2e`, `npm run build`, `npm run measure`, and `git
diff --check`; W03 adds focused command/core/runtime coverage and a documented
context-selection measurement where needed. Automated checks cannot prove that
an executor inspected a governed visual asset or that an external review was
independent; those observations must remain explicit in the result record.

History is additive. Rollback leaves accepted snapshots and result records in
place; malformed/corrupt result bytes are reported and never substituted with
the current draft. Repairing or republishing a plan cannot rewrite the baseline
or retroactively validate an earlier result. No unresolved product decision
blocks P1: exact field names, CLI script name, and panel layout may vary only if
they preserve the versioned contracts and observable behavior above.
