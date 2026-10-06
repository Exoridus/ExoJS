import { getAudioContext } from '#audio/audioContext';
import { AudioEffect, isEffectReady } from '#audio/AudioEffect';

interface AudioContextModule {
  getAudioContext(): AudioContext;
  onAudioContextReady: { dispatch(context: AudioContext): unknown };
}

// AudioEffect is an abstract base - TS abstract-ness is compile-time only, so a
// minimal concrete subclass exercises the shared setup and readiness contract
// without a real Web Audio effect implementation.
const defineMinimalEffect = (Base: typeof AudioEffect) =>
  class MinimalEffect extends Base {
    public node: AudioNode | null = null;
    public setupCalls = 0;

    public constructor(private readonly _pending?: Promise<void>) {
      super();
      this._deferSetup(context => {
        this.setupCalls++;
        this.node = context.createGain();

        return this._pending;
      });
    }

    public get inputNode(): AudioNode {
      if (!this.node) throw new Error('MinimalEffect not yet initialized.');
      return this.node;
    }

    public get outputNode(): AudioNode {
      return this.inputNode;
    }

    public override destroy(): void {
      this._teardown();
      this.node = null;
    }
  };

/** A fresh module registry, so the shared AudioContext starts locked. */
const freshLockedModules = async (): Promise<{ MinimalEffect: ReturnType<typeof defineMinimalEffect>; audio: AudioContextModule }> => {
  vi.resetModules();
  const { AudioEffect: FreshAudioEffect } = await import('#audio/AudioEffect');
  const audio = (await import('#audio/audioContext')) as unknown as AudioContextModule;

  return { MinimalEffect: defineMinimalEffect(FreshAudioEffect), audio };
};

/** Like {@link freshLockedModules}, also handing out the fresh base class for ad-hoc subclasses. */
const freshLockedModulesWithBase = async (): Promise<{
  MinimalEffect: ReturnType<typeof defineMinimalEffect>;
  audio: AudioContextModule;
  FreshAudioEffect: typeof AudioEffect;
}> => {
  vi.resetModules();
  const { AudioEffect: FreshAudioEffect } = await import('#audio/AudioEffect');
  const audio = (await import('#audio/audioContext')) as unknown as AudioContextModule;

  return { MinimalEffect: defineMinimalEffect(FreshAudioEffect), audio, FreshAudioEffect };
};

const isSettled = async (promise: Promise<void>): Promise<boolean> => {
  let settled = false;

  void promise.then(() => {
    settled = true;
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  return settled;
};

describe('AudioEffect', () => {
  beforeEach(() => {
    // Creates the (mock, running) shared context, so a setup can run immediately.
    getAudioContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('a setup run with a ready context wires the effect and resolves ready', async () => {
    const MinimalEffect = defineMinimalEffect(AudioEffect);
    const effect = new MinimalEffect();

    expect(isEffectReady(effect)).toBe(true);
    await expect(effect.ready).resolves.toBeUndefined();
    effect.destroy();
  });

  test('ready stays pending and the effect unwired while the context is locked', async () => {
    const { MinimalEffect, audio } = await freshLockedModules();
    const effect = new MinimalEffect();

    expect(effect.setupCalls).toBe(0);
    expect(isEffectReady(effect)).toBe(false);
    expect(await isSettled(effect.ready)).toBe(false);

    audio.onAudioContextReady.dispatch(new AudioContext());

    expect(effect.setupCalls).toBe(1);
    expect(isEffectReady(effect)).toBe(true);
    expect(await isSettled(effect.ready)).toBe(true);
    effect.destroy();
  });

  test('a setup is not repeated on a later context run', async () => {
    const { MinimalEffect, audio } = await freshLockedModules();
    const effect = new MinimalEffect();

    audio.onAudioContextReady.dispatch(new AudioContext());
    audio.onAudioContextReady.dispatch(new AudioContext());

    expect(effect.setupCalls).toBe(1);
    effect.destroy();
  });

  test('ready waits for an asynchronous setup to settle', async () => {
    let finish!: () => void;
    const MinimalEffect = defineMinimalEffect(AudioEffect);
    const effect = new MinimalEffect(
      new Promise<void>(resolve => {
        finish = resolve;
      }),
    );

    expect(isEffectReady(effect)).toBe(true);
    expect(await isSettled(effect.ready)).toBe(false);

    finish();

    expect(await isSettled(effect.ready)).toBe(true);
    effect.destroy();
  });

  test('an effect destroyed while the context is locked never builds its nodes', async () => {
    const { MinimalEffect, audio } = await freshLockedModules();
    const effect = new MinimalEffect();

    effect.destroy();
    audio.onAudioContextReady.dispatch(new AudioContext());

    expect(effect.setupCalls).toBe(0);
    expect(isEffectReady(effect)).toBe(false);
  });

  test('ready rejects with the error of a failed asynchronous setup', async () => {
    const failure = new Error('setup failed');
    const MinimalEffect = defineMinimalEffect(AudioEffect);
    const effect = new MinimalEffect(Promise.reject(failure));

    await expect(effect.ready).rejects.toBe(failure);
    effect.destroy();
  });

  test('ready requested only after a setup failed still rejects with that error', async () => {
    const failure = new Error('setup failed');
    const MinimalEffect = defineMinimalEffect(AudioEffect);
    const effect = new MinimalEffect(Promise.reject(failure));

    await new Promise(resolve => setTimeout(resolve, 0));

    await expect(effect.ready).rejects.toBe(failure);
    effect.destroy();
  });

  test('a setup that throws rethrows from construction', () => {
    const failure = new Error('sync failure');

    class ThrowingEffect extends AudioEffect {
      public constructor() {
        super();
        this._deferSetup(() => {
          throw failure;
        });
      }

      public get inputNode(): AudioNode {
        throw new Error('never built');
      }

      public get outputNode(): AudioNode {
        throw new Error('never built');
      }

      public override destroy(): void {
        this._teardown();
      }
    }

    let effect: ThrowingEffect | null = null;

    expect(() => {
      effect = new ThrowingEffect();
    }).toThrow(failure);
    expect(effect).toBeNull();
  });

  test('a setup failing at unlock rejects only its own ready and lets the unlock reach every other listener', async () => {
    const { MinimalEffect, audio, FreshAudioEffect } = await freshLockedModulesWithBase();
    const failure = new Error('broken custom effect');

    class BrokenEffect extends FreshAudioEffect {
      public constructor() {
        super();
        this._deferSetup(() => {
          throw failure;
        });
      }

      public get inputNode(): AudioNode {
        throw new Error('never built');
      }

      public get outputNode(): AudioNode {
        throw new Error('never built');
      }

      public override destroy(): void {
        this._teardown();
      }
    }

    const broken = new BrokenEffect();
    const healthy = new MinimalEffect();

    expect(() => audio.onAudioContextReady.dispatch(new AudioContext())).not.toThrow();

    await expect(broken.ready).rejects.toBe(failure);
    await expect(healthy.ready).resolves.toBeUndefined();
    expect(isEffectReady(broken)).toBe(false);
    broken.destroy();
    healthy.destroy();
  });

  test('ready rejects with an AbortError when the effect is destroyed while the context is locked', async () => {
    const { MinimalEffect } = await freshLockedModules();
    const effect = new MinimalEffect();
    const ready = effect.ready;

    effect.destroy();

    await expect(ready).rejects.toMatchObject({ name: 'AbortError' });
    await expect(effect.ready).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('a setup settling after destroy cannot resolve ready', async () => {
    let finish!: () => void;
    const MinimalEffect = defineMinimalEffect(AudioEffect);
    const effect = new MinimalEffect(
      new Promise<void>(resolve => {
        finish = resolve;
      }),
    );
    const ready = effect.ready;

    effect.destroy();
    finish();

    await expect(ready).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('destroying an effect that is already ready keeps ready resolved', async () => {
    const MinimalEffect = defineMinimalEffect(AudioEffect);
    const effect = new MinimalEffect();

    await effect.ready;
    effect.destroy();

    await expect(effect.ready).resolves.toBeUndefined();
  });

  test('a destroyed effect is no longer wired', () => {
    const MinimalEffect = defineMinimalEffect(AudioEffect);
    const effect = new MinimalEffect();

    effect.destroy();

    expect(isEffectReady(effect)).toBe(false);
  });
});
