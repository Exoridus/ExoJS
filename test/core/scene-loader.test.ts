import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import { SceneLoader } from '#core/scene/SceneLoader';
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

describe('SceneLoader', () => {
  afterEach(() => {
    decodeAudioDataMock.mockClear();
    global.fetch = originalFetch;
  });

  test('get() claims under its own scope, distinct from the app loader', async () => {
    const { app } = makeAppWithAudio();
    const sceneLoader = new SceneLoader(app);

    const handle = sceneLoader.get('boom.ogg');
    await handle.loaded;
    expect(handle.audioBuffer).not.toBeNull();

    // app-level release must NOT free it — the scene scope holds the claim.
    app.loader.release(handle);
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
