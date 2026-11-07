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

test('keeps capture stage metadata and rejects runs with a different stage', async () => {
  document.documentElement.innerHTML = readFileSync('packages/exojs-bench/src/rendering/dpr-probe/page/index.html', 'utf8');
  vi.stubGlobal('__PROBE_META__', { gitSha: 'test', engineVersion: 'test' });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  const preview = {
    backendType: 'webgl2',
    cssWidth: 1,
    cssHeight: 1,
    backingWidth: 1,
    backingHeight: 1,
    internalTargets: [],
    stop: vi.fn().mockResolvedValue(undefined),
  };
  mocks.start.mockResolvedValue(preview);
  const cell = deferred<{ errors: never[]; internalTargets: never[] }>();
  mocks.run.mockReturnValueOnce(cell.promise).mockResolvedValue({ errors: [], internalTargets: [] });
  await import('../src/rendering/dpr-probe/page/probe');
  await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
  document.querySelector<HTMLButtonElement>('#run-sustained-2')!.click();
  await vi.waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(1));
  document.querySelector<HTMLButtonElement>('#stage-buttons button[data-value="fill"]')!.click();
  cell.resolve({ errors: [], internalTargets: [] });
  await vi.waitFor(() => expect(globalThis.__dprProbe!.collected).toHaveLength(1));
  const result = globalThis.__dprProbe!.buildResult();
  expect(result.stagePreset).toBe('fixed');
  expect([result.stageWidth, result.stageHeight]).toEqual([360, 360]);
  expect(result.notes.some(note => note.includes('fixed 360x360'))).toBe(true);
  await vi.waitFor(() => expect(document.querySelector<HTMLButtonElement>('#run-sustained-2')!.disabled).toBe(false));
  document.querySelector<HTMLButtonElement>('#run-sustained-2')!.click();
  await vi.waitFor(() => expect(document.querySelector('#status')!.textContent).toContain('clear'));
  expect(mocks.run).toHaveBeenCalledTimes(1);
});

test.each(['environment', 'preview-stop', 'run-stop'] as const)(
  'recovers from a rejected %s transition and permits a later run',
  async failurePoint => {
    document.documentElement.innerHTML = readFileSync('packages/exojs-bench/src/rendering/dpr-probe/page/index.html', 'utf8');
    vi.stubGlobal('__PROBE_META__', { gitSha: 'test', engineVersion: 'test' });
    HTMLElement.prototype.scrollIntoView = vi.fn();
    mocks.start.mockReset();
    mocks.run.mockReset();
    const preview = {
      backendType: 'webgl2',
      cssWidth: 1,
      cssHeight: 1,
      backingWidth: 1,
      backingHeight: 1,
      internalTargets: [],
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const error = new Error('transition failed');
    mocks.start.mockResolvedValue(preview);
    mocks.run.mockResolvedValue({ errors: [], internalTargets: [] });

    if (failurePoint === 'environment') {
      mocks.start.mockRejectedValueOnce(error);
    }

    await import('../src/rendering/dpr-probe/page/probe');
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
    const runButton = document.querySelector<HTMLButtonElement>('#run-sustained-2')!;

    if (failurePoint === 'environment') {
      expect(document.querySelector('#status')!.textContent).toContain('transition failed');
    } else {
      preview.stop.mockRejectedValueOnce(error);

      if (failurePoint === 'preview-stop') {
        const buttons = document.querySelectorAll<HTMLButtonElement>('#dpr-buttons button');
        buttons[0]!.click();
        await vi.waitFor(() => expect(document.querySelector('#visual-readout')!.textContent).toContain('transition failed'));
        buttons[1]!.click();
        await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(3));
      } else {
        runButton.click();
        await vi.waitFor(() => expect(document.querySelector('#status')!.textContent).toContain('aborted: transition failed'));
        expect(runButton.disabled).toBe(false);
        expect(document.querySelector<HTMLButtonElement>('#run-matrix')!.disabled).toBe(false);
        expect(document.querySelector<HTMLButtonElement>('#run-sustained-3')!.disabled).toBe(false);
      }
    }

    runButton.click();
    await vi.waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(runButton.disabled).toBe(false));
  },
);
