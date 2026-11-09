// @vitest-environment node

import { runMatrix } from '../src/rendering/driver';
import type { CellResult } from '../src/rendering/EngineAdapter';

const resources = vi.hoisted(() => ({ start: vi.fn(), launch: vi.fn(), timeout: vi.fn() }));

vi.mock('playwright', () => ({ chromium: { launch: resources.launch }, webkit: { launch: resources.launch } }));
vi.mock('../src/shared/viteServer', () => ({
  RENDERING_LIBRARY_ARMS: [],
  readEngineVersion: () => 'test-version',
  startViteServer: resources.start,
}));
vi.mock('../src/shared/timeout', () => ({ raceWithTimeout: resources.timeout }));

describe('competitive capture failure boundaries', () => {
  beforeEach(() => vi.resetAllMocks());

  test.each(['screenshot', 'disposal'] as const)('stops after a %s timeout without remeasuring a checkpointed cell', async stage => {
    const result: CellResult = {
      spec: {
        engine: 'exojs',
        config: 'current',
        backend: 'webgl2',
        archetype: 'dirty-10',
        nodeCount: 1000,
        timedFrames: 3,
        warmupFrames: 2,
        measurement: { profile: 'timing', cycle: 0 },
      },
      status: 'ok',
      cpuMsMedian: 1,
      cpuMsP95: 1,
      frameMsMedian: null,
      frameMsP95: null,
      queueMsMedian: null,
      queueMsP95: null,
      structural: { drawCalls: 0, textureBinds: 0, bufferUploads: 0 },
      clock: { resolutionMs: 0.005, crossOriginIsolated: true },
    };
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValueOnce(result.clock).mockResolvedValueOnce(result).mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('capture fixture')),
    };
    const browser = {
      version: () => 'test-version',
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const serverClose = vi.fn().mockResolvedValue(undefined);
    resources.start.mockResolvedValue({ resolvedUrls: { local: ['http://localhost'], network: [] }, close: serverClose });
    resources.launch.mockResolvedValueOnce(browser).mockRejectedValue(new Error('Unexpected browser relaunch.'));
    resources.timeout.mockImplementation(async (_pending: Promise<unknown>, _duration: number, sentinel: symbol) => sentinel);

    if (stage === 'disposal') {
      resources.timeout.mockImplementationOnce(async (pending: Promise<unknown>) => pending);
    }

    const checkpoint = vi.fn();

    const acquisition = runMatrix({
      backends: ['webgl2'],
      filter: { engine: 'exojs', config: 'current', archetype: 'dirty-10', nodeCount: 1000 },
      sampling: { profile: 'timing', timedFrames: 3, warmupFrames: 2, cycles: 2, orderSeed: 1 },
      captureDir: 'run-capture-fixture',
      onCellResult: checkpoint,
    });

    await expect(acquisition).rejects.toThrow(stage === 'screenshot' ? /Screenshot capture timed out/ : /Held-scene disposal timed out/);
    expect(checkpoint).toHaveBeenCalledExactlyOnceWith(result);
    expect(resources.launch).toHaveBeenCalledOnce();
    expect(page.screenshot).toHaveBeenCalledOnce();
    expect(page.evaluate).toHaveBeenCalledTimes(stage === 'screenshot' ? 2 : 3);
    expect(browser.close).toHaveBeenCalledOnce();
    expect(serverClose).toHaveBeenCalledOnce();
  });
});
