/**
 * Scene-owned audio across a real scene change and a real application
 * shutdown, when one of the scene's voices throws while it is stopped: every
 * other voice the scene started still has to stop, and the failure has to
 * reach the application's error pipeline exactly once.
 */
import type { Voice } from '#audio/Playable';
import { Sound } from '#audio/Sound';
import { Application } from '#core/Application';
import { Scene } from '#core/scene/Scene';

vi.mock('#rendering/webgl2/WebGl2Backend', () => ({
  WebGl2Backend: vi.fn().mockImplementation(function () {
    return {
      onContextLost: { add: vi.fn() },
      onContextRestored: { add: vi.fn() },
      onRenderError: { add: vi.fn(), destroy: vi.fn() },
      stats: {
        frameTimeMs: 0,
        drawCalls: 0,
        culledNodes: 0,
        submittedNodes: 0,
        batches: 0,
        renderPasses: 0,
        renderTargetChanges: 0,
        frame: 0,
        rawFrameDeltaMs: 0,
      },
      resetStats: vi.fn().mockReturnThis(),
      flush: vi.fn().mockReturnThis(),
      initialize: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      resize: vi.fn().mockReturnThis(),
      view: { getBounds: vi.fn().mockReturnValue({ left: 0, top: 0, right: 800, bottom: 600 }) },
      renderTarget: {},
      rendererRegistry: { bindRenderer: vi.fn() },
      backendType: 'webgl2',
      setView: vi.fn().mockReturnThis(),
      draw: vi.fn().mockReturnThis(),
      execute: vi.fn().mockReturnThis(),
      clear: vi.fn().mockReturnThis(),
      pushScissorRect: vi.fn().mockReturnThis(),
      popScissorRect: vi.fn().mockReturnThis(),
      acquireRenderTexture: vi.fn(),
      releaseRenderTexture: vi.fn().mockReturnThis(),
      composeWithAlphaMask: vi.fn().mockReturnThis(),
    };
  }),
}));

const failure = new Error('onEnd listener threw');
const sound = new Sound({ duration: 10 } as AudioBuffer);
let voices: Voice[] = [];

/** Starts three looping voices; the caller's `onEnd` listener on the first one throws. */
class Noisy extends Scene {
  public override init(): void {
    voices = [this.audio.play(sound, { loop: true }), this.audio.play(sound, { loop: true }), this.audio.play(sound, { loop: true })];
    voices[0]!.onEnd.add(() => {
      throw failure;
    });
  }
}

class Quiet extends Scene {}

const createApp = (): Application => new Application({ backend: { type: 'webgl2' }, scenes: { noisy: Noisy, quiet: Quiet } });

/** Voices the application audio system still considers live. */
const liveVoices = (app: Application): number => (app.audio as unknown as { _voices: Set<Voice> })._voices.size;

let rafSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 1);
  voices = [];
});

afterEach(() => {
  rafSpy.mockRestore();
});

describe('scene-owned audio teardown with a throwing voice', () => {
  test('a scene change stops every voice of the outgoing scene and reports the failure once', async () => {
    const app = createApp();
    const onError = vi.fn();

    app.onError.add(onError);
    await app.scenes.change(Noisy);

    expect(voices.every(voice => !voice.ended)).toBe(true);
    expect(liveVoices(app)).toBe(3);

    await app.scenes.change(Quiet);

    expect(voices.map(voice => voice.ended)).toEqual([true, true, true]);
    expect(liveVoices(app)).toBe(0);
    expect(onError.mock.calls).toEqual([[failure]]);

    await app.destroy();

    expect(app.destroyOutcome).toEqual({ status: 'completed', errors: [] });
  });

  test('application destroy stops every scene voice and records the failure once in the outcome', async () => {
    const app = createApp();
    const onError = vi.fn();

    app.onError.add(onError);
    await app.scenes.change(Noisy);
    await app.destroy();

    expect(voices.map(voice => voice.ended)).toEqual([true, true, true]);
    expect(app.destroyOutcome).toEqual({ status: 'completedWithErrors', errors: [failure] });
    expect(onError.mock.calls).toEqual([[failure]]);
  });

  test('a scene that never activates still cancels every deferred voice', async () => {
    const app = createApp();
    const onError = vi.fn();

    app.onError.add(onError);

    await app.scenes.preload(Noisy);
    expect(voices.every(voice => !voice.ended)).toBe(true);

    await app.destroy();

    expect(voices.map(voice => voice.ended)).toEqual([true, true, true]);
    expect(app.destroyOutcome).toEqual({ status: 'completedWithErrors', errors: [failure] });
  });
});
