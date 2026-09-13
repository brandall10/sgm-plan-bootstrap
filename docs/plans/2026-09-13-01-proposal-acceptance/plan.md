# W02 — Refine, accept, and reopen the same proposal

## Goal and scope

Preserve the exact proposal a person reviews, record their actual acceptance separately, and reopen its requirements and selected designs after later edits or a runtime restart. Make changes between that accepted proposal and a newer draft inspectable in the reusable viewer.

Design inputs: [revision and acceptance rules](../../specs/01-plan-package.md#revisions-and-acceptance), [reference identity](../../specs/01-plan-package.md#references-and-identity), [visual meaning](../../specs/01-plan-package.md#visual-meaning), [native feedback](../../specs/02-viewer-and-review.md#native-annotation-loop), [comparison](../../specs/02-viewer-and-review.md#acceptance-and-comparison), and [coherent updates](../../specs/02-viewer-and-review.md#coherent-file-updates).

Include local snapshot storage, acceptance recording through an explicit local command, pinned viewer navigation, material-change summaries, and a native review/refinement trial. Preserve the shared core/runtime/viewer boundaries and the existing atomic manifest publication convention.

Exclude execution activation, phase context selection, execution evidence UI, skill migration, SGM integration, hosted storage, accounts, collaborative editing, custom annotation transport, in-browser authoring or acceptance controls, semantic merging, pixel diffs, and automatic history deletion. Product acceptance records do not grant execution permission.

## Architecture and behavior

### Snapshot identity and storage

Use a local content-addressed store at `<package-root>/.plan-package/`, containing versioned snapshot descriptors, immutable byte blobs, and separate acceptance records. Keep this store outside the manifest's declared input set; reject references into it so snapshots cannot recursively include history. Create it lazily. Package identity and record IDs must be validated data, never unchecked filesystem paths.

A snapshot binds the exact manifest bytes and a deterministic inventory of captured files to a full SHA-256 identifier. Preserve the existing displayed candidate ID as a compatibility field, but use the full snapshot digest for durable references and acceptance. The inventory includes logical file ID, declared root/path, digest, and retained bytes. Capture all successfully resolved declared local files, including repository-root material and transitive prototype dependencies. Preserve optional unavailable references as explicit omissions/diagnostics; never replace them with later live content. Every governing selected asset and its dependency closure must be retained, even when its declaration omits a required flag. Required external material needs a retained local copy; do not fetch external URLs.

The shared core owns descriptor/record validation, identity inputs, acceptance meaning, and comparison. The Node runtime owns hashing, confined storage, atomic writes, and snapshot resolution. Reopening uses a resolver over retained blobs and reuses package validation and the runtime model projection. It must work without the original repository root or draft dependency files. Do not reserialize the authoritative manifest or rewrite its paths to reopen it.

Persist a complete snapshot before exposing a successful runtime candidate as reviewable. Write blobs and descriptors through temporary files and atomic publication; existing digest destinations must be verified and never overwritten with different content. Concurrent identical writes converge safely. Interrupted writes may leave unreachable temporary files or blobs, but cannot expose a partial snapshot. Disk failure retains the previous view with explicit persistence diagnostics. Verify descriptor identity and blob digests on reopening before serving a captured model/assets; missing or corrupt bytes produce a snapshot-specific error with no draft fallback. No automatic pruning occurs in this scope; document disk growth and backing up the whole store.

### Acceptance and readiness

Provide a local `npm run accept -- ...` command that requires an explicit snapshot ID, package/store location, actor attribution, actual acceptance instruction, and its source description or reference. Accept a UTF-8 input file for instruction text. There is no implicit “accept latest” behavior. Store a versioned append-only record containing a caller-supplied unique record ID, package ID, full snapshot ID, instruction, source, actor, recorded-at timestamp, and whether the record is illustrative. Attribution is supplied provenance, not authenticated identity. An agent may record acceptance only when the conversation already authorizes it.

Verify the exact referenced snapshot before publishing the record atomically. A repeated record ID with identical input is idempotent; reuse with conflicting content fails. Old snapshots can be explicitly accepted after the draft moves forward. Preserve earlier acceptance records; acceptance never mutates `plan.json`, increments its author revision, changes asset bytes, or activates execution. Record creation failure cannot appear as success. Keep writes in this command, with read-only history APIs in the viewer runtime. Refresh history on explicit reload and reconnect; observing the acceptance-record directory may notify through the existing event stream, without adding a second transport.

Treat `plan.json.state` as legacy author metadata, not proof of acceptance. Derive the acceptance label from a valid record for the exact snapshot; an unsupported manifest claim gets an explicit unverified label/diagnostic. Existing v1 packages remain readable without automatic acceptance migration.

Separate structural/file integrity from unresolved planning questions. A coherent draft containing blocking questions may be displayed, saved, and accepted as an approach while those questions stay visible with their affected items. It must not be labeled executable or ready for those obligations. Malformed content and unavailable governing bytes block snapshot acceptance. This distinction requires adjusting the resolver's current single valid-candidate gate without weakening digest or confinement checks. W02 does not implement a scheduler or context readiness service.

### Viewer selection and comparison

Extend routes with explicit draft or snapshot selection while retaining existing package/item links. A new unqualified package opening chooses the most recently recorded non-illustrative acceptance when available, otherwise the working draft; resolve that choice to a concrete snapshot route. Order records deterministically by recorded-at time with record ID as a tie-breaker. This is a display default, not activation. Explicit routes always win. Illustrative acceptance is visibly labeled and never supplies the ordinary accepted default.

Show snapshot identity, author revision, acceptance provenance, questions, and selected view. Draft watcher events can update the draft summary but cannot replace a pinned model or its artifact URLs. Reconnect/restart restores the concrete selected snapshot and item. Missing snapshot or corrupt record errors remain visible; never silently choose the draft or another acceptance. Keep draft rejection diagnostics distinct from pinned-snapshot integrity status. Preserve surviving navigation when deliberately switching views and explain missing-item fallback.

Compare two explicit resolved snapshots of the same package, normally accepted versus current draft. The core returns stable-ID additions, removals, and changes with old/new values and links. Cover goal/scope, constraints, phase objectives/approaches/order/dependencies, criteria, decisions, questions, references/applicability, asset authority/purpose, and file digests. A dependency-only CSS/JS change must identify the affected prototype. Distinguish revision/serialization/legacy-state-only changes from obligation or asset changes. Report captured-file availability differences. Do not claim semantic equivalence or infer that a changed design contradicts prose; human review resolves that judgment. A removed item links to its old snapshot. Every comparison keeps both versions accessible.

Native feedback remains in Codex annotations or conversation. Display the snapshot and stable item identity where available to support attribution. Apply compatible feedback to the working proposal and publish normally. Stale feedback must be checked against its source snapshot and current item; do not silently reinterpret a removed or changed target. Account for addressed/deferred/unresolved feedback in the handoff, while consequential decisions become authoritative package content.

## P1 — Durable snapshots and explicit acceptance

Objective: retain and identify complete proposals across processes, with honest acceptance and blocking-question semantics.

- **P1-T1:** Define core snapshot and acceptance contracts, full digest inputs, captured-file/omission rules, and separate material integrity from planning blockers. Preserve v1 reading and remove manifest-state-based acceptance claims from the model/header. Cover governing asset dependencies and unsupported record versions.
- **P1-T2:** Implement confined atomic snapshot/blob storage and reopening over retained bytes. Integrate persistence before runtime candidate publication. Exercise interrupted/concurrent writes, read-only/full-disk failures through fault injection, integrity checks, repository-root capture, optional omissions, and exclusion of the history store from package inputs.
- **P1-T3:** Implement the explicit acceptance command and record reader, including provenance validation, illustrative labels, idempotency/conflicting retries, old-snapshot acceptance, and history refresh on runtime reload. Keep records separate from content and preserve every earlier record.
- **P1-T4:** Add core, filesystem, CLI, and HTTP tests and document storage, command usage, compatibility, backup, and failure recovery. Use temporary copies of both fixtures; test inputs must explicitly identify synthetic acceptance as illustrative.

Acceptance: after persistence, changing/removing draft files and restarting still returns the exact retained manifest and dependency bytes. Partial/corrupt snapshots never produce accepted success. An actual command invocation records only its specified snapshot and provenance; duplicate retries cannot create conflicting records. Manifest `state: accepted` alone is insufficient. Blocking questions remain visible without preventing coherent viewing or implying executable readiness. Run typecheck, lint, unit/HTTP tests, browser regressions, and build.

## P2 — Reopen and compare accepted proposals

Depends on P1's snapshot/acceptance interfaces.

Objective: make accepted content, later drafts, and their material differences directly inspectable.

- **P2-T1:** Add read-only history/snapshot/comparison API projections and a shared core comparison function. Compare stable identities and captured bytes, including prototype dependencies; reject cross-package comparisons and report unavailable inputs explicitly.
- **P2-T2:** Implement concrete snapshot/draft routes, default selection, acceptance provenance and illustrative labels, pinned artifact serving, and deliberate view switching. Retain older links and isolate draft diagnostics from accepted content. Keep prototype sandbox/CSP and safe narrative behavior for all snapshots.
- **P2-T3:** Add compact change summaries with old/new values and navigable links into both snapshots. Cover deleted items, dependency changes, authoritative design-only edits, reference changes, and metadata-only revisions. Maintain keyboard use, visible focus, wrapped identifiers, and desktop/tablet/narrow hierarchy.
- **P2-T4:** Add browser/HTTP/core checks for acceptance followed by text and CSS/JS edits, pinned live refresh, runtime restart, deep links, multiple acceptances, illustrative records, missing/corrupt snapshots, and invalid current drafts. Verify both fixtures and document reopening/comparison usage.

Acceptance: a fresh unqualified opening selects the latest real recorded acceptance, while explicit draft and older snapshot links remain stable. Watching, reload, and reconnect do not replace pinned content. A design dependency change appears in comparison even when criterion text is unchanged. Each changed or removed item reaches the correct version. Corruption never substitutes current draft bytes, and prototypes remain isolated. Run typecheck, lint, unit/HTTP tests, browser checks, and build; inspect representative layouts.

## P3 — Demonstrate the complete review/refinement loop

Depends on P2's pinned routes and comparison UI.

Objective: demonstrate that native review can refine one proposal while preserving its accepted meaning.

- **P3-T1:** Prepare an isolated illustrative package, review it with its selected prototype, and record a clearly labeled demonstration acceptance. Reopen after restart, revise a criterion and selected design, publish, and demonstrate both preserved content and the comparison links. Verify repository-root source removal does not break retained material.
- **P3-T2:** Obtain a real native annotation against a visible snapshot/item, interpret it against that version, and apply its compatible change to the working draft. Exercise stale feedback after another edit and a removed target. Request a concrete human annotation if the host requires it; automated tests cannot establish receipt. Record actual attribution, addressed/deferred/unresolved outcomes, and visible refresh without inventing host messaging.
- **P3-T3:** Complete usage/troubleshooting guidance and independent verification of the changed code. Record native receipt evidence separately from simulated stale-target checks, snapshot/record IDs, byte comparisons, and layout evidence. If host receipt cannot be obtained, record the exact blocker and leave that acceptance obligation incomplete. Measure snapshot reopen and comparison on the representative fixture over five ordinary runs; record environment, range/median, and investigate repeatable delays beyond a few seconds.

Acceptance: the isolated trial demonstrates review, recorded illustrative acceptance, later refinement, and exact reopening after restart. At least one new native annotation actually reaches the agent and its compatible resolution appears in the draft while the accepted snapshot stays unchanged. Conflicting/stale feedback is explicitly accounted for. Run typecheck, lint, unit/HTTP tests, browser checks, build, and `npm run measure`; record the additional reopen/comparison measurements separately. Demonstration acceptance is never presented as acceptance or implementation of the example's exercise behavior.

## Prerequisites, decisions, and recovery

Execution requires Node/npm, the local Chrome browser used by Playwright, writable package storage, and a supported Codex annotation surface plus a real human interaction for P3. Native receipt can block P3 completion but not P1/P2. Routine module names and visual styling are delegated within these contracts. No unresolved product decision blocks P1.

The established validation commands are `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, and `npm run build`. Tests must assert observable persistence, attribution, isolation, and selection behavior rather than mirror implementation details. Automated checks do not establish human authorization or native receipt. Use independent phase verification under repository conventions; performance checks and manual layouts apply where specified above.

History is additive; do not rewrite existing proposals to migrate acceptance. Older readers can still open draft manifests but do not understand durable acceptance; document that limitation. Preserve the store during rollback and never garbage-collect accepted bytes. Recover corrupt history from a verified backup of the same bytes; otherwise report unavailable content. Repairing/re-publishing a draft does not repair an accepted snapshot. Temporary-write cleanup may remove only unreferenced temporary artifacts, never completed snapshots or records.
