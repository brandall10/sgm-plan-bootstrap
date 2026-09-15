# Plan Package history, acceptance, and results

This guide describes the durable records kept beside a package after
publication. It is used when accepting a specific proposal snapshot, recording
execution observations, reopening history, or comparing revisions. The store
is ignored package-local data; it is not part of the package's declared inputs.

## Durable snapshots and acceptance

When the local runtime publishes a candidate it first creates the package's
ignored `.plan-package/` store. The store contains:

- `blobs/<sha256>` — immutable manifest and captured-file bytes;
- `snapshots/<full-sha256>.json` — a versioned descriptor containing the exact
  manifest digest, author revision, compatibility content ID, sorted file
  inventory, and explicit optional omissions; and
- `acceptances/<record-id>.json` — append-only, versioned provenance records; and
- `results/<result-id>.json` — append-only, versioned observations bound to an
  exact snapshot, phase, activity, code revision, and evidence set.

Snapshot IDs are full SHA-256 digests over the exact manifest bytes and the
deterministic captured inventory. Repository-root files and every selected
asset dependency are retained in the same way as package-root files. The store
is excluded from package inputs and is never fetched from external references.
Existing blobs, descriptors, and records are verified before an identical
retry is accepted; different bytes under an existing immutable identity fail.
Reopening a snapshot verifies the descriptor, manifest, every blob digest, and
the compatibility content ID before serving retained bytes. It never falls
back to the current draft.

Record an explicit acceptance only after the conversation has authorized it:

```sh
npm run accept -- \
  --package examples/save-outcome \
  --snapshot-id <full-snapshot-sha256> \
  --record-id acceptance.save-outcome-1 \
  --actor user:example \
  --source conversation:user-message-1 \
  --instruction-file /absolute/path/to/instruction.txt
```

The command requires a concrete snapshot and UTF-8 instruction file; it never
selects “latest” implicitly. Reusing a record ID with identical input is
idempotent (the generated timestamp is not part of the retry identity), while
conflicting input fails. Acceptance is provenance only: it does not mutate
`plan.json`, activate execution, or make a blocking question executable.

## Durable result records

Result records retain execution observations independently of the accepted
proposal. They carry separate statement arrays for intended work, observed
facts, inferences, and unverified claims, plus produced interfaces, deviations,
unresolved findings, evidence links, delivery facts, continuation notes, and
explicit supersession. Every result also names its package, full snapshot ID,
phase, activity, author, recording time, code revision, relevant environment,
and related package item IDs. An illustrative result remains visibly
illustrative; a result record never establishes acceptance, verification, or
integration by itself.

Record a result only with an explicit snapshot and phase. A JSON input file can
contain the full result body; the command supplies or overrides its source
identity and provenance fields:

```sh
npm run record-result -- \
  --package examples/save-outcome \
  --snapshot-id <full-snapshot-sha256> \
  --phase phase.save-outcome \
  --activity verify \
  --record-id result.save-outcome-verify-1 \
  --author agent:example \
  --code-revision <git-revision> \
  --record-file /absolute/path/to/result.json
```

The store reopens the referenced retained snapshot and validates the phase and
related item IDs before publishing. Identical retries by result ID are
idempotent (recorded time is not part of retry identity); different input,
missing superseded records, corrupt history, mismatched identities, and stale
or unavailable evidence remain visible diagnostics. Superseded records remain
available as history and are not reported as current. The read-only runtime
projection is available at `/api/results`, `/api/history`, and the per-record
route `/api/results/<result-id>`.

The viewer's overview and phase views consume the same projection through their
Execution results panels. Current and superseded records, illustrative fixture
labels, evidence status/locators, limitations, and review/integration facts are
rendered as separate fields. A panel with no records explicitly reports that
there is no retained evidence; it does not label the phase successful.

## History and comparison projection

The viewer's history projection is available at `/api/history` (also exposed as
`/api/snapshots`). It lists verified snapshots, their acceptance records and
captured-file availability, plus the current working draft and the default
view. An accepted snapshot is selected as the default only when a
non-illustrative acceptance record names it; otherwise the working draft is
shown. Acceptance records remain provenance, so an illustrative record is
listed and labeled but does not become the default.

Two saved snapshots can be compared with
`/api/compare?from=<snapshot-id>&to=<snapshot-id>`. The `to` selection may
also be `draft`, which resolves to the current working draft's persisted
snapshot. Comparison output uses stable package IDs, separates material
changes from metadata/serialization changes, includes old and new values, and
reports captured inputs that cannot be verified. Comparisons across package
IDs and comparisons with unavailable or corrupt snapshots are rejected.
