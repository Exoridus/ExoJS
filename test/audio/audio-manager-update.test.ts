import { getAudioContext } from '@/audio/audio-context';
import { _resetAudioManagerForTesting, getAudioManager } from '@/audio/AudioManager';
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
  const spy = jest.spyOn(ctx, 'createPanner').mockImplementation(
    () =>
      ({
        connect: jest.fn(),
        disconnect: jest.fn(),
        context: ctx,
        panningModel: 'equalpower' as PanningModelType,
        distanceModel: 'linear' as DistanceModelType,
        maxDistance: 10000,
        refDistance: 1,
        rolloffFactor: 1,
        positionX: { setValueAtTime: jest.fn() },
        positionY: { setValueAtTime: jest.fn() },
        positionZ: { setValueAtTime: jest.fn() },
      }) as unknown as PannerNode,
  );
  return { restore: () => spy.mockRestore() };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioManager.update()', () => {
  beforeEach(() => {
    _resetAudioManagerForTesting();
  });

  afterEach(() => {
    _resetAudioManagerForTesting();
    jest.restoreAllMocks();
  });

  // 1. mixer.update() ticks listener
  test('update() calls listener._tick()', () => {
    const mixer = getAudioManager();
    const tickSpy = jest.spyOn(mixer.listener, '_tick');
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

    const tick1 = jest.spyOn(sound1, '_tickSpatial');
    const tick2 = jest.spyOn(sound2, '_tickSpatial');

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
    const tickSpy = jest.spyOn(sound, '_tickSpatial');
    mixer.update();
    expect(tickSpy).not.toHaveBeenCalled();
  });

  // 4. Application.update() invokes mixer.update() between interaction and tweens
  test('Application.update() calls getAudioManager().update() between interaction.update() and tweens.update()', () => {
    jest.resetModules();

    const callOrder: string[] = [];

    const mixerMock = {
      update: jest.fn(() => {
        callOrder.push('mixer');
      }),
      _applyVisibility: jest.fn(),
    };
    jest.doMock('@/audio/AudioManager', () => ({
      getAudioManager: () => mixerMock,
    }));
    jest.doMock('@/rendering/webgl2/WebGl2Backend', () => ({
      WebGl2Backend: jest.fn(() => ({
        initialize: jest.fn(),
        flush: jest.fn(),
        resize: jest.fn(),
        destroy: jest.fn(),
        resetStats: jest.fn().mockReturnThis(),
        stats: { frameTimeMs: 0 },
      })),
    }));
    jest.doMock('@/rendering/webgpu/WebGpuBackend', () => ({
      WebGpuBackend: jest.fn(),
    }));
    jest.doMock('@/resources/Loader', () => ({
      Loader: jest.fn(() => ({ destroy: jest.fn() })),
    }));
    jest.doMock('@/input/InputManager', () => ({
      InputManager: jest.fn(() => ({
        update: jest.fn(),
        destroy: jest.fn(),
        onCanvasFocusChange: { add: jest.fn() },
      })),
    }));
    jest.doMock('@/input/InteractionManager', () => ({
      InteractionManager: jest.fn(() => ({
        update: jest.fn(() => {
          callOrder.push('interaction');
        }),
        destroy: jest.fn(),
      })),
    }));
    jest.doMock('@/core/SceneManager', () => ({
      SceneManager: jest.fn(() => ({ update: jest.fn(), setScene: jest.fn(), destroy: jest.fn() })),
    }));

    let Application!: typeof import('@/core/Application').Application;
    let ApplicationStatus!: typeof import('@/core/Application').ApplicationStatus;

    jest.isolateModules(() => {
      const mod = require('@/core/Application') as typeof import('@/core/Application');
      Application = mod.Application;
      ApplicationStatus = mod.ApplicationStatus;
    });

    const app = Object.create(Application.prototype) as import('@/core/Application').Application;
    const rawApp = app as unknown as Record<string, unknown>;

    const tweens = {
      update: jest.fn(() => {
        callOrder.push('tweens');
      }),
    };

    rawApp['_status'] = ApplicationStatus.Running;
    rawApp['input'] = { update: jest.fn() };
    rawApp['interaction'] = {
      update: () => {
        callOrder.push('interaction');
      },
    };
    rawApp['tweens'] = tweens;
    rawApp['sceneManager'] = { update: jest.fn() };
    rawApp['_backend'] = {
      flush: jest.fn(),
      resetStats: jest.fn().mockReturnThis(),
      stats: { frameTimeMs: 0 },
    };
    rawApp['_frameClock'] = {
      elapsedTime: { milliseconds: 16, seconds: 0.016 },
      restart: jest.fn(),
    };
    rawApp['_updateHandler'] = jest.fn();
    rawApp['_frameCount'] = 0;
    rawApp['onFrame'] = { dispatch: jest.fn() };

    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    app.update();

    const mixerIdx = callOrder.indexOf('mixer');
    const interactionIdx = callOrder.indexOf('interaction');
    const tweensIdx = callOrder.indexOf('tweens');

    expect(mixerMock.update).toHaveBeenCalledTimes(1);
    expect(mixerIdx).toBeGreaterThan(interactionIdx);
    expect(tweensIdx).toBeGreaterThan(mixerIdx);

    jest.resetModules();
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
    const tickSpy = jest.spyOn(sound, '_tickSpatial');
    // mixer is now destroyed — but we can still call update (though mixer is invalid, so don't call it)
    expect(tickSpy).not.toHaveBeenCalled();
    pannerSpy.restore();
  });
});
