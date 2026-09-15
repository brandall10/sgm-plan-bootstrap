# Focused context measurement

This is a small local measurement of the `examples/offline-recovery` fixture,
not a productivity benchmark. It compares one matched phase/activity over five
ordinary sequential runs using the same local Node process and the same
temporary accepted snapshot.

## Method

The full representation is the JSON package manifest plus the text decoded
from all five captured fixture files. The selected representation is the exact
ready Markdown returned by:

```sh
npm run plan -- context --package examples/offline-recovery \
  --snapshot <snapshot-id> --phase phase.persistence-outcomes --activity implement
```

Expansion is measured separately with the same snapshot and the explicit refs
`reference.recovery-notes` and `asset.recovery-flow`. Character counts use
Unicode characters; elapsed time is local output-generation time. The full and
selected inputs represent the same accepted fixture content, while the
selected handoff leaves supporting material expandable.

## Latest sample

Measured 2026-09-15 on Apple M3 Max, macOS `darwin 27.0.0`, arm64, Node
`v26.7.0`, with the repository's local runtime and no dependency-installation
time included:

| Representation | Characters | Median elapsed | Expansion uses |
| --- | ---: | ---: | ---: |
| Full manifest + captured files | 15,828 | 0.02 ms | 0 |
| Selected `implement` handoff | 8,006 | 4.36 ms | 0 |
| Explicit two-reference expansion | 4,520 | 4.23 ms | 5 |

The run used snapshot
`014895e71530c9e621330cde2413e03f0256093135b4be4c270827695ee46f52` and five
samples per row. The selected output is shorter than the full representation
because supporting file text is not included until explicitly expanded.

## Limitations

- These are character counts, not model token counts; no tokenizer was used.
- One illustrative package and five local runs cannot establish a general
  context or productivity improvement.
- The measurement excludes authoring, model, verification, browser review, and
  human-intervention time. It measures CLI/runtime output generation only.
- The fixture's accepted proposal and result records demonstrate package
  recovery semantics; they do not prove that the described exercise product was
  implemented, verified, reviewed, or integrated.
