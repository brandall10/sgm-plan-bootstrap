# Plan CLI response contract

`npm run plan --` is a read-only package operation. Its canonical response is
one versioned JSON document on stdout; `--format json` selects that default and
`--format markdown` renders the same resolved response for people. This
contract is independent of the `plan-package` manifest schema.

```sh
npm run --silent plan -- context --format json \
  --package <package-directory> --snapshot <full-snapshot-sha256> \
  --phase <phase-id> --activity implement
```

JSON stdout is exactly one complete `plan-cli-response` object followed by an
optional newline. Diagnostics and launcher failures belong on stderr; consumers
must parse all of stdout rather than search for a JSON fragment. Explicit help
remains text. `context` and `expand` accept `--max-chars N`; `current` rejects
it.

## Envelope

Every JSON response has this shape. Unknown additive fields are allowed, but a
consumer must reject an unsupported `format` or `format_version`.

```json
{
  "format": "plan-cli-response",
  "format_version": "1",
  "operation": "current | context | expand | null",
  "request": {},
  "source": {},
  "outcome": "ok | error",
  "diagnostics": [],
  "coverage": "complete | limited | unavailable",
  "completeness": "complete | incomplete | unavailable",
  "readiness": { "state": "ready | blocked | not_evaluated", "blockers": [] },
  "data": {}
}
```

`request` retains the explicit package/store/repository selection, snapshot,
phase, activity, refs, renderer format, character budget, and draft-comparison
choice. Its path fields and omitted operation inputs are `null`, never guessed.
Handled argument errors preserve known request values, use a nullable
`operation` and `source`, and exit `2`.

`source` contains the resolved `package_id`, `snapshot_id`, author `revision`,
`acceptance_status`, selected source IDs, retained result IDs, and result code
revisions. It is nullable when a requested source cannot be reopened. A source
is always snapshot-bound; a working draft is separately labelled comparison
information and never silently blended into the source.

Each diagnostic has `code`, `severity` (`error`, `warning`, or `info`),
`message`, `path`, and optional `item_id`. `outcome` says whether the operation
was handled; it does not authorize execution. `coverage` describes declared
obligation coverage, `completeness` describes this response, and `readiness`
describes the selected phase. A blocked context can therefore be a complete,
successfully resolved response.

## Operation data

`data.kind` is `current`, `context`, `expand`, `budget`, or `failure`.
Collections that may be absent use a section object:

```json
{ "state": "not_requested" }
{ "state": "resolved", "items": [] }
{ "state": "unavailable", "diagnostics": [] }
```

Only `resolved` sections contain `items`; an empty array is a real resolved
empty collection, not unavailable material.

| Operation | `data` contents | Readiness |
| --- | --- | --- |
| `current` | Accepted-baseline identity, retained snapshots, phase states, available current/historical result summaries, and optional draft comparison | `not_evaluated` for an inspectable accepted baseline; `blocked` when no executable baseline exists |
| `context` | Accepted goal/scope, selected phase and activity tasks, phase map, exact constraints/criteria, applicable decisions/questions/references/assets, governing IDs, explicit expansion IDs, prerequisite interfaces/findings, result summaries, limitations, and optional draft comparison | `ready` or `blocked` from the resolved selection |
| `expand` | Requested IDs in request order with retained content or immutable routes represented in each item, plus per-item diagnostics | `not_evaluated`; expansion is inspection, not execution readiness |
| `budget` / `failure` | Only known identity, a stable diagnostic, and safe next steps | `not_evaluated` for a budget response; `blocked` for unavailable input/source failures |

`current` does not request phase-specific context or expansions. `expand` does
not evaluate context selection or phase readiness. Reference and asset routes
identify retained snapshot bytes; a route is not proof that a caller inspected
the material.

## Exit, failures, and budgets

Exit `0` means a successful usable operation. Exit `1` means unavailable,
blocked, unaccepted, malformed, or budget-incomplete context. A successful
`expand` inspection of an unaccepted snapshot may still return `0`, and legacy
limited context coverage remains explicit rather than automatically changing a
historical exit convention. Exit `2` is reserved for arguments.

Handled source and runtime failures return this envelope by default, with
known request fields and stable diagnostics. A process that cannot start cannot
promise a response.

For `context` and `expand`, `--max-chars` counts Unicode code points in the
complete selected-format serialization, including its trailing newline. The
CLI never slices JSON or removes governing wording while reporting completeness.
On overflow it returns a complete minimum `budget` envelope with the full
serialized character count, requested limit, known source/blockers, a
`budget-exceeded` diagnostic, and next steps. This minimum envelope can exceed
a very small requested limit and says so explicitly. Character counts are not
token counts.

## Adapter requirements

An adapter must pass provider root/revision, package or store, snapshot, phase,
and activity explicitly. It invokes the supported silent launcher with
`context --format json`, parses all stdout, validates this envelope/version and
returned request/source identity, and uses fields/codes rather than Markdown
text. It preserves valid provider stdout, stderr, and exit status without a
banner or prose wrapper. A dirty, unavailable, revision-mismatched, malformed,
version-mismatched, or identity-mismatched provider is an adapter diagnostic,
not a fallback to a different provider or snapshot.
