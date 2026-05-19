# Post-Implementation Loader & Scene Input Review

## 1. Executive verdict

- Loader/assets API is **mostly implemented as designed** and the main happy paths work at runtime.
- Scene input refactor is **not aligned with the agreed target behavior**: `Scene.handleInput` is removed, but no scene-level replacement with propagation controls (`event.stopPropagation()`-style) exists.
- Recommendation: **Needs design reconsideration before proceeding**.

Blockers before moving on:
- Scene-level input propagation model is currently absent (no capture/passthrough/transparent semantics in runtime API).
- `LoadingQueue` progress accounting is incorrect for unresolved string asset types.
- `AssetDefinitions` extension typing suggests richer config support, but extra config fields are dropped at runtime.

## 2. Loader/assets API alignment

### 2.1 What matches the agreed spec

Confirmed in source/runtime:
- Existing API remains usable:
  - `loader.load(Type, path|paths|record)` still works and can be `await`ed (`src/resources/Loader.ts:411-413`, `420-500`).
  - `loader.get(Type, alias)` unchanged (`src/resources/Loader.ts:596-607`).
- Inline config map works:
  - `loader.load({ logo: { type: 'texture', source: '...' } })` is implemented (`src/resources/Loader.ts:502-517`) and aliases by object key.
- `Asset` works:
  - `loader.load(asset)` overload + runtime branch are implemented (`src/resources/Loader.ts:403`, `422-427`).
- `Assets` works:
  - typed container with direct properties + `.entries` exists (`src/resources/Assets.ts:21-45`, `70-77`), and `loader.load(assets)` is implemented (`src/resources/Loader.ts:404`, `430-446`).
- Spread merge pattern is supported because `.entries` values are `Asset` refs and config-map loading accepts `AssetInput` values (`src/resources/AssetDefinitions.ts:20`, `src/resources/Loader.ts:504-507`).
- Promise-like queue behavior works for `await` and `Promise.all` (`src/resources/LoadingQueue.ts:27-84`).

### 2.2 Deviations or ambiguities

- `LoadingQueue` progress bug on unknown string type:
  - In `_createLoadingQueue`, unknown type returns `Promise.reject(...)` without `queue._notifyItem(false)` (`src/resources/Loader.ts:836-841`).
  - Result: `progress.pending` can stay > 0 forever after rejection.
- `Assets` reserved-key collision:
  - A definition key named `entries` throws at runtime because `Object.defineProperty(this, 'entries', ...)` is created in the loop, then `this.entries = ...` writes to a read-only property (`src/resources/Assets.ts:36-45`).
- `unload(asset)` alias mismatch when same `Asset` was loaded through a keyed map/container:
  - `load({ logo: assetRef })` stores under alias `logo` (`src/resources/Loader.ts:504-507`, `844-845`),
  - but `unload(assetRef)` resolves alias from `asset._config.source` (`src/resources/Loader.ts:643-649`).
  - This is not load/unload-symmetric for mixed usage.

### 2.3 Alias/cache semantics

- Config-map and `Assets` keys become aliases (`src/resources/Loader.ts:432-441`, `504-514`), so `loader.get(Type, key)` works.
- `Asset` single-load alias is `source` path (`src/resources/Loader.ts:424-426`), same as prior `load(Type, path)` behavior.
- All overloads share the same `_resources` store and `_inFlight` dedupe keys (`src/resources/Loader.ts:138`, `141`, `765-790`, `1120-1139`), so this is one coherent registry.
- Existing alias-first identity semantics remain: same path under different aliases becomes separate cache keys (pre-existing behavior, not newly introduced).

## 3. TypeScript soundness

### 3.1 `Asset`

- Constructor inference path is sound for inline literals via facade signature (`src/resources/Asset.ts:39-43`).
- Runtime implementation is a casted constructor facade (`src/resources/Asset.ts:45`), which is acceptable but hides runtime validation gaps (invalid config can still be forced with `any`).

### 3.2 `Assets`

- Direct property inference is good (`src/resources/Assets.ts:12-14`, `70-75`).
- `.entries` preserves mapped resource types (`src/resources/Assets.ts:8-10`, `22`, `44`).
- Ergonomic/runtime pitfall: key `entries` is currently unusable and throws (`src/resources/Assets.ts:36-45`).

### 3.3 Inline config maps

- Inline object literals infer correctly in common usage.
- Named mutable config objects are prone to `type` widening (`string` vs literal), so `loader.load(namedObj)` can become cumbersome unless users apply `as const` / `satisfies`.
- Mixed maps (`Asset<T>` + config objects) are supported by type and runtime (`src/resources/AssetDefinitions.ts:20`, `src/resources/Loader.ts:504-507`).

### 3.4 `AssetDefinitions` extension model

- Declaration-merging surface exists (`src/resources/AssetDefinitions.ts:8-13`).
- `registerAssetType()` runtime hook exists (`src/resources/Loader.ts:202-210`).
- Critical mismatch: typed extra config fields are ignored at runtime for config-map/asset-based loading.
  - Loader only uses `_config.source` and never forwards additional config fields to factory options (`src/resources/Loader.ts:844`, `765-790`).

### 3.5 Type-risk summary

- Main type/runtime risks:
  - extension config fields appear supported by types but are dropped at runtime,
  - alias semantics for `unload(asset)` depend on how the asset was loaded,
  - named-object widening hurts ergonomics.

## 4. `LoadingQueue`

### 4.1 Promise/await/Promise.all behavior

- `LoadingQueue<T>` correctly implements `PromiseLike<T>` and provides `then/catch/finally` (`src/resources/LoadingQueue.ts:27-84`).
- `await loader.load(...)` and `Promise.all([loader.load(...), ...])` work.

### 4.2 Progress semantics

- Initial progress state is coherent (`loaded=0`, `pending=count`) (`src/resources/LoadingQueue.ts:36-42`).
- Progress updates per settled item (`src/resources/LoadingQueue.ts:51-66`).
- Cached assets are still counted as loaded items via completion callbacks in `load(...)` branches (`src/resources/Loader.ts:456-459`, `471-474`, `844-847`).

### 4.3 Error/cached/reload edge cases

- Known-ctor failures are counted; queue may reject before all items settle, then continue emitting progress updates as remaining items complete.
- Unknown string asset type failure is **not** counted (pending can remain non-zero permanently) due missing `_notifyItem(false)` path (`src/resources/Loader.ts:836-841`).
- No hanging-state guard exists for never-settling network promises (expected for bare promises, but worth documenting).

## 5. Unload semantics

Confirmed behavior:
- `unload(asset)` uses alias = `asset._config.source` (`src/resources/Loader.ts:643-649`).
- `unload(assetsContainer)` uses container keys as aliases (`src/resources/Loader.ts:654-663`).
- Raw config objects are intentionally not supported for unload (only `Asset`, `Assets`, or explicit `(type, alias)` overloads).

Ambiguities / risks:
- Not fully symmetric with load in mixed patterns:
  - if an `Asset` is loaded under a map key alias, `unload(asset)` does not unload that keyed alias.
- `unload(asset)`/`unload(assets)` silently no-op for unregistered type names (via missing `_assetTypeMap` lookup), which may mask configuration errors.

Recommended refinements:
- Decide and document one canonical alias source per `Asset` load path, or track reverse alias mapping for asset refs loaded through keyed maps.
- Consider explicit warning/throw when unloading typed assets whose type name has no registered constructor mapping.

## 6. Scene input propagation refactor

What changed:
- `Scene.handleInput` is removed from source API (`src/core/Scene.ts` has no input event hook).
- `SceneInputMode` (`capture|passthrough|transparent`) and `SceneInputEvent` are absent in source.
- `SceneParticipationPolicy` now only has `mode` (`src/core/Scene.ts:94-96`).
- `SceneManager` has no input-routing subscription/dispatch pipeline; only update/draw stack participation remains (`src/core/SceneManager.ts:356-385`).

Where `event.stopPropagation()` now lives:
- Only in node-level interaction bubbling (`InteractionEvent.stopPropagation`) for `InteractionManager`/`RenderNode` pointer events (`src/input/InteractionEvent.ts:13-18`, `45-47`).
- There is no scene-level input event object with propagation controls.

Overlay/capture/transparent semantics:
- `overlay/modal/opaque` still govern update/draw participation.
- `capture/passthrough/transparent` scene-level input semantics are no longer present in runtime API.

Docs/tests impact:
- Major docs drift: API and guide pages still describe `handleInput`, `SceneInputMode`, and `input` push options.
  - `site/src/content/api/scene.mdx:44-56`
  - `site/src/content/api/scene-manager.mdx:3`, `29-32`
  - `site/src/content/guide/core-concepts/scene-lifecycle.mdx:30-33`, `115-140`
  - `site/src/content/guide/core-concepts/scenes.mdx:91`
  - `site/src/content/guide/recipes/pause-menu.mdx:14`, `29-31`, `73-77`
  - `site/src/content/guide/recipes/hud-overlay.mdx:18`, `61-67`
  - `site/src/content/guide/recipes/cinematics.mdx:18`, `112-119`
- Tests no longer cover scene-level input propagation semantics; only stack update/draw behavior is tested (`test/core/scene-manager.test.ts`).

Capability regression assessment:
- This is a regression vs the previous scene-level routing model unless explicitly replaced elsewhere.
- Current model is not “strictly cleaner” yet because the promised scene-level explicit propagation API is not present.

## 7. Missing tests / missing docs / next cleanup

Prioritized missing tests:
1. Loader config-map and `Assets` API runtime tests:
- `load(Asset)`, `load(Assets)`, `load(configMap)` alias behavior + `get(...)` coherence.
- Spread merge with `.entries` and mixed `Asset`+config maps.
2. LoadingQueue behavior tests:
- Progress lifecycle for success/failure/cached items.
- Unknown type path should increment `failed` and reach `pending=0`.
- `then/catch/finally` and `Promise.all` interop coverage.
3. Unload symmetry tests:
- `unload(asset)` after keyed-map load of same asset ref.
- `unload(assetsContainer)` coherence with keyed aliases.
4. Type tests:
- Inference for `new Asset(...)`, `new Assets(...)`, `.entries`, inline config maps.
- Named-object widening guidance (`as const` / `satisfies`).
- Declaration-merging extension sample that validates `registerAssetType` + custom type load path.
5. Scene input tests:
- If scene-level routing is intended: propagation stop/continue, capture semantics, transparent semantics.
- If removed intentionally: add migration tests/docs asserting the new canonical approach.

Missing docs cleanup:
- Update/remove all `handleInput`/`inputMode`/`pushScene(..., { input })` references.
- Add docs for `Asset`, `Assets`, `AssetDefinitions`, `LoadingQueue`, `registerAssetType`, and new `Loader.load`/`unload` overloads.
- Update Loader API docs to show return type `LoadingQueue<T>` (not `Promise<T>`).

## 8. Final recommendation

**Needs design reconsideration before proceeding**.

Rationale:
- Loader/assets implementation is close, but has a few concrete correctness/ergonomic issues.
- Scene input refactor currently removes an existing capability without delivering the agreed replacement model, and docs/tests are still aligned to the old semantics.
