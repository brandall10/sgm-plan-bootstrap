# SGM Plan Package experiment

Build a repeatable local viewer for saved plans, then test native review and focused execution. The design is described in three capability specifications. **project_status.md is the single source of truth for the proposed work structure and durable project memory.**

## Start development

1. Read [project_status.md](project_status.md) for the actual state, recommended outcome, and relevant specification sections.
2. Use the existing planning skill to develop only the selected work item, after inspecting current code and applicable instructions.
3. Review that implementation plan. Once accepted and authorized, use `status-next` to execute its PR-sized phases.
4. Keep active working notes in `status.md` and durable progress, decisions, and evidence links in `project_status.md`.

The proposed work structure can be partial. A specification does not need a corresponding roadmap item, and adding a specification does not create a commitment to implement it. Work items can be split, combined, reordered, replaced, or retired directly in project_status.md as understanding changes.

## Read the design

| Specification | Subject |
| --- | --- |
| [01 — Plan Package](docs/specs/01-plan-package.md) | Content, phase semantics, identity, references, visual authority, revisions, and acceptance |
| [02 — Viewer and review](docs/specs/02-viewer-and-review.md) | Reusable components, local runtime, coherent refresh, native annotations, and accepted-plan inspection |
| [03 — Execution context and integration](docs/specs/03-execution-and-integration.md) | Context selection, handoffs, verification, skill adapters, and SGM relationships |

Read them in that order for the complete design. During focused work, follow the sections linked from project_status.md and expand only when a real dependency requires it. The documents describe capabilities rather than delivery phases.

## Read-only specifications and memory

| File or artifact | Responsibility while building this experiment |
| --- | --- |
| `docs/specs/` | Read-only design inputs: intended behavior, constraints, examples, and verification expectations |
| `project_status.md` | Durable memory: current priorities, proposed plan structure, actual plan links, material decisions, progress, blockers, and evidence links |
| Root `status.md` | Active working memory: source plan pointer, phase checklist, current findings, attempts, and next actions |
| Accepted implementation plan | Detailed approach and instructions for the selected scope |
| Code, test output, screenshots, and other evidence | Supporting artifacts linked from the memory files; they do not create another work queue |

Do not write completion marks, run results, implementation notes, roadmap IDs, or tracking tables into the specifications. If implementation reveals a conflict or design question, record it in the memory files. Preserve the specified intent while resolving ordinary implementation choices; propose an explicit design revision if the intent needs to change. Editing a spec requires an explicitly authorized design change, not an automatic end-of-phase update.

The specs describe richer plan/execution records that the product may eventually maintain. Those future structures do not replace these two memory files during this experiment.

Root status.md and project_status.md belong in version control and must not be ignored. Before resetting it, move consequential findings, progress, decisions, and evidence links into project_status.md. Root status.md is the one active execution checklist; plan directories contain plan.md and, when needed, results.md, but must not contain another status.md. Keep plans and specs free of duplicate progress checklists. Do not create status.md merely because a work item was selected for planning; treat any plan-local status.md as a stale duplicate to reconcile and remove.

## Planning and execution conventions

The plans that build the experiment stay compatible with the current Markdown workflow. The representative package being viewed uses the experimental JSON format. Exercise new execution tooling in a separately selected product trial. The bootstrap retains its current Markdown plans and two memory files throughout this experiment; it does not require the new tooling to build itself.

Use the repository's established plan location; otherwise use `docs/plans/YYYY-MM-DD-XX-feature-name/plan.md`. A plan is roughly an epic with PR-sized phases, often 3–6 when warranted; smaller work may need fewer. Phase boundaries come from the implementation plan and need not match specification boundaries or roadmap rows.

A selected roadmap item already chooses the subject. The planner may refine its scope from code and evidence without manufacturing another candidate-selection exercise. Linked spec sections provide design requirements, not an obligation to implement every described capability in that plan.

Existing user authorization may cover acceptance and execution together. Preserve it through routine choices, local validation, and repairs. Use the existing independent verification and phase-per-PR workflow where repository access permits. Record actual implementation, verification, PR, and merge facts separately; CI is not a prerequisite.

Suggested first instruction to the planning agent:

> Read README.md and project_status.md. Use my existing planning skill to develop W01, following its linked spec sections and inspecting the current repository. Keep docs/specs read-only. Produce one Markdown implementation plan compatible with status-next, including the representative package, reusable web viewer, coherent file watching, native-surface probe, and local behavioral checks. Resolve ordinary engineering choices yourself. Record the proposed plan link and any material planning findings in project_status.md. Do not expand future work items or begin implementation in this planning invocation.

## Adopting this bundle

Unpack into a separate folder first. In an existing repository, merge the new roadmap and memory conventions into project_status.md and applicable project instructions while preserving actual progress and active work. Move any unique rationale from earlier work proposals into the relevant specs or memory entry before retiring those obsolete proposal files. Do not retain a parallel backlog of those proposals.

This bundle updates the Plan Package experiment; it is not a replacement for the whole SGM specification. Existing SGM materials remain useful context for system ownership and integration. The source design drew on SGM draft 0.11, the offline-recovery Plan Package example, and the shared planning/annotation conventions in codex-viz-planning-skills.zip. The three specifications here are sufficient to start the experiment without reading that entire archive.

Use the actual installed planner/status-next/verification skills and their invocation syntax. This documentation revision does not install or modify those skills, activate an implementation plan, or establish that product behavior has been built or tested.

## W01 implementation

P1 establishes the executable package representation and confined local runtime;
P2 adds the reusable review surface. Read [the package format guide](docs/package-format.md)
for the exact fields, publication procedure, launch command, viewer behavior,
and diagnostic handling. [The architecture note](docs/architecture.md) records
the core/server/viewer boundaries, and [the native-surface probe](docs/native-surface-probe.md)
records the actual host-review result.

After installing the locked dependencies, launch an illustrative package with:

```sh
npm install
npm run dev -- --package examples/offline-recovery
```

The second fixture can be loaded with `--package examples/save-outcome`. The
fixtures describe proposals only; their mock controls and diagrams are not
evidence of a working exercise product. After changing a declared package
file, republish its manifest atomically with `npm run publish -- --package
<package-directory>`.

The runtime creates an ignored `.plan-package/` directory beside the selected
package. It stores immutable snapshot descriptors and bytes before a candidate
is displayed. Use the explicit `npm run accept -- ...` command documented in
[the package format guide](docs/package-format.md#durable-snapshots-and-acceptance)
to record authorized acceptance provenance for a concrete snapshot.

Run the local verification suite with `npm run typecheck`, `npm run lint`,
`npm test`, `npm run test:e2e`, and `npm run build`. Use `npm run measure` for
the five-run local load/render/refresh baseline. The browser checks use the
locally installed Google Chrome channel; they do not establish native Codex
annotation support.

The development runtime watches the selected package's manifest, declared files,
and the parent directories needed for atomic replacement. Edit the package files,
then run the publication helper to produce a complete manifest. The viewer
automatically displays a newly published candidate; an interrupted or invalid
edit leaves the last valid revision visible with diagnostics. Its live-refresh
label shows whether the local event stream is connected, reconnecting, or offline.
See [the package format guide](docs/package-format.md#refresh-troubleshooting) if
the viewer retains an earlier revision.
