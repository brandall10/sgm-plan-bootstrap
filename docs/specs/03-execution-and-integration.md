# Execution context and integration

This specification defines how the product supplies focused plan context, retains execution observations, and connects visual planning with SGM. These are capabilities to build. The bootstrap itself continues to use `project_status.md` as durable memory and `status.md` as active working memory, as described in the [README](../../README.md).

## Purpose

A rich plan should be sufficiently detailed for human review without requiring every executor to read every phase and artifact. The context selector provides the current activity's governing material and exposes further context deliberately.

JSON makes material addressable; selection produces the reduction in context. A shorter response is useful only if it preserves the obligations necessary to do the work correctly.

The same mechanism should support a continuing executor, a fresh session, and an independent verifier. It does not require a scheduler, manager agent, graph database, or model-specific routing layer.

## Context selection

| Material | Implementation activity | Verification activity |
| --- | --- | --- |
| Plan identity, accepted snapshot, goal, scope, brief phase map | Included | Included |
| Shared and applicable constraints and acceptance criteria | Exact governing wording included | Same obligations included |
| Current phase approach, tasks, decisions, and edge cases | Included | Available where relevant to checking the result |
| Required designs and references | Accessible and inspected when required | Accessible for comparison with implementation |
| Prerequisite outputs and unresolved findings | Relevant actual interfaces/results included | Relevant setup and limitations included |
| Detailed checks, fixtures, and evidence requirements | Included when they constrain implementation; otherwise expandable | Included |
| Other phase narratives, rejected alternatives, annotation history | Expandable when relevant | Expandable when relevant |
| Producer's claimed results | Identified as prior observations when useful | Clearly identified as claims requiring assessment |

Selection begins with the requested phase and activity, then follows declared applicability, dependencies, required references, and consumer obligations. It should include the relevant output of a prerequisite without recursively dumping every predecessor's full plan.

For example, persistence implementation must receive the UI's required save-result distinctions. It can receive those obligations without the UI layout discussion. Conversely, the UI phase needs the interface actually delivered and any unresolved discrepancy, rather than assuming the original persistence proposal was implemented exactly.

Preserve authoritative wording rather than generating a lossy paraphrase of acceptance criteria. Optional explanation may be shortened or deferred. If required material exceeds a requested size, return an explicit incomplete/over-budget result and support deliberate expansion; never silently truncate obligations and claim readiness.

The selector is deterministic for identified inputs. Its completeness claim concerns declared obligations. It cannot establish that all real repository dependencies were modeled; an agent may need to inspect additional code and request more context.

## Operations

The initial interface is a local CLI over package files. Its canonical response is versioned structured JSON for agents and adapters. Explicit `--format json` selects that default; `--format markdown` provides a human-readable rendering of the same resolved response. The viewer and CLI reuse the [package core](02-viewer-and-review.md#application-boundaries); presentation does not define selection or readiness semantics.

The public response contract has a stable format/version independent of the package schema, operation and explicit request identity, source provenance, structured diagnostic codes, and snapshot-bound expansion references. Consumers reject unsupported versions and tolerate unknown additive fields. The public model avoids duplicated internal selector representations and supports runtime validation at the consumer boundary.

Unrequested sections, successfully resolved empty collections, unavailable material, and blocked readiness have distinct machine meanings. Acceptance, operation success, declared-context coverage, response completeness, and phase readiness remain separate claims. Limited legacy coverage is distinguishable from missing required material. Exact governing wording, result identities/revisions, prerequisite interfaces/findings, and reference attribution survive either presentation.

Handled argument and source failures return parseable JSON when JSON is selected, including by default. Exceeded serialization budgets return complete, explicitly incomplete diagnostic responses with source identity and next steps, never sliced JSON or silently truncated governing obligations. A minimum diagnostic envelope may exceed a budget too small to contain it; character counts are not token counts. Process termination and failures before startup cannot promise a response. Detailed fields and operation-specific presence rules belong in one package reference, alongside the implementation.

| Operation | Meaning |
| --- | --- |
| Current | Inspect the supplied package's accepted proposal, phase state, blockers, and available results |
| Context | Resolve a phase and activity against an identified proposal and required execution/reference revisions |
| Expand | Retrieve explicitly identified supporting items using the same source identity |

Illustrative commands describe the intended operations, not an already-installed API:

```text
plan current --package PATH
plan context --package PATH --phase PHASE_ID --activity implement --snapshot SNAPSHOT_ID
plan context --package PATH --phase PHASE_ID --activity verify --snapshot SNAPSHOT_ID
plan expand --package PATH --snapshot SNAPSHOT_ID --refs REF_ID...
```

Each response should identify the plan, proposal snapshot, phase/activity, relevant execution-record revisions, selected IDs and source references, required unavailable material, and available expansions. Output size and token count may be reported where a suitable tokenizer is available; character counts must not be presented as exact model token counts.

The operation takes a selected package; it does not decide project priorities by scanning all specs. During this experiment, the agent reads `project_status.md` to select work and locate its active plan. There is no requirement for a machine parser of the roadmap's free-form prose.

An MCP interface can wrap proven operations later if it solves actual integration friction. The capability does not require one initially.

## Readiness and revisions

A ready implementation handoff requires identified accepted scope, resolved governing references, available required designs, satisfied declared prerequisites, and no unresolved blocker for the selected work. User authorization and environment permissions remain independent constraints; package metadata cannot grant new authority.

An accepted plan may contain a future phase whose prerequisite is not yet delivered. Acceptance therefore does not imply that every phase is currently ready. Similarly, structural validity does not establish acceptance, and a merged prerequisite PR does not establish every required behavioral result.

The implementation must expose missing reference content, changed governed assets, incompatible predecessor interfaces, incomplete verification obligations, and stale evidence. The agent may investigate or perform authorized repairs; it must not silently weaken a criterion to make a phase ready.

Context expansion must remain attributable to the source snapshot. If newer working content is consulted, distinguish it from the accepted baseline and surface consequential differences. Do not silently combine accepted requirements with incompatible current draft details.

Required visual assets must actually be inspectable by the executor. Providing a filename alone is not evidence of inspection. If the agent lacks the capability needed for a governing asset, the handoff should expose that limitation rather than claim a complete implementation context.

## Durable results in the product

The future package can retain compact results that let later work recover what happened without reconstructing a conversation. They are separate from accepted proposal content.

| Result content | Purpose |
| --- | --- |
| Plan snapshot and phase ID | Attribute work to accepted intent |
| Code revision and relevant environment | Identify what was implemented or inspected |
| Interfaces actually produced | Supply reliable prerequisite information |
| Consequential deviations and unresolved findings | Expose differences from the proposal and remaining obligations |
| Verification observations and evidence links | Support particular claims with inspectable behavior |
| Review/PR/integration facts | Distinguish local completion, review, and actual integration |
| Useful failed approaches and continuation notes | Help a fresh executor avoid repeating consequential mistakes |

A small record or narrative with structured identifiers can suffice. Do not require a transcript archive, a full event-sourcing system, or a separate subsystem for every observation type.

Working notes may be compressed as long as accepted obligations, consequential findings, and evidence attribution remain available. Routine tool output need not be retained forever. The saved result should distinguish what was intended, observed, inferred, and left unverified.

This product design does not change the experiment's current memory ownership. While building the product, place durable progress, findings, and evidence links in `project_status.md`; maintain tactical details in `status.md`. Sample product records used for development remain clearly labeled fixtures.

## Verification and completion

Independent verification starts from the accepted obligations and inspectable candidate implementation. It may use the implementer's setup notes and claimed results, but those claims do not become its assessment authority. A fresh context alone does not guarantee an independent assessment if it merely inherits the producer's conclusion.

Each applicable criterion needs an actual disposition supported by the relevant local checks. Failed, blocked, or unavailable checks remain explicit. Screenshots can establish visual properties; persistence, ordering, interaction, and recovery behavior require appropriate behavioral evidence.

Evidence identifies the code revision and relevant conditions actually inspected. After a repair, an earlier pass does not automatically apply to the new candidate. A report-only commit may follow the tested implementation commit without pretending that the report itself was part of the tested code.

The executor owns repairs and phase delivery under the existing workflow. Local validation is sufficient for this experiment; CI and production deployment are not prerequisites. A PR is the intended delivery unit where repository access permits, while implementation, verification, PR creation, and merge remain separate facts.

Acceptance, validation policy, and delegated authority come from the applicable accepted baseline and actual user instructions. Proposed work must not redefine the criteria used to validate itself without an explicit approved change.

## Planning skill integration

The visual skills remain lightweight authors of a shared representation. They use reusable package operations and viewer components rather than regenerating the standard interface in every session.

Exploration can remain informal while alternatives are being considered. Once a proposal is ready for review, its consequential choices and selected designs are saved into the package. Acceptance opens that saved representation; implementation must not depend on reconstructing intent from the planning conversation afterward.

Both visual skills contribute to the same package. Keep common conventions in one maintained source and generate standalone copies only where installation portability requires them. Changes to skills must follow their actual source repository/versioning workflow rather than editing only installed caches.

The execution skill's adapter uses the selected package and current phase to request context, retrieves required assets, and records results through supported operations. The adapter can be exercised in a separately selected trial project. The bootstrap itself keeps ordinary Markdown implementation plans, project_status.md as durable memory, and status.md as working memory throughout this experiment. Existing plans need not be converted in bulk.

Installing a context CLI is not proof that the execution skill uses it. Integration verification must inspect actual invocation and the context delivered to the executor.

## SGM integration

A plan can reference an SGM boundary, contract, shared resource, or external adapter where it constrains the change. References should reuse SGM identities and carry enough version information to resolve the intended obligation.

Without a graph, a reference to a repository specification section can supply the same necessary constraint. The package reader and context selector must remain usable in that configuration.

An integrated view should distinguish the existing accepted contract, the proposed change, and observed implementation. When one review accepts both a plan and a system-meaning change, the decision should explicitly identify both subjects. Acceptance does not itself perform an unspecified graph publication or repository mutation.

A small integration can show one real affected boundary, the relevant contract, its consumers, and source/evidence links. A universal plan-to-graph conversion and wholesale migration of older delivery formats are unnecessary.

SGM's durable understanding goals remain broader than this package. Package and API ownership, shared state, and replaceable external adapters should not disappear merely because the initial experiment concerns plans.

## Learning and supervision

A retained connection between delivered context, accepted proposal, code revision, and observed outcome can help diagnose failure. A missed obligation might have been absent from the model, omitted by the resolver, ignored during execution, or missed during verification. Those failures call for different remedies.

Use that evidence to propose bounded improvements to tools, selection rules, or reusable guidance. Observations and learned advice cannot automatically amend accepted requirements or grant authority. Automatic instruction editing, model routing, and persistent supervisor hierarchies are outside the required capability.

The representation can support later delegation by making scope, required context, and obligation coverage explicit. Child work may receive narrower authority, and unassigned integration obligations must remain visible. Implementing an orchestration system is not required to preserve those design properties.

## Observable correctness and usefulness

| Scenario | What must be demonstrated |
| --- | --- |
| Select one phase | Applicable criteria and decisions survive exactly; unrelated narratives remain expandable |
| Future consumer constrains current work | The governing constraint reaches the earlier phase |
| Prerequisite differs from the proposal | Actual interface and consequential mismatch are visible |
| Required reference/asset is unavailable | The response discloses the incomplete handoff rather than claiming ready |
| Reopen in a fresh session | Goal, current obligations, predecessor results, and unresolved findings can be recovered |
| Select JSON or Markdown | Both render the same resolved identity, exact obligations, prerequisite results, diagnostics, and expansion meaning |
| Handle failure or budget overflow | JSON remains parseable; unavailable, blocked, limited, empty, and unrequested material remain distinguishable; incomplete output cannot claim a complete ready handoff |
| Compare viewer and CLI | Both identify the same revision, items, criteria, and reference meaning |
| Verify a repaired implementation | Evidence applies to the actual candidate and does not inherit an obsolete pass |
| Use a package without SGM | Ordinary document references support viewing and focused context |

Usefulness is a separate question from correctness. Measure context supplied including expansions, elapsed time, authoring/maintenance effort, defects, rework, and human interventions where available.

To study selection, compare full and selected context on matched work with model/settings, session policy, verification requirements, and overall budget held comparable. To study fresh sessions, keep the context strategy stable. Small trials are exploratory; one successful handoff does not establish general productivity gains.
