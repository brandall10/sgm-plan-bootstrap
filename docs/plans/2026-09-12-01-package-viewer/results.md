# W01 results

Source plan: [W01 — Open and refresh a saved Plan Package](plan.md)

The plan is accepted at revision `ee7a0c339cc4b4265f738add0427e675484e3567`. P1 was implemented and locally verified in code revision `771070ecee3c6e1665bdf9a69ecadd18095aaa95`, based on `main` at that accepted revision. [PR #1](https://github.com/brandall10/sgm-plan-bootstrap/pull/1) merged into `main` at `826a228423ae5b49b7b503b56295dfe4def3bdfd`. P2's browser viewer was implemented and locally verified in `9e3dc24d59ca5d5c4f38578031e02049323967e9`; the native Browser annotation receipt/edit/reload loop is now also verified. [PR #2](https://github.com/brandall10/sgm-plan-bootstrap/pull/2) merged into `main` at `fbddbeef1f3ca293c59366f217df61f97a8e9276`. P3 was implemented and locally verified in `d34c1af836147047e54f5b7ab5f582f9d3796dfd` on `feat/package-viewer-phase-p3-live-refresh`; [PR #3](https://github.com/brandall10/sgm-plan-bootstrap/pull/3) merged into `main` at `3e7b60daec2a5222c22deaf1cb5310b13fdcc27a`.

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

- Validation covered the accepted plan at `ee7a0c339cc4b4265f738add0427e675484e3567`, `main` base `2978e011883eb344a53b6e80788e4432567309c0`, and implementation revision `9e3dc24d59ca5d5c4f38578031e02049323967e9`.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — passed: 4 test files, 20 tests. Includes the existing package/runtime checks plus safe-link handling, candidate-scoped prototype route/CSP/traversal checks, and manual valid-candidate reload. Local HTTP tests used approved loopback access.
- `npm run test:e2e` — passed: 5 Playwright checks using the local Google Chrome channel. The suite exercises the two fixture models, manual reload, keyboard phase navigation and visible focus, criterion links, diagrams, missing targets, diagnostics, unsafe narrative, prototype interaction/isolation, and 1440×920 desktop, 1024×900 tablet, and 740×960 narrow layouts.
- `npm run build` — passed: TypeScript check plus Vite production build.
- `git diff --check` — passed.
- Manual Codex in-app-browser inspection — the visible offline-recovery criterion/design route showed the revision/content ID, diagnostics, diagram, and styled sandboxed mock. The detailed host finding is [the native-surface probe](../../native-surface-probe.md).

### Native presentation outcome

- Native Browser annotation is **verified** in the inspected Codex desktop surface. A user annotation targeted the stable `criterion.restore-choice` element at the phase route and reached this task with page URL, top-document frame, target text, selector, DOM path, viewport position, nearby text, comment text, and a saved marker screenshot.
- The exact requested criterion edit was published through `npm run publish -- --package examples/offline-recovery`, producing author revision `2` and content ID `content-1d8329ead56663b8b792cdcb`. The Browser's **Reload package** control then displayed that new revision/content ID and the updated criterion at its stable deep link.
- This verifies the host receipt and annotation-to-authoritative-edit/manual-reload loop in this environment. It does not generalize to arbitrary hosts or other Codex surfaces. No custom feedback transport was added; live watching remains P3 scope. Full evidence is in [the native-surface probe](../../native-surface-probe.md).

### Delivery ledger

- Implementation: complete in `9e3dc24d59ca5d5c4f38578031e02049323967e9` on `feat/package-viewer-phase-p2-viewer`; browser/viewer behavior and the native annotation receipt/edit/reload loop are locally verified.
- Review/merge: [PR #2](https://github.com/brandall10/sgm-plan-bootstrap/pull/2) merged successfully.
- Integration: observed on `main` at merge revision `fbddbeef1f3ca293c59366f217df61f97a8e9276`; P2 is integrated.

## P3

### Interfaces produced

- `PackageWatcher` watches the selected manifest, captured declared files, and the necessary parent directories for atomic replacement, deletion, and newly declared dependencies. Debounce limits duplicate filesystem notifications without treating timing as the coherence guarantee.
- `CandidateStore.loadAndPublish` serializes loads and generation-fences superseded requests. It publishes only complete candidates, keeps prior captured bytes on rejection, and exposes the latest attempt outcome through `RuntimeState.lastAttempt`.
- `/api/events` provides an initial `state` event plus `candidate-published` and `candidate-rejected` events. Rejected state includes the retained package/revision and actionable diagnostics; successful publication refreshes the viewer's candidate-scoped model and asset URLs.
- The viewer's live status/recovery surface reports connection state, refetches complete state on reconnect, preserves surviving item routes/scroll/details, and falls back to a surviving phase or overview with a visible explanation when an item is deleted. `npm run measure` is a reproducible five-run benchmark for the representative fixture.

### Verification and outcomes

- Accepted plan revision covered: `ee7a0c339cc4b4265f738add0427e675484e3567`; local `main` base covered: `0a81fb09e4f1426b557d55ede786c8609cfaf73a`; phase branch: `feat/package-viewer-phase-p3-live-refresh`.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — passed: 4 test files, 25 tests. Coverage includes generation fencing, watched valid/invalid publication, initial-invalid recovery, interrupted multi-file retention, asset consistency, newly declared dependency rediscovery, and SSE state events. Runtime HTTP checks used approved loopback access.
- `npm run test:e2e` — passed: 8 Playwright checks using the local Google Chrome channel. Coverage includes automatic refresh/rejection diagnostics, retained revision, selected-item deletion fallback, runtime restart/reconnect, both fixtures, unsafe narrative, prototype isolation, and responsive hierarchy.
- `npm run build` — passed: TypeScript check plus Vite production build.
- `npm run measure` — passed: five ordinary sequential runs per category on an Apple M3 Max (`arm64`, macOS Darwin `27.0.0`), Node `v26.7.0`, Google Chrome via Playwright; representative fixture `examples/offline-recovery`, 5 declared/captured files, 5,339 captured bytes, baseline revision 2. Warm candidate load: median `1.08 ms`, range `0.94–1.23 ms`. Runtime open (candidate load + watcher-disabled server startup + `/api/state`): median `2.19 ms`, range `2.07–12.26 ms`. Browser render (navigation to overview heading): median `94.05 ms`, range `93.72–333.30 ms`. Text refresh (edit + atomic publication + watched publication): median `360.99 ms`, range `75.67–903.25 ms`. Asset refresh (edit + atomic publication + watched publication + asset request): median `406.28 ms`, range `93.84–504.17 ms`.
- `git diff --check` — passed. No CI run was required; local validation is the repository's documented workflow.

### Scenarios and limitations

- Atomic publication is observed through the manifest's sibling-temp-file rename. Direct multi-file interruption produces a rejection while the prior candidate's text and asset bytes remain paired; correcting and republishing recovers without a server restart.
- The watcher uses Node's local `fs.watch` and watches only the selected manifest, declared files, and their necessary parent directories. Persistent invalid content is not hot-looped; a later watched change retries it. A process restart intentionally resets in-memory candidate history, but the browser reconnects and reloads the current state when the runtime returns.
- Connection recovery is implemented through standard browser `EventSource` plus a full `/api/state` fetch on `open`; no custom annotation, chat, polling, or agent-session transport was added. The native Browser annotation outcome remains the verified P2 evidence in [the native-surface probe](../../native-surface-probe.md).

### Delivery ledger

- Implementation: complete and verified locally in `d34c1af836147047e54f5b7ab5f582f9d3796dfd` on `feat/package-viewer-phase-p3-live-refresh`, based on `main` `0a81fb09e4f1426b557d55ede786c8609cfaf73a` and accepted plan revision `ee7a0c339cc4b4265f738add0427e675484e3567`.
- Review/merge: [PR #3](https://github.com/brandall10/sgm-plan-bootstrap/pull/3) merged successfully.
- Integration: observed on `main` at merge revision `3e7b60daec2a5222c22deaf1cb5310b13fdcc27a`; P3 and W01 are integrated.
- Next action: W01 is closed; W02 remains proposed and requires separate authorization before implementation.
