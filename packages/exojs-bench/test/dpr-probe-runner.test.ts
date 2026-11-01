import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ destroy: vi.fn(), scene: vi.fn() }));

vi.mock('#core/Application', () => ({
  Application: class {
    backend = { backendType: 'webgl2', resetStats() {}, clear() {}, flush() {} };
    rendering = { render() {} };
    pixelRatio = 1;

    async start() {}

    stop() {}

    destroy = mocks.destroy;
  },
}));
vi.mock('#core/Color', () => ({ Color: class {} }));
vi.mock('../src/rendering/dpr-probe/scenes', () => ({ createProbeScene: mocks.scene }));
vi.mock('../src/rendering/dpr-probe/instrumentation', () => ({
  createTargetRecorder: () => ({ arm() {}, disarm() {}, summary: () => [] }),
  instrumentAcquireRenderTexture: () => () => {},
  instrumentCacheTexture: () => () => {},
}));

import { runProbeCell, startVisualPreview } from '../src/rendering/dpr-probe/runner';

describe('probe teardown', () => {
  let finishDestroy: () => void;
  let host: HTMLElement;

  beforeEach(() => {
    mocks.destroy.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finishDestroy = resolve;
        }),
    );
    mocks.scene.mockReturnValue({ cacheNodes: [], textNodes: [], root: {}, update() {}, dispose() {} });
    const canvas = { id: '', style: {}, width: 1, height: 1, clientWidth: 1, clientHeight: 1, getContext: () => null, remove() {} };
    host = { querySelector: () => null, append() {} } as unknown as HTMLElement;
    vi.stubGlobal('document', { createElement: () => canvas });
    vi.stubGlobal('addEventListener', () => {});
    vi.stubGlobal('removeEventListener', () => {});
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(0));

      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  test('waits for destruction before a cell finishes', async () => {
    mocks.scene.mockImplementation(() => {
      throw new Error('scene failed');
    });
    let finished = false;
    const cell = runProbeCell({
      cell: { scene: 'baseline', mode: 'inherit', pixelRatio: 1 },
      backend: 'webgl2',
      host,
      stage: { width: 1, height: 1 },
      index: 0,
      runStartedAt: 0,
    }).then(() => {
      finished = true;
    });
    await vi.waitFor(() => expect(mocks.destroy).toHaveBeenCalled());
    await Promise.resolve();
    expect(finished).toBe(false);
    finishDestroy!();
    await cell;
    expect(finished).toBe(true);
  });

  test('waits for destruction before preview stop finishes', async () => {
    const preview = await startVisualPreview({
      scene: 'baseline',
      mode: 'inherit',
      pixelRatio: 1,
      backend: 'webgl2',
      host,
      stage: { width: 1, height: 1 },
    });
    let finished = false;
    const stopped = preview.stop().then(() => {
      finished = true;
    });
    await vi.waitFor(() => expect(mocks.destroy).toHaveBeenCalled());
    await Promise.resolve();
    expect(finished).toBe(false);
    finishDestroy!();
    await stopped;
    expect(finished).toBe(true);
  });

  test('waits for destruction before reporting a preview failure', async () => {
    mocks.scene.mockImplementation(() => {
      throw new Error('scene failed');
    });
    let finished = false;
    const failed = startVisualPreview({
      scene: 'baseline',
      mode: 'inherit',
      pixelRatio: 1,
      backend: 'webgl2',
      host,
      stage: { width: 1, height: 1 },
    }).catch((error: Error) => {
      finished = true;

      return error;
    });
    await vi.waitFor(() => expect(mocks.destroy).toHaveBeenCalled());
    await Promise.resolve();
    expect(finished).toBe(false);
    finishDestroy!();
    expect((await failed).message).toBe('scene failed');
  });
});
