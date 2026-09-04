import { TweenSystem } from '#animation/TweenSystem';
import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Scene } from '#core/scene/Scene';
import { SceneDirector } from '#core/scene/SceneDirector';
import { SceneNavigationAbortedError, SceneTransitionLifecycleError } from '#core/scene/sceneErrors';
import {
  SceneTransition,
  type SceneTransitionContext,
  type SceneTransitionEnvironment,
  type SceneTransitionFrame,
  type SceneTransitionRequirements,
  type SceneTransitionSession,
} from '#core/scene/SceneTransition';
import type { SceneConstructor } from '#core/scene/sceneTypes';
import { Signal } from '#core/Signal';
import { type Seconds, Time } from '#core/units';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderTexture } from '#rendering/texture/RenderTexture';

import { createRenderBackendDouble } from './render-backend-double';

/** Options for {@link describeSceneTransitionConformance} / {@link runSceneTransitionConformance}. */
export interface SceneTransitionConformanceOptions {
  /** Frames a scenario drives before it declares the session stuck. Default `600` (ten seconds at 60 Hz). */
  readonly maxFrames?: number;
  /** Simulated delta each driven frame advances by. Default one 60 Hz frame. */
  readonly frameDelta?: Seconds;
  /** How many frames the abort scenarios run before interrupting. Default `2`. */
  readonly abortAfterFrames?: number;
  /** Canvas backing-store size the harness reports, which sizes every transition render texture. Default `320x180`. */
  readonly canvasSize?: { readonly width: number; readonly height: number };
  /**
   * Assert that whatever the transition allocates per session was released.
   * Called after one completed navigation whose session has been destroyed
   * twice, so it also proves the release does not run a second time. Adds the
   * teardown scenario; omit it and the scenario is not registered.
   */
  readonly expectReleased?: () => void;
}

/** Everything one instrumented session did, from `beginSession()` to `destroy()`. */
interface SessionRecord {
  session: RecordingSession;
  commitCalls: number;
  updateCalls: number;
  renderCalls: number;
  destroyCalls: number;
  /** `true` once `done` was observed `true` while the environment had not committed yet. */
  doneBeforeCommit: boolean;
  /** Member names the session was driven through after `destroy()` had already run. */
  readonly callsAfterDestroy: string[];
  /** `placement` reads that answered something outside `'scene' | 'screen'`. */
  readonly invalidPlacements: unknown[];
}

/** Aggregated instrumentation for every session one transition definition produced. */
interface TransitionRecord {
  readonly sessions: SessionRecord[];
  readonly requirements: SceneTransitionRequirements[];
}

class RecordingEnvironment implements SceneTransitionEnvironment {
  public constructor(
    private readonly _inner: SceneTransitionEnvironment,
    private readonly _record: SessionRecord,
  ) {}

  public get context(): SceneTransitionContext {
    return this._inner.context;
  }

  public get commitRequested(): boolean {
    return this._inner.commitRequested;
  }

  public get committed(): boolean {
    return this._inner.committed;
  }

  public commit(): void {
    this._record.commitCalls++;
    this._inner.commit();
  }
}

class RecordingSession implements SceneTransitionSession {
  public constructor(
    private readonly _inner: SceneTransitionSession,
    private readonly _environment: SceneTransitionEnvironment,
    private readonly _record: SessionRecord,
  ) {}

  public get done(): boolean {
    const done = this._inner.done;

    this._note('done');

    if (done && !this._environment.committed) {
      this._record.doneBeforeCommit = true;
    }

    return done;
  }

  public get placement(): 'scene' | 'screen' {
    const placement = this._inner.placement;

    this._note('placement');

    if (placement !== 'scene' && placement !== 'screen') {
      this._record.invalidPlacements.push(placement);
    }

    return placement;
  }

  public update(delta: Seconds): void {
    this._record.updateCalls++;
    this._note('update');
    this._inner.update(delta);
  }

  public render(context: RenderingContext, frame: SceneTransitionFrame): void {
    this._record.renderCalls++;
    this._note('render');
    this._inner.render(context, frame);
  }

  public destroy(): void {
    this._record.destroyCalls++;
    this._inner.destroy();
  }

  /** Direct passthrough for the scenario that probes a redundant teardown, bypassing the `destroyCalls` counter. */
  public destroyInner(): void {
    this._inner.destroy();
  }

  private _note(member: string): void {
    if (this._record.destroyCalls > 0) {
      this._record.callsAfterDestroy.push(member);
    }
  }
}

/**
 * Wraps the transition under test so the harness sees every Director/session
 * interaction. Delegates through the public `beginSession()` entry point, so a
 * transition that overrides `beginSession()` itself is instrumented the same
 * way one that only implements `createSession()` is.
 */
class RecordingTransition extends SceneTransition {
  public constructor(
    private readonly _inner: SceneTransition,
    private readonly _record: TransitionRecord,
  ) {
    super();
  }

  public override getRequirements(context: SceneTransitionContext): SceneTransitionRequirements {
    const requirements = this._inner.getRequirements(context);

    this._record.requirements.push(requirements);

    return requirements;
  }

  protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
    const record: SessionRecord = {
      session: null as unknown as RecordingSession,
      commitCalls: 0,
      updateCalls: 0,
      renderCalls: 0,
      destroyCalls: 0,
      doneBeforeCommit: false,
      callsAfterDestroy: [],
      invalidPlacements: [],
    };

    this._record.sessions.push(record);

    const recordingEnvironment = new RecordingEnvironment(environment, record);

    record.session = new RecordingSession(this._inner.beginSession(recordingEnvironment), recordingEnvironment, record);

    return record.session;
  }
}

interface BackendCounters {
  acquired: number;
  released: number;
}

interface ConformanceHarness {
  readonly director: SceneDirector<Record<string, SceneConstructor<void>>>;
  readonly rendering: RenderingContext;
  readonly first: SceneConstructor<void>;
  readonly second: SceneConstructor<void>;
  readonly errors: Error[];
  readonly textures: BackendCounters;
  /** One `Application.update()` worth of Director calls, in the order the real frame loop makes them. */
  tick(): void;
}

const createHarness = (options: SceneTransitionConformanceOptions): ConformanceHarness => {
  const { width, height } = options.canvasSize ?? { width: 320, height: 180 };
  const textures: BackendCounters = { acquired: 0, released: 0 };
  const backend: RenderBackend = {
    ...createRenderBackendDouble(),
    acquireRenderTexture(textureWidth: number, textureHeight: number) {
      textures.acquired++;

      return new RenderTexture(textureWidth, textureHeight);
    },
    releaseRenderTexture(texture: RenderTexture) {
      textures.released++;
      texture.destroy();

      return this;
    },
  };
  const rendering = new RenderingContext(backend);
  const errors: Error[] = [];
  const onError = new Signal<[Error]>();

  onError.add(error => errors.push(error));

  const app = {
    backend,
    rendering,
    onError,
    canvas: { width, height } as HTMLCanvasElement,
    onResize: new Signal<[number, number, Application]>(),
    clearColor: Color.black,
    tweens: new TweenSystem(),
    loader: { _releaseScope: () => undefined },
    interaction: { attachRoot: () => undefined, detachRoot: () => undefined },
    input: {
      onKeyDown: new Signal<[number]>(),
      onKeyUp: new Signal<[number]>(),
      onPointerDown: new Signal<[unknown]>(),
      onPointerUp: new Signal<[unknown]>(),
    },
  } as unknown as Application;

  const first = class extends Scene {} as SceneConstructor<void>;
  const second = class extends Scene {} as SceneConstructor<void>;
  const director = new SceneDirector(app, { first, second });

  return {
    director,
    rendering,
    first,
    second,
    errors,
    textures,
    tick(): void {
      const delta = options.frameDelta ?? Time.seconds(1 / 60);

      director._beginFrame();
      director.preUpdate(delta);
      director.update(delta);
      director._updateTransition(delta);

      if (director._transitionPlacement() === 'scene') {
        director.draw(rendering);
        director._renderTransition(rendering);
      } else {
        director.draw(rendering);
        director._renderTransition(rendering);
      }

      director._endFrame();
    },
  };
};

/**
 * A macrotask turn. The Director's commit runs asynchronously (the incoming
 * scene's `load()`/`init()` are awaited), so a scenario has to yield between
 * driven frames or the session would never observe `committed`.
 */
const flush = (): Promise<void> => new Promise<void>(resolve => void setTimeout(resolve, 0));

interface NavigationOutcome {
  status: 'pending' | 'resolved' | 'rejected';
  error?: unknown;
  frames: number;
}

/** Drive `navigation` frame by frame until it settles or `maxFrames` is spent. */
const drive = async (harness: ConformanceHarness, navigation: Promise<unknown>, maxFrames: number, stopAfterFrames = Infinity): Promise<NavigationOutcome> => {
  const outcome: NavigationOutcome = { status: 'pending', frames: 0 };

  void navigation.then(
    () => {
      outcome.status = 'resolved';
    },
    (error: unknown) => {
      outcome.status = 'rejected';
      outcome.error = error;
    },
  );

  await flush();

  while (outcome.status === 'pending' && outcome.frames < maxFrames && outcome.frames < stopAfterFrames) {
    harness.tick();
    outcome.frames++;
    await flush();
  }

  return outcome;
};

/** The one place a scenario turns "the navigation never finished" into a message that names the likely cause. */
const expectSettled = (outcome: NavigationOutcome, maxFrames: number): void => {
  expect(
    outcome.status,
    `the navigation never settled within ${maxFrames} frames - the session neither called environment.commit() nor reported done. A session must request the commit itself; nothing else will.`,
  ).not.toBe('pending');
};

const expectResolved = (outcome: NavigationOutcome, maxFrames: number): void => {
  expectSettled(outcome, maxFrames);

  if (outcome.status === 'rejected') {
    const error = outcome.error;
    const reason = error instanceof SceneTransitionLifecycleError ? ` (SceneTransitionLifecycleError: ${error.reason})` : '';

    throw new Error(`the navigation rejected instead of completing${reason}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
};

const expectOneSession = (record: TransitionRecord): SessionRecord => {
  expect(record.sessions, 'beginSession() must produce exactly one session per navigation').toHaveLength(1);

  return record.sessions[0] as SessionRecord;
};

const expectCleanSession = (session: SessionRecord): void => {
  expect(session.commitCalls, 'environment.commit() must be called exactly once per session').toBe(1);
  expect(session.destroyCalls, 'the Director destroys a session exactly once, on every exit path').toBe(1);
  expect(session.callsAfterDestroy, 'no update()/render()/done/placement access may follow destroy()').toEqual([]);
  expect(session.invalidPlacements, "placement must answer 'scene' or 'screen'").toEqual([]);
  expect(session.doneBeforeCommit, 'done must never be true while the environment has not committed yet').toBe(false);
};

const expectBalancedTextures = (harness: ConformanceHarness): void => {
  expect(harness.textures.released, `every render texture the Director provisioned must be released again (acquired ${harness.textures.acquired})`).toBe(
    harness.textures.acquired,
  );
};

const newRecord = (): TransitionRecord => ({ sessions: [], requirements: [] });

/**
 * Run the scene-transition lifecycle conformance suite for `createTransition`
 * inside the caller's own `describe` block.
 *
 * Each scenario builds a fresh headless Director over a render-backend double,
 * registers two minimal scenes, and drives a real navigation frame by frame in
 * the order `Application.update()` uses. The transition is wrapped so every
 * Director/session interaction is observed; the assertions are the contract
 * {@link SceneTransitionLifecycleError} enforces at runtime, plus the ones a
 * failing implementation would otherwise only show as a leak or a stuck screen:
 *
 * - the session requests the commit itself, exactly once, and reports `done`
 *   only after the commit was crossed;
 * - it survives a navigation with no outgoing scene and one with no incoming
 *   scene;
 * - an abort mid-session (frame loop stopped, Director disposed) settles the
 *   navigation, destroys the session exactly once, and leaves no update/render
 *   call or unreleased render texture behind;
 * - what the session allocated is released once, when `expectReleased` says
 *   how to check it;
 * - the definition instance itself stays reusable across navigations.
 *
 * `createTransition` must return a fresh definition on every call. Scenarios
 * that need the same instance twice call it once and navigate twice.
 */
export const runSceneTransitionConformance = (createTransition: () => SceneTransition, options: SceneTransitionConformanceOptions = {}): void => {
  const maxFrames = options.maxFrames ?? 600;
  const abortAfterFrames = options.abortAfterFrames ?? 2;

  test('getRequirements() answers the same requirements for the same context', () => {
    const transition = createTransition();
    const context: SceneTransitionContext = { operation: 'change', hasOutgoingScene: true, hasIncomingScene: true };

    const first = transition.getRequirements(context);
    const second = transition.getRequirements(context);

    expect(second, 'getRequirements() must be pure - the Director calls it before every session').toEqual(first);
    expect(['none', 'snapshot'], `outgoingFrame must be 'none' or 'snapshot', got ${String(first.outgoingFrame)}`).toContain(first.outgoingFrame);
    expect(['none', 'direct', 'texture'], `currentFrame must be 'none', 'direct' or 'texture', got ${String(first.currentFrame)}`).toContain(
      first.currentFrame,
    );
  });

  test('commits once and reports done only after the commit, completing the navigation', async () => {
    const harness = createHarness(options);
    const record = newRecord();

    await harness.director.change(harness.first);

    const navigation = harness.director.change(harness.second, { transition: new RecordingTransition(createTransition(), record) });
    const outcome = await drive(harness, navigation, maxFrames);

    expectResolved(outcome, maxFrames);
    expectCleanSession(expectOneSession(record));
    expect(harness.director.currentScene, 'the incoming scene must be active once the navigation resolved').toBeInstanceOf(harness.second);
    expect(harness.errors, 'a conformant session reports nothing through the app error pipeline').toEqual([]);
    expectBalancedTextures(harness);
  });

  test('completes a first navigation, which has no outgoing scene to show', async () => {
    const harness = createHarness(options);
    const record = newRecord();

    const navigation = harness.director.change(harness.first, { transition: new RecordingTransition(createTransition(), record) });
    const outcome = await drive(harness, navigation, maxFrames);

    expectResolved(outcome, maxFrames);
    expectCleanSession(expectOneSession(record));
    expect(record.requirements[0], 'getRequirements() runs once per navigation, before the session starts').toBeDefined();
    expect(harness.director.currentScene, 'the incoming scene must be active once the navigation resolved').toBeInstanceOf(harness.first);
    expectBalancedTextures(harness);
  });

  test('completes an unload, which has no incoming scene to show', async () => {
    const harness = createHarness(options);
    const record = newRecord();

    await harness.director.change(harness.first);

    const navigation = harness.director.unload(harness.first, { transition: new RecordingTransition(createTransition(), record) });
    const outcome = await drive(harness, navigation, maxFrames);

    expectResolved(outcome, maxFrames);
    expectCleanSession(expectOneSession(record));
    expect(harness.director.currentScene, 'an unload leaves no active scene behind').toBeNull();
    expectBalancedTextures(harness);
  });

  test('an abort mid-session settles the navigation and tears the session down exactly once', async () => {
    const harness = createHarness(options);
    const record = newRecord();

    await harness.director.change(harness.first);

    const navigation = harness.director.change(harness.second, { transition: new RecordingTransition(createTransition(), record) });
    const outcome = await drive(harness, navigation, maxFrames, abortAfterFrames);

    expect(
      outcome.status,
      `the session finished within ${abortAfterFrames} frames, so there was nothing left to abort - give the transition under test a longer duration, or raise abortAfterFrames`,
    ).toBe('pending');

    harness.director._abortInFlightNavigation(new SceneNavigationAbortedError());
    await flush();

    const session = expectOneSession(record);

    expect(session.destroyCalls, 'an aborted session must be destroyed exactly once').toBe(1);

    // Nothing may reach the session after the abort: the Director cleared it,
    // so these frames prove the session is genuinely out of the loop rather
    // than still being ticked against released resources.
    harness.tick();
    harness.tick();

    expect(session.callsAfterDestroy, 'no update()/render()/done/placement access may follow destroy()').toEqual([]);
    expect(harness.director.currentScene, 'an aborted navigation leaves a scene active, never a half-committed void').not.toBeNull();
    expectBalancedTextures(harness);
  });

  test('disposing the Director mid-session rejects the navigation and destroys the session exactly once', async () => {
    const harness = createHarness(options);
    const record = newRecord();

    await harness.director.change(harness.first);

    const navigation = harness.director.change(harness.second, { transition: new RecordingTransition(createTransition(), record) });

    await drive(harness, navigation, maxFrames, abortAfterFrames);
    await harness.director._dispose();

    await expect(navigation, 'a disposed Director rejects the in-flight navigation').rejects.toThrow(SceneTransitionLifecycleError);

    const session = expectOneSession(record);

    expect(session.destroyCalls, 'a session aborted by disposal must be destroyed exactly once').toBe(1);
    expect(session.callsAfterDestroy, 'no update()/render()/done/placement access may follow destroy()').toEqual([]);
    expectBalancedTextures(harness);
  });

  test('a redundant destroy() is harmless', async () => {
    const harness = createHarness(options);
    const record = newRecord();

    await harness.director.change(harness.first);

    const navigation = harness.director.change(harness.second, { transition: new RecordingTransition(createTransition(), record) });

    expectResolved(await drive(harness, navigation, maxFrames), maxFrames);

    const { session } = expectOneSession(record);

    // The Director never calls destroy() twice - this proves the release is
    // written so it cannot double-free if it ever did, which is what makes an
    // abort-path bug show up as a failed assertion instead of a driver crash.
    expect(() => session.destroyInner(), 'destroy() must be safe to call again - release resources once and null the handles').not.toThrow();
    expectBalancedTextures(harness);
  });

  const expectReleased = options.expectReleased;

  if (expectReleased !== undefined) {
    test('tears its per-session state down exactly once', async () => {
      const harness = createHarness(options);
      const record = newRecord();

      await harness.director.change(harness.first);

      const navigation = harness.director.change(harness.second, { transition: new RecordingTransition(createTransition(), record) });

      expectResolved(await drive(harness, navigation, maxFrames), maxFrames);

      const { session } = expectOneSession(record);

      session.destroyInner();
      expectReleased();
      expectBalancedTextures(harness);
    });
  }

  test('one definition instance drives two consecutive navigations', async () => {
    const harness = createHarness(options);
    const record = newRecord();
    const transition = new RecordingTransition(createTransition(), record);

    await harness.director.change(harness.first);

    expectResolved(await drive(harness, harness.director.change(harness.second, { transition }), maxFrames), maxFrames);
    expectResolved(await drive(harness, harness.director.change(harness.first, { transition }), maxFrames), maxFrames);

    expect(record.sessions, 'each navigation gets its own session - a definition must hold no per-navigation state').toHaveLength(2);
    record.sessions.forEach(expectCleanSession);
    expect(harness.director.currentScene, 'the second navigation must have completed too').toBeInstanceOf(harness.first);
    expectBalancedTextures(harness);
  });
};

/**
 * {@link runSceneTransitionConformance} wrapped in its own `describe` block.
 * The usual entry point; call `runSceneTransitionConformance` directly only to
 * nest the scenarios inside a block a spec already owns.
 */
export const describeSceneTransitionConformance = (
  name: string,
  createTransition: () => SceneTransition,
  options: SceneTransitionConformanceOptions = {},
): void => {
  describe(`${name} scene-transition conformance`, () => {
    runSceneTransitionConformance(createTransition, options);
  });
};
