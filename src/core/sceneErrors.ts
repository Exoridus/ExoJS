import type { SceneInstanceKind } from './sceneTypes';

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
 * that is not a {@link SceneRegistration} - neither a {@link Scene} subclass
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
 * switch, restore, or transition session is already in flight - navigation
 * never queues.
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
 * Thrown to reject a `change()`/`restore()`/`unload()` call whose transition
 * session was still in flight when the {@link Application} frame loop
 * stopped (a fatal frame error, or `stop()`/`destroy()` called mid-transition)
 * - the session cannot progress without frame callbacks, so the navigation
 * is aborted rather than left to hang forever. Any
 * claimed preload/retained entry is restored, not discarded.
 */
export class SceneNavigationAbortedError extends Error {
  public constructor() {
    super('Navigation aborted: the application stopped, or was destroyed, while a transition was in flight.');
    this.name = 'SceneNavigationAbortedError';
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
 * exists for `Target` - there is no priority order; the caller must specify
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
 * Thrown when a {@link SceneTransitionSession} or {@link SceneTransitionEnvironment}
 * violates the transition lifecycle contract:
 * - `'commit-reentrant'` - {@link SceneTransitionEnvironment.commit} was called
 *   a second time on the same session. Dev-mode only; a production build
 *   no-ops the second call instead of throwing.
 * - `'done-before-commit'` - the session reported {@link SceneTransitionSession.done}
 *   `true` while {@link SceneTransitionEnvironment.committed} was still
 *   `false`. Always thrown, dev and production - the navigation aborts and
 *   the session is destroyed.
 * - `'aborted'` - the owning `SceneDirector` was destroyed while this
 *   session was still active. Always thrown.
 */
export class SceneTransitionLifecycleError extends Error {
  public readonly reason: 'commit-reentrant' | 'done-before-commit' | 'aborted';

  public constructor(reason: 'commit-reentrant' | 'done-before-commit' | 'aborted') {
    super(SceneTransitionLifecycleError._messageFor(reason));
    this.name = 'SceneTransitionLifecycleError';
    this.reason = reason;
  }

  private static _messageFor(reason: 'commit-reentrant' | 'done-before-commit' | 'aborted'): string {
    switch (reason) {
      case 'commit-reentrant':
        return 'environment.commit() was called a second time on the same SceneTransitionSession. commit() may only be called once per session.';
      case 'done-before-commit':
        return 'SceneTransitionSession.done became true while SceneTransitionEnvironment.committed was still false. A session must not report done before the navigation has actually committed.';
      case 'aborted':
        return 'SceneDirector was destroyed while a SceneTransitionSession was still active.';
    }
  }
}
