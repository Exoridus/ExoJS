import { describe, expect, test, vi } from 'vitest';

import { releaseFailedPreview } from '../src/rendering/dpr-probe/previewCleanup';

vi.mock('#core/Application', () => ({
  Application: class {
    pixelRatio = 1;
    backend = { backendType: 'webgl2', acquireRenderTexture() {}, resetStats() {}, clear() {}, flush() {} };
    rendering = { render() {} };

    async start() {}

    stop() {}

    destroy() {}
  },
}));
vi.mock('../src/rendering/dpr-probe/scenes', () => ({
  createProbeScene: () => ({ root: {}, cacheNodes: [], textNodes: [], update() {}, dispose() {} }),
}));
vi.mock('../src/rendering/page/gpuFrameTimer', () => ({
  createWebGl2GpuTimer: () => ({
    available: true,
    note: '1 disjoint GPU frame(s) discarded',
    async drainSubmittedWork() {},
    beginFrame() {},
    endFrame() {},
    async collect() {
      return { frameMs: [1], queueMs: [] };
    },
  }),
  createWebGpuGpuTimer: () => {},
  noopGpuTimer: {},
}));

test('retains GPU sample caveats in a probe cell capture', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);

    return 0;
  });
  const { runProbeCell } = await import('../src/rendering/dpr-probe/runner');

  try {
    const result = await runProbeCell({
      cell: { scene: 'plain', mode: 'inherit', pixelRatio: 1 } as never,
      backend: 'webgl2',
      host: document.createElement('div'),
      index: 0,
      runStartedAt: 0,
      stage: { width: 64, height: 64 },
      measureMs: 0,
    });

    expect(result.gpuMsMedian).toBe(1);
    expect(result.errors).toContain('1 disjoint GPU frame(s) discarded');
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

describe('releaseFailedPreview', () => {
  test('undoes instrumentation, disposes the scene and destroys the app', () => {
    const calls: string[] = [];

    releaseFailedPreview({
      restores: [() => calls.push('undo')],
      disposeScene: () => calls.push('scene'),
      destroyApp: () => calls.push('app'),
    });

    expect(calls).toEqual(['undo', 'scene', 'app']);
  });

  test('keeps releasing when an earlier step throws, and never obscures the caller error', () => {
    const calls: string[] = [];

    expect(() =>
      releaseFailedPreview({
        restores: [
          () => calls.push('undo-1'),
          () => {
            calls.push('undo-2');

            throw new Error('undo failed');
          },
        ],
        disposeScene: () => {
          calls.push('scene');

          throw new Error('dispose failed');
        },
        destroyApp: () => calls.push('app'),
      }),
    ).not.toThrow();

    expect(calls).toEqual(['undo-1', 'undo-2', 'scene', 'app']);
  });

  test('skips the scene when construction never returned', () => {
    const calls: string[] = [];

    releaseFailedPreview({
      restores: [],
      disposeScene: null,
      destroyApp: () => calls.push('app'),
    });

    expect(calls).toEqual(['app']);
  });
});
