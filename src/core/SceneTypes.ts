import type { Application } from './Application';
import type { Color } from './Color';
import type { Scene } from './Scene';

/**
 * Zero-argument constructor for a {@link Scene} subclass. `Data` is the
 * activation-data type this scene expects, inferred at navigation call
 * sites via {@link InferSceneData}.
 */
export type SceneConstructor<Data = void> = new () => Scene<Data>;

/**
 * A {@link SceneConstructor} for any activation-data type — used for registry
 * storage and navigation targets whose `Data` is not statically known.
 *
 * Union of the `void` and `any` instantiations, not just `SceneConstructor<any>`
 * alone: `Scene.load`/`Scene.init` take their data parameter as `Readonly<Data>`,
 * and TypeScript's structural check for a construct signature's return type does
 * not collapse `Readonly<any>` against a concrete subclass's `Readonly<void>`
 * parameter once that subclass has any of its own members (true of virtually
 * every real scene) — `SceneConstructor<any>` alone then silently rejects the
 * single most common case, a plain `Scene` (`Data = void`) subclass. Including
 * the `void` arm explicitly gives every void-data scene an exact-match branch,
 * while `any` still covers every data-carrying scene.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately erases Data for heterogeneous registry storage; see spec §6.3.
export type AnySceneConstructor = SceneConstructor | SceneConstructor<any>;

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

/** Every string key registered in a `SceneRegistryShape` — the type of a valid `change()`/`restore()` key-based navigation target. */
export type RegistryKeyOf<Registry> = Extract<keyof Registry, string>;

/**
 * Extracts the {@link Scene} subclass constructor a {@link SceneRegistration}
 * resolves to — unwraps the descriptor form, passes a bare constructor
 * through unchanged.
 */
export type ConstructorOf<R extends SceneRegistration<AnySceneConstructor>> = R extends { scene: infer C } ? C : R;

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

/**
 * Fade-to-color scene transition. The screen fades to `color` (default black)
 * over `duration` ms (default 220), the scene change happens at full
 * opacity, then the screen fades back in.
 */
export interface FadeSceneTransition {
  type: 'fade';
  duration?: number;
  color?: Color;
}

/** Discriminated union of supported {@link SceneDirector} transitions. */
export type SceneTransition = FadeSceneTransition;

/**
 * Options for {@link SceneDirector.change}. This is an intermediate shape —
 * the spec's final shape (definition §6.3) also carries a `transition`
 * field accepting a `SceneTransitionSelection` (a class-based
 * `SceneTransition`/`PhasedSceneTransition`, or an `{ enter, exit }` pair).
 * That lands in Slice 5, once the real transition-runtime types exist. A
 * caller who still needs today's hardcoded fade machinery in the meantime
 * uses the bridge documented on {@link SceneDirector.change} itself, not
 * this type — `transition` is deliberately not part of this shape yet.
 */
export type ChangeSceneOptions<Data> = ([Data] extends [void] ? { data?: never } : { data: Readonly<Data> }) & {
  /**
   * Suspend the outgoing scene instead of ending it permanently, retaining
   * it (keyed by its constructor) for a later {@link SceneDirector.restore}
   * call. The same scene instance and its state are preserved; `load()`/
   * `init()` do not re-run on restore. Replaces the old `retainCurrent`
   * name — same meaning, renamed to match the public state it produces
   * ({@link SceneState.Suspended}).
   */
  suspendCurrent?: boolean;
};

/**
 * Tuple type for `change()`'s single options parameter: present-and-required
 * whenever `ChangeSceneOptions<Data>` has a required `data` field (`Data`
 * is not `void`), optional otherwise. There is no runtime data/options
 * ambiguity to resolve anymore — `data` always lives inside this one
 * object, never as a separate positional argument (spec §6.3; this
 * supersedes the deleted two-argument `SetSceneArgs`).
 */
export type ChangeSceneArgs<Data> = [Data] extends [void] ? [options?: ChangeSceneOptions<Data>] : [options: ChangeSceneOptions<Data>];

/**
 * Options for {@link SceneDirector.restore}. No `data` field — a restored
 * scope reuses whatever activation data it was originally prepared with;
 * `load()`/`init()` never run again for it (definition §14.3).
 */
export interface RestoreSceneOptions {
  /** Suspend the currently active scene (if any) instead of ending it permanently — mirrors {@link ChangeSceneOptions.suspendCurrent}. */
  suspendCurrent?: boolean;
}

/** Which kind of scene activation a disambiguating {@link SceneDirector.unload} call targets. */
export type SceneInstanceKind = 'active' | 'retained' | 'preloaded';

/** Options passed to {@link SceneDirector.unload}. */
export interface UnloadOptions {
  /**
   * Only materializes for an active-scope match — a retained or preloaded
   * match has nothing visible on screen to transition, and always runs the
   * direct (non-transitioned) teardown path regardless of this option.
   */
  transition?: SceneTransition;
  /**
   * Disambiguates which candidate to discard when more than one exists for
   * the same constructor (active, retained, and/or preloaded can all
   * coexist). Omit only when exactly one candidate exists — `'all'` discards
   * every one that does.
   */
  instance?: SceneInstanceKind | 'all';
}

/**
 * Options passed to {@link SceneDirector.preload}. Unlike
 * {@link ChangeSceneOptions}, there is no `transition`/`suspendCurrent` —
 * preloading never touches the active scope or visibly transitions anything.
 */
export type PreloadOptions<Data> = [Data] extends [void] ? { data?: never } : { data: Readonly<Data> };

/**
 * Tuple type for the variadic tail of `preload()` calls, after the target
 * constructor — mirrors {@link ChangeSceneArgs}'s conditional-arity trick:
 * when `Data` is `void` the options argument itself is optional (nothing to
 * supply), otherwise it's required so a data-carrying scene can't be
 * preloaded without its data.
 */
export type PreloadArgs<Data> = [Data] extends [void] ? [options?: PreloadOptions<Data>] : [options: PreloadOptions<Data>];

/**
 * Resolve the erased-at-runtime options tail of a `preload()` call. Simpler
 * than `change()`'s data-vs-options disambiguation — `preload()` only ever
 * takes zero or one argument, always an options object, never a bare data
 * value.
 * @internal
 */
export function resolvePreloadArgs(args: readonly unknown[]): { data: unknown } {
  const options = args[0] as { data?: unknown } | undefined;

  return { data: options?.data };
}

/**
 * @internal Temporary bridge, removed by Slice 5 once `SceneTransition`
 * becomes the real class-based union (spec §3.2) and a `transition` field
 * is added to {@link ChangeSceneOptions} directly (spec §6.3). Until then,
 * `SceneDirector.change()` still accepts today's hardcoded-fade-shaped
 * `transition` option and routes it through the existing fade machinery
 * unchanged — this type is that call boundary's actual (wider) parameter
 * type. Deliberately not re-exported from the package root: a new caller
 * should not discover `transition` as supported input via this slice's
 * public types.
 */
export type ChangeSceneCallOptions<Data> = ChangeSceneOptions<Data> & { transition?: SceneTransition };

/** @internal Bridge counterpart of {@link ChangeSceneCallOptions} for {@link SceneDirector.restore}. See its doc comment for the full rationale. */
export type RestoreSceneCallOptions = RestoreSceneOptions & { transition?: SceneTransition };

/**
 * Thrown (dev builds only) when `ApplicationOptions.scenes` registers the
 * same constructor under more than one key.
 */
export class DuplicateSceneRegistrationError extends Error {
  public readonly constructorName: string;
  public readonly keys: readonly [string, string];

  public constructor(constructorName: string, keys: readonly [string, string]) {
    super(
      `Scene constructor "${constructorName}" is registered under more than one key in ApplicationOptions.scenes: "${keys[0]}" and "${keys[1]}". Each scene constructor may be registered only once.`,
    );
    this.name = 'DuplicateSceneRegistrationError';
    this.constructorName = constructorName;
    this.keys = keys;
  }
}

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

/**
 * Thrown (dev builds only) when navigating to a constructor that is not
 * present in `ApplicationOptions.scenes`.
 */
export class UnregisteredSceneError extends Error {
  public readonly constructorName: string;
  public readonly registeredNames: readonly string[];

  public constructor(constructorName: string, registeredNames: readonly string[]) {
    const list = registeredNames.length > 0 ? registeredNames.join(', ') : '(none)';

    super(`Scene constructor "${constructorName}" is not registered in ApplicationOptions.scenes. Registered scenes: ${list}.`);
    this.name = 'UnregisteredSceneError';
    this.constructorName = constructorName;
    this.registeredNames = registeredNames;
  }
}

/**
 * Thrown when `change`/`restore` is called while another Scene
 * switch, restore, or fade transition is already in flight — navigation
 * never queues (definition §11.5).
 */
export class ConcurrentSceneNavigationError extends Error {
  public constructor() {
    super(
      'A Scene switch or transition is already in progress. Concurrent navigation is not supported — await the in-flight operation before starting another.',
    );
    this.name = 'ConcurrentSceneNavigationError';
  }
}

/**
 * Thrown when `change` targets a constructor that already has a retained
 * (suspended) Scene. Call {@link SceneDirector.restore} or
 * {@link SceneDirector.unload} for it first.
 */
export class RetainedSceneConflictError extends Error {
  public readonly constructorName: string;

  public constructor(constructorName: string) {
    super(
      `Scene constructor "${constructorName}" already has a retained (suspended) instance. Call restore(...) or unload(...) for it before starting a fresh activation.`,
    );
    this.name = 'RetainedSceneConflictError';
    this.constructorName = constructorName;
  }
}

/**
 * Thrown when `restore` targets a constructor with no retained
 * (suspended) Scene.
 */
export class RetainedSceneNotFoundError extends Error {
  public readonly constructorName: string;

  public constructor(constructorName: string) {
    super(`Scene constructor "${constructorName}" has no retained (suspended) instance to restore.`);
    this.name = 'RetainedSceneNotFoundError';
    this.constructorName = constructorName;
  }
}

/**
 * Thrown when `unload(Target)` is called with `options.instance` omitted
 * while more than one activation (active, retained, and/or preloaded)
 * exists for `Target` — there is no priority order; the caller must specify
 * which one via `{ instance: 'active' | 'retained' | 'preloaded' }`, or
 * `{ instance: 'all' }` to discard every one.
 */
export class AmbiguousSceneInstanceError extends Error {
  public readonly constructorName: string;
  public readonly candidates: readonly SceneInstanceKind[];

  public constructor(constructorName: string, candidates: readonly SceneInstanceKind[]) {
    super(
      `Scene constructor "${constructorName}" has more than one matching instance (${candidates.join(', ')}). Call unload(${constructorName}, { instance: '...' }) to specify which one, or { instance: 'all' } to discard every one.`,
    );
    this.name = 'AmbiguousSceneInstanceError';
    this.constructorName = constructorName;
    this.candidates = candidates;
  }
}

/**
 * Thrown when `unload(Target, { instance: kind })` targets a specific kind
 * of activation that does not exist for `Target`.
 */
export class SceneInstanceNotFoundError extends Error {
  public readonly constructorName: string;
  public readonly instance: SceneInstanceKind;

  public constructor(constructorName: string, instance: SceneInstanceKind) {
    super(`Scene constructor "${constructorName}" has no ${instance} instance to unload.`);
    this.name = 'SceneInstanceNotFoundError';
    this.constructorName = constructorName;
    this.instance = instance;
  }
}

/**
 * Bidirectional index built from `ApplicationOptions.scenes` by
 * {@link validateSceneRegistry}. `byConstructor` backs the constructor-based
 * navigation checks (`change`'s registration/diagnostics lookups); `byKey`
 * backs key-based navigation (`change`/`restore` given a registered string
 * key).
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
    let ctor: AnySceneConstructor | undefined;
    if (typeof registration === 'function') {
      ctor = registration;
    } else if (isSceneRegistrationDescriptor(registration)) {
      ctor = registration.scene;
    }

    if (__DEV__ && !(typeof ctor === 'function' && ctor.prototype instanceof sceneBase)) {
      throw new InvalidSceneRegistrationError(key);
    }

    const resolvedCtor = ctor!;
    const existingKey = byConstructor.get(resolvedCtor);

    if (__DEV__ && existingKey !== undefined) {
      throw new DuplicateSceneRegistrationError(resolvedCtor.name, [existingKey, key]);
    }

    byConstructor.set(resolvedCtor, key);
    byKey.set(key, resolvedCtor);
  }

  return { byConstructor, byKey };
}
