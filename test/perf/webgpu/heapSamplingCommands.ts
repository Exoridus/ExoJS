/**
 * Node-side CDP bridge for the WebGPU allocation harness.
 *
 * The Node allocation gate (`test/perf/rendering/allocation.ts`) drives V8's
 * allocation sampling profiler through `node:inspector`. That session belongs
 * to the Node process, and the WebGPU backend does not run there at all - it
 * needs a real browser with a real adapter. The same profiler is reachable in
 * Chromium over CDP (`HeapProfiler.startSampling` / `stopSampling`), and the
 * playwright browser provider hands every vitest browser command a live
 * `BrowserContext`, so these three commands bracket a measurement window from
 * inside the page while the profiler itself runs where the JS heap is.
 *
 * The two `includeObjectsCollectedBy*GC` flags are as load-bearing here as they
 * are in the Node sampler: without them the profile reports only what is still
 * live at `stopSampling`, which is the opposite of a per-frame throwaway rate.
 *
 * Registered in `vitest.config.ts` under the `browser-webgpu-alloc` project.
 *
 * @internal Test/perf-only.
 */
import type { BrowserCommandContext } from 'vitest/node';

/** One node of V8's sampling heap profile, as CDP serialises it. */
export interface SamplingProfileNode {
  readonly callFrame: {
    readonly functionName: string;
    readonly url: string;
    readonly lineNumber: number;
    readonly columnNumber: number;
  };
  readonly selfSize: number;
  readonly id: number;
  readonly children: readonly SamplingProfileNode[];
}

/**
 * The playwright provider augments `BrowserCommandContext` with `page` and
 * `context`; the augmentation is only visible where the provider's types are
 * imported, so the two fields are narrowed locally instead.
 */
interface PlaywrightCommandContext extends BrowserCommandContext {
  readonly page: object;
  readonly context: { newCDPSession(page: object): Promise<CdpSession> };
}

interface CdpSession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  detach(): Promise<void>;
}

/**
 * One CDP session per measured window, torn down with it. A session held open
 * across scenes would be a second reason for numbers to depend on what ran
 * before, and this harness exists to have none.
 */
let session: CdpSession | null = null;

export const startHeapSampling = async (ctx: BrowserCommandContext, samplingInterval = 512): Promise<number> => {
  const { context, page } = ctx as PlaywrightCommandContext;

  session = await context.newCDPSession(page);

  await session.send('HeapProfiler.enable');
  await session.send('HeapProfiler.startSampling', {
    samplingInterval,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });

  return 0;
};

export const stopHeapSampling = async (): Promise<SamplingProfileNode> => {
  if (session === null) throw new Error('stopHeapSampling called without a matching startHeapSampling.');

  const result = (await session.send('HeapProfiler.stopSampling')) as { profile: { head: SamplingProfileNode } };

  await session.send('HeapProfiler.disable');
  await session.detach();
  session = null;

  return result.profile.head;
};

/**
 * The page cannot write files and cannot print to the runner's stdout in a way
 * a driver can parse, so the cell hands its finished record here.
 */
export const emitAllocationRecord = (_ctx: BrowserCommandContext, record: unknown): number => {
  process.stdout.write(`\n__EXOJS_WEBGPU_ALLOC__${JSON.stringify(record)}\n`);

  return 0;
};
