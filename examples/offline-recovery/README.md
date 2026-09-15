# Offline recovery example

This is an illustrative Plan Package fixture. It describes persistence and
recovery behavior; it is not an implemented exercise application and its
prototype is not evidence of a working product.

The package is published by updating the digests in `plan.json` with:

```sh
npm run publish -- --package examples/offline-recovery
```

The package reader loads only the declared files and keeps the prototype's CSS
and JavaScript as candidate-scoped dependencies.

The W03 P4 recovery demonstration uses a temporary copy of this fixture. It
records a real accepted snapshot, an illustrative persistence-phase interface,
an obsolete verification result, and a repaired result that supersedes it.
The demonstration then removes governed draft files and recovers the pinned
snapshot, result history, and evidence through a fresh runtime and the
package-local CLI. These ignored records are test evidence for the package
workflow; they are not claims that the exercise product described here exists.
