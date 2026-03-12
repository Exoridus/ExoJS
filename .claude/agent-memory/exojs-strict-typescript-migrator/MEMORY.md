# ExoJS Strict TypeScript Migrator — Memory

## Type System Conventions

- Signal uses tuple-based generics: `Signal<Args extends Array<unknown> = []>`. The default `[]` means no-arg signals.
- `Signal<[]>` (zero-arg) is used for media events (onStart/onStop). This is intentional.
- `context?: object` on Signal/Input is a known weak typing issue — see Nullability Rules below.
- All factory classes use concrete option types locally (e.g. `ITextureFactoryOptions`), but the base interface/abstract class uses `options?: object | null`. This is the primary `object` debt.

## Public API Type Constraints

- `IResourceFactory<SourceValue, TargetValue>` — `create(source, options?: object | null)` must stay
  structurally compatible across all factory subclasses. Cannot simply narrow to generic `Options` without
  also adding a third generic parameter and updating all callers. This is a medium-complexity change.
- `IResourceQueueItem.options?: object` and `Loader.add(options?: object)` are the consumer-facing entry
  points for the `options` propagation chain. Narrowing requires either a generic Loader or discriminated
  per-type loading.
- `ResourceContainer.getResources()` returns `Map<string, unknown>` (internal alias `ResourceMap`). The
  public `get<K>()` correctly narrows via `IResourceTypeMap[K]`. The internal `Map<string, unknown>` is
  acceptable but slightly leaky via the public `resources` getter.

## Nullability Rules

- `context?: object` is the established `this`-binding slot on Signal. Its purpose is identity comparison,
  not typed access of the object's members. `object` is technically correct (excludes primitives) but
  `Record<string, unknown>` would be more conventional. No members of context are accessed — only reference
  equality is used. The right fix is to introduce a type alias: `type SignalContext = object` or narrow to
  `NonNullable<object>`. No semantic change needed.
- `_audioContext!.currentTime` non-null assertions in Music/Sound/Video are in methods gated by `_gainNode`
  being non-null. When `_gainNode` is set, `_audioContext` is also set. This invariant should be codified.
- `this._database!` in IndexedDbDatabase.getObjectStore is safe because `connect()` is always awaited
  before use. This could be improved with a narrower return-path type.
- `Pointer._canvas!` is set in constructor and only nulled in `destroy()`. Post-destroy calls are
  UB anyway. The assertion is defensible but could be eliminated with non-nullable field + lifecycle clarity.

## Known Strictness Blockers

- `options?: object` across `IResourceFactory`, `AbstractResourceFactory`, `IResourceQueueItem`, and
  `Loader.add` forms a coupled chain. Narrowing all four at once without breaking `FontFactory`
  (which requires `options: IFontFactoryOptions` — not optional!) is the main structural challenge.
  - FontFactory currently violates the base interface contract: base says optional, FontFactory requires it.
  - Proper fix: add a third generic param `Options = object | null` to IResourceFactory.
- `AudioAnalyser.ts` uses `as any` on Uint8Array/Float32Array passed to AnalyserNode methods because
  TypeScript 5.x DOM lib changed signatures to `Uint8Array<ArrayBuffer>` / `Float32Array<ArrayBuffer>`.
  The code's typed arrays are `Uint8Array` / `Float32Array` without the generic. Fix: declare fields as
  `Uint8Array<ArrayBuffer>` and `Float32Array<ArrayBuffer>`.
- `RenderManager.ts` uses `args: any` on three debug/logging functions (`logGlCall`,
  `validateNoneOfTheArgsAreUndefined`, `logAndValidate`). These consume the `webgl-debug` vendor library
  which has no types. Fix: narrow to `IArguments | ArrayLike<unknown>` or a local type alias.
- `Signal.bindings` is `public readonly` but the array content is mutable (consumers can push/splice).
  Should be `ReadonlyArray<ISignalBinding<Args>>` for consumers, or the getter should return a readonly view.

## Declaration Compatibility Notes

- tsconfig has `strict: true`. No additional strictness flags need to be enabled — the project is already
  on maximum standard strictness. Remaining issues are code-level, not compiler-flag-level.
- `skipLibCheck: true` — means vendor type problems are suppressed. The `as any` in AudioAnalyser
  may be hiding a real lib version mismatch that skipLibCheck papers over.
- `target: es2020`, `lib: ["es2020", "dom", "dom.iterable"]` — typed arrays without generic param
  (e.g. plain `Uint8Array`) are the pre-ES2024 form; newer DOM lib changed to `Uint8Array<ArrayBuffer>`.
