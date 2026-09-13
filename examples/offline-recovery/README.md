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
