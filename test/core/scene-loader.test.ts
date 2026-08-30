import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import type { Application } from '#core/Application';
import { Scene } from '#core/scene/Scene';
import { SceneLoader } from '#core/scene/SceneLoader';
import { materializeAssetTypes } from '#extensions/materialize';

// SoundFactory.create() decodes bytes via the shared OfflineAudioContext
// (`decodeAudioData` from '#audio/audioContext'). jsdom has no real audio
// decoder, so the module is mocked wholesale - mirrors test/assets/loader-claims.test.ts.
// `vi.mock` factories are hoisted above imports, so the mock function must be
// created via `vi.hoisted()` to be referenced safely inside the factory below.
const { decodeAudioDataMock } = vi.hoisted(() => ({
  decodeAudioDataMock: vi.fn(async (): Promise<AudioBuffer> => ({ duration: 2 }) as AudioBuffer),
}));

vi.mock('#audio/audioContext', () => ({
  decodeAudioData: decodeAudioDataMock,
}));

const originalFetch = global.fetch;

const mockFetchAudio = (): void => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: async () => new ArrayBuffer(8),
  })) as unknown as typeof fetch;
};

/** Minimal Application harness exposing a real Loader (mirrors test/ui/scene-ui.test.ts's fake-app pattern). */
const makeAppWithAudio = (): { app: Application; fetchMock: typeof fetch } => {
  mockFetchAudio();
  const loader = new Loader();
  materializeAssetTypes(loader, coreAssetTypes);
  const app = { loader } as unknown as Application;

  return { app, fetchMock: global.fetch };
};

describe('SceneLoader', () => {
  afterEach(() => {
    decodeAudioDataMock.mockClear();
    global.fetch = originalFetch;
  });

  test('get() claims under its own scope, distinct from the app loader', async () => {
    const { app } = makeAppWithAudio();
    const sceneLoader = new SceneLoader(app);
    const other = app.loader.createScope({ name: 'other' });

    const handle = sceneLoader.get('boom.ogg');
    await handle.loaded;
    expect(handle.audioBuffer).not.toBeNull();

    // Another scope releasing must NOT free it - the scene holds its own claim,
    // and a scope can only ever drop the claim it took itself.
    other.release(handle);
    expect(handle.audioBuffer).not.toBeNull();
  });

  test('destroy() releases its claims (refcount 0 → evict)', async () => {
    const { app } = makeAppWithAudio();
    const sceneLoader = new SceneLoader(app);
    const handle = sceneLoader.get('boom.ogg');

    await handle.loaded;

    sceneLoader.destroy();
    expect(handle.audioBuffer).toBeNull();
    expect(handle.loadState).toBe('loading');
  });
});

describe('Scene.loader', () => {
  test('throws before the scene is attached', () => {
    const scene = new Scene();

    expect(() => scene.loader).toThrow(/unavailable/);
  });
});
