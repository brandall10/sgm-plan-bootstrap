# P1 implementation boundaries

The project keeps package meaning in a shared core and gives filesystem and
HTTP authority to the local runtime.

| Boundary | Responsibility | Deliberate exclusions |
| --- | --- | --- |
| `src/core` | Parse/validate the inline contract, check relationships, resolve supplied file bytes, and describe a deterministic content-ID input | Node filesystem, HTTP, browser rendering, and publication writes |
| `src/server` | Resolve declared roots with real-path confinement, capture and digest files, fence manifest mutation, publish atomically, and serve candidate-scoped responses | Agent sessions, annotations, write APIs, and live watching |
| `src/viewer` | Minimal Vite/React bootstrap for the P1 project build | Reusable review UI, navigation, prototypes, and native host presentation until P2 |
| `examples` | Data-driven illustrative packages and their declared local dependencies | Evidence that the described exercise behavior is implemented |

The `CandidateStore` is the small runtime model interface intended for P2. It
can retain multiple successful candidates by content ID, returns copies of
captured bytes, and never replaces the current candidate when a new load fails.
