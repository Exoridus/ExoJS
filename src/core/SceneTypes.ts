import type { Color } from './Color';
import type { Scene } from './Scene';

/**
 * Zero-argument constructor for a {@link Scene} subclass. `Data` is the
 * activation-data type this scene expects, inferred at navigation call
 * sites via {@link InferSceneData}.
 */
export type SceneConstructor<Data = void> = new () => Scene<Data>;

/** A {@link SceneConstructor} for any activation-data type — used for registry storage and navigation targets whose `Data` is not statically known. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately erases Data for heterogeneous registry storage; see spec §6.3.
export type AnySceneConstructor = SceneConstructor<any>;

/** Extracts the activation-data type a {@link SceneConstructor} expects. */
export type InferSceneData<C> = C extends SceneConstructor<infer Data> ? Data : never;

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

const looksLikeSetSceneOptions = (value: unknown): value is SetSceneOptions => isPlainObject(value) && Object.keys(value).every(key => setSceneOptionsKeys.has(key));

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
    super(`Scene constructor "${constructorName}" is registered under more than one key in ApplicationOptions.scenes: "${keys[0]}" and "${keys[1]}". Each scene constructor may be registered only once.`);
    this.name = 'DuplicateSceneRegistrationError';
    this.constructorName = constructorName;
    this.keys = keys;
  }
}

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
 * Validate and index an `ApplicationOptions.scenes` record: every value must
 * be a function whose prototype chain includes {@link Scene} (checked via
 * `prototype instanceof Scene` — deliberately never constructs an instance,
 * since construction may have user side effects), and no constructor may
 * appear under more than one key. Dev builds only; production builds skip
 * validation.
 * @internal
 */
export function validateSceneRegistry(scenes: Record<string, AnySceneConstructor> | undefined, sceneBase: typeof Scene): ReadonlyMap<AnySceneConstructor, string> {
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
