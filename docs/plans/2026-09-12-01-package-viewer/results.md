# W01 results

Source plan: [W01 — Open and refresh a saved Plan Package](plan.md)

The plan is accepted at revision `ee7a0c339cc4b4265f738add0427e675484e3567`. P1 was implemented and locally verified in code revision `771070ecee3c6e1665bdf9a69ecadd18095aaa95`, based on `main` at that accepted revision. [PR #1](https://github.com/brandall10/sgm-plan-bootstrap/pull/1) merged into `main` at `826a228423ae5b49b7b503b56295dfe4def3bdfd`.

## P1

### Interfaces produced

- Strict inline `plan.json` v1.0 validator with globally unique IDs, phase dependency/cycle checks, applicability/file-reference checks, supported-capability checks, and distinct structural/material diagnostics.
- Core file-resolution interface plus Node-owned declared-root confinement, SHA-256 checks, exact manifest reread fence, deterministic displayed content IDs, immutable candidate capture, and candidate-scoped model/file/asset HTTP responses.
- Atomic publication helper that recomputes declared file digests, increments author revision, validates a sibling temporary manifest, and renames it into place only after the complete candidate resolves.
- Data-driven `offline-recovery` and independently worded `save-outcome` fixtures with declared narrative, diagrams, and prototype dependencies.

### Verification and outcomes

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — passed: 3 test files, 16 tests. Coverage includes malformed JSON, duplicate IDs, unknown targets/dependencies, dependency cycles, unsupported required capabilities, blocking questions, required file/digest failures, repository-root requirements, traversal/symlink escapes, manifest mutation, immutable captured bytes, failed reload retention, publication failure atomicity, and runtime model/asset endpoints. The HTTP tests required approved loopback access in the managed sandbox.
- `npm run build` — passed: TypeScript check plus Vite production build.
- Manual fixture review — completed while authoring and inspecting both manifests, narrative files, diagrams, and the visibly labelled mock controls. Fixture content is illustrative only and not evidence of an implemented exercise product.

### Deviations and limitations

- P1 includes only a minimal React/Vite bootstrap so the project/build boundary exists. Reusable review UI and navigation are intentionally deferred to P2; live watching, recovery, browser checks, native host probing, and performance measurements remain P3/P2 obligations as planned.
- The offline fixture includes an optional external documentation reference. The local reader does not fetch it and reports `external-not-fetched`; this is an intentional honest warning, not a missing required input.

### Delivery ledger

- Implementation: verified locally and committed on `feat/package-viewer-phase-p1-core`.
- Review/merge: [PR #1](https://github.com/brandall10/sgm-plan-bootstrap/pull/1) merged successfully.
- Integration: observed on `main` at merge revision `826a228423ae5b49b7b503b56295dfe4def3bdfd`; the merged tree contains the P1 implementation, fixtures, and status/results records.
- Next action: P1 is closed out; P2 delivery is recorded below.

## P2

### Interfaces produced

- Reusable React review surface mounted by the local runtime, consuming its resolved immutable candidate model rather than reparsing `plan.json`. It supplies overview/phase views, stable package/item hash links, exact criteria, shared context, decisions/questions, generated phase dependencies, diagnostics, and artifact provenance.
- A manual `POST /api/reload` path that rereads the selected package, publishes only a valid candidate, and leaves the current candidate intact on a rejected edit; the viewer's reload control calls that path.
- Candidate-scoped artifact rendering: SVGs render as images; selected HTML mocks use a distinct prototype route that exposes only the captured primary/dependency bytes. The frame has an opaque `allow-scripts` sandbox and restrictive CSP, while generic HTML-asset URLs are rejected.
- Safe Markdown presentation that treats raw HTML as text and activates only `https:`, `http:`, `mailto:`, and fragment links. Responsive CSS includes keyboard-visible focus, path/ID wrapping, desktop/tablet hierarchy, and narrow stacking.
- Playwright configuration and five browser behaviors covering both packages, keyboard phase navigation with visible focus, deep links/diagnostics, artifacts, mock isolation, unsafe narrative, blocking labels, and tablet/narrow layouts.

### Verification and outcomes

- Validation covered the accepted plan at `ee7a0c339cc4b4265f738add0427e675484e3567` and `main` base `2978e011883eb344a53b6e80788e4432567309c0`. The implementation revision is recorded in the follow-up ledger update after this phase commit.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — passed: 4 test files, 20 tests. Includes the existing package/runtime checks plus safe-link handling, candidate-scoped prototype route/CSP/traversal checks, and manual valid-candidate reload. Local HTTP tests used approved loopback access.
- `npm run test:e2e` — passed: 5 Playwright checks using the local Google Chrome channel. The suite exercises the two fixture models, manual reload, keyboard phase navigation and visible focus, criterion links, diagrams, missing targets, diagnostics, unsafe narrative, prototype interaction/isolation, and 1440×920 desktop, 1024×900 tablet, and 740×960 narrow layouts.
- `npm run build` — passed: TypeScript check plus Vite production build.
- `git diff --check` — passed.
- Manual Codex in-app-browser inspection — the visible offline-recovery criterion/design route showed the revision/content ID, diagnostics, diagram, and styled sandboxed mock. The detailed host finding is [the native-surface probe](../../native-surface-probe.md).

### Native presentation outcome

- Native annotation is **unavailable or unverified** in the inspected Codex desktop surface: the browser rendered the package, but no annotation action, feedback receipt, or payload reached the agent. The browser-panel request was queued and no human annotation was supplied.
- This is not treated as a successful annotation trial. P2 retains the browser path and manual reload without adding a custom feedback transport. A later supported host may repeat the probe against a visible stable item and record its attribution fields.

### Delivery ledger

- Implementation: complete and locally verified on `feat/package-viewer-phase-p2-viewer`; the feature commit is recorded by the next ledger update.
- Review/merge: scoped P2 PR pending creation.
- Integration: not merged; P3 cannot begin until P2 is integrated.

## P3

No P3 refresh/recovery or performance outcome recorded.

Next action: deliver P2's PR and await integration before selecting P3.
