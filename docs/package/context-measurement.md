# Focused context measurement

This is a small local measurement of the `examples/offline-recovery` fixture,
not a productivity benchmark. It compares versioned JSON and explicit Markdown
renderers for one matched phase/activity over five ordinary sequential runs
using the same local Node process and temporary accepted snapshot.

## Method

The full representation is the JSON package manifest plus text decoded from all
five captured fixture files. The focused responses are generated from the same
resolved model and snapshot with:

```sh
npm run --silent plan -- context --format json \
  --package examples/offline-recovery --snapshot <snapshot-id> \
  --phase phase.persistence-outcomes --activity implement
npm run --silent plan -- context --format markdown \
  --package examples/offline-recovery --snapshot <snapshot-id> \
  --phase phase.persistence-outcomes --activity implement
```

The same two renderers expand `reference.recovery-notes` and
`asset.recovery-flow` against that snapshot. Character counts are Unicode code
points; bytes are UTF-8 response bytes; elapsed time is local output-generation
time. The producer verifies that both renderers receive equal public
data/source models before measuring. The total includes the selected response
plus its necessary two-reference expansion.

## Latest sample

Measured 2026-09-15 on Apple M3 Max, macOS `darwin 27.0.0`, arm64, Node
`v26.7.0`, response `plan-cli-response` v1, UTF-8, with no
dependency-installation time included:

| Representation | Characters | UTF-8 bytes | Median elapsed | Expansion uses |
| --- | ---: | ---: | ---: | ---: |
| Full manifest + captured files | 15,828 | 15,853 | 0.02 ms | 0 |
| Selected JSON response | 17,796 | 17,796 | 4.26 ms | 0 |
| Selected Markdown response | 8,006 | 8,056 | 4.32 ms | 0 |
| Two-reference JSON expansion | 5,949 | 5,949 | 4.08 ms | 5 |
| Two-reference Markdown expansion | 4,520 | 4,522 | 4.10 ms | 5 |
| JSON selected + expansion | 23,745 | 23,745 | — | 5 |
| Markdown selected + expansion | 12,526 | 12,578 | — | 5 |

The run used snapshot
`014895e71530c9e621330cde2413e03f0256093135b4be4c270827695ee46f52` and five
samples per timed row. JSON is the canonical structured contract and includes
explicit section state, diagnostics, and identity fields; Markdown is a
separate presentation of the same resolved material. These payloads are not a
claim that either renderer is intrinsically better.

## Limitations

- Character counts are not model token counts; no tokenizer was used.
- One illustrative package and five local runs cannot establish a general
  context or productivity improvement.
- The full representation, JSON response, and Markdown response have different
  serializations, so the figures are observed payload sizes rather than an
  equal-payload compression comparison.
- The measurement excludes authoring, model, verification, browser review, and
  human-intervention time. It measures CLI/runtime output generation only.
- The fixture's accepted proposal and result records demonstrate package
  recovery semantics; they do not prove that the described exercise product was
  implemented, verified, reviewed, or integrated.
