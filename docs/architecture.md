# P1/P2/P3 implementation boundaries

The project keeps package meaning in a shared core and gives filesystem and
HTTP authority to the local runtime.

| Boundary | Responsibility | Deliberate exclusions |
| --- | --- | --- |
| `src/core` | Parse/validate the inline contract, check relationships, resolve supplied file bytes, and describe a deterministic content-ID input | Node filesystem, HTTP, browser rendering, and publication writes |
| `src/server` | Resolve declared roots with real-path confinement, capture and digest files, fence manifest mutation and overlapping loads, publish atomically, watch declared inputs, broadcast candidate state, serve candidate-scoped responses, and mount the local viewer | Agent sessions, annotations, write APIs, and package-content mutation |
| `src/viewer` | Consume the resolved runtime model; render reusable overview/phase navigation, criteria, decisions/questions, diagrams, safe narrative, sandboxed prototype frames, live connection state, and navigation recovery | Package parsing, filesystem access, custom feedback transport, package watching, and native host presentation adapters |
| `examples` | Data-driven illustrative packages and their declared local dependencies | Evidence that the described exercise behavior is implemented |

The `CandidateStore` is the small runtime model interface shared by the viewer
and watcher. It can retain multiple successful candidates by content ID, returns
copies of captured bytes, never replaces the current candidate when a new load
fails, and serializes/generation-fences load requests so a slower older request
cannot publish after a newer one has been requested. Its runtime state retains
the last valid candidate identity alongside the most recent attempt diagnostics.

The server's HTML-prototype route is deliberately narrower than its ordinary
asset route. It exposes a declared HTML asset and only its declared relative
dependencies under one candidate ID, while the viewer embeds it with an opaque
script-permitted sandbox. This permits a selected mock to demonstrate its own
behavior without gaining access to viewer DOM, navigation, or runtime APIs.
