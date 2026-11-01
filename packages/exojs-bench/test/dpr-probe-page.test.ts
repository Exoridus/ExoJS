import { readFileSync } from 'node:fs';

import { afterEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ start: vi.fn(), run: vi.fn() }));
vi.mock('../src/rendering/page/gpuFrameTimer', () => ({ requestTimestampFeature() {} }));
vi.mock('../src/rendering/dpr-probe/runner', () => ({
  DEFAULT_MEASURE_MS: 1,
  SUSTAINED_MEASURE_MS: 1,
  WARMUP_FRAMES: 1,
  measureTimerResolutionMs: () => 1,
  startVisualPreview: mocks.start,
  runProbeCell: mocks.run,
}));

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });

  return { promise, resolve };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});

test('serializes preview switches and waits for teardown before measuring', async () => {
  document.documentElement.innerHTML = readFileSync('packages/exojs-bench/src/rendering/dpr-probe/page/index.html', 'utf8');
  vi.stubGlobal('__PROBE_META__', { gitSha: 'test', engineVersion: 'test' });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  const stop = deferred<void>();
  const preview = {
    backendType: 'webgl2',
    cssWidth: 1,
    cssHeight: 1,
    backingWidth: 1,
    backingHeight: 1,
    internalTargets: [],
    stop: vi.fn().mockResolvedValueOnce(undefined).mockReturnValue(stop.promise),
  };
  const boot = deferred<typeof preview>();
  mocks.start.mockResolvedValueOnce(preview).mockReturnValueOnce(boot.promise).mockResolvedValue(preview);
  mocks.run.mockResolvedValue({ errors: [], internalTargets: [] });
  await import('../src/rendering/dpr-probe/page/probe');
  await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
  const buttons = document.querySelectorAll<HTMLButtonElement>('#dpr-buttons button');
  buttons[0]!.click();
  buttons[1]!.click();
  expect(mocks.start).toHaveBeenCalledTimes(2);
  boot.resolve(preview);
  await vi.waitFor(() => expect(preview.stop).toHaveBeenCalledTimes(2));
  document.querySelector<HTMLButtonElement>('#run-sustained-2')!.click();
  expect(mocks.run).not.toHaveBeenCalled();
  expect(mocks.start).toHaveBeenCalledTimes(2);
  stop.resolve();
  await vi.waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(1));
  expect(mocks.start).toHaveBeenCalledTimes(2);
});
