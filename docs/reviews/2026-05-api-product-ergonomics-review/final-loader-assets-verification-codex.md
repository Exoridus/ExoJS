# Final Loader / Assets Verification Review

## 1. Executive verdict

Still has blocking correctness issues.

Previously reported blockers are fixed, but two new correctness gaps remain in the finalized design path:

1. `context.fetch*` + default `IndexedDbStore` is not operational because `__ctx_text`, `__ctx_binary`, `__ctx_json` stores are not created by default.
2. `unload(asset)` does not honor handler `getIdentityKey(config)` identity discrimination and can miss alias cleanup for config-sensitive identities.

## 2. Previously identified blockers

### 2.1 LoadingQueue progress

Status: Fixed.

Evidence:
- Unknown string asset type now notifies queue failure and settles progress (`src/resources/Loader.ts:998-1005`).
- Progress accounting logic remains correct (`src/resources/LoadingQueue.ts:51-66`).
- Regression tests cover unknown-type finalization and mixed success/failure (`test/resources/loader.test.ts:935-978`).

Verification result:
- `pending` reaches `0` on unknown type failure.
- `failed` increments.
- Mixed success/failure queues settle with `loaded + failed === total`.

### 2.2 Custom handler config forwarding

Status: Fixed.

Evidence:
- Runtime forwards full config (`source` + extra typed fields) into handler path (`src/resources/Loader.ts:1040-1042`, `1071-1073`).
- Handler registration type surface supports typed config (`src/resources/Loader.ts:266-281`).
- Tests confirm `format` arrives intact and is used (`test/resources/loader.test.ts:1148-1164`).

### 2.3 Alias / identity / unload

Status: Fixed for the intended normal-resource case.

Evidence:
- Alias/identity tracking and cleanup are implemented (`src/resources/Loader.ts:1050-1058`, `767-779`, `812-837`).
- Tests confirm:
  - shared fetch for dual aliases (`test/resources/loader.test.ts:1011-1025`),
  - both aliases retrievable pre-unload (`1027-1039`),
  - `unload(asset)` clears both aliases (`1059-1077`).

Important remaining edge case (blocking, see Section 3): custom `getIdentityKey` identities are not used by `unload(asset)`.

### 2.4 Reserved entries guard

Status: Fixed.

Evidence:
- Guard is explicit and clear (`src/resources/Assets.ts:26-30`).
- Runtime tests cover both reject/accept paths (`test/resources/loader.test.ts:1123-1138`).

## 3. Cache / IDB / handler verification

- normal fetch path:
  - `_fetch` uses factory namespace (`storageName`) and `key: path/source` (`src/resources/Loader.ts:1184-1192`).
  - This avoids alias-driven persistent-cache fragmentation.

- handler fetch path:
  - `context.fetchText/ArrayBuffer/Json` use dedicated storage names `__ctx_text`, `__ctx_binary`, `__ctx_json` (`src/resources/Loader.ts:1142-1147`).
  - `_contextFetch` uses `key: source` (`1173-1175`), matching the intended raw-payload cache keying.

- identityKey semantics:
  - `identityKey` is used for in-flight dedup and exposed to handler context (`src/resources/Loader.ts:1043-1048`, `1060-1102`, `1138-1142`).
  - It is not used as an IDB key.

- getIdentityKey semantics:
  - Config-sensitive discriminator is applied for identity (`src/resources/Loader.ts:1043-1047`).
  - Tests verify same source + different format separation (`test/resources/loader.test.ts:1274-1299`) and source-only dedup when absent (`1301-1318`).

- correctness assessment:
  - same URL, different parse formats: correct when `getIdentityKey` is provided.
  - same URL, same parse format: concurrent dedup is correct.
  - different URLs: isolated identities and cache keys as expected.

Blocking issues:
1. Default IDB schema does not include handler context stores.
- `IndexedDbStore` default stores omit `__ctx_text`, `__ctx_binary`, `__ctx_json` (`src/resources/IndexedDbStore.ts:40`).
- `IndexedDbDatabase` accesses stores by exact name (`src/resources/IndexedDbDatabase.ts:57-61`).
- Result: with default `IndexedDbStore`, handler `context.fetch*` cache path can fail on missing object store.

2. `unload(asset)` does not use `getIdentityKey` identity.
- `unload(asset)` builds identity from source only (`src/resources/Loader.ts:767`, `1478-1479`).
- For handler types whose identity discriminator includes extra config fields, alias-set lookup can miss, breaking “unload by identity” semantics.

Subtle limitation (non-blocking, by design):
- If handler output varies by config but handler does not encode that variation into `source` (for raw cache keys) and does not provide a matching `getIdentityKey`, cache/dedup behavior can be semantically wrong. This is documented by design expectations and is controllable by handler authors.

## 4. TypeScript / public API verification

- AssetDefinitions:
  - Open for declaration merging and used consistently by `AnyAssetConfig`/`InferAssetResource` (`src/resources/AssetDefinitions.ts:7-23`).

- Asset:
  - No alias field; identity-neutral typed config holder (`src/resources/Asset.ts:30-38`).
  - Typed constructor facade is correct (`40-45`).

- Assets:
  - Direct properties remain typed via facade intersection (`src/resources/Assets.ts:13-15`, `77-83`).
  - `.entries` preserves mapped typing (`9-11`, `23`, `51`).

- LoadingQueue:
  - Implements `PromiseLike<T>` and preserves result typing through `then/catch/finally` (`src/resources/LoadingQueue.ts:27`, `69-84`).

- loader overloads:
  - New and legacy overload families are present and coherently typed (`src/resources/Loader.ts:505-523`).
  - Homogeneous batch accepts `string | { source, ...extra }` (`src/resources/Loader.ts:104`, `523`) and runtime forwards per-item extra options (`600-606`), covered by tests (`test/resources/loader.test.ts:1323-1375`).

Type robustness conclusion:
- Public typing model is structurally sound and compiles cleanly (`npm run typecheck` passed).
- Dedicated compile-time assertion tests for inference behavior are still limited (see Section 5).

## 5. Test adequacy

- existing coverage:
  - Full suite passes: `1358` tests (`npm test`).
  - Loader stabilization coverage is strong for:
    - progress finalization,
    - alias identity/unload for normal source identity,
    - handler config forwarding,
    - `getIdentityKey` in-flight separation,
    - homogeneous batch object values.

- high-value missing tests:
1. Handler context fetch with real `IndexedDbStore` default schema:
- Assert `context.fetch*` works with default store configuration and does not fail due to missing `__ctx_*` stores.

2. `unload(asset)` with config-sensitive `getIdentityKey`:
- Load same source under different formats/aliases and assert unload removes aliases for the exact identity mapping semantics.

3. Explicit cache key/namespace assertion for handler helpers:
- Assert store calls use (`__ctx_text|__ctx_json|__ctx_binary`, `source`) and stay separated from normal factory namespaces.

4. Compile-time inference assertions:
- Add explicit TS assertion tests for `Assets` direct-property typing, `.entries` typing, and `LoadingQueue<T>` preservation through `Promise.all([...])` compositions.

## 6. Final recommendation

1. commit/release integration:
- Not ready yet. Resolve the two blocking correctness issues first (default IDB context stores + unload/getIdentityKey identity mismatch).

2. docs / guide / examples adaptation:
- Do after those fixes land. Current behavior would force docs to either hide or disclaim important parts of the handler cache/identity contract.
