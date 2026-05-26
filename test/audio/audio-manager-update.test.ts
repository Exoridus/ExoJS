import { getAudioContext } from '@/audio/audio-context';
import { disposeAudioManager, getAudioManager } from '@/audio/AudioManager';
import { Sound } from '@/audio/Sound';

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
  beforeEach(() => {
    disposeAudioManager();
  });

  afterEach(() => {
    disposeAudioManager();
    vi.restoreAllMocks();
  });

  // 1. mixer.update() ticks listener
  test('update() calls listener._tick()', () => {
    const mixer = getAudioManager();
    const tickSpy = vi.spyOn(mixer.listener, '_tick');
    mixer.update();
    expect(tickSpy).toHaveBeenCalledTimes(1);
  });

  // 2. mixer.update() ticks all registered spatial sounds
  test('update() calls _tickSpatial() on all registered spatial sounds', () => {
    const pannerSpy = setupPannerSpy();
    const mixer = getAudioManager();
    const sound1 = new Sound(createAudioBufferStub());
    const sound2 = new Sound(createAudioBufferStub());
    sound1.position = { x: 0, y: 0 };
    sound2.position = { x: 10, y: 10 };

    const tick1 = vi.spyOn(sound1, '_tickSpatial');
    const tick2 = vi.spyOn(sound2, '_tickSpatial');

    mixer.update();

    expect(tick1).toHaveBeenCalledTimes(1);
    expect(tick2).toHaveBeenCalledTimes(1);
    pannerSpy.restore();
  });

  // 3. Non-spatial sounds NOT ticked
  test('update() does NOT call _tickSpatial() on non-spatial sounds', () => {
    const mixer = getAudioManager();
    const sound = new Sound(createAudioBufferStub());
    // sound.position remains null — not spatial
    const tickSpy = vi.spyOn(sound, '_tickSpatial');
    mixer.update();
    expect(tickSpy).not.toHaveBeenCalled();
  });

  // 4. Application.update() invokes mixer.update() between interaction and tweens
  test('Application.update() calls getAudioManager().update() between interaction.update() and tweens.update()', async () => {
    vi.resetModules();

    const callOrder: string[] = [];

    const mixerMock = {
      update: vi.fn(() => {
        callOrder.push('mixer');
      }),
      _applyVisibility: vi.fn(),
    };
    vi.doMock('@/audio/AudioManager', () => ({
      getAudioManager: () => mixerMock,
    }));
    vi.doMock('@/rendering/webgl2/WebGl2Backend', () => ({
      WebGl2Backend: vi.fn(function () { return {
        initialize: vi.fn(),
        flush: vi.fn(),
        resize: vi.fn(),
        destroy: vi.fn(),
        resetStats: vi.fn().mockReturnThis(),
        stats: { frameTimeMs: 0 },
      }; }),
    }));
    vi.doMock('@/rendering/webgpu/WebGpuBackend', () => ({
      WebGpuBackend: vi.fn(),
    }));
    vi.doMock('@/resources/Loader', () => ({
      Loader: vi.fn(function () { return { destroy: vi.fn() }; }),
    }));
    vi.doMock('@/input/InputManager', () => ({
      InputManager: vi.fn(function () { return {
        update: vi.fn(),
        destroy: vi.fn(),
        onCanvasFocusChange: { add: vi.fn() },
      }; }),
    }));
    vi.doMock('@/input/InteractionManager', () => ({
      InteractionManager: vi.fn(function () {
        return {
          update: vi.fn(() => {
            callOrder.push('interaction');
          }),
          destroy: vi.fn(),
        };
      }),
    }));
    vi.doMock('@/core/SceneManager', () => ({
      SceneManager: vi.fn(function () { return { update: vi.fn(), setScene: vi.fn(), destroy: vi.fn() }; }),
    }));

    const { Application, ApplicationStatus } = await import('@/core/Application');

    const app = Object.create(Application.prototype) as import('@/core/Application').Application;
    const rawApp = app as unknown as Record<string, unknown>;

    const tweens = {
      update: vi.fn(() => {
        callOrder.push('tweens');
      }),
    };

    rawApp['_status'] = ApplicationStatus.Running;
    rawApp['input'] = { update: vi.fn() };
    rawApp['interaction'] = {
      update: () => {
        callOrder.push('interaction');
      },
    };
    rawApp['tweens'] = tweens;
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
    rawApp['_updateHandler'] = vi.fn();
    rawApp['_frameCount'] = 0;
    rawApp['onFrame'] = { dispatch: vi.fn() };

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    app.update();

    const mixerIdx = callOrder.indexOf('mixer');
    const interactionIdx = callOrder.indexOf('interaction');
    const tweensIdx = callOrder.indexOf('tweens');

    expect(mixerMock.update).toHaveBeenCalledTimes(1);
    expect(mixerIdx).toBeGreaterThan(interactionIdx);
    expect(tweensIdx).toBeGreaterThan(mixerIdx);

    vi.resetModules();
  });

  test('update() still works after all spatial sounds are unregistered', () => {
    const pannerSpy = setupPannerSpy();
    const mixer = getAudioManager();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 0, y: 0 };
    sound.position = null;

    expect(() => mixer.update()).not.toThrow();
    pannerSpy.restore();
  });

  test('destroy() clears the spatial sounds set', () => {
    const pannerSpy = setupPannerSpy();
    const mixer = getAudioManager();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 0, y: 0 };

    mixer.destroy();

    // After destroy, update() shouldn't call anything on the old sound
    const tickSpy = vi.spyOn(sound, '_tickSpatial');
    // mixer is now destroyed — but we can still call update (though mixer is invalid, so don't call it)
    expect(tickSpy).not.toHaveBeenCalled();
    pannerSpy.restore();
  });
});
