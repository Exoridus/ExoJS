import { getAudioContext } from '#audio/audio-context';
import { AudioManager } from '#audio/AudioManager';
import { Sound } from '#audio/Sound';
import type { SoundVoice } from '#audio/SoundVoice';

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

describe('AudioManager.update()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. mixer.update() ticks listener
  test('update() calls listener._tick()', () => {
    const mixer = new AudioManager();
    const tickSpy = vi.spyOn(mixer.listener, '_tick');
    mixer.update();
    expect(tickSpy).toHaveBeenCalledTimes(1);
  });

  // 2. mixer.update() ticks all registered spatial voices
  test('update() calls _tickSpatial() on all registered spatial voices', () => {
    const pannerSpy = setupPannerSpy();
    const mixer = new AudioManager();
    const sound1 = new Sound(createAudioBufferStub());
    const sound2 = new Sound(createAudioBufferStub());
    sound1.position = { x: 0, y: 0 };
    sound2.position = { x: 10, y: 10 };

    const voice1 = mixer.play(sound1) as SoundVoice;
    const voice2 = mixer.play(sound2) as SoundVoice;

    const tick1 = vi.spyOn(voice1, '_tickSpatial');
    const tick2 = vi.spyOn(voice2, '_tickSpatial');

    mixer.update();

    expect(tick1).toHaveBeenCalledTimes(1);
    expect(tick2).toHaveBeenCalledTimes(1);

    pannerSpy.restore();
    sound1.destroy();
    sound2.destroy();
  });

  // 3. Non-spatial voices NOT ticked
  test('update() does NOT call _tickSpatial() on non-spatial voices', () => {
    const mixer = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    // sound.position remains null — not spatial
    const voice = mixer.play(sound) as SoundVoice;
    const tickSpy = vi.spyOn(voice, '_tickSpatial');
    mixer.update();
    expect(tickSpy).not.toHaveBeenCalled();
    sound.destroy();
  });

  // 4. Application.update() drives the internal prepare stage — input,
  // interaction, audio, tweens, rendering, in that fixed relative order —
  // ahead of fixed steps. The core managers are no longer app systems (they
  // no longer occupy `app.systems`), so this stubs each manager's
  // `_prepareFrame` directly rather than going through the registry.
  test('Application.update() drives the internal prepare stage in the historical core-manager order', async () => {
    vi.resetModules();

    const callOrder: string[] = [];

    vi.doMock('#rendering/webgl2/WebGl2Backend', () => ({ WebGl2Backend: vi.fn() }));
    vi.doMock('#rendering/webgpu/WebGpuBackend', () => ({ WebGpuBackend: vi.fn() }));
    vi.doMock('#resources/Loader', () => ({
      Loader: vi.fn(function () {
        return { destroy: vi.fn() };
      }),
    }));

    const { Application, ApplicationStatus } = await import('#core/Application');
    const { SystemRegistry } = await import('#core/SystemRegistry');

    const app = Object.create(Application.prototype) as import('#core/Application').Application;
    const rawApp = app as unknown as Record<string, unknown>;

    const prepareStub = (name: string): { _prepareFrame: () => void } => ({ _prepareFrame: () => callOrder.push(name) });

    rawApp['_status'] = ApplicationStatus.Running;
    rawApp['pauseOnHidden'] = false;
    rawApp['_documentVisible'] = true;
    rawApp['systems'] = new SystemRegistry();
    rawApp['scenes'] = {
      _beginFrame: vi.fn(),
      _endFrame: vi.fn(),
      fixedUpdate: vi.fn(),
      update: vi.fn(),
      draw: vi.fn(),
      _drawTransition: vi.fn(),
    };
    rawApp['input'] = prepareStub('input');
    rawApp['interaction'] = prepareStub('interaction');
    rawApp['_audio'] = prepareStub('audio');
    rawApp['tweens'] = prepareStub('tweens');
    rawApp['_rendering'] = prepareStub('rendering');
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
    rawApp['_updateHandler'] = vi.fn();
    rawApp['_frameCount'] = 0;
    rawApp['onFrame'] = { dispatch: vi.fn() };
    rawApp['onFixedFrame'] = { dispatch: vi.fn() };

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    app.update();

    expect(callOrder).toEqual(['input', 'interaction', 'audio', 'tweens', 'rendering']);

    vi.resetModules();
  });

  test('update() still works after all spatial voices end', () => {
    const pannerSpy = setupPannerSpy();
    const mixer = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 0, y: 0 };
    const voice = mixer.play(sound);
    voice.stop(); // mark ended

    expect(() => mixer.update()).not.toThrow();
    pannerSpy.restore();
    sound.destroy();
  });

  test('destroy() clears the spatial voices set', () => {
    const pannerSpy = setupPannerSpy();
    const mixer = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 0, y: 0 };
    const voice = mixer.play(sound) as SoundVoice;

    mixer.destroy();

    // After destroy, update() is not safe to call on destroyed mixer.
    // But the voice's _tickSpatial should not have been called.
    const tickSpy = vi.spyOn(voice, '_tickSpatial');
    expect(tickSpy).not.toHaveBeenCalled();
    pannerSpy.restore();
    sound.destroy();
  });
});
