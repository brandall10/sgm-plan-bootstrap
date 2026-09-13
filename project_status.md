# SGM Plan Package experiment — project status

**Updated:** 2026-09-13
**Current state:** W01 P1, P2, and P3 are integrated in `main` via [PR #1](https://github.com/brandall10/sgm-plan-bootstrap/pull/1), [PR #2](https://github.com/brandall10/sgm-plan-bootstrap/pull/2), and [PR #3](https://github.com/brandall10/sgm-plan-bootstrap/pull/3). P3 integrated at merge commit `3e7b60daec2a5222c22deaf1cb5310b13fdcc27a`; W01 is complete. W02 P1 is implemented and locally verified on its scoped branch; review/merge is pending.
**Recommended next work:** push and open the scoped W02 P1 PR, then reconcile review/merge state before beginning P2.
**Active implementation plan:** [W02 — Refine, accept, and reopen the same proposal](docs/plans/2026-09-13-01-proposal-acceptance/plan.md) (accepted and committed; P1 checklist/results are current in [status.md](status.md) and [W02 results](docs/plans/2026-09-13-01-proposal-acceptance/results.md)).

## Goal and observed baseline

Make saved plans dependable to view and refine, then test whether focused context and retained results improve the authoring-to-execution handoff. A normal local web application renders packages without asking an LLM to reconstruct the interface.

The inspected source bundles contain SGM specifications, an illustrative offline-recovery plan, and visual authoring conventions. They contained no working shared Plan Package renderer/context resolver at W01 start. W01 now records a completed native Browser annotation receipt/edit/reload experiment; acceptance history, execution, and productivity evidence remain outside this work.

## Planning structure

This file is the sole source of truth for proposed work, actual plan links, priorities, and durable project memory. The following is our current suggested structure, not a comprehensive coverage map of the specifications. Unlisted capabilities create no implicit work. Revise this table as evidence changes; detailed phase design belongs in the selected implementation plan.

| ID | Proposed plan outcome | Scope and prerequisites | Specification references | State / actual plan |
| --- | --- | --- | --- | --- |
| W01 | Open and refresh a saved package | Representative sample, minimal package core, reusable viewer, coherent watcher; inspect current repository and probe native presentation | [Minimum content](docs/specs/01-plan-package.md#minimum-content), [phase meaning](docs/specs/01-plan-package.md#phase-meaning-and-dependencies), [example](docs/specs/01-plan-package.md#representative-example); [components](docs/specs/02-viewer-and-review.md#reusable-components), [application boundaries](docs/specs/02-viewer-and-review.md#application-boundaries), [updates](docs/specs/02-viewer-and-review.md#coherent-file-updates), [native loop](docs/specs/02-viewer-and-review.md#native-annotation-loop) | [Accepted plan](docs/plans/2026-09-12-01-package-viewer/plan.md); P1, P2, and P3 integrated in `main` via [PR #1](https://github.com/brandall10/sgm-plan-bootstrap/pull/1), [PR #2](https://github.com/brandall10/sgm-plan-bootstrap/pull/2), and [PR #3](https://github.com/brandall10/sgm-plan-bootstrap/pull/3); P3 merged at `3e7b60daec2a5222c22deaf1cb5310b13fdcc27a`; W01 complete |
| W02 | Refine, accept, and reopen the same proposal | Native feedback plus preserved reviewed assets and clear draft/accepted views; requires a usable viewer and actual host-surface findings | [Visual meaning](docs/specs/01-plan-package.md#visual-meaning), [revisions and acceptance](docs/specs/01-plan-package.md#revisions-and-acceptance); [native loop](docs/specs/02-viewer-and-review.md#native-annotation-loop), [comparison](docs/specs/02-viewer-and-review.md#acceptance-and-comparison) | [Accepted plan](docs/plans/2026-09-13-01-proposal-acceptance/plan.md); P1 implemented/verified in `7a1dd15de47920ddd811296e88b14508d8c4463b`; [active checklist](status.md); PR delivery pending |
| W03 | Retrieve phase context and predecessor results | Shared selector/CLI and demonstrable result handling in the product; requires package/revision semantics, not an SGM graph | [Context selection](docs/specs/03-execution-and-integration.md#context-selection), [operations](docs/specs/03-execution-and-integration.md#operations), [readiness](docs/specs/03-execution-and-integration.md#readiness-and-revisions), [product results](docs/specs/03-execution-and-integration.md#durable-results-in-the-product) | Proposed; no plan yet |
| W04 | Use the workflow on a real change | Thin adapters and a two-phase change in a separate trial project, including a fresh-session handoff; requires usable package/viewer/context capabilities | [Skill integration](docs/specs/03-execution-and-integration.md#planning-skill-integration), [verification](docs/specs/03-execution-and-integration.md#verification-and-completion), [correctness and usefulness](docs/specs/03-execution-and-integration.md#observable-correctness-and-usefulness); [performance](docs/specs/02-viewer-and-review.md#performance-and-proportionality) | Proposed; no plan yet |
| W05 | Connect the useful package to SGM | One real boundary/contract reference and necessary alignment with broader SGM design; scope depends on trial findings | [Authority](docs/specs/01-plan-package.md#authority-and-content-ownership), [references](docs/specs/01-plan-package.md#references-and-identity), [SGM integration](docs/specs/03-execution-and-integration.md#sgm-integration) | Conditional; no plan yet |

Rows are candidate plans, not implementation phases. They may be combined, split, reordered, replaced, or retired here. Capability dependencies matter; numbering does not impose a scheduler or automatically authorize every later row.

## Selected planning brief — W02

The user selected W02 on 2026-09-13 after W01 completion. Preserve complete reviewed proposals and their acceptance provenance, reopen exact accepted content after later edits/restart, and compare material changes. The [proposal](docs/plans/2026-09-13-01-proposal-acceptance/plan.md) has three dependent phases: storage/acceptance, viewer/history/comparison, and the complete native review trial. Selection authorizes planning only.

User approval on 2026-09-13 accepted the settled plan and checklist. Root [status.md](status.md) owns W02's active execution checklist; the [companion](docs/plans/2026-09-13-01-proposal-acceptance/status.md) mirrors the accepted baseline and current delivery state. [Results](docs/plans/2026-09-13-01-proposal-acceptance/results.md) record P1 implementation and verification separately from pending review/merge. W01 completion remains in its results, project memory, and Git history. Next action: deliver the W02 P1 PR.

## Historical planning brief — W01

The first useful outcome is a local app that opens the complete two-phase offline-recovery sample, navigates its content and designs, and refreshes coherent file edits. Establish the smallest supported package representation while implementing it. Include a second tiny package to reveal hard-coded sample rendering, invalid/partial-write recovery, preserved navigation, and basic load/refresh measurements.

Probe actual native annotation compatibility early, without making custom feedback infrastructure part of this plan. A working browser viewer remains useful if host presentation is unavailable; record that limitation honestly. Full acceptance/history, executable phase selection, skill migration, and SGM integration can remain outside W01.

The planner should choose technology, component boundaries, file layout, update convention, and PR-sized phases after inspecting the repository. The [README](README.md#planning-and-execution-conventions) supplies the invocation and workflow. Record the resulting plan link in this file; planning alone does not activate status.md.

## Decisions and constraints to retain

- `docs/specs` is read-only design input during planning and implementation. It contains no project tracking information.
- This file holds the proposed work structure and durable memory. Root status.md holds the active checklist and working notes.
- Specification coverage does not dictate roadmap completeness. No separate seed files or parallel backlog are maintained.
- Bootstrap implementation plans stay in the current Markdown workflow. Richer product records do not replace the bootstrap's memory convention during this experiment.
- Common viewing/refresh behavior runs without LLM calls. Native annotations remain the feedback mechanism; do not build a replacement transport.
- Preserve accepted intent and required designs. Use local behavioral checks and independent verification; CI is not required.

## Progress, findings, and evidence

The documentation was reorganized into three capability specs and this direct planning entry point. The previous separate proposal files have been retired from the bundle. W01 P1, P2, and P3 are integrated; P2 has locally verified browser-viewer evidence plus a verified native annotation/edit/reload loop in [PR #2](https://github.com/brandall10/sgm-plan-bootstrap/pull/2), and P3 is integrated through [PR #3](https://github.com/brandall10/sgm-plan-bootstrap/pull/3).

During work, add concise durable outcomes here with the actual plan, relevant code/PR revision, checks/evidence, material decisions, and unresolved limitations. Keep tactical attempts and the active phase checklist in status.md. Before resetting that working file, bring forward anything a fresh session needs to know. Evidence files support these entries rather than becoming another project memory or work queue.

Update the affected roadmap row and the recommended next work from actual results. Distinguish proposed, accepted, active, implemented, verified, awaiting review/merge, and integrated. Do not add these states to the specifications or repeatedly copy the whole phase checklist into this file.

## Open questions and future considerations

### Bootstrap documentation review — 2026-09-12

- Initialized the local repository on `main`. README and ignore conventions were committed separately from the three capability specifications and this roadmap. The checkout contains documentation only; no application, dependency manifest, or test setup exists yet. Only macOS `.DS_Store` files are ignored; `status.md` and `project_status.md` belong in version control.
- Reviewed README, this memory file, and all three specifications for technical guidance. A small TypeScript application with a local Node service is a suggested starting point, not a mandated stack. Framework, package manager, renderer, runtime versions, validation library, and watch transport remain W01 planning choices.
- Required architectural boundaries are a shared package core, local file/runtime service, web viewer, and optional host presentation adapter. The later context CLI must reuse the core's semantics. No source-directory layout or workspace/monorepo arrangement is prescribed; choose the smallest layout that preserves these boundaries.
- Existing document ownership is explicit: read-only `docs/specs/`, durable `project_status.md`, version-controlled active `status.md`, and Markdown implementation plans under `docs/plans/YYYY-MM-DD-XX-feature-name/plan.md` unless an established location supersedes it. Experimental product packages use `plan.json` with Markdown narrative fields; example field names are provisional.
- W01 must settle the supported package representation and completed-write convention. Debouncing alone is insufficient for multi-file coherence; retain the last valid model with diagnostics on incomplete edits. Stable IDs, declared reference roots, safe narrative rendering, symlink-aware file confinement, and isolated prototype scripts constrain implementation.
- Local launch requires one documented command. Common viewing and refresh require no LLM calls. Accounts, hosted deployment, a database, custom annotation transport, and an initial MCP interface are unnecessary. At bootstrap, native annotation compatibility still required an actual host probe and was unverified.
- Verification guidance calls for two distinct packages, coherent data/asset refresh, invalid-write recovery, preserved navigation, and measured local load/refresh behavior. Full acceptance/history, context execution, skill adapters, and SGM integration remain later proposed work. The documentation-only bootstrap had no implementation plan or product tests at review time; accepted W01 execution and its P1–P3 evidence are recorded below.

The actual host presentation mechanism, initial representation details, and useful performance baseline remain decisions for W01. Subsequent review/context design can change in response to those findings; record the decision here and propose a spec revision if intended behavior must change.

Broader SGM comprehension and change-analysis goals remain relevant, but this roadmap need not enumerate them now. Automatic learning, hierarchy, routing, MCP, and fresh-versus-continuing comparisons have no selected implementation work. Add a concrete work item here only when evidence and priorities justify it.

### W01 planning — 2026-09-12

- Drafted [W01 — Open and refresh a saved Plan Package](docs/plans/2026-09-12-01-package-viewer/plan.md) against documentation-only baseline `662800e`. The clean checkout contained no source, tests, active checklist, plans or execution results; no applicable AGENTS.md was found.
- Chose a single TypeScript/npm project with a Node runtime and React viewer, an inline-phase package core, and a final atomic `plan.json` manifest with digested local dependencies. Candidate-scoped immutable asset bytes prevent mixed content during refresh. Exact supported dependency versions will be locked during execution.
- The proposal covers three dependent PR-sized phases: core/fixtures/loading, viewer/native probe, and refresh/recovery/measurements. At planning time, native annotation remained unverified and might require a real user interaction; the follow-up evidence is recorded in the W01 P2 entry below.
- No implementation, dependency installation, product checks, or execution occurred. No root `status.md` or results record was created. W01 is now accepted and committed; `status-next` activation remains the next step. W02–W05 remain unchanged proposals.

### Planning correction — 2026-09-12

- The first W01 draft copied repository-baseline facts and handoff/commit instructions into the plan. The planner guidance requires an observed starting state, which explains the former baseline paragraph; its handoff rule only requires reporting uncommitted revisions, and the commit mechanics belong in project memory or `status-next`. Those process paragraphs were removed from the uncommitted plan. No accepted plan was mutated.

### W01 acceptance — 2026-09-12

- User acceptance promoted W01 from proposal to the active committed plan. The plan and project-status update were committed together; `status.md` is now activated, while implementation has not started.

### W01 P1 implementation — 2026-09-12

- Implemented the accepted P1 scope on branch `feat/package-viewer-phase-p1-core` in code revision `771070ecee3c6e1665bdf9a69ecadd18095aaa95`, based on `main`/accepted plan revision `ee7a0c339cc4b4265f738add0427e675484e3567`.
- Added the versioned inline `plan.json` contract, strict structural validation, stable ID and dependency checks, declared-root reference resolution, blocking-question diagnostics, SHA-256 publication helper, and candidate content IDs.
- Added a confined Node runtime and immutable candidate store serving captured model/file/asset bytes, plus two data-driven illustrative fixtures: the complete two-phase offline-recovery package and an independently worded one-phase save-outcome package. Added format, boundary, publication, launch, and troubleshooting guidance in the repository docs.
- Verification passed: `npm run typecheck`, `npm run lint`, `npm test` (3 files, 16 tests, including loopback HTTP endpoints), `npm run build`, and `git diff --cached --check`. Runtime tests required loopback permission in the managed sandbox but passed in the approved local run.
- Material boundary: P1 does not include the reusable viewer, live watching/recovery, browser checks, native presentation probe, or performance measurements; those remain P2/P3 obligations. The offline fixture's optional external reference is intentionally not fetched and is surfaced as a warning.
- Delivery state: implementation and local verification complete; [PR #1](https://github.com/brandall10/sgm-plan-bootstrap/pull/1) merged into `main` at `826a228423ae5b49b7b503b56295dfe4def3bdfd`. P1 is integrated; P2 delivery is recorded below.

### W01 P2 viewer and native-surface probe — 2026-09-13

- Implemented a data-driven React review surface over the existing immutable runtime model: overview and stable hash links, phase/criterion navigation, constraints, decisions/questions, generated dependency map, diagrams, artifact provenance, and explicit draft/diagnostic labels. The viewer never reparses package content.
- Added safe narrative rendering with raw HTML treated as text and only safe web/mail/fragment links activated. Selected HTML mocks now use a candidate-scoped route, restrictive CSP, opaque `allow-scripts` iframe sandbox, and declared dependency-only serving; browser checks show the mock can act within its frame but cannot read viewer DOM.
- Added Playwright browser checks for both fixtures, deep links/missing targets, diagnostics/blocking labels, unsafe narrative handling, artifact rendering, prototype isolation, and desktop/tablet/narrow hierarchy. Local typecheck, lint, unit/HTTP, browser, build, and whitespace checks passed; details are in [W01 results](docs/plans/2026-09-12-01-package-viewer/results.md#p2).
- The initial Codex presentation probe was inconclusive because it queued a browser-panel request without a human annotation. A follow-up actual in-app Browser annotation targeted `criterion.restore-choice`, reached the task with attribution fields, and drove an authoritative publish from revision 1/content `content-849285f380ec32ad523d7d41` to revision 2/content `content-1d8329ead56663b8b792cdcb`; [the recorded outcome](docs/native-surface-probe.md) is verified for this environment. No replacement feedback transport was built.
- Delivery state: implementation, browser/viewer verification, and the native annotation/edit/reload loop are complete in `9e3dc24d59ca5d5c4f38578031e02049323967e9` on `feat/package-viewer-phase-p2-viewer`; [PR #2](https://github.com/brandall10/sgm-plan-bootstrap/pull/2) merged into `main` at `fbddbeef1f3ca293c59366f217df61f97a8e9276`. P3 is now eligible but remains unstarted.

### W01 P3 live refresh, recovery, and measurements — 2026-09-13

- Added a scoped package watcher over `plan.json`, declared files, and required parent directories. Debounced filesystem activity drives serialized, generation-fenced candidate loads; valid publication refreshes watch targets for newly declared dependencies, while invalid or interrupted edits retain the last captured candidate.
- Added `/api/events` server-sent events for initial state, candidate publication, and candidate rejection. Runtime state keeps the retained package/revision alongside the latest diagnostics and attempt outcome. The viewer reports connected/reconnecting/offline state, refetches full state after reconnect, preserves surviving hash/scroll/details, and falls back with an explanation when a selected item disappears.
- Added unit/runtime/browser scenarios for atomic publication, invalid initial recovery, interrupted multi-file saves, asset consistency, new dependencies, overlapping load fencing, SSE events, selected-item deletion, runtime restart/reconnect, and the second fixture. Added `npm run measure` for five-run load/open/render/text-refresh/asset-refresh baselines and completed usage/troubleshooting documentation.
- Local verification passed: typecheck, lint, 25 unit/HTTP tests, 8 Playwright Chrome checks, build, benchmark, and whitespace validation. Measurements on an Apple M3 Max with Node `v26.7.0` and Chrome: warm load median `1.08 ms` (range `0.94–1.23`), runtime open median `2.19 ms` (`2.07–12.26`), browser render median `94.05 ms` (`93.72–333.30`), text refresh median `360.99 ms` (`75.67–903.25`), asset refresh median `406.28 ms` (`93.84–504.17`).
- Delivery state: implementation and verification are complete in `d34c1af836147047e54f5b7ab5f582f9d3796dfd`; [PR #3](https://github.com/brandall10/sgm-plan-bootstrap/pull/3) merged into `main` at `3e7b60daec2a5222c22deaf1cb5310b13fdcc27a`. W01 P3 is integrated.

### W02 planning — 2026-09-13

- Inspected clean local HEAD `2b78904`, README, W01 plan/status/results, the capability specifications, package core/resolver, publication/loading/store/runtime, viewer routing/header, and unit/HTTP/browser tests. Local Git history includes W01 P3 merge `3e7b60d`; no fresh remote delivery check was needed for this planning proposal. No applicable AGENTS.md was found.
- `CandidateStore` retains captured candidates only in memory. The loader binds exact manifest bytes and captured file digests to a shortened content ID; it already retains bytes suitable for durable capture. The viewer derives its accepted label directly from `plan.state`, and its refresh path always fetches the current candidate. No durable acceptance/history implementation was found in the inspected paths.
- The resolver currently rejects open blocking questions through the same error gate as material failures. W02 separates these meanings to support inspecting/accepting an approach while keeping unresolved obligations visibly blocked. Governing asset dependency retention must not depend solely on the optional `required` flags.
- Proposed a local content-addressed `.plan-package` store with full snapshot digests and separate attributed records, an explicit acceptance command rather than a viewer write API, and shared comparison semantics. Existing manifest labels will remain compatible author metadata but will not establish acceptance. No external service or dependency installation is needed for planning.
- Preserved W01's plan, results, and completed root checklist. Added W02 plan/checklist/results placeholder and linked them here. There is no unresolved product decision blocking P1; P3 requires a new actual human annotation and remains incomplete if it cannot be obtained. No implementation, product tests, or acceptance commit occurred during planning.

### W02 acceptance — 2026-09-13

- The user explicitly approved the reviewed plan and checklist. Re-read the complete planning set; no changes to the reviewed plan scope were present. The plan remains unchanged.
- Accepted and committed W02 as the active plan with the root checklist, reconciled companion checklist, and results record in one documentation acceptance set. All 11 tasks remain unchecked; implementation has not started. W01 results and accepted plan are preserved.
- Next action: `status-next` when execution is requested. Approval of this plan did not execute a phase.

### W02 P1 implementation — 2026-09-13

- Implemented durable snapshot and acceptance contracts in code revision `7a1dd15de47920ddd811296e88b14508d8c4463b`, based on accepted plan/current `main` `2411338f9f288fc31be67f9eb63d57ff21567220`.
- The runtime now persists exact manifest bytes and resolved package/repository/selected-asset dependency bytes in an atomic, content-addressed `.plan-package` store before publishing a candidate. Descriptors and blobs are integrity-checked on reopen; optional omissions remain explicit; corrupt or failed writes do not replace the prior candidate.
- Added explicit acceptance records and `npm run accept -- ...` with required snapshot/provenance/instruction inputs, idempotent retries, conflict rejection, read-only runtime history, and unverified legacy manifest-state handling. Blocking questions remain visible planning blockers rather than integrity rejection.
- Verification passed: `npm run typecheck`, `npm run lint`, `npm test` (36 tests), `npm run test:e2e` (8 Chrome checks), `npm run build`, and `git diff --check`.
- Delivery state: implementation and local verification complete; scoped PR not yet opened; remote merge and local integration remain pending. Next action: push the branch and open the W02 P1 PR.
