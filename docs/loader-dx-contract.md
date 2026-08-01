# Loader diagnostics and release contract

`loader.inspect()` returns a detached, sorted and frozen snapshot of currently claimed assets. It is intended for diagnostics, support bundles, and developer tooling; mutating it never changes residency.

Each row reports the normalized key, constructor token, source, state, claim count (distinct claim scopes, not handle/`get()` call count), in-flight status, and whether the request is still queued in the background lane — `background` is always in lockstep with `state === 'queued'`, never `true` on an already-settled `'ready'`/`'failed'` row.

`loader.release(object)` now rejects an object with no claim identity — anything that isn't a descriptor, a materialized catalog leaf/catalog, an adopted handle, or the `(type, source)` overload — instead of silently doing nothing. Releasing a valid form with no active claim (a never-adopted catalog leaf, an unclaimed key) is still idempotent.

A catalog `parse` callback is synchronous in ExoJS 0.16. Returning a Promise or another thenable fails that `AssetRef` with an actionable error; asynchronous decoding belongs in the registered asset handler's load phase.
