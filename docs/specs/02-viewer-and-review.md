# Viewer and review

This specification defines a repeatable web application for inspecting and refining the [Plan Package](01-plan-package.md). It contains product requirements, not development progress or a delivery sequence.

## Experience

Opening an existing plan requires no LLM call. The application reads saved data and supplies navigation, diagrams, criteria, designs, revision information, and any execution evidence the implemented format supports.

The same application serves draft review, accepted-plan inspection, and execution inspection. These views may emphasize different information while retaining common identity and navigation. The interface must make the selected proposal or accepted snapshot clear.

An agent creates and changes plan content through investigation and conversation. The viewer handles common presentation through reusable components. Custom diagrams and prototypes remain possible without requiring the agent to rebuild the surrounding review interface for each plan.

## Main views

| View | Essential content and interaction |
| --- | --- |
| Overview | Goal, scope, phase map, important shared obligations, and blocking questions; links into details |
| Phase | Outcome, approach, prerequisites, criteria, applicable decisions, required designs, and relevant results |
| Designs and decisions | Selected assets with authority and purpose; optional rationale and alternatives |
| Accepted proposal | Exact accepted content and selected asset versions, visibly distinguished from a newer draft |
| Execution | Available phase results, findings, verification, and integration facts associated with their plan/code revisions |

Essential constraints must not disappear behind optional disclosure. Longer rationale and historical alternatives can remain available on demand. The viewer should keep enough overall context visible that selecting one phase does not obscure the plan's destination.

Draft, accepted, implemented, verified, and integrated are distinct facts. Text labels must communicate those distinctions even without color. Absence of evidence must not appear as success.

## Reusable components

Components need defined behavior and data inputs, not just CSS class names.

| Component | Data and behavior |
| --- | --- |
| Plan header | Plan identity, displayed revision/snapshot, selected view, and any stale/invalid-update indication |
| Phase navigator | Stable phase IDs, titles, dependencies, and available state; selection survives valid updates |
| Criterion list | Exact criterion wording, source IDs, applicability, and separately linked evidence when available |
| Decision/question panel | Statement, rationale, scope, and unresolved blocking effect |
| Relationship diagram | Structured nodes/edges or a linked explanatory artifact; selecting a meaningful element reaches its related item |
| Artifact frame | Purpose, authority, source revision, mock/evidence label, and accessible asset content |
| Finding/result panel | Affected obligations, observed outcome, inspected code revision, evidence, and unresolved limitations |
| Revision summary | Material changes in content or selected assets without replacing access to either revision |

Use a small consistent design system for typography, spacing, navigation, disclosure, and evidence labels. Reuse the visual planning skills' conventions where suitable. The viewer shell should not inherit arbitrary styling from each embedded prototype.

Support keyboard navigation, visible focus, readable wrapping of IDs and paths, and sensible narrow-screen stacking. Preserve the visual hierarchy at desktop and tablet sizes. Polishing many alternate themes is outside the required behavior.

## Application boundaries

| Part | Responsibility |
| --- | --- |
| Shared package core | Parse, validate, resolve identities/references, and expose a consistent package model |
| Local runtime | Load allowed files, observe completed edits, serve assets, and notify clients |
| Web viewer | Render the model and maintain navigation/presentation state |
| Host presentation adapter | Present the same content through a supported native review surface when one is available |
| Authoring agent and skills | Interpret feedback and revise authoritative package content |

The package core also supports the [context selector](03-execution-and-integration.md#context-selection). The browser and CLI must not separately redefine what a phase, criterion, required reference, or accepted snapshot means.

A small TypeScript application with a local Node service is a reasonable greenfield starting point. Existing project technology may be reused. Framework, renderer library, and watch transport are implementation choices; this specification does not depend on a particular library version.

The application must operate locally with one documented launch command. Hosted deployment, accounts, collaborative editing, and a database are unnecessary for the experiment. Bind local services appropriately; broader remote access requires an explicit supported configuration.

## Coherent file updates

The watcher has one responsibility: notify the viewer that a complete package update can be loaded. It does not receive annotations, prompt an agent, or manage agent sessions.

A debounce alone cannot guarantee a consistent multi-file edit. The implementation needs a completed-write convention. A single-file package can use atomic replacement. A package with referenced files can publish a final manifest that identifies the complete intended content, including relevant asset digests or immutable versioned paths.

The reader must reject a candidate whose files do not match that manifest, or whose manifest changes while it is being resolved. Only a complete valid candidate replaces the displayed model. Equivalent mechanisms are acceptable if they demonstrate the same behavior without introducing a general transaction platform.

| Update case | User-visible result |
| --- | --- |
| Valid content or referenced asset change | Refresh affected content and show the new displayed revision |
| Partial write or temporarily missing file | Retain the last valid view and explain that the current edit is incomplete |
| Persistently invalid candidate | Keep actionable diagnostics visible; never disguise the old view as the new revision |
| Selected item survives | Preserve selected phase, scroll anchor, and expanded details where possible |
| Selected item is removed | Navigate to a sensible surviving parent and explain the removed target |
| Accepted snapshot is selected | Continue displaying its pinned content when the working draft changes |

Observe declared package files and required local dependencies rather than scanning every unrelated repository file. Disconnection from the local runtime should be visible and recover without losing the selected view.

## Native annotation loop

Native Codex annotations and ordinary conversation supply feedback. The authoring agent updates package content, and the ordinary file update path refreshes the viewer. There must be no custom feedback server, chat pane, polling hook, or agent session registry added merely to reproduce host functionality.

Host compatibility must be demonstrated in the actual environment. An arbitrary localhost URL, iframe, or custom `data-review-id` attribute is not evidence of native annotation support. A minimal compatibility probe must establish how the surface is presented, whether an annotation reaches the agent, and what information its actual payload contains.

Visible item labels and the displayed revision support attribution even when machine IDs are absent from that payload. Region/text feedback can be mapped to an item only when the correspondence is clear. An older annotation must not silently attach to a different item after a revision.

For a feedback batch, the agent should:

1. Read the whole batch and identify affected questions, requirements, designs, or implementation defects.
2. Apply clear compatible changes to their authoritative content, preserving surviving IDs.
3. Resolve conflicts or stale targets only where needed, while completing independent work.
4. Refresh the saved proposal and account for addressed, answered, deferred, or unresolved feedback.

Consequential decisions belong in resolved package content. Full annotation transcripts and every rejected draft need not become permanent plan dependencies.

If native presentation is unavailable, the browser viewer remains useful. A supported adapter or static projection may reuse the same renderer, but it must disclose limitations such as manual refresh. Text-driven edits can exercise the content loop; they cannot be reported as a successful native annotation trial. Do not invent host messaging or acceptance controls.

## Acceptance and comparison

Review for acceptance opens the saved package and selected assets. The user must be able to see which revision is under review, its unresolved questions, and what a selected prototype governs.

Acceptance is recorded only through an actual instruction or supported action that identifies the reviewed proposal. A local mock button must not imply that an instruction was sent or that acceptance was persisted. Existing authorization may already cover acceptance and activation together.

After acceptance, reopening selects the preserved snapshot. A newer draft remains separately identifiable. Material changes to criteria, decisions, dependencies, or authoritative asset bytes should be inspectable in a compact summary with links to the changed items. A general-purpose semantic merge engine or pixel diff is unnecessary.

An update to viewer-only presentation need not revise a plan. An edit to a selected authoritative prototype can change the design and therefore the proposal snapshot. This follows the [package's visual and revision rules](01-plan-package.md#revisions-and-acceptance).

## Assets and isolation

Serve only files within declared package and repository roots, including resolution of symlinks. Package paths must not allow arbitrary host-file access. Render narrative content safely and keep prototype scripts isolated from privileged viewer controls and APIs.

Interactive prototypes may need scripts to run their demonstrations. Their runtime capabilities should be explicitly bounded. Keep harness controls, simulated data, and real product controls visually distinguishable. Relative assets must remain available when reopening a preserved snapshot.

Required visuals must be inspectable in both human review and the agent handoff. Unsupported formats or unavailable assets should produce a clear limitation rather than an empty frame presented as a valid design.

## Observable correctness

Verification should exercise the behavior central to the application:

| Scenario | What must be demonstrated |
| --- | --- |
| Open two different packages | Rendering depends on package data rather than the sample's hard-coded content |
| Navigate phases and criteria | Correct content, stable links, and applicable designs are displayed |
| Change data and an asset | The candidate becomes visible coherently with the correct revision |
| Interrupt a multi-file save | No mixed proposal is published; the last valid view and diagnostics remain usable |
| Recover from an invalid edit | The corrected proposal appears without resetting surviving navigation |
| Annotate a meaningful item | Actual host feedback reaches the agent and its resolution appears in saved content |
| Reopen an accepted plan after later edits | The original governed asset bytes and requirements remain available |
| Inspect execution evidence | Actual observations and their revisions remain distinguishable from design mockups |

These are verification requirements, not records of completed checks. The project's memory files record what was actually observed.

## Performance and proportionality

An already-written package should open and refresh within a few seconds on the development machine. Record actual measurements and environment before treating a numeric target as a reliable service objective.

Separate dependency installation and server launch from warm loading, parsing, rendering, and asset refresh. Separate all of those from LLM investigation, content authoring, and verification time. A fast renderer does not establish fast planning overall.

Use representative package content and ordinary repeated measurements. A benchmark service, continuous telemetry system, or repeated cosmetic review loops are unnecessary unless a concrete performance or usability problem requires them.
