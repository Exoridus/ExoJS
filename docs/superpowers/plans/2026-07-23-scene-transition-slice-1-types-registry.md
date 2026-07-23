# Scene Transition/Lifecycle Redesign — Slice 1: Public Types & Registry Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the pure type-level foundation the other 7 slices of `.workspace/specs/2026-07-23-scene-transition-lifecycle-design.md` build on, with **zero navigation-behavior change**: `Scene<Data, AppLike>` + `ApplicationOf<T>` (§6.2) so project code can type `this.app` as its own `Application` subclass; `SceneRegistryShape<Registry>` / `SceneRegistration<C>` / `ConstructorOf<R>` (§6.1) so `ApplicationOptions.scenes` becomes a real, bidirectional, typed registry instead of a diagnostics-only `Record<string, AnySceneConstructor>`; `Application<Registry>` as a generic class; and a bidirectional (constructor ↔ key) registry index inside `SceneDirector`, stored but not yet consumed by any navigation method. `setScene()` / `restoreScene()` / `releaseScene()` keep their exact current signatures and behavior — every existing test in `scene-director.test.ts`, `scene.test.ts`, and `application.test.ts` must keep passing completely unmodified.

**Architecture:** Six tasks, ordered strictly by compile dependency (each task must leave the whole repo green before the next starts — there is a real ordering constraint here, not just a stylistic one, detailed below). `SceneTypes.ts` first gains the pure registry-shape types (`SceneRegistration`/`SceneRegistryShape`/`ConstructorOf`), which have no dependency on `Application`. Next, `SceneTypes.ts`'s `validateSceneRegistry()` is rewritten to accept the new descriptor form and return a bidirectional `SceneRegistryIndex` (`byConstructor`/`byKey`), and `SceneDirector` becomes `SceneDirector<Registry>` to store it — these two changes are inseparable (they're the only producer/consumer pair in the codebase) and land in one task. Only _then_ can `Application` become `Application<Registry>` (it needs `SceneDirector<Registry>` to already exist for its own `scenes` field type). Only _then_ can `SceneTypes.ts` add `ApplicationLike`/`ApplicationOf<T>` (they reference `Application<any>`, which doesn't type-check against a non-generic `Application`). Only _then_ can `Scene<Data, AppLike>` be added to `Scene.ts` (its default type parameter is `Application`, which must already accept a type argument). A final task exports everything from `src/core/index.ts`, regenerates the two root-export snapshot tests and the API docs, and runs the full verification gate.

**Tech Stack:** TypeScript (strict), Vitest. Builds on `origin/main @ b5aad1a3` (this worktree's base, includes PR #402/#403 — scene-pause flag separation, `onStateChange` coverage). Baseline: `pnpm test:core` green at 318 files / 5083 tests / 0 failures.

## Global Constraints

- Clean breaks only — no deprecated aliases, no shims (pre-1.0 policy). This slice is purely additive, though: every new generic parameter has a default that reproduces today's exact behavior for existing call sites, so nothing existing needs a migration in this slice.
- **No navigation-method changes.** `SceneDirector.setScene()`/`restoreScene()`/`releaseScene()` keep their exact current signatures, JSDoc, and behavior. Every pre-existing test in `test/core/scene-director.test.ts`, `test/core/scene.test.ts`, and `test/core/application.test.ts` must keep passing byte-for-byte unmodified — this plan only _adds_ tests to those files, it never edits an existing one.
- `SceneRegistration<C>`'s `transition` field is typed `unknown` for this slice, with a `// TODO(slice 6): SceneTransitionSelection` comment — Slice 6's own plan (`2026-07-23-scene-transition-slice-6-phase-composition-rendering.md`, Task 6) already greps for and replaces exactly this placeholder shape, so the comment text and field shape below must match verbatim.
- The bidirectional registry (`SceneRegistryIndex.byKey`) is stored but **not consumed by any public method yet** — reserved for Slice 3's key-based `change()`/`restore()`. Slice 3's own plan already anticipates Slice 1 may not name this exactly as it guessed (`.resolve(key)`) and explicitly instructs its own implementer to adapt to whatever Slice 1 actually shipped — so this plan is free to use the clearer `byConstructor`/`byKey` map pair (matching this slice's own brief: "storage/lookup needs to become bidirectional (key ↔ constructor)") without needing to match that guess.
- `Application<Registry extends SceneRegistryShape<Registry> = {}>` — the default is `{}`, exactly as specified in spec §6.1's own code block. (Slice 3's plan independently guessed `Record<string, never>` as a placeholder default while explicitly flagging it as an assumption to verify against Slice 1's real code — `{}` is correct per the authoritative spec and is what this plan uses throughout.)
- JSDoc conventions: see `[[feedback-jsdoc-conventions]]` memory — every public export gets a doc comment; `@internal` for engine-only surface.
- `pnpm docs:api:generate` must be run and committed before this slice is considered done (push-gated in this repo).
- Every task ends green on its own scoped test command before moving to the next.
- **Strict task ordering, not just convenience:** `SceneDirector` must become generic (Task 2) before `Application` can (Task 3) — `Application<Registry>`'s own `scenes: SceneDirector<Registry>` field requires the generic to already exist. `Application` must become generic (Task 3) before `ApplicationLike`/`ApplicationOf` are added (Task 4) — `ApplicationLike = Application<any> | ...` does not type-check against a non-generic class (verified: attempting this against a non-generic `Application` produces `error TS2315: Type 'Application' is not generic`). `ApplicationLike`/`ApplicationOf` must exist (Task 4) before `Scene<Data, AppLike>` is added (Task 5) — `Scene`'s second generic's default is `Application`, its constraint is `ApplicationLike`. Do not reorder these tasks.
- The `SceneTypes.ts` → `Application.ts` type import that `ApplicationLike`/`ApplicationOf` introduces (Task 4) creates a type-only cycle with `Application.ts`'s existing `SceneTypes.ts` import (for `AnySceneConstructor`/`InferSceneData`/`SceneRegistryShape`) — use `import type` for it. This project's madge-based cycle tooling already treats type-only cycles as fine (see `project-circular-deps-type-only` memory); Task 4's own steps include running `pnpm typecheck` specifically to confirm no cycle-related compile error.
- Every `any` this slice introduces (`ApplicationLike`/`ApplicationOf`, mirroring the spec's own §6.2 code exactly) gets an `eslint-disable`/`eslint-enable` block around it, matching the existing `AnySceneConstructor` line's `eslint-disable-next-line` convention one line further up in the same file.

---

## File Structure

```text
src/core/
├── SceneTypes.ts   (modified) — SceneRegistration<C>/SceneRegistryShape<Registry>/ConstructorOf<R> (Task 1);
│                                  SceneRegistryIndex, rewritten validateSceneRegistry(), updated
│                                  InvalidSceneRegistrationError message (Task 2); ApplicationLike/
│                                  ApplicationOf<T> (Task 4)
├── SceneDirector.ts (modified) — SceneDirector<Registry>, bidirectional _registry: SceneRegistryIndex,
│                                  two call-site updates (.byConstructor); no method signature changes (Task 2)
├── Application.ts    (modified) — ApplicationOptions<Registry>, Application<Registry>, scenes?: Registry
│                                   (descriptor form), SceneDirector<Registry> wiring (Task 3)
├── Scene.ts          (modified) — Scene<Data, AppLike>, ApplicationOf<AppLike>-typed `app` getter and `_app`
│                                   field, `_attach`'s internal cast (Task 5)
└── index.ts          (modified) — export the 5 new public types (Task 6)

test/core/
├── scene-types.test.ts                          (modified) — validateSceneRegistry direct unit tests (Task 2)
├── scene-director.test.ts                        (modified) — 3 new tests: descriptor-form registration,
│                                                    mixed-form duplicate detection, invalid descriptor (Task 2)
├── scene.test.ts                                 (modified) — 1 new test: app getter runtime-unaffected by a
│                                                    custom AppLike (Task 5)
└── __snapshots__/
    └── root-index-type-inventory.test.ts.snap    (regenerated — Task 6; root-index-snapshot.test.ts.snap is
                                                     NOT touched, see Task 6's reasoning)

test/type-tests/
├── scene-types.type-test.ts               (modified) — SceneRegistration/SceneRegistryShape/ConstructorOf
│                                             (Task 1); ApplicationLike/ApplicationOf in isolation (Task 4)
├── scene-director-registry.type-test.ts   (new) — SceneDirector<Registry> accepts bare/descriptor/mixed
│                                             registrations, rejects invalid ones (Task 2)
├── application-registry.type-test.ts      (new) — Application<Registry>/ApplicationOptions<Registry> wiring,
│                                             interface-as-explicit-type-argument, invalid-entry rejection (Task 3)
├── scene-app-typing.type-test.ts          (new) — Scene<Data, AppLike> in all 4 documented forms + the
│                                             cross-file self-referential anchor pattern (Task 5)
└── helpers/
    ├── scene-app-anchor-app.ts    (new) — the named-Application-subclass anchor (spec §6.2)
    └── scene-app-anchor-scene.ts  (new) — AppScene base class using `typeof app`

site/src/content/api/    (regenerated — Task 6, `pnpm docs:api:generate`)
```

---

## Task 1: `SceneTypes.ts` — `SceneRegistration`, `SceneRegistryShape`, `ConstructorOf`

**Files:**

- Modify: `src/core/SceneTypes.ts`
- Test: `test/type-tests/scene-types.type-test.ts`

**Interfaces:**

- Produces: `SceneRegistration<C extends AnySceneConstructor>`, `SceneRegistryShape<Registry>`, `ConstructorOf<R extends SceneRegistration<AnySceneConstructor>>`. Consumed by Task 2 (`SceneDirector`), Task 3 (`Application`).

Pure type additions, unused by anything else in the codebase yet — no runtime behavior, so no vitest test. This task ends on `pnpm typecheck` + `pnpm typecheck:type-tests` instead of a vitest run.

- [ ] **Step 1: Add the three types to `SceneTypes.ts`**

In `src/core/SceneTypes.ts`, insert immediately after the existing `InferSceneData` (currently the last line before the `FadeSceneTransition` interface):

```ts
/** Extracts the activation-data type a {@link SceneConstructor} expects. */
export type InferSceneData<C> = C extends SceneConstructor<infer Data> ? Data : never;

/**
 * A single `ApplicationOptions.scenes` registry entry: either a bare
 * {@link Scene} subclass constructor, or a descriptor pairing one with a
 * target-bound default transition. Both forms register identically —
 * `title: TitleScene` and `title: { scene: TitleScene }` are equivalent.
 */
export type SceneRegistration<C extends AnySceneConstructor> =
  | C
  | {
      readonly scene: C;
      /**
       * Default transition used whenever navigation targets this
       * constructor without its own call-site `transition` option (spec
       * §3.10).
       */
      // TODO(slice 6): SceneTransitionSelection
      readonly transition?: unknown;
    };

/**
 * Structural constraint for an `ApplicationOptions.scenes` registry: every
 * value must be a {@link SceneRegistration}. A mapped-type constraint, not
 * `Record<string, SceneRegistration<AnySceneConstructor>>` — `Record<K, V>`
 * requires an index signature to structurally match, which a plain
 * `interface GameScenes { title: typeof TitleScene; ... }` does not have (a
 * `type` alias with the identical shape happens to satisfy it, an
 * `interface` does not — confirmed against this project's TypeScript
 * version, `--strict`: "Index signature for type 'string' is missing"). The
 * public API must not depend on which of the two a caller wrote; a
 * mapped-type constraint accepts both.
 */
export type SceneRegistryShape<Registry> = {
  readonly [Key in keyof Registry]: SceneRegistration<AnySceneConstructor>;
};

/**
 * Extracts the {@link Scene} subclass constructor a {@link SceneRegistration}
 * resolves to — unwraps the descriptor form, passes a bare constructor
 * through unchanged.
 */
export type ConstructorOf<R extends SceneRegistration<AnySceneConstructor>> = R extends { scene: infer C } ? C : R;
```

(Leave everything else in the file untouched for this task — `FadeSceneTransition`, `SceneTransition`, `SetSceneOptions`, etc. all stay exactly as they are.)

- [ ] **Step 2: Add the failing type-test assertions**

In `test/type-tests/scene-types.type-test.ts`, change the import line:

```ts
import type { AnySceneConstructor, InferSceneData, SetSceneArgs } from '#core/SceneTypes';
```

to:

```ts
import type { AnySceneConstructor, ConstructorOf, InferSceneData, SceneRegistration, SceneRegistryShape, SetSceneArgs } from '#core/SceneTypes';
```

Then append, immediately before the file's final `export {};`:

```ts
// SceneRegistration / SceneRegistryShape / ConstructorOf
class RegGameScene extends Scene<GameData> {}

const _bareRegistration: SceneRegistration<typeof VoidScene> = VoidScene;
const _descriptorRegistration: SceneRegistration<typeof RegGameScene> = { scene: RegGameScene };
const _descriptorWithTransition: SceneRegistration<typeof RegGameScene> = { scene: RegGameScene, transition: 'placeholder' };

// A plain interface (no index signature) satisfies the mapped-type constraint.
interface GameScenesRegistry {
  readonly voidScene: typeof VoidScene;
  readonly gameScene: { readonly scene: typeof RegGameScene };
}
const _acceptsInterfaceRegistry: SceneRegistryShape<GameScenesRegistry> = {
  voidScene: VoidScene,
  gameScene: { scene: RegGameScene },
};

type BareCtorOf = ConstructorOf<typeof VoidScene>; // expect: typeof VoidScene
type DescriptorCtorOf = ConstructorOf<{ scene: typeof RegGameScene }>; // expect: typeof RegGameScene
const _bareCtorCheck: BareCtorOf = VoidScene;
const _descriptorCtorCheck: DescriptorCtorOf = RegGameScene;
```

- [ ] **Step 3: Run to verify it fails before Step 1's edit — confirm by temporarily reverting**

This step exists to prove the test actually exercises the new types (the skill's TDD discipline), not because the edit order is ambiguous — Step 1 must in fact be applied first for TypeScript to resolve `Scene`/`GameData`/`VoidScene` (already present in the file) against the new imports. Run:

Run: `pnpm typecheck:type-tests`
Expected (with Step 1 NOT yet applied): FAIL — `Module '"#core/SceneTypes"' has no exported member 'SceneRegistration'` (and similarly for `SceneRegistryShape`/`ConstructorOf`).

- [ ] **Step 4: Apply Step 1, then re-run**

Run: `pnpm typecheck:type-tests`
Expected: PASS.

- [ ] **Step 5: Full typecheck**

Run: `pnpm typecheck`
Expected: clean (these are pure, currently-unconsumed type additions — nothing else in `src/` references them yet, so this should be a trivial pass).

- [ ] **Step 6: Lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/core/SceneTypes.ts test/type-tests/scene-types.type-test.ts
git commit -m "feat(core): SceneRegistration/SceneRegistryShape/ConstructorOf (scene registry types)"
```

---

## Task 2: `SceneTypes.ts` (bidirectional registry) + `SceneDirector<Registry>`

**Files:**

- Modify: `src/core/SceneTypes.ts`
- Modify: `src/core/SceneDirector.ts`
- Test: `test/core/scene-types.test.ts`
- Test: `test/core/scene-director.test.ts`
- Test: `test/type-tests/scene-director-registry.type-test.ts` (new)

**Interfaces:**

- Consumes: `SceneRegistration<C>`, `SceneRegistryShape<Registry>` (Task 1).
- Produces: `SceneRegistryIndex` (`{ byConstructor: ReadonlyMap<AnySceneConstructor, string>; byKey: ReadonlyMap<string, AnySceneConstructor> }`, `@internal`), rewritten `validateSceneRegistry(scenes, sceneBase): SceneRegistryIndex`, `SceneDirector<Registry extends SceneRegistryShape<Registry> = {}>`. Consumed by Task 3 (`Application`).

These two files must land together: `validateSceneRegistry`'s return type is changing from `ReadonlyMap<AnySceneConstructor, string>` to `SceneRegistryIndex`, and `SceneDirector` is its only caller in the entire codebase — splitting this across two tasks would leave the repo non-compiling in between.

- [ ] **Step 1: Write the failing runtime tests for `validateSceneRegistry`**

In `test/core/scene-types.test.ts`, change the import line:

```ts
import { resolveSetSceneArgs } from '#core/SceneTypes';
```

to:

```ts
import { Scene } from '#core/Scene';
import { DuplicateSceneRegistrationError, InvalidSceneRegistrationError, resolveSetSceneArgs, validateSceneRegistry } from '#core/SceneTypes';
```

Then append a new `describe` block at the end of the file:

```ts
describe('validateSceneRegistry', () => {
  class VoidScene extends Scene {}
  class OtherScene extends Scene {}

  test('undefined input returns empty byConstructor/byKey maps', () => {
    const registry = validateSceneRegistry(undefined, Scene);

    expect(registry.byConstructor.size).toBe(0);
    expect(registry.byKey.size).toBe(0);
  });

  test('a bare-constructor entry populates both directions', () => {
    const registry = validateSceneRegistry({ title: VoidScene }, Scene);

    expect(registry.byConstructor.get(VoidScene)).toBe('title');
    expect(registry.byKey.get('title')).toBe(VoidScene);
  });

  test('a descriptor-form entry resolves to its scene constructor in both directions', () => {
    const registry = validateSceneRegistry({ game: { scene: OtherScene, transition: 'placeholder' } }, Scene);

    expect(registry.byConstructor.get(OtherScene)).toBe('game');
    expect(registry.byKey.get('game')).toBe(OtherScene);
  });

  test('bare and descriptor forms coexist in one registry', () => {
    const registry = validateSceneRegistry({ title: VoidScene, game: { scene: OtherScene } }, Scene);

    expect(registry.byKey.size).toBe(2);
    expect(registry.byConstructor.size).toBe(2);
  });

  test('rejects a duplicate constructor registered under two keys, even across mixed forms', () => {
    expect(() => validateSceneRegistry({ first: VoidScene, second: { scene: VoidScene } }, Scene)).toThrow(DuplicateSceneRegistrationError);
  });

  test('rejects a descriptor whose scene is not a Scene subclass', () => {
    class NotAScene {}

    expect(() => validateSceneRegistry({ bad: { scene: NotAScene as never } }, Scene)).toThrow(InvalidSceneRegistrationError);
  });

  test('rejects a value that is neither a constructor nor a { scene } descriptor', () => {
    expect(() => validateSceneRegistry({ bad: {} as never }, Scene)).toThrow(InvalidSceneRegistrationError);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/scene-types.test.ts`
Expected: FAIL — `registry.byConstructor` is `undefined` (the current `validateSceneRegistry` returns a bare `Map`, not `{ byConstructor, byKey }`).

- [ ] **Step 3: Rewrite `validateSceneRegistry` in `SceneTypes.ts`**

Replace the `InvalidSceneRegistrationError` class:

```ts
/**
 * Thrown (dev builds only) when `ApplicationOptions.scenes` contains a value
 * that is not a {@link Scene} subclass constructor.
 */
export class InvalidSceneRegistrationError extends Error {
  public readonly key: string;

  public constructor(key: string) {
    super(`ApplicationOptions.scenes["${key}"] must be a Scene subclass constructor.`);
    this.name = 'InvalidSceneRegistrationError';
    this.key = key;
  }
}
```

with:

```ts
/**
 * Thrown (dev builds only) when `ApplicationOptions.scenes` contains a value
 * that is not a {@link SceneRegistration} — neither a {@link Scene} subclass
 * constructor nor a `{ scene, transition? }` descriptor whose `scene` is one.
 */
export class InvalidSceneRegistrationError extends Error {
  public readonly key: string;

  public constructor(key: string) {
    super(`ApplicationOptions.scenes["${key}"] must be a Scene subclass constructor, or a { scene, transition? } descriptor whose scene is one.`);
    this.name = 'InvalidSceneRegistrationError';
    this.key = key;
  }
}
```

Then replace the entire `validateSceneRegistry` function (currently the last thing in the file):

```ts
/**
 * Validate and index an `ApplicationOptions.scenes` record: every value must
 * be a function whose prototype chain includes {@link Scene} (checked via
 * `prototype instanceof Scene` — deliberately never constructs an instance,
 * since construction may have user side effects), and no constructor may
 * appear under more than one key. Dev builds only; production builds skip
 * validation.
 * @internal
 */
export function validateSceneRegistry(
  scenes: Record<string, AnySceneConstructor> | undefined,
  sceneBase: typeof Scene,
): ReadonlyMap<AnySceneConstructor, string> {
  const registry = new Map<AnySceneConstructor, string>();

  if (scenes === undefined) {
    return registry;
  }

  for (const [key, ctor] of Object.entries(scenes)) {
    if (__DEV__ && !(typeof ctor === 'function' && ctor.prototype instanceof sceneBase)) {
      throw new InvalidSceneRegistrationError(key);
    }

    const existingKey = registry.get(ctor);

    if (__DEV__ && existingKey !== undefined) {
      throw new DuplicateSceneRegistrationError(ctor.name, [existingKey, key]);
    }

    registry.set(ctor, key);
  }

  return registry;
}
```

with:

```ts
/**
 * Bidirectional index built from `ApplicationOptions.scenes` by
 * {@link validateSceneRegistry}. `byConstructor` backs the existing
 * constructor-based navigation checks (`setScene`'s registration/diagnostics
 * lookups); `byKey` is reserved for key-based navigation — not consumed by
 * any navigation method yet.
 * @internal
 */
export interface SceneRegistryIndex {
  readonly byConstructor: ReadonlyMap<AnySceneConstructor, string>;
  readonly byKey: ReadonlyMap<string, AnySceneConstructor>;
}

const isSceneRegistrationDescriptor = (value: unknown): value is { scene: AnySceneConstructor; transition?: unknown } =>
  typeof value === 'object' && value !== null && 'scene' in value;

/**
 * Validate and index an `ApplicationOptions.scenes` record: every value must
 * be a {@link SceneRegistration} — a function whose prototype chain includes
 * {@link Scene} (checked via `prototype instanceof Scene` — deliberately
 * never constructs an instance, since construction may have user side
 * effects), or a `{ scene, transition? }` descriptor whose `scene` passes the
 * same check — and no resolved constructor may appear under more than one
 * key, in either form. Dev builds only; production builds skip validation.
 * @internal
 */
export function validateSceneRegistry(scenes: Record<string, SceneRegistration<AnySceneConstructor>> | undefined, sceneBase: typeof Scene): SceneRegistryIndex {
  const byConstructor = new Map<AnySceneConstructor, string>();
  const byKey = new Map<string, AnySceneConstructor>();

  if (scenes === undefined) {
    return { byConstructor, byKey };
  }

  for (const [key, registration] of Object.entries(scenes)) {
    const ctor = typeof registration === 'function' ? registration : isSceneRegistrationDescriptor(registration) ? registration.scene : undefined;

    if (__DEV__ && !(typeof ctor === 'function' && ctor.prototype instanceof sceneBase)) {
      throw new InvalidSceneRegistrationError(key);
    }

    const resolvedCtor = ctor as AnySceneConstructor;
    const existingKey = byConstructor.get(resolvedCtor);

    if (__DEV__ && existingKey !== undefined) {
      throw new DuplicateSceneRegistrationError(resolvedCtor.name, [existingKey, key]);
    }

    byConstructor.set(resolvedCtor, key);
    byKey.set(key, resolvedCtor);
  }

  return { byConstructor, byKey };
}
```

- [ ] **Step 4: Run the SceneTypes test — expect a new failure**

Run: `pnpm vitest run test/core/scene-types.test.ts`
Expected: PASS on its own (the function is now fixed) — but do NOT run the full suite yet; `SceneDirector.ts` still assigns the old return shape to `ReadonlyMap<AnySceneConstructor, string>`, so `pnpm typecheck` fails until Step 5 below is applied. This is expected and fine within this one task (Tasks are the unit of "must end green," not intermediate steps within a task).

- [ ] **Step 5: Update `SceneDirector.ts` — generic class, bidirectional field, two call sites**

Change the import block:

```ts
import {
  type AnySceneConstructor,
  ConcurrentSceneNavigationError,
  type InferSceneData,
  resolveSetSceneArgs,
  type RestoreSceneOptions,
  RetainedSceneConflictError,
  RetainedSceneNotFoundError,
  type SceneTransition,
  type SetSceneArgs,
  UnregisteredSceneError,
  validateSceneRegistry,
} from './SceneTypes';
```

to:

```ts
import {
  type AnySceneConstructor,
  ConcurrentSceneNavigationError,
  type InferSceneData,
  resolveSetSceneArgs,
  type RestoreSceneOptions,
  RetainedSceneConflictError,
  RetainedSceneNotFoundError,
  type SceneRegistryIndex,
  type SceneRegistryShape,
  type SceneTransition,
  type SetSceneArgs,
  UnregisteredSceneError,
  validateSceneRegistry,
} from './SceneTypes';
```

Change the class declaration and `_registry` field:

```ts
export class SceneDirector {
  private readonly _app: Application;
  private readonly _registry: ReadonlyMap<AnySceneConstructor, string>;
```

to:

```ts
export class SceneDirector<Registry extends SceneRegistryShape<Registry> = {}> {
  private readonly _app: Application;
  private readonly _registry: SceneRegistryIndex;
```

Change the constructor:

```ts
  public constructor(app: Application, scenes?: Record<string, AnySceneConstructor>) {
    this._app = app;
    this._registry = validateSceneRegistry(scenes, Scene);
  }
```

to:

```ts
  public constructor(app: Application, scenes?: Registry) {
    this._app = app;
    this._registry = validateSceneRegistry(scenes, Scene);
  }
```

Change the two `_registry` usages inside `setScene()`:

```ts
if (__DEV__ && !this._registry.has(target)) {
  throw new UnregisteredSceneError(target.name, [...this._registry.values()]);
}
```

to:

```ts
if (__DEV__ && !this._registry.byConstructor.has(target)) {
  throw new UnregisteredSceneError(target.name, [...this._registry.byConstructor.values()]);
}
```

Finally, add one sentence to the class-level JSDoc (currently starting `"Single-active-scene controller owned by {@link Application}. Holds at most one active {@link Scene} ..."`) — insert after the existing first paragraph, before the "There is no scene stack" paragraph:

```text
 * The `Registry` generic (inferred from `ApplicationOptions.scenes`, spec
 * §6.1) types the scene registry passed at construction. This class stores
 * it bidirectionally (`byConstructor`/`byKey`) for later use by key-based
 * navigation — no method here consumes `byKey` yet.
```

- [ ] **Step 6: Run scene-types.test.ts and scene-director.test.ts — confirm every pre-existing test still passes unmodified**

Run: `pnpm vitest run test/core/scene-types.test.ts test/core/scene-director.test.ts`
Expected: PASS — every test that existed before this task (constructor-only registrations, `UnregisteredSceneError`, `DuplicateSceneRegistrationError`, all `setScene`/`restoreScene`/`releaseScene` behavior) passes completely unchanged.

- [ ] **Step 7: Add the new descriptor-form / mixed-duplicate / invalid-descriptor tests to `scene-director.test.ts`**

Change the import line:

```ts
import {
  ConcurrentSceneNavigationError,
  DuplicateSceneRegistrationError,
  RetainedSceneConflictError,
  RetainedSceneNotFoundError,
  UnregisteredSceneError,
} from '#core/SceneTypes';
```

to:

```ts
import {
  ConcurrentSceneNavigationError,
  DuplicateSceneRegistrationError,
  InvalidSceneRegistrationError,
  RetainedSceneConflictError,
  RetainedSceneNotFoundError,
  UnregisteredSceneError,
} from '#core/SceneTypes';
```

Append a new `describe` block, right after the existing `'constructor throws DuplicateSceneRegistrationError naming both conflicting keys'` test:

```ts
describe('registry — descriptor form (spec §6.1)', () => {
  test('accepts a descriptor-form registration ({ scene, transition }) exactly like a bare constructor', async () => {
    const TestScene = makeSceneClass();
    const manager = new SceneDirector(createApplicationStub(), { test: { scene: TestScene, transition: 'placeholder' } });

    await expect(manager.setScene(TestScene)).resolves.toBe(manager);
  });

  test('rejects a duplicate constructor registered under two keys across mixed forms', () => {
    const DupScene = makeSceneClass();

    expect(() => new SceneDirector(createApplicationStub(), { first: DupScene, second: { scene: DupScene } })).toThrow(DuplicateSceneRegistrationError);
  });

  test('rejects an invalid descriptor whose scene is not a Scene subclass', () => {
    class NotAScene {}

    expect(() => new SceneDirector(createApplicationStub(), { bad: { scene: NotAScene as never } })).toThrow(InvalidSceneRegistrationError);
  });
});
```

- [ ] **Step 8: Run to verify the new tests pass**

Run: `pnpm vitest run test/core/scene-director.test.ts`
Expected: PASS.

- [ ] **Step 9: Add the type-test file for `SceneDirector<Registry>`**

Create `test/type-tests/scene-director-registry.type-test.ts`:

```ts
import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import { SceneDirector } from '#core/SceneDirector';

interface GameData {
  readonly level: number;
}

class VoidScene extends Scene {}
class GameScene extends Scene<GameData> {}
class NotAScene {}

declare const app: Application;

// Bare-constructor and descriptor-form registrations both type-check, alone and mixed.
new SceneDirector(app, { title: VoidScene });
new SceneDirector(app, { title: VoidScene, game: { scene: GameScene } });
new SceneDirector(app, { title: VoidScene, game: { scene: GameScene, transition: 'placeholder' } });

// No registry at all — Registry defaults to {}.
new SceneDirector(app);

// A plain interface (no index signature) is accepted as an explicit type argument.
interface GameScenesRegistry {
  readonly title: typeof VoidScene;
  readonly game: typeof GameScene;
}
new SceneDirector<GameScenesRegistry>(app, { title: VoidScene, game: GameScene });

// An entry that isn't a Scene subclass (bare or descriptor) is rejected at the type level.
// @ts-expect-error — NotAScene is not a Scene subclass constructor
new SceneDirector(app, { bad: NotAScene });
// @ts-expect-error — NotAScene is not a Scene subclass constructor
new SceneDirector(app, { bad: { scene: NotAScene } });

export {};
```

- [ ] **Step 10: Run the type-tests**

Run: `pnpm typecheck:type-tests`
Expected: PASS.

- [ ] **Step 11: Full typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 12: Run the full core suite (confirms nothing else in the codebase called `validateSceneRegistry` or relied on `SceneDirector`'s old non-generic declaration)**

Run: `pnpm test:core`
Expected: all green, count ≥ 5083 (baseline) + this task's new tests.

- [ ] **Step 13: Commit**

```bash
git add src/core/SceneTypes.ts src/core/SceneDirector.ts test/core/scene-types.test.ts test/core/scene-director.test.ts test/type-tests/scene-director-registry.type-test.ts
git commit -m "feat(core): bidirectional scene registry (SceneRegistryIndex), SceneDirector<Registry>

validateSceneRegistry() now accepts the { scene, transition? } descriptor
form alongside a bare constructor, and returns a bidirectional
byConstructor/byKey index instead of a one-way Map. SceneDirector becomes
generic over Registry to carry this typing — no navigation method's
signature or behavior changes; byKey is stored for a later slice's
key-based navigation and is not yet consumed anywhere."
```

---

## Task 3: `Application<Registry>`, `ApplicationOptions<Registry>`

**Files:**

- Modify: `src/core/Application.ts`
- Test: `test/type-tests/application-registry.type-test.ts` (new)

**Interfaces:**

- Consumes: `SceneRegistryShape<Registry>` (Task 1), `SceneDirector<Registry>` (Task 2).
- Produces: `Application<Registry extends SceneRegistryShape<Registry> = {}>`, `ApplicationOptions<Registry extends SceneRegistryShape<Registry> = {}>` with `scenes?: Registry`. Consumed by Task 4 (nothing directly), Task 5 (`Scene`'s `AppLike` default).

No new runtime test: `test/core/application.test.ts` fully mocks `SceneDirector` (see the file's own header comment — `setScene` is a plain `vi.fn()` that never validates a registry), so it cannot observe `Registry`-specific behavior either way; this is a pre-existing, documented characteristic of that test file, not something this task works around. The wiring is verified at the type level instead.

- [ ] **Step 1: Write the failing type-test**

Create `test/type-tests/application-registry.type-test.ts`:

```ts
import { Application } from '#core/Application';
import { Scene } from '#core/Scene';

class TitleScene extends Scene {}
interface GameData {
  readonly level: number;
}
class GameScene extends Scene<GameData> {}
class NotAScene {}

// Bare-constructor registry, inferred.
new Application({ scenes: { title: TitleScene } });

// Descriptor form, including the still-untyped `transition` placeholder.
new Application({
  scenes: {
    title: TitleScene,
    game: { scene: GameScene, transition: 'placeholder-until-slice-6' },
  },
});

// No `scenes` option at all — Registry defaults to {}.
new Application();
new Application({});

// A plain interface (no index signature) satisfies the registry constraint
// as an explicit class type argument (spec §6.1's own TypeScript-verified claim).
interface GameScenesRegistry {
  readonly title: typeof TitleScene;
  readonly game: typeof GameScene;
}
class TypedGameApplication extends Application<GameScenesRegistry> {}
declare const typedApp: TypedGameApplication;
void typedApp;

// An invalid entry (neither a Scene subclass constructor nor a valid
// descriptor) is rejected at the type level too, not just at runtime.
// @ts-expect-error — NotAScene is not a Scene subclass constructor
new Application({ scenes: { bad: NotAScene } });
// @ts-expect-error — NotAScene is not a Scene subclass constructor
new Application({ scenes: { bad: { scene: NotAScene } } });

export {};
```

Note: this file deliberately does not assert `typedApp.scenes`'s type against a concrete `SceneDirector<GameScenesRegistry>` via `expectTypeOf(...).toEqualTypeOf(...)` — at this slice, `Registry` is not yet used anywhere inside `SceneDirector`'s own member signatures (Slice 3 adds the first such use), so every `SceneDirector<X>` is currently structurally identical regardless of `X`; such an assertion would pass trivially even if `Registry` were silently dropped, and would not be a meaningful regression guard. The constructibility and invalid-entry-rejection checks above are the meaningful, regression-catching parts of this task's type-test.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm typecheck:type-tests`
Expected: FAIL — `Application` is not generic yet (`error TS2558` / `error TS2315`-class errors on `Application<GameScenesRegistry>`), and `scenes` is typed `Record<string, AnySceneConstructor>` so the descriptor form doesn't type-check.

- [ ] **Step 3: Update `Application.ts`**

Change the import line:

```ts
import type { AnySceneConstructor, InferSceneData, SetSceneArgs } from './SceneTypes';
```

to:

```ts
import type { AnySceneConstructor, InferSceneData, SceneRegistryShape, SetSceneArgs } from './SceneTypes';
```

Change the `ApplicationOptions` interface — its declaration line and the `scenes` field (leave every other field in the interface untouched):

```ts
export interface ApplicationOptions {
```

to:

```ts
export interface ApplicationOptions<Registry extends SceneRegistryShape<Registry> = {}> {
```

and:

```ts
  /**
   * Registry of navigable {@link Scene} constructors, keyed by a
   * diagnostics-only name (shown in {@link UnregisteredSceneError} messages
   * and duplicate-registration errors). Required for any
   * {@link Application.start} / {@link SceneDirector.setScene} call that
   * targets a constructor — unregistered targets reject in development
   * builds. Validated once at construction: every value must be a
   * {@link Scene} subclass constructor (checked without instantiating it),
   * and no constructor may appear under more than one key.
   */
  scenes?: Record<string, AnySceneConstructor>;
}
```

to:

```ts
  /**
   * Registry of navigable {@link Scene} constructors, keyed by a name used
   * for diagnostics (shown in {@link UnregisteredSceneError} messages and
   * duplicate-registration errors) and, in a later slice, key-based
   * navigation. Each value is either a bare {@link Scene} subclass
   * constructor, or a `{ scene, transition? }` descriptor pairing one with a
   * target-bound default transition — see {@link SceneRegistration}
   * (`transition`'s real type ships with the transition runtime; it is an
   * inert placeholder until then). Required for any {@link Application.start}
   * / {@link SceneDirector.setScene} call that targets a constructor —
   * unregistered targets reject in development builds. Validated once at
   * construction: every value must resolve to a {@link Scene} subclass
   * constructor (checked without instantiating it), and no constructor may
   * appear under more than one key.
   */
  scenes?: Registry;
}
```

Change the class declaration:

```ts
export class Application {
  public readonly options: ApplicationOptions;
```

to:

```ts
export class Application<Registry extends SceneRegistryShape<Registry> = {}> {
  public readonly options: ApplicationOptions<Registry>;
```

Change the `scenes` field:

```ts
  public readonly scenes: SceneDirector;
```

to:

```ts
  public readonly scenes: SceneDirector<Registry>;
```

Change the constructor signature:

```ts
  public constructor(appSettings: ApplicationOptions = {}) {
```

to:

```ts
  public constructor(appSettings: ApplicationOptions<Registry> = {}) {
```

Change the `SceneDirector` construction call:

```ts
this.scenes = new SceneDirector(this, appSettings.scenes);
```

to:

```ts
this.scenes = new SceneDirector<Registry>(this, appSettings.scenes);
```

Leave every other line of `Application.ts` — including both `start()` overloads, `AnySceneConstructor`'s other use there, and everything else in the 1260-line file — completely untouched.

- [ ] **Step 4: Run the type-test**

Run: `pnpm typecheck:type-tests`
Expected: PASS.

- [ ] **Step 5: Full typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Run `application.test.ts` and the full core suite**

Run: `pnpm vitest run test/core/application.test.ts`
Expected: PASS, unmodified (confirms the fully-mocked `SceneDirector` harness is unaffected by `Application` becoming generic).

Run: `pnpm test:core`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/core/Application.ts test/type-tests/application-registry.type-test.ts
git commit -m "feat(core): Application<Registry> generic, descriptor-form ApplicationOptions.scenes"
```

---

## Task 4: `SceneTypes.ts` — `ApplicationLike`, `ApplicationOf<T>`

**Files:**

- Modify: `src/core/SceneTypes.ts`
- Test: `test/type-tests/scene-types.type-test.ts`

**Interfaces:**

- Consumes: `Application<Registry>` (Task 3) — this is the reason this task cannot land before Task 3.
- Produces: `ApplicationLike`, `ApplicationOf<T extends ApplicationLike>`. Consumed by Task 5 (`Scene<Data, AppLike>`).

- [ ] **Step 1: Write the failing type-test**

In `test/type-tests/scene-types.type-test.ts`, change the imports:

```ts
import { Scene } from '#core/Scene';
import type { AnySceneConstructor, ConstructorOf, InferSceneData, SceneRegistration, SceneRegistryShape, SetSceneArgs } from '#core/SceneTypes';
```

to:

```ts
import { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import type {
  AnySceneConstructor,
  ApplicationLike,
  ApplicationOf,
  ConstructorOf,
  InferSceneData,
  SceneRegistration,
  SceneRegistryShape,
  SetSceneArgs,
} from '#core/SceneTypes';
```

Then append, before the final `export {};`:

```ts
// ApplicationLike / ApplicationOf, in isolation — Scene's own AppLike
// generic is exercised end-to-end in scene-app-typing.type-test.ts (Task 5).
class CustomApp extends Application {}

type FromInstance = ApplicationOf<CustomApp>;
type FromCtor = ApplicationOf<typeof CustomApp>;
declare const customAppInstance: CustomApp;
type FromTypeofInstance = ApplicationOf<typeof customAppInstance>;
type FromBase = ApplicationOf<Application>;

const _fromInstance: FromInstance = customAppInstance;
const _fromCtor: FromCtor = customAppInstance;
const _fromTypeofInstance: FromTypeofInstance = customAppInstance;
declare const baseApp: Application;
const _fromBase: FromBase = baseApp;

// A type not resolving to any Application shape is rejected by the constraint.
class NotAnApp {}
// @ts-expect-error — NotAnApp does not extend ApplicationLike
type _rejectsNonApp = ApplicationOf<NotAnApp>;
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm typecheck:type-tests`
Expected: FAIL — `ApplicationLike`/`ApplicationOf` are not exported yet.

- [ ] **Step 3: Add the two types to `SceneTypes.ts`**

Change the import block at the top of the file:

```ts
import type { Color } from './Color';
import type { Scene } from './Scene';
```

to:

```ts
import type { Application } from './Application';
import type { Color } from './Color';
import type { Scene } from './Scene';
```

Then insert, immediately after `ConstructorOf` (added in Task 1) and before the `FadeSceneTransition` interface:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any -- ApplicationLike/ApplicationOf must accept `Application<any>` and an abstract constructor's erased argument list; see spec §6.2. */
/**
 * Anything that resolves to a concrete {@link Application} instance type: the
 * instance itself, its constructor, or `typeof` an already-typed instance.
 * {@link Scene}'s second generic accepts any of the three — see
 * {@link ApplicationOf}.
 */
export type ApplicationLike = Application<any> | (abstract new (...args: any[]) => Application<any>);

/**
 * Normalizes an {@link ApplicationLike} to its concrete `Application`
 * instance type, letting {@link Scene}'s second generic accept an
 * `Application` instance type, its constructor, or `typeof someAppInstance`
 * interchangeably (spec §6.2).
 *
 * `typeof someAppInstance` only works once the instance already has an
 * explicit, non-inferred type — a fully-inferred `const app = new
 * Application({ scenes: {...} })` cannot be threaded through a
 * self-referential base-scene chain this way (confirmed: TS2506/TS7022 — the
 * inference cycle runs through the un-annotated `const`'s own initializer,
 * which ordinary lazy interface/type-alias resolution does not rescue).
 * Break the cycle with an explicit fixed point instead — a named
 * `Application` subclass with a hand-written registry type:
 *
 *   class GameApplication extends Application<GameScenes> {}
 *   export const app: GameApplication = new GameApplication({ scenes: {...} });
 *   // in a second module:
 *   export abstract class AppScene<Data = void> extends Scene<Data, typeof app> {}
 *
 * The cross-file `import type` this introduces is a type-only module cycle —
 * unproblematic, erased entirely at compile time.
 */
export type ApplicationOf<T extends ApplicationLike> = T extends abstract new (...args: any[]) => infer Instance
  ? Instance extends Application<any>
    ? Instance
    : never
  : T extends Application<any>
    ? T
    : never;
/* eslint-enable @typescript-eslint/no-explicit-any */
```

- [ ] **Step 4: Run the type-test**

Run: `pnpm typecheck:type-tests`
Expected: PASS.

- [ ] **Step 5: Full typecheck — confirm the type-only import cycle compiles cleanly**

Run: `pnpm typecheck`
Expected: clean. `SceneTypes.ts` now `import type`s from `Application.ts`, which already `import type`s `SceneRegistryShape` (and others) from `SceneTypes.ts` — a type-only cycle between the two files. Confirm there is no `error TS` output related to circular references; if there is, verify every import touched in this task uses `import type` (a value import would make the cycle load-bearing at runtime, which is the actual failure mode this constraint exists to avoid — this task introduces none).

- [ ] **Step 6: Lint**

Run: `pnpm lint`
Expected: clean (confirms the `eslint-disable`/`eslint-enable` block is correctly scoped — no leftover `no-explicit-any` warnings inside it, and no unused-disable warning if the rule wasn't actually about to fire outside the block).

- [ ] **Step 7: Commit**

```bash
git add src/core/SceneTypes.ts test/type-tests/scene-types.type-test.ts
git commit -m "feat(core): ApplicationLike/ApplicationOf<T> — typed this.app for a project-local Application subclass"
```

---

## Task 5: `Scene<Data, AppLike>`

**Files:**

- Modify: `src/core/Scene.ts`
- Test: `test/core/scene.test.ts`
- Test: `test/type-tests/scene-app-typing.type-test.ts` (new)
- Test: `test/type-tests/helpers/scene-app-anchor-app.ts` (new)
- Test: `test/type-tests/helpers/scene-app-anchor-scene.ts` (new)

**Interfaces:**

- Consumes: `ApplicationLike`, `ApplicationOf<T>` (Task 4).
- Produces: `Scene<Data = void, AppLike extends ApplicationLike = Application>`, `Scene.app: ApplicationOf<AppLike>`. This is the last of the 5 new public types/generics this slice adds — nothing later in this slice depends on it, but every later slice (2 onward) that touches `Scene.ts` depends on this generic parameter list already being in place.

Does **not** touch `Scene.onLoad`/`onUnload`/`onActivate`/`onSuspend` or any lifecycle hook (`load`/`init`/`update`/`fixedUpdate`/`draw`/`unload`/`destroy`) — those are Slice 2's job. This task only changes the generic parameter list, the `_app` field's type, the `app` getter's return type, and `_attach`'s body (not its parameter types).

- [ ] **Step 1: Write the failing runtime test**

In `test/core/scene.test.ts`, add one module-scope ambient declaration near the top of the file, right after the existing `class DummyDrawable extends Drawable {}` line:

```ts
// Ambient (erased at runtime) — exists only as a type argument for
// Scene<void, CustomApp> below. `declare class` is only legal at module
// scope, which is why this sits here rather than inside the describe block
// that uses it.
declare class CustomApp extends Application {}
```

Then append a new `describe` block right after the existing `describe('app accessor', ...)` block (after its closing `});` around line 189):

```ts
describe('app accessor with a project-specific AppLike (compile-time-only distinction)', () => {
  class CustomAppScene extends Scene<void, CustomApp> {}

  test('returns the same attached instance regardless of the declared AppLike generic', () => {
    const scene = new CustomAppScene();

    scene._attach(fakeApp, makeFakeScope());

    expect(scene.app).toBe(fakeApp);
  });
});
```

(`declare class CustomApp` produces no runtime code — it exists only as a type argument for `Scene<void, CustomApp>`; the test still constructs a real `CustomAppScene` and attaches the file's existing `fakeApp` stub, proving the getter's actual runtime behavior — return `this._app`, or throw before attachment — is unaffected by which `AppLike` a subclass declares. `declare class` is restricted to module/namespace scope in TypeScript — confirmed via `error TS1184: Modifiers cannot appear here` when attempted directly inside a block — hence its placement at the top of the file rather than inside the `describe` callback.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/scene.test.ts`
Expected: FAIL — `Scene` does not accept a second type argument yet (a TypeScript error surfaces here since this file is type-checked as part of the test run; if your runner only reports it via `pnpm typecheck`, run that too and expect the analogous error there).

- [ ] **Step 3: Update `Scene.ts`**

Change the import block — insert one new import line after `import type { SceneState } from './SceneState';` and before `import { deserializeInto, migrate, serializeTree } from './serialization/serialize';`:

```ts
import type { ApplicationLike, ApplicationOf } from './SceneTypes';
```

Change the class declaration:

```ts
export class Scene<Data = void> {
```

to:

```ts
export class Scene<Data = void, AppLike extends ApplicationLike = Application> {
```

Change the `_app` field:

```ts
  protected _app: Application | null = null;
```

to:

```ts
  protected _app: ApplicationOf<AppLike> | null = null;
```

Change the `app` getter:

```ts
  public get app(): Application {
    if (this._app === null) {
      throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
    }

    return this._app;
  }
```

to:

```ts
  public get app(): ApplicationOf<AppLike> {
    if (this._app === null) {
      throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
    }

    return this._app;
  }
```

Change `_attach`:

```ts
  /**
   * Attach this scene to `app` and its owning `scope`, making every
   * scene-bound facility getter resolve. Called once by `SceneScope` at the
   * start of activation.
   * @internal
   */
  public _attach(app: Application, scope: SceneScope<Data>): void {
    this._app = app;
    this._scope = scope;
  }
```

to:

```ts
  /**
   * Attach this scene to `app` and its owning `scope`, making every
   * scene-bound facility getter resolve. Called once by `SceneScope` at the
   * start of activation.
   *
   * `app`'s parameter type stays the bare {@link Application} (not
   * `AppLike`) because `SceneScope` — this method's only caller — is not
   * itself parametrized over `AppLike`. The cast below reflects a
   * construction invariant the framework guarantees (a scene is always
   * attached to the actual `Application` instance it runs under; `AppLike`
   * only names that instance's type more precisely for `this.app`'s
   * callers), not a real type hole.
   * @internal
   */
  public _attach(app: Application, scope: SceneScope<Data>): void {
    this._app = app as ApplicationOf<AppLike>;
    this._scope = scope;
  }
```

Finally, update the class-level JSDoc. Change:

```ts
/**
 * A scene's lifecycle host. Subclass to define scene behavior:
 *
 *   class GameScene extends Scene {
 *       override init(): void { ... }
 *       override update(delta: Time): void { ... }
 *       override draw(context: RenderingContext): void { ... }
 *   }
 *
 * `Data` is this scene's activation-data type — the value passed to
 * {@link Scene.load} and {@link Scene.init}. Scenes that need no activation
 * data use the default:
 *
 *   class TitleScene extends Scene { ... }
 *
 * A scene that needs typed data declares it through the generic:
 *
 *   interface GameData { readonly level: number; }
 *   class GameScene extends Scene<GameData> { ... }
 *
 * Scene-bound facilities ({@link Scene.systems}, {@link Scene.loader},
 * {@link Scene.inputs}, {@link Scene.interaction}, {@link Scene.tweens},
 * {@link Scene.audio}) are unavailable during construction and class-field
 * initialization — they become available once the scene is attached and
 * remain available through {@link Scene.load}, {@link Scene.init}, the frame
 * hooks, {@link Scene.unload}, and {@link Scene.destroy}.
 * @stable
 */
```

to:

```ts
/**
 * A scene's lifecycle host. Subclass to define scene behavior:
 *
 *   class GameScene extends Scene {
 *       override init(): void { ... }
 *       override update(delta: Time): void { ... }
 *       override draw(context: RenderingContext): void { ... }
 *   }
 *
 * `Data` is this scene's activation-data type — the value passed to
 * {@link Scene.load} and {@link Scene.init}. Scenes that need no activation
 * data use the default:
 *
 *   class TitleScene extends Scene { ... }
 *
 * A scene that needs typed data declares it through the generic:
 *
 *   interface GameData { readonly level: number; }
 *   class GameScene extends Scene<GameData> { ... }
 *
 * `AppLike` (second generic, default {@link Application}) types
 * {@link Scene.app} as the concrete {@link Application} subclass the scene
 * runs under, so a project's own `Application` members are visible inside
 * scene code, not just at the call site that constructs it:
 *
 *   class AppScene<Data = void> extends Scene<Data, GameApplication> {}
 *   class TitleScene extends AppScene { ... } // this.app: GameApplication
 *
 * For a project whose own base scene needs `typeof app` (an already-
 * constructed `Application` instance) rather than a named subclass, see
 * {@link ApplicationOf}'s doc for the explicit-fixed-point pattern required
 * to avoid an unresolvable inference cycle.
 *
 * Scene-bound facilities ({@link Scene.systems}, {@link Scene.loader},
 * {@link Scene.inputs}, {@link Scene.interaction}, {@link Scene.tweens},
 * {@link Scene.audio}) are unavailable during construction and class-field
 * initialization — they become available once the scene is attached and
 * remain available through {@link Scene.load}, {@link Scene.init}, the frame
 * hooks, {@link Scene.unload}, and {@link Scene.destroy}.
 * @stable
 */
```

- [ ] **Step 4: Run to verify the new test passes, and every pre-existing test in the file still passes unmodified**

Run: `pnpm vitest run test/core/scene.test.ts`
Expected: PASS — all pre-existing tests (the `app accessor` describe block above it, all facility-getter tests, the `root`/serialization tests) plus the one new test.

- [ ] **Step 5: Write the type-test helper files**

Create `test/type-tests/helpers/scene-app-anchor-app.ts`:

```ts
import { Application } from '#core/Application';

// The explicit-fixed-point anchor pattern from spec §6.2: a named
// `Application` subclass, constructed with an explicit type annotation,
// breaks the inference cycle a fully-inferred `const app = new
// Application(...)` cannot (confirmed: TS2506/TS7022 in an un-anchored
// version of this pattern).
export class GameApplication extends Application {}

export const app: GameApplication = new GameApplication();
```

Create `test/type-tests/helpers/scene-app-anchor-scene.ts`:

```ts
import { Scene } from '#core/Scene';

import type { app } from './scene-app-anchor-app';

// A project's own base scene, anchored to `typeof app` from a SEPARATE
// module — this is the cross-file type-only cycle the pattern relies on
// (this file needs `scene-app-anchor-app.ts`'s type; nothing there needs
// this file's).
export abstract class AppScene<Data = void> extends Scene<Data, typeof app> {}
```

- [ ] **Step 6: Write the failing type-test**

Create `test/type-tests/scene-app-typing.type-test.ts`:

```ts
import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';

import { GameApplication, type app } from './helpers/scene-app-anchor-app';
import { AppScene } from './helpers/scene-app-anchor-scene';

// Plain Scene (no AppLike) — this.app types as bare Application.
class PlainScene extends Scene {}
declare const plain: PlainScene;
const _plainAppCheck: Application = plain.app;

// Scene<Data, GameApplication> — direct instance-type form.
class DirectScene extends Scene<void, GameApplication> {}
declare const direct: DirectScene;
const _directAppCheck: GameApplication = direct.app;

// Scene<Data, typeof GameApplication> — constructor form.
class CtorFormScene extends Scene<void, typeof GameApplication> {}
declare const ctorForm: CtorFormScene;
const _ctorFormAppCheck: GameApplication = ctorForm.app;

// Scene<Data, typeof app> — direct typeof-instance form.
class DirectTypeofAppScene extends Scene<void, typeof app> {}
declare const directTypeofApp: DirectTypeofAppScene;
const _directTypeofAppCheck: GameApplication = directTypeofApp.app;

// The explicit-fixed-point anchor pattern (spec §6.2), via an intermediate
// AppScene base declared in yet another module — the exact cross-file
// type-only cycle the spec's TS2506/TS7022 finding says an un-anchored,
// fully-inferred `const app` cannot support.
class TitleScene extends AppScene {}
declare const title: TitleScene;
const _titleAppCheck: GameApplication = title.app;

export {};
```

- [ ] **Step 7: Run to verify it passes (this task's `Scene.ts` edit from Step 3 must already be applied for this to compile)**

Run: `pnpm typecheck:type-tests`
Expected: PASS.

- [ ] **Step 8: Full typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 9: Run the full core suite**

Run: `pnpm test:core`
Expected: all green — confirms nothing else in `src/`/`test/` constructs a `Scene` in a way incompatible with the new second generic (it has a default, so every existing `Scene`/`Scene<Data>` call site is unaffected).

- [ ] **Step 10: Commit**

```bash
git add src/core/Scene.ts test/core/scene.test.ts test/type-tests/scene-app-typing.type-test.ts test/type-tests/helpers/scene-app-anchor-app.ts test/type-tests/helpers/scene-app-anchor-scene.ts
git commit -m "feat(core): Scene<Data, AppLike> — typed this.app for a project-local Application subclass"
```

---

## Task 6: Root exports, snapshots, API docs, full verification

**Files:**

- Modify: `src/core/index.ts`
- Regenerate: `test/core/__snapshots__/root-index-type-inventory.test.ts.snap`
- Regenerate: `site/src/content/api/` (via `pnpm docs:api:generate`)

**Interfaces:** none new — this task only re-exports what Tasks 1–5 already produced, and runs the full verification gate.

- [ ] **Step 1: Export the 5 new public types from `src/core/index.ts`**

Change:

```ts
export type {
  AnySceneConstructor,
  FadeSceneTransition,
  InferSceneData,
  RestoreSceneOptions,
  SceneConstructor,
  SceneTransition,
  SetSceneArgs,
  SetSceneOptions,
} from './SceneTypes';
```

to:

```ts
export type {
  AnySceneConstructor,
  ApplicationLike,
  ApplicationOf,
  ConstructorOf,
  FadeSceneTransition,
  InferSceneData,
  RestoreSceneOptions,
  SceneConstructor,
  SceneRegistration,
  SceneRegistryShape,
  SceneTransition,
  SetSceneArgs,
  SetSceneOptions,
} from './SceneTypes';
```

(No change to the adjacent `export { ConcurrentSceneNavigationError, ... }` value-export block — this slice adds no new runtime-visible exports, only types.)

- [ ] **Step 2: Confirm the root runtime-export snapshot is unaffected**

Run: `pnpm vitest run test/core/root-index-snapshot.test.ts`
Expected: PASS with no snapshot diff — this test only sees runtime (value) bindings, and this slice added none (only types, which are erased). If it fails, something in this slice accidentally added a runtime export; investigate before proceeding rather than regenerating the snapshot to match.

- [ ] **Step 3: Regenerate the type-level export inventory snapshot**

Run: `pnpm exec vitest run root-index-type-inventory --updateSnapshot`
Expected: the snapshot file updates. Open the diff and confirm it adds exactly these 5 lines (alphabetically positioned) and nothing else:

```text
"ApplicationLike: type alias",
"ApplicationOf: type alias",
"ConstructorOf: type alias",
"SceneRegistration: type alias",
"SceneRegistryShape: type alias",
```

- [ ] **Step 4: Re-run both root-index tests to confirm they're green with the new snapshot committed**

Run: `pnpm vitest run test/core/root-index-snapshot.test.ts test/core/root-index-type-inventory.test.ts`
Expected: PASS.

- [ ] **Step 5: JSDoc conventions pass**

Re-read the `[[feedback-jsdoc-conventions]]` memory's style rules and diff every new/changed doc comment from Tasks 1–5 against it (tag order, `@internal` usage, `{@link}` cross-references, no noise `@param`/`@returns`). Fix inline if anything drifted.

- [ ] **Step 6: Full test suite**

Run: `pnpm test`
Expected: all pass, count ≥ 5083 (baseline) + every new test added across Tasks 1–5.

- [ ] **Step 7: Full typecheck (all projects)**

Run: `pnpm typecheck && pnpm typecheck:examples && pnpm typecheck:type-tests && pnpm typecheck:guides && pnpm typecheck:packages`
Expected: all clean. `typecheck:packages` matters here specifically — `packages/exojs-react` and others reference `Application`/`Scene`/`AnySceneConstructor` directly; this slice's repro-verified reasoning says none of them should break (every new generic has a default reproducing today's exact shape), but this step is where that gets confirmed against the real code rather than assumed.

- [ ] **Step 8: Full lint + format**

Run: `pnpm lint:all && pnpm format:check`
Expected: clean.

- [ ] **Step 9: Regenerate API docs**

Run: `pnpm docs:api:generate && pnpm docs:api:check`
Expected: generate exits 0; check reports in sync.

- [ ] **Step 10: Commit**

```bash
git add src/core/index.ts test/core/__snapshots__/root-index-type-inventory.test.ts.snap site/src/content/api/
git commit -m "docs: export scene-registry/AppLike types from package root; regenerate API docs"
```

---

## Self-Review Notes (from the plan-writing pass)

**Spec coverage check:** §6.1 (bidirectional registry, `SceneRegistration`/`SceneRegistryShape`/`ConstructorOf`, mapped-type-vs-`Record` distinction, interface-as-explicit-type-argument) — Tasks 1–3. §6.2 (`Scene<Data, AppLike>`/`ApplicationOf<T>`, the three accepted `AppLike` forms, the self-referential-anchor pattern and its TS2506/TS7022 finding) — Tasks 4–5, with the anchor pattern given a real cross-file type-test (`helpers/scene-app-anchor-app.ts` / `helpers/scene-app-anchor-scene.ts`), not just prose. The `transition` placeholder's exact shape (`unknown`, `// TODO(slice 6): SceneTransitionSelection`) — Task 1, cross-checked directly against Slice 6's own already-written plan (`2026-07-23-scene-transition-slice-6-phase-composition-rendering.md`, Task 6), which greps for and replaces exactly this shape. Everything else in the spec (§3.x transition runtime, §4 preload, §5 `unload`, §7 LoadingScene, §8 built-ins) is out of scope for Slice 1 per the orchestrator's own slice breakdown and is not touched here.

**Cross-slice consistency check (done by reading the other 7 slices' already-written plans in this worktree, all present under `docs/superpowers/plans/2026-07-23-scene-transition-slice-*.md`):** Slice 2 explicitly states it "does not touch the `Scene` generic parameter list or the `app` getter" — consistent with this plan's Task 5 leaving every lifecycle hook/signal alone. Slice 3 assumes `SceneDirector<Registry extends SceneRegistryShape<Registry> = Record<string, never>>` and a `.resolve(key)` method — both are that plan's own author's hedged guesses (explicitly flagged as "if Slice 1's real names differ, adapt"), not hard requirements; this plan uses the spec's actual `= {}` default and the clearer `byConstructor`/`byKey` map pair instead, which Slice 3's own instructions already account for. Slice 6's Task 6 greps for and replaces the exact `transition?: unknown` / `// TODO(slice 6): SceneTransitionSelection` shape this plan's Task 1 produces — verified to match verbatim, not just in spirit.

**Placeholder scan:** no `TBD`/`implement later`/"add appropriate handling"-style text anywhere in the tasks above; every step that changes code shows the complete before/after text, not a description of the change.

**Type consistency check:** `SceneRegistryIndex` (Task 2) is used identically in `SceneDirector.ts`'s field type and both call sites (`.byConstructor`); `SceneRegistration<C>`/`ConstructorOf<R>` (Task 1) use the exact same field name (`scene`) the real spec code and Slice 6's plan both use; `ApplicationOf<AppLike>` (Task 4) is used identically for `Scene`'s `_app` field, `app` getter return type, and `_attach`'s internal cast (Task 5) — no name drifted between where a type is produced and where it's consumed. `Application<Registry>`'s default (`= {}`) and `SceneDirector<Registry>`'s default (`= {}`) match each other and the spec exactly.

**Empirically verified during planning (not just reasoned about), via throwaway `tsc --noEmit --strict` repros against isolated snippets in the scratchpad directory — never against the real engine source, and no engine file was modified to produce these results:**

1. An `interface` with no index signature satisfies `Registry extends SceneRegistryShape<Registry>` as both an inferred argument and an explicit type argument.
2. A `Registry`-typed generic value is assignable to a plainly-typed `Record<string, SceneRegistration<AnySceneConstructor>>` parameter (this is why `validateSceneRegistry` itself stays non-generic — Task 2).
3. `Object.entries()` on an unconstrained generic `Registry` parameter loses its value type to `unknown` (confirmed this is why `SceneDirector`'s constructor delegates to the concretely-typed `validateSceneRegistry` rather than iterating `Registry` directly itself).
4. `ConstructorOf<R>`'s conditional-type extraction works for both the bare-constructor and descriptor-form arms.
5. The internal `_attach` cast (`app as ApplicationOf<AppLike>`) compiles without an intermediate `unknown` cast.
6. A subclass with a narrower `AppLike` (e.g. `Scene<GameData, GameApplication>`) is still assignable everywhere the engine passes a `Scene<Data>` value (e.g. into `SceneScope`'s constructor) — confirms Task 5 requires no change to `SceneScope.ts`.
7. `this` inside `Application<Registry>`'s own constructor, and an externally-held concrete `Application<SomeRegistry>` instance, are both still assignable to every existing bare-`Application`-typed parameter across the engine (`SceneDirector`, `InteractionManager`, etc.) — confirms Task 3 requires no changes anywhere outside `Application.ts` itself.
8. Against a _structurally trivial_ stand-in `Scene` class (no members), invalid-registry-entry rejection silently does not fire (everything is assignable to an empty type) — this was a real false negative caught during planning and corrected by re-testing against a `Scene` stand-in with real members before finalizing Task 3's and Task 2's `@ts-expect-error` assertions; the real engine `Scene` class has substantially more members than either stand-in, so the corrected (passing) result is the reliable one.
