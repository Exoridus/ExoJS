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

/**
 * Extracts the {@link Scene} subclass constructor a {@link SceneRegistration}
 * resolves to — unwraps the descriptor form, passes a bare constructor
 * through unchanged.
 */
export type ConstructorOf<R extends SceneRegistration<AnySceneConstructor>> = R extends { scene: infer C } ? C : R;

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

/** Options passed to {@link SceneDirector.setScene} / {@link Application.start}. */
export interface SetSceneOptions {
  transition?: SceneTransition;
  /**
   * Suspend the outgoing scene instead of ending it permanently, retaining
   * it (keyed by its constructor) for a later {@link SceneDirector.restoreScene}
   * call. The same scene instance and its state are preserved; `load()`/
   * `init()` do not re-run on restore.
   */
  retainCurrent?: boolean;
}

/** Options passed to {@link SceneDirector.restoreScene}. */
export interface RestoreSceneOptions {
  transition?: SceneTransition;
  /**
   * Suspend the currently active scene (if any) instead of ending it
   * permanently, retaining it for a later {@link SceneDirector.restoreScene}
   * call — mirrors {@link SetSceneOptions.retainCurrent}.
   */
  retainCurrent?: boolean;
}

/**
 * The reserved key set of {@link SetSceneOptions}. Used at runtime by
 * {@link resolveSetSceneArgs} to distinguish an options argument from a data
 * argument when only one tail argument is present (`Data` is erased at
 * runtime — see that function's doc for the full explanation).
 */
const setSceneOptionsKeys = new Set(['transition', 'retainCurrent']);

/**
 * Tuple type for the variadic tail of `setScene`/`start` calls, after the
 * target constructor. When `Data` is `void` there is no data slot — only
 * `options`. Otherwise `data` is required and `options` is optional.
 *
 * **Runtime caveat:** `Data` has no runtime representation (erased). A
 * single tail argument is classified as *options* when it is a plain object
 * whose keys are a subset of `{ transition, retainCurrent }` (see
 * {@link resolveSetSceneArgs}) — otherwise it is classified as *data*. A
 * scene whose `Data` shape's only keys happen to be named `transition`
 * and/or `retainCurrent` would be misread as options; avoid that shape, or
 * nest such fields one level deeper.
 */
export type SetSceneArgs<Data> = [Data] extends [void] ? [options?: SetSceneOptions] : [data: Readonly<Data>, options?: SetSceneOptions];

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const looksLikeSetSceneOptions = (value: unknown): value is SetSceneOptions =>
  isPlainObject(value) && Object.keys(value).every(key => setSceneOptionsKeys.has(key));

/**
 * Resolve the erased-at-runtime `(data?, options?)` tail of a `setScene`/
 * `start` call into its two parts. See {@link SetSceneArgs} for the
 * disambiguation rule and its documented edge case.
 * @internal
 */
export function resolveSetSceneArgs(args: readonly unknown[]): { data: unknown; options: SetSceneOptions } {
  if (args.length >= 2) {
    return { data: args[0], options: (args[1] as SetSceneOptions | undefined) ?? {} };
  }

  if (args.length === 1) {
    return looksLikeSetSceneOptions(args[0]) ? { data: undefined, options: args[0] } : { data: args[0], options: {} };
  }

  return { data: undefined, options: {} };
}

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
 * Thrown when `setScene`/`restoreScene` is called while another Scene
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
 * Thrown when `setScene` targets a constructor that already has a retained
 * (suspended) Scene. Call {@link SceneDirector.restoreScene} or
 * {@link SceneDirector.releaseScene} for it first.
 */
export class RetainedSceneConflictError extends Error {
  public readonly constructorName: string;

  public constructor(constructorName: string) {
    super(
      `Scene constructor "${constructorName}" already has a retained (suspended) instance. Call restoreScene(...) or releaseScene(...) for it before starting a fresh activation.`,
    );
    this.name = 'RetainedSceneConflictError';
    this.constructorName = constructorName;
  }
}

/**
 * Thrown when `restoreScene` targets a constructor with no retained
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
export function validateSceneRegistry(
  scenes: Record<string, SceneRegistration<AnySceneConstructor>> | undefined,
  sceneBase: typeof Scene,
): SceneRegistryIndex {
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
