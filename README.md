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

Use the package-local `plan` command to recover focused, attributable context;
`npm run dev` remains the viewer launcher:

```sh
npm run plan -- current --package <package-directory>
npm run plan -- context --package <package-directory> \
  --snapshot <full-snapshot-sha256> --phase <phase-id> --activity implement
npm run plan -- expand --package <package-directory> \
  --snapshot <full-snapshot-sha256> --refs <item-id>...
```

`current` uses the latest real acceptance as its display default and reports an
unaccepted package without substituting the working draft. `context` requires
an explicit snapshot, phase, and activity; it prints exact governing wording,
readiness blockers, retained results, and snapshot-bound expansion IDs.
`expand` accepts only explicit IDs from the same snapshot and returns retained
text or immutable viewer/runtime routes for visual and binary material. Use
`--store <store-directory>` when the working package root is unavailable,
`--compare-draft` to label newer working content without blending it into the
accepted baseline, and `--max-chars N` for an explicit incomplete response
when the complete Markdown output exceeds a character budget. Exit status `1`
means the requested handoff is unavailable, blocked, unaccepted, or incomplete;
status `2` is reserved for command-line errors.

The viewer's overview and phase views include the same retained result history,
with evidence, limitations, and review/integration facts kept distinct. See
the [focused context measurement](docs/package/context-measurement.md) for the
bounded local comparison used by the recovery demonstration.

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
