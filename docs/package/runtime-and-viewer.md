# Plan Package local runtime and viewer

This guide describes how to launch and inspect a package locally. It is used
after a package has been authored or published, and when diagnosing reload,
history, or viewer behavior.

## Local runtime and review surface

Install dependencies once, then launch either fixture with one command:

```sh
npm install
npm run dev -- --package examples/offline-recovery
npm run dev -- --package examples/save-outcome
```

The runtime binds to `127.0.0.1` by default and opens the browser viewer at
`/`. It exposes `/api/health`, `/api/state`, `/api/acceptances`,
`/api/history`, and a server-sent event stream at `/api/events`. The working
draft is available at `/api/draft/model`, while an immutable saved snapshot is
available at `/api/snapshots/<snapshot-id>/model`. Both views have captured
`files` and non-HTML `assets` routes; HTML prototypes are served only through
their isolated `prototypes/<asset-id>/` route. The older candidate-scoped
routes remain available for compatibility, but new links to accepted material
use snapshot-scoped URLs.

The viewer's **Reload package** control uses `POST /api/reload` to reread and
revalidate the already selected package. It writes no package files: a valid
candidate becomes current, while an invalid candidate leaves the last valid
candidate visible with its diagnostics. The runtime also watches `plan.json`,
declared local files, and the parent directories needed to observe atomic
renames and missing-file recovery. Events are debounced, serialized, and
generation-fenced; the newest load request cannot be replaced by a slower older
resolution. A valid load emits `candidate-published`; a rejected load emits
`candidate-rejected` with the retained candidate's package/revision and the
rejection diagnostics.

The viewer renders that resolved model instead of reparsing package files. Its
overview and phase routes use stable package/item IDs in the hash, show goal,
scope, shared constraints, exact criteria, dependencies, applicable decisions
and questions, diagnostics, and artifact metadata. Unqualified package links
open the selected default view, while concrete links use
`#/packages/<package-id>/draft` or
`#/packages/<package-id>/snapshots/<snapshot-id>` (with optional `/items/<id>`).
The view switcher exposes the working draft and every recorded snapshot.
Comparison links use
`#/packages/<package-id>/compare/<from-snapshot-id>/<draft|to-snapshot-id>`.
Missing or package-mismatched deep links remain visible errors rather than
silently selecting another item.

Narrative Markdown is rendered as text and small supported Markdown constructs;
raw HTML is never interpreted and only `https:`, `http:`, `mailto:`, and
fragment link destinations become links.

SVG assets are displayed as images from their immutable snapshot or draft URL.
HTML prototype assets are deliberately unavailable from the generic asset
endpoint: the viewer opens them only at the view's
`/api/{draft|snapshots/<snapshot-id>}/prototypes/<asset-id>/` route in an iframe
with `sandbox="allow-scripts"`. The runtime serves only that HTML file and its
declared relative dependencies from the captured view, applies restrictive
CSP, and prevents the opaque sandbox from accessing viewer controls. The mock
label is part of the frame, not an assertion that a product action occurred.

The viewer provides manual reload and live refresh. Its connection label
reports `connected`, `reconnecting`, or `offline`. On an SSE reconnect it
fetches `/api/state` again so missed events do not hide a rejected candidate or
a newer revision. When a selected stable item survives a refresh, its hash
route, scroll anchor, and open rationale details are retained. If the item is
removed, the viewer navigates to its surviving phase or the package overview
and explains the fallback. A candidate that is no longer available after a
runtime restart is reported as unavailable rather than silently showing a
different candidate.

## Refresh troubleshooting

If the viewer says it is showing the last valid revision, inspect `/api/state`
and read the diagnostic paths before editing. Restore all files involved in
the completed-write convention, then run the publication helper so the
manifest's digests and revision describe one complete candidate. A malformed or
partial manifest is intentionally retried only when another watched filesystem
event arrives; it is not hot-looped in the background. If the connection label
remains `reconnecting`, keep the viewer open while the local runtime is
restarted or use **Try again** after the runtime is available. The current hash
route is preserved across a transient disconnect.

For the package manifest and publication contract, see
[Plan Package format and publication](package-format.md). For snapshots,
acceptance, results, and comparisons, see
[Plan Package history, acceptance, and results](package-history.md).
