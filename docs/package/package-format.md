# Plan Package format and publication

The package core supports one versioned representation: an inline `plan.json` manifest with
`format: "plan-package"` and `format_version: "1.0"`. The reader accepts the
fields below and retains `metadata` as opaque optional data. Structural validity
does not imply acceptance, implementation, verification, or execution
readiness.

## Supported fields

| Field | Meaning |
| --- | --- |
| `id`, `title`, `revision`, `state` | Stable identity, human title, positive author revision, and legacy author metadata (`draft`/`accepted`) |
| `goal_md`, `scope`, `constraints` | Inline Markdown intent, included/excluded boundaries, and shared obligations |
| `phases` | Stable phase IDs, objective/approach Markdown, `depends_on` phase IDs, activity-tagged `tasks`, and exact `acceptance_criteria` |
| `references` | Local file references or non-fetched HTTP(S) references, with purpose, applicability, and requiredness |
| `decisions`, `questions` | Resolved choices and open/answered/deferred questions with a blocking flag |
| `assets` | Selected files with format, purpose, authority, applicability, requiredness, and transitive dependency file IDs |
| `files` | Digest inventory for every local file consumed by the model or an asset, with a declared `package` or `repository` root |
| `required_capabilities` | Semantics the reader must understand; unknown required capabilities reject the package |
| `metadata` | Optional opaque metadata retained by the parsed model and never interpreted as a supported capability |

Packages that require `context-selection.v1` must declare at least one task in
each phase. A task has a stable `id`, exact `text_md`, and an `activity` of
`implement` or `verify`. A criterion may declare `applies_to` phase or
criterion IDs; when omitted, it applies to its owning phase. This lets a
downstream phase's exact consumer obligation reach a prerequisite without
pulling the downstream narrative into the prerequisite's focused context.

IDs are globally unique across addressable package items, including phases,
tasks, criteria, files, references, assets, decisions, questions, and
constraints.

Paths use normalized `/` separators and are relative to the root declared on
their file entry. Absolute paths, `.`/`..` segments, NUL bytes, and Windows
backslash paths are rejected. A repository-root entry requires the runtime to
be given an explicit repository root; the process working directory is never
used to reinterpret a package-relative path.

Local references and required assets must resolve to a declared file. External
references are not fetched. A required external reference is complete only when
`local_file_id` points to a retained local copy. Optional external references
produce a visible informational diagnostic. Missing required files, digest
mismatches, unsupported semantics, unknown relationships, and dependency cycles
prevent a candidate from being published. Open blocking questions remain
visible as planning blockers: they prevent executable/readiness claims but do
not prevent a coherent proposal from being reviewed, saved, or accepted as an
approach.

## Publication convention

`plan.json` is the final publication manifest. Every declared file has a
lowercase SHA-256 digest. After changing any package file or selected asset,
run the publication helper:

```sh
npm run publish -- --package examples/offline-recovery
```

The helper validates the package, reads the declared files through their
confined real paths, increments `revision`, recomputes all file digests, writes
a uniquely named sibling temporary manifest, validates that temporary
candidate, and atomically renames it over `plan.json`. It does not imply that
the proposal was accepted or that any exercise product exists. If validation
fails, the existing manifest is left in place.

The manifest's `state` field is retained for v1 compatibility but never proves
acceptance. The local runtime derives acceptance only from a durable record;
the viewer labels a candidate with no selected record as acceptance unverified.

For the retained snapshot, acceptance, and result lifecycle, see
[Package history, acceptance, and results](package-history.md). For launching
and inspecting a package locally, see [Local runtime and viewer](runtime-and-viewer.md).
The read-only machine/human response emitted by the package-local CLI is
specified separately in [Plan CLI response contract](plan-cli-response.md).
