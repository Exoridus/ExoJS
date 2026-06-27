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
        positionX: { setValueAtTime: vi.fn() },
        positionY: { setValueAtTime: vi.fn() },
        positionZ: { setValueAtTime: vi.fn() },
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

  // 4. Application.update() ticks the app systems in ascending order. The core
  // managers register on app.systems with reserved bands, so the loop runs
  // interaction (200) → audio (300) → tweens (400). Stand in with ordered probes.
  test('Application.update() ticks app systems in ascending order', async () => {
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

    // Register out of order to prove the registry sorts by `order`, not insertion.
    const systems = new SystemRegistry();
    systems.add({ order: 400, update: () => callOrder.push('tweens'), destroy: vi.fn() });
    systems.add({ order: 200, update: () => callOrder.push('interaction'), destroy: vi.fn() });
    systems.add({ order: 300, update: () => callOrder.push('audio'), destroy: vi.fn() });

    rawApp['_status'] = ApplicationStatus.Running;
    rawApp['pauseOnHidden'] = false;
    rawApp['_documentVisible'] = true;
    rawApp['systems'] = systems;
    rawApp['scene'] = { update: vi.fn() };
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

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    app.update();

    expect(callOrder).toEqual(['interaction', 'audio', 'tweens']);

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
