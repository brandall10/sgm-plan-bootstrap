# Plan Package

This specification defines the content a saved plan must preserve and the meaning shared by its human and agent views. It describes the system being built. The experiment's own planning and memory conventions are defined in the [README](../../README.md).

## Purpose

A Plan Package represents one proposed change: its goal, boundaries, approach, phases, criteria, decisions, and selected visual designs. A person can inspect it in a repeatable viewer, while an implementation agent can retrieve the portion relevant to its current activity. Both views resolve the same saved content.

A plan roughly corresponds to an epic. Its phases are independently reviewable, PR-sized delivery units with explicit outcomes and dependencies. A small plan may have one phase; a substantial plan often has several. Neither the format nor the viewer imposes a phase count.

The package must work with ordinary repository documents before an SGM graph exists. When SGM is available, a package can reference affected system responsibilities and contracts, and declare proposed changes to them.

## Authority and content ownership

| Information | Meaning |
| --- | --- |
| Accepted system specifications or SGM model | Intended behavior, responsibilities, architectural boundaries, and contracts |
| Plan proposal | A scoped change, implementation approach, phase obligations, and selected designs |
| Acceptance record | A person's actual acceptance of an identified saved proposal |
| Execution and verification records | Observations about particular work and code revisions |
| Working notes or procedural guidance | Useful operational context that cannot silently alter accepted obligations |

These distinctions concern the product's data model. They do not require the bootstrap project to maintain separate memory files beyond `project_status.md` and `status.md`.

When a plan changes an existing contract, it must identify the intended change. A plan cannot silently replace the existing contract merely by restating it differently. Where one user instruction accepts both a plan and its proposed specification change, the system may preserve that as one coherent decision.

The viewer is a projection. Generated Markdown, diagrams, and context responses must not become independently editable copies of accepted intent.

## Minimum content

The minimum package is a `plan.json` file. Additional files exist when the content needs them; empty directories and placeholder records are unnecessary.

| Content | Required meaning |
| --- | --- |
| Identity | Stable plan ID, format version, human title, and distinguishable content revision |
| Goal and scope | Intended outcome, included work, and explicit exclusions |
| Constraints | Shared obligations that apply across the change |
| Phases | Stable identities, outcomes, dependencies, approach, and observable acceptance criteria |
| References | Explicit links to supporting specifications, contracts, assets, or predecessor outputs when needed |
| Decisions and questions | Resolved consequential choices, and unresolved questions with their scope and blocking effect when present |
| Assets | Selected visuals and other retained artifacts, including their purpose and authority when present |

Narrative fields contain Markdown. JSON makes content addressable and relationships explicit; it need not encode every paragraph as a document tree. A logical item does not need its own file.

An implementation may begin with inline phases or separately referenced phases. It must document and validate the representation it supports. Supporting both arrangements, extensions, or legacy conversions is not a prerequisite for a useful reader.

This small example illustrates an inline representation; field spelling is provisional, and it is not an accepted or implemented plan:

```json
{
  "format": "plan-package",
  "format_version": "0.1-draft",
  "id": "plan-save-outcome",
  "revision": 1,
  "title": "Expose the save outcome",
  "goal_md": "Tell the caller whether completed exercise progress was persisted.",
  "scope": {
    "included": ["An explicit persistence result"],
    "excluded": ["Cloud sync", "Recovery screen design"]
  },
  "constraints": [
    {
      "id": "constraint-honest-save",
      "text_md": "Report saved only after persistence succeeds."
    }
  ],
  "phases": [
    {
      "id": "phase-save-result",
      "title": "Return and consume the save outcome",
      "depends_on": [],
      "objective_md": "Callers can distinguish saved and unsaved completion.",
      "approach_md": "Keep persistence behind the session service and return its explicit outcome.",
      "acceptance_criteria": [
        {
          "id": "criterion-failed-save",
          "text_md": "A failed write reports unsaved and preserves the previous valid snapshot."
        }
      ]
    }
  ]
}
```

The format should not require a full machine schema for every optional future record. A small runtime validator or schema sufficient for implemented semantics is appropriate. Required semantics that a consumer cannot interpret must be reported explicitly.

## Phase meaning and dependencies

Each phase needs enough engineering substance to support implementation: responsibilities, important data or state flow, relevant edge cases, prerequisites, and an observable result. Exhaustive filenames and pseudocode are optional authoring choices.

Acceptance criteria reach the executor before implementation. Detailed fixtures, verification procedures, and review instructions may be retrieved later. A phase must not discover a governing requirement only after it believes the work is finished.

Dependencies describe necessary results, not merely numerical order. A later UI phase may require an error result from an earlier API phase. That consumer constraint belongs in the earlier phase's applicable obligations, even though the UI narrative is excluded from its default context.

A prerequisite's proposed design and its actual delivered interface are different information. The product's execution records make that distinction available to subsequent phases. Missing or incompatible results must remain visible.

Open questions identify the phases or decisions they block. Minor choices may be explicitly delegated. Acceptance of a broader approach does not make a phase executable while its blocking question remains unresolved.

## References and identity

IDs remain stable when a title, order, or file location changes. Distinct IDs are needed for content that the viewer or context selector must address independently, including phases, criteria, decisions, and referenced assets.

Package-relative paths and repository-relative paths must be distinguishable. The reader must resolve references from their declared root, rather than from whichever directory the process happens to use. External references must state what they provide and whether access is required.

Required design assets and specification material that govern an accepted proposal need resolvable, revision-specific content. A mutable path or temporary preview URL alone cannot preserve the accepted meaning. Supporting source code references may identify repository commits and locations without copying a whole repository into the package.

Reference declarations should explain applicability and purpose. They need not become a new graph vocabulary. SGM entity IDs can be reused where suitable; ordinary document references remain supported.

## Visual meaning

| Visual | Relationship to plan meaning |
| --- | --- |
| Phase order and dependency maps | Generated from the package's structured relationships |
| Explanatory architecture or behavior diagrams | Refer to the obligations and decisions they explain |
| Selected prototypes | Govern explicitly delegated design details, such as layout, action placement, or interaction behavior |
| Rejected alternatives | Retained only when useful as rationale; excluded from default execution context |
| Implementation screenshots or recordings | Evidence of the actual implementation, identified separately from the proposed design |

Behavior must survive visual review as explicit plan meaning. If a diagram says persistence precedes a saved notification, that ordering needs a corresponding obligation; it must not exist only as an arrow in a picture.

A selected prototype includes the local dependencies needed to reproduce it. Its mock behavior and platform approximations must be visible. An executable mock demonstrates the prototype's behavior, not integration with the real application.

Contradictions between explicit criteria and selected designs must be resolved. A visual asset cannot silently amend a criterion, and an executor cannot silently discard an accepted design because reading its text is easier.

## Revisions and acceptance

A displayed revision identifies the complete proposal being viewed. A human-readable counter is useful, but a counter alone does not preserve its bytes. The implementation must choose a resolvable snapshot mechanism, such as a Git revision with an explicit included-file set or a local content-addressed snapshot.

The proposal snapshot includes plan content, governing selected assets, and their necessary dependencies. Acceptance records the actual instruction or action, the accepted snapshot, and its attribution. The system must never invent acceptance from a generated button state, a successful validator run, or a resolved comment.

Acceptance records are separate from the content they identify, avoiding a self-referential snapshot. Adding execution evidence does not mutate an accepted proposal. A subsequent edit to scope, criteria, decisions, or an authoritative design produces a new proposal; the accepted version remains reopenable.

Changing the viewer's presentation chrome can leave proposal content untouched. Changing a selected prototype's layout can change the accepted design even when no plan sentence changes. The snapshot mechanism must account for the latter's asset bytes.

Acceptance and activation are distinguishable. Existing user authorization may cover both, so the implementation should not impose redundant confirmation. Stored plan metadata does not confer permissions that the execution environment or user has not granted.

## Validation and failure behavior

| Condition | Required behavior |
| --- | --- |
| Malformed JSON, duplicate IDs, invalid phase dependency, or unsupported required semantics | Report actionable diagnostics; do not claim a valid package |
| Missing required file or reference | Identify the affected item and unavailable material |
| Dependency cycle | Identify the participating phases or edges |
| Unresolved blocking question | Preserve it visibly and prevent a ready claim for affected work |
| Incomplete multi-file edit | Do not publish a mixed proposal as the current valid revision |
| Missing or changed accepted asset bytes | Report snapshot integrity/access failure rather than substituting current draft content |
| Structural checks pass | Claim only structural validity, not acceptance, implementation, or successful verification |

The viewer may show an incomplete draft with diagnostics. Acceptance, executable context, and ordinary draft viewing have different readiness needs. Those distinctions must be explicit rather than hidden behind one boolean named `valid`.

## Representative example

The representative package concerns offline exercise recovery. One phase persists completed exercises and exposes restore, discard, and save outcomes. A second phase supplies the recovery experience. The package includes a dependency diagram, criteria, an explanatory behavior diagram, a selected recovery prototype, and a nonblocking wording choice.

The example exercises several meaningful obligations: saved is shown only after persistence succeeds; failed writes preserve prior valid progress; invalid snapshots produce an explicit unavailable result; and starting over does not allow an older queued save to resurrect discarded progress. The first phase must receive the result distinctions needed by the second.

An annotation changing what Start over does may affect both the UI and persistence ordering. The revised package should make that relationship inspectable. Demonstration acceptance or verification records must be labeled as examples; they are never evidence that the user's project was accepted or tested.

## Boundary with other capabilities

The [viewer specification](02-viewer-and-review.md) defines how this content is presented and updated. The [execution specification](03-execution-and-integration.md) defines context selection, observations, and integrations. They share the package's identity, references, obligations, and revision semantics.

Exact file layouts, field names, and snapshot mechanics may be chosen while planning implementation. These choices must preserve the behaviors above. Changes to the intended behavior require an explicit design decision; implementation work does not silently rewrite this specification.
