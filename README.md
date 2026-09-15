# SGM Plan Package

A small local viewer for saved Plan Packages. It renders plans, preserves exact
snapshot bytes across edits and restarts, and supports explicit acceptance and
result records. It runs locally; no hosted service or account is required.

## Quick start

Requirements: Node.js `>=20.19` and npm.

```sh
npm install
npm run dev -- --package examples/offline-recovery
```

The CLI prints the local viewer URL. The second illustrative package is
available with:

```sh
npm run dev -- --package examples/save-outcome
```

The example packages are demonstrations of the format. Their mock controls and
diagrams are not evidence of a working exercise product.

## Package operations

After editing a package, publish its complete manifest atomically:

```sh
npm run publish -- --package <package-directory>
```

The runtime creates an ignored `.plan-package/` directory beside the selected
package for immutable snapshot descriptors and retained bytes. Record an
authorized acceptance only for a concrete snapshot with the explicit command
documented in [the package history guide](docs/package/package-history.md#durable-snapshots-and-acceptance):

```sh
npm run accept -- ...
```

Execution observations are separate from proposal bytes. Record one against an
exact snapshot and phase with `npm run record-result`; pass the complete
versioned record as a JSON object through `--record-file`. The runtime exposes
verified current and historical records at `/api/results` and `/api/history`.

## Documentation

These Markdown guides are explanatory references; the runtime does not load
them. Read the format guide while authoring or publishing `plan.json`, the
history guide when accepting or recording results, and the runtime guide when
launching, reviewing, or troubleshooting the viewer.

- [Package format and publication](docs/package/package-format.md)
- [Package history, acceptance, and results](docs/package/package-history.md)
- [Local runtime and viewer](docs/package/runtime-and-viewer.md)
- [Architecture and boundaries](docs/architecture.md)
- [Full design specifications](docs/specs/)
- [Current roadmap and state](project_status.md)
- [Current plan checklist](status.md)
- [Plans and detailed results](docs/plans/)
- [Repository instructions for agents](AGENTS.md)

For routine agent work, start with `AGENTS.md` and the current status/plan
records. Read only the relevant README section when a quickstart or package
operation is needed; this file is not a required wholesale context load.
