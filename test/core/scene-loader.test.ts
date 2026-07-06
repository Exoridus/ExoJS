import { Sound } from '#audio/Sound';
import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import { materializeAssetBindings } from '#extensions/materialize';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';

// SoundFactory.create() decodes bytes via the shared OfflineAudioContext
// (`decodeAudioData` from '#audio/audio-context'). jsdom has no real audio
// decoder, so the module is mocked wholesale — mirrors test/resources/loader-claims.test.ts.
// `vi.mock` factories are hoisted above imports, so the mock function must be
// created via `vi.hoisted()` to be referenced safely inside the factory below.
const { decodeAudioDataMock } = vi.hoisted(() => ({
  decodeAudioDataMock: vi.fn(async (): Promise<AudioBuffer> => ({ duration: 2 }) as AudioBuffer),
}));

vi.mock('#audio/audio-context', () => ({
  decodeAudioData: decodeAudioDataMock,
}));

const originalFetch = global.fetch;

function mockFetchAudio(): void {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: async () => new ArrayBuffer(8),
  })) as unknown as typeof fetch;
}

/** Minimal Application harness exposing a real Loader (mirrors test/ui/scene-ui.test.ts's fake-app pattern). */
function makeAppWithAudio(): { app: Application; fetchMock: typeof fetch } {
  mockFetchAudio();
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  const app = { loader } as unknown as Application;

  return { app, fetchMock: global.fetch };
}

describe('Scene.loader', () => {
  afterEach(() => {
    decodeAudioDataMock.mockClear();
    global.fetch = originalFetch;
  });

  test('throws before the scene is attached', () => {
    const scene = new Scene();
    expect(() => scene.loader).toThrow(/attached/i);
  });

  test('get() through this.loader claims under the scene scope', async () => {
    const { app } = makeAppWithAudio();
    const scene = new Scene();
    scene.app = app;

    const handle = scene.loader.get(Sound, 'boom.ogg');
    await handle.loaded;
    expect(handle.audioBuffer).not.toBeNull();

    // app-level release must NOT free it — the scene holds the claim.
    app.loader.release(handle);
    expect(handle.audioBuffer).not.toBeNull();
  });

  test('destroying the scene releases its claims (refcount 0 → evict)', async () => {
    const { app } = makeAppWithAudio();
    const scene = new Scene();
    scene.app = app;
    const handle = scene.loader.get(Sound, 'boom.ogg');
    await handle.loaded;

    scene.destroy(); // _disposal.destroy() → SceneLoader.destroy() → release all
    expect(handle.audioBuffer).toBeNull();
    expect(handle.loadState).toBe('loading');
  });
});
