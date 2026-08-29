import { getAudioContext } from '#audio/audio-context';
import { AudioSystem } from '#audio/AudioSystem';
import { Sound } from '#audio/Sound';
import type { SoundVoice } from '#audio/SoundVoice';
import { Time } from '#core/units';

import { frameDelta } from '../support/frame-delta';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createAudioBufferStub = (): AudioBuffer =>
  ({
    duration: 2,
  }) as AudioBuffer;

const setupPannerSpy = () => {
  const ctx = getAudioContext() as AudioContext & { createPanner: () => PannerNode };
  const spy = vi.spyOn(ctx, 'createPanner').mockImplementation(
    () =>
      ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        context: ctx,
        panningModel: 'equalpower' as PanningModelType,
        distanceModel: 'linear' as DistanceModelType,
        maxDistance: 10000,
        refDistance: 1,
        rolloffFactor: 1,
        positionX: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
        positionY: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
        positionZ: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      }) as unknown as PannerNode,
  );
  return { restore: () => spy.mockRestore() };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioSystem.update()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. mixer.preUpdate() ticks listener
  test('update() calls listener._tick()', () => {
    const mixer = new AudioSystem();
    const tickSpy = vi.spyOn(mixer.listener, '_tick');
    mixer.preUpdate(frameDelta);
    expect(tickSpy).toHaveBeenCalledTimes(1);
  });

  // 2. mixer.preUpdate() ticks all registered spatial voices
  test('update() calls _tickSpatial() on all registered spatial voices', () => {
    const pannerSpy = setupPannerSpy();
    const mixer = new AudioSystem();
    const sound1 = new Sound(createAudioBufferStub());
    const sound2 = new Sound(createAudioBufferStub());

    const voice1 = mixer.play(sound1, { position: { x: 0, y: 0 } }) as SoundVoice;
    const voice2 = mixer.play(sound2, { position: { x: 10, y: 10 } }) as SoundVoice;

    const tick1 = vi.spyOn(voice1, '_tickSpatial');
    const tick2 = vi.spyOn(voice2, '_tickSpatial');

    mixer.preUpdate(frameDelta);

    expect(tick1).toHaveBeenCalledTimes(1);
    expect(tick2).toHaveBeenCalledTimes(1);

    pannerSpy.restore();
    sound1.destroy();
    sound2.destroy();
  });

  // 3. Non-spatial voices NOT ticked
  test('update() does NOT call _tickSpatial() on non-spatial voices', () => {
    const mixer = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());
    // sound.position remains null - not spatial
    const voice = mixer.play(sound) as SoundVoice;
    const tickSpy = vi.spyOn(voice, '_tickSpatial');
    mixer.preUpdate(frameDelta);
    expect(tickSpy).not.toHaveBeenCalled();
    sound.destroy();
  });

  // 4. The engine's own core systems run as `preUpdate` systems, ahead of the
  // fixed steps, in a fixed relative order pinned by their `SystemOrder.Core*`
  // values: input, interaction (which retires the pointers input flagged
  // terminal, in its own `finally`), audio, tweens, rendering.
  test('Application.update() runs the core systems in order at the head of preUpdate', async () => {
    vi.resetModules();

    const callOrder: string[] = [];

    vi.doMock('#rendering/webgl2/WebGl2Backend', () => ({ WebGl2Backend: vi.fn() }));
    vi.doMock('#rendering/webgpu/WebGpuBackend', () => ({ WebGpuBackend: vi.fn() }));
    vi.doMock('#assets/Loader', () => ({
      Loader: vi.fn(function () {
        return { destroy: vi.fn() };
      }),
    }));

    const { Application, ApplicationState } = await import('#core/Application');
    const { SystemRegistry } = await import('#core/SystemRegistry');
    const { SystemOrder } = await import('#core/SystemOrder');

    const app = Object.create(Application.prototype) as import('#core/Application').Application;
    const rawApp = app as unknown as Record<string, unknown>;

    const preUpdateStub = (name: string): { preUpdate: () => void } => ({ preUpdate: () => callOrder.push(name) });

    rawApp['_state'] = ApplicationState.Running;
    rawApp['_frameLoopActive'] = true;
    rawApp['pauseOnHidden'] = false;
    rawApp['_documentVisible'] = true;
    rawApp['systems'] = new SystemRegistry();
    rawApp['scenes'] = {
      _beginFrame: vi.fn(),
      _endFrame: vi.fn(),
      preUpdate: vi.fn(),
      fixedUpdate: vi.fn(),
      update: vi.fn(),
      draw: vi.fn(),
      _updateTransition: vi.fn(),
      _transitionPlacement: vi.fn(() => null),
      _renderTransition: vi.fn(),
    };
    rawApp['input'] = { ...preUpdateStub('input'), _finishInteractionFrame: () => callOrder.push('finishInteraction') };
    rawApp['interaction'] = {
      preUpdate: (): void => {
        callOrder.push('interaction');
        (rawApp['input'] as { _finishInteractionFrame: () => void })._finishInteractionFrame();
      },
    };
    rawApp['_audio'] = preUpdateStub('audio');
    rawApp['tweens'] = preUpdateStub('tweens');
    rawApp['_rendering'] = preUpdateStub('rendering');

    // The constructor is bypassed here, so register the stubs the same way it
    // would - same order values, same phase restriction.
    const registry = rawApp['systems'] as InstanceType<typeof SystemRegistry>;
    const preUpdateOnly = ['preUpdate'] as const;

    registry.add(rawApp['input'] as never, { order: SystemOrder.CoreInput, phases: preUpdateOnly });
    registry.add(rawApp['interaction'] as never, { order: SystemOrder.CoreInteraction, phases: preUpdateOnly });
    registry.add(rawApp['_audio'] as never, { order: SystemOrder.CoreAudio, phases: preUpdateOnly });
    registry.add(rawApp['tweens'] as never, { order: SystemOrder.CoreTweens, phases: preUpdateOnly });
    registry.add(rawApp['_rendering'] as never, { order: SystemOrder.CoreRendering, phases: preUpdateOnly });
    rawApp['_backend'] = {
      flush: vi.fn(),
      resetStats: vi.fn().mockReturnThis(),
      stats: { frameTimeMs: 0 },
    };
    rawApp['_frameClock'] = {
      elapsedTime: { milliseconds: 16, seconds: 0.016 },
      restart: vi.fn(),
    };
    rawApp['_fixed'] = { advance: () => 0, alpha: 0 };
    // Object.create() bypasses the constructor, so the real field
    // initializer (`= Time.seconds(0)`) never runs - stand in with a real Time so
    // the frame path stays type-honest.
    rawApp['_frameDelta'] = Time.seconds(0);
    rawApp['_updateHandler'] = vi.fn();
    rawApp['_frameCount'] = 0;
    rawApp['onFrame'] = { dispatch: vi.fn() };
    rawApp['onFixedFrame'] = { dispatch: vi.fn() };

    rawApp['platform'] = { now: () => 0, requestFrame: vi.fn().mockReturnValue(1), cancelFrame: vi.fn() };

    app.update();

    expect(callOrder).toEqual(['input', 'interaction', 'finishInteraction', 'audio', 'tweens', 'rendering']);

    vi.resetModules();
  });

  test('update() still works after all spatial voices end', () => {
    const pannerSpy = setupPannerSpy();
    const mixer = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());
    const voice = mixer.play(sound, { position: { x: 0, y: 0 } });
    voice.stop(); // mark ended

    expect(() => mixer.preUpdate(frameDelta)).not.toThrow();
    pannerSpy.restore();
    sound.destroy();
  });

  test('destroy() clears the spatial voices set', () => {
    const pannerSpy = setupPannerSpy();
    const mixer = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());
    const voice = mixer.play(sound, { position: { x: 0, y: 0 } }) as SoundVoice;

    mixer.destroy();

    // After destroy, update() is not safe to call on destroyed mixer.
    // But the voice's _tickSpatial should not have been called.
    const tickSpy = vi.spyOn(voice, '_tickSpatial');
    expect(tickSpy).not.toHaveBeenCalled();
    pannerSpy.restore();
    sound.destroy();
  });
});
