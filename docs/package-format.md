# Plan Package format and local runtime

P1 supports one versioned representation: an inline `plan.json` manifest with
`format: "plan-package"` and `format_version: "1.0"`. The reader accepts the
fields below and retains `metadata` as opaque optional data. Structural validity
does not imply acceptance, implementation, verification, or execution
readiness.

## Supported fields

| Field | Meaning |
| --- | --- |
| `id`, `title`, `revision`, `state` | Stable identity, human title, positive author revision, and `draft`/`accepted` state |
| `goal_md`, `scope`, `constraints` | Inline Markdown intent, included/excluded boundaries, and shared obligations |
| `phases` | Stable phase IDs, objective/approach Markdown, `depends_on` phase IDs, and exact `acceptance_criteria` |
| `references` | Local file references or non-fetched HTTP(S) references, with purpose, applicability, and requiredness |
| `decisions`, `questions` | Resolved choices and open/answered/deferred questions with a blocking flag |
| `assets` | Selected files with format, purpose, authority, applicability, requiredness, and transitive dependency file IDs |
| `files` | Digest inventory for every local file consumed by the model or an asset, with a declared `package` or `repository` root |
| `required_capabilities` | Semantics the reader must understand; unknown required capabilities reject the package |
| `metadata` | Optional opaque metadata retained by the parsed model and never interpreted as a supported capability |

IDs are globally unique across addressable package items, including phases,
criteria, files, references, assets, decisions, questions, and constraints.
Paths use normalized `/` separators and are relative to the root declared on
their file entry. Absolute paths, `.`/`..` segments, NUL bytes, and Windows
backslash paths are rejected. A repository-root entry requires the runtime to
be given an explicit repository root; the process working directory is never
used to reinterpret a package-relative path.

Local references and required assets must resolve to a declared file. External
references are not fetched. A required external reference is complete only when
`local_file_id` points to a retained local copy. Optional external references
produce a visible informational diagnostic. Open blocking questions, missing
required files, digest mismatches, unsupported semantics, unknown relationships,
and dependency cycles prevent a candidate from being published.

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

The runtime reads exact manifest bytes before loading files and rereads them
afterward. A manifest mutation, missing file, digest mismatch, or path escape
discards the candidate. A successful candidate receives a separate displayed
content ID derived from the exact manifest bytes and verified file inventory.
Responses for that candidate use captured bytes rather than rereading working
files.

## Local runtime

Install dependencies once, then launch either fixture with one command:

```sh
npm install
npm run dev -- --package examples/offline-recovery
npm run dev -- --package examples/save-outcome
```

The P1 runtime binds to `127.0.0.1` by default. It exposes `/api/health`,
`/api/state`, candidate-scoped JSON model responses at
`/api/candidates/<content-id>/model`, and captured files/assets at
`/api/candidates/<content-id>/files/<file-id>` or
`/api/candidates/<content-id>/assets/<asset-id>`. The reusable browser review
surface is a P2 deliverable; the P1 root response identifies that boundary.

Run the phase checks with:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Playwright installation and browser checks are intentionally documented with
the P2 viewer work, not required by P1.
