# SGM Plan Package experiment — project status

**Updated:** 2026-09-12
**Current state:** Capability specifications and planning handoff prepared; no product implementation verified in this bundle.
**Recommended next work:** W01 — open and refresh a representative Plan Package.
**Active implementation plan:** None established here. Preserve any active work found in the target repository.

## Goal and observed baseline

Make saved plans dependable to view and refine, then test whether focused context and retained results improve the authoring-to-execution handoff. A normal local web application renders packages without asking an LLM to reconstruct the interface.

The inspected source bundles contain SGM specifications, an illustrative offline-recovery plan, and visual authoring conventions. They contain no working shared Plan Package renderer/context resolver. This documentation handoff establishes no completed native annotation, acceptance, execution, or productivity experiment. Inspect current code before adopting this baseline in a different checkout.

## Planning structure

This file is the sole source of truth for proposed work, actual plan links, priorities, and durable project memory. The following is our current suggested structure, not a comprehensive coverage map of the specifications. Unlisted capabilities create no implicit work. Revise this table as evidence changes; detailed phase design belongs in the selected implementation plan.

| ID | Proposed plan outcome | Scope and prerequisites | Specification references | State / actual plan |
| --- | --- | --- | --- | --- |
| W01 | Open and refresh a saved package | Representative sample, minimal package core, reusable viewer, coherent watcher; inspect current repository and probe native presentation | [Minimum content](docs/specs/01-plan-package.md#minimum-content), [phase meaning](docs/specs/01-plan-package.md#phase-meaning-and-dependencies), [example](docs/specs/01-plan-package.md#representative-example); [components](docs/specs/02-viewer-and-review.md#reusable-components), [application boundaries](docs/specs/02-viewer-and-review.md#application-boundaries), [updates](docs/specs/02-viewer-and-review.md#coherent-file-updates), [native loop](docs/specs/02-viewer-and-review.md#native-annotation-loop) | Recommended for planning; no plan yet |
| W02 | Refine, accept, and reopen the same proposal | Native feedback plus preserved reviewed assets and clear draft/accepted views; requires a usable viewer and actual host-surface findings | [Visual meaning](docs/specs/01-plan-package.md#visual-meaning), [revisions and acceptance](docs/specs/01-plan-package.md#revisions-and-acceptance); [native loop](docs/specs/02-viewer-and-review.md#native-annotation-loop), [comparison](docs/specs/02-viewer-and-review.md#acceptance-and-comparison) | Proposed; no plan yet |
| W03 | Retrieve phase context and predecessor results | Shared selector/CLI and demonstrable result handling in the product; requires package/revision semantics, not an SGM graph | [Context selection](docs/specs/03-execution-and-integration.md#context-selection), [operations](docs/specs/03-execution-and-integration.md#operations), [readiness](docs/specs/03-execution-and-integration.md#readiness-and-revisions), [product results](docs/specs/03-execution-and-integration.md#durable-results-in-the-product) | Proposed; no plan yet |
| W04 | Use the workflow on a real change | Thin adapters and a two-phase change in a separate trial project, including a fresh-session handoff; requires usable package/viewer/context capabilities | [Skill integration](docs/specs/03-execution-and-integration.md#planning-skill-integration), [verification](docs/specs/03-execution-and-integration.md#verification-and-completion), [correctness and usefulness](docs/specs/03-execution-and-integration.md#observable-correctness-and-usefulness); [performance](docs/specs/02-viewer-and-review.md#performance-and-proportionality) | Proposed; no plan yet |
| W05 | Connect the useful package to SGM | One real boundary/contract reference and necessary alignment with broader SGM design; scope depends on trial findings | [Authority](docs/specs/01-plan-package.md#authority-and-content-ownership), [references](docs/specs/01-plan-package.md#references-and-identity), [SGM integration](docs/specs/03-execution-and-integration.md#sgm-integration) | Conditional; no plan yet |

Rows are candidate plans, not implementation phases. They may be combined, split, reordered, replaced, or retired here. Capability dependencies matter; numbering does not impose a scheduler or automatically authorize every later row.

## Selected planning brief — W01

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

The documentation was reorganized into three capability specs and this direct planning entry point. The previous separate proposal files have been retired from the bundle. No implementation plan, product acceptance, behavioral verification, or merged PR is recorded yet.

During work, add concise durable outcomes here with the actual plan, relevant code/PR revision, checks/evidence, material decisions, and unresolved limitations. Keep tactical attempts and the active phase checklist in status.md. Before resetting that working file, bring forward anything a fresh session needs to know. Evidence files support these entries rather than becoming another project memory or work queue.

Update the affected roadmap row and the recommended next work from actual results. Distinguish proposed, accepted, active, implemented, verified, awaiting review/merge, and integrated. Do not add these states to the specifications or repeatedly copy the whole phase checklist into this file.

## Open questions and future considerations

### Bootstrap documentation review — 2026-09-12

- Initialized the local repository on `main`. README and ignore conventions were committed separately from the three capability specifications and this roadmap. The checkout contains documentation only; no application, dependency manifest, or test setup exists yet. Root `status.md` and macOS `.DS_Store` files are ignored.
- Reviewed README, this memory file, and all three specifications for technical guidance. A small TypeScript application with a local Node service is a suggested starting point, not a mandated stack. Framework, package manager, renderer, runtime versions, validation library, and watch transport remain W01 planning choices.
- Required architectural boundaries are a shared package core, local file/runtime service, web viewer, and optional host presentation adapter. The later context CLI must reuse the core's semantics. No source-directory layout or workspace/monorepo arrangement is prescribed; choose the smallest layout that preserves these boundaries.
- Existing document ownership is explicit: read-only `docs/specs/`, durable `project_status.md`, ignored active `status.md`, and Markdown implementation plans under `docs/plans/YYYY-MM-DD-XX-feature-name/plan.md` unless an established location supersedes it. Experimental product packages use `plan.json` with Markdown narrative fields; example field names are provisional.
- W01 must settle the supported package representation and completed-write convention. Debouncing alone is insufficient for multi-file coherence; retain the last valid model with diagnostics on incomplete edits. Stable IDs, declared reference roots, safe narrative rendering, symlink-aware file confinement, and isolated prototype scripts constrain implementation.
- Local launch requires one documented command. Common viewing and refresh require no LLM calls. Accounts, hosted deployment, a database, custom annotation transport, and an initial MCP interface are unnecessary. Native annotation compatibility requires an actual host probe and remains unverified.
- Verification guidance calls for two distinct packages, coherent data/asset refresh, invalid-write recovery, preserved navigation, and measured local load/refresh behavior. Full acceptance/history, context execution, skill adapters, and SGM integration remain later proposed work. No implementation plan was created or activated by this review, and no product tests were run.

The actual host presentation mechanism, initial representation details, and useful performance baseline remain decisions for W01. Subsequent review/context design can change in response to those findings; record the decision here and propose a spec revision if intended behavior must change.

Broader SGM comprehension and change-analysis goals remain relevant, but this roadmap need not enumerate them now. Automatic learning, hierarchy, routing, MCP, and fresh-versus-continuing comparisons have no selected implementation work. Add a concrete work item here only when evidence and priorities justify it.
