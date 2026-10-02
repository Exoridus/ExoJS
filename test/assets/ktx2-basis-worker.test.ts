import { afterEach, describe, expect, test, vi } from 'vitest';

import { BasisKtx2Runtime } from '#assets/factories/BasisKtx2Runtime';

class FakeWorker {
  public static instances: FakeWorker[] = [];
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;
  public onmessageerror: (() => void) | null = null;
  public messages: Array<{ kind: string; id?: number; buffer?: ArrayBuffer }> = [];
  public terminated = false;
  public constructor() {
    FakeWorker.instances.push(this);
  }
  public postMessage(message: { kind: string; id?: number; buffer?: ArrayBuffer }): void {
    this.messages.push(message);
  }
  public terminate(): void {
    this.terminated = true;
  }
  public reply(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}
const descriptor = {
  pixelWidth: 4,
  pixelHeight: 4,
  levelCount: 1,
  dfd: { hasAlpha: true, colorPrimaries: 1, transferFunction: 1, flags: 0 },
  universal: 'uastc',
} as const;
const run = (runtime: BasisKtx2Runtime, signal?: AbortSignal) => runtime.transcode(new ArrayBuffer(16), descriptor, { id: 13 }, signal);
const ready = async (): Promise<FakeWorker> => {
  const worker = FakeWorker.instances[0]!;
  worker.reply({ kind: 'ready' });
  await Promise.resolve();
  return worker;
};
afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.instances = [];
});

describe('Basis worker lifecycle', () => {
  test('lazy initialization is shared and equal-source concurrent requests use unique ids', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const runtime = new BasisKtx2Runtime();
    expect(FakeWorker.instances).toHaveLength(0);
    const first = run(runtime),
      second = run(runtime);
    const worker = await ready();
    expect(worker.messages.filter(message => message.kind === 'init')).toHaveLength(1);
    const jobs = worker.messages.filter(message => message.kind === 'transcode');
    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.id).not.toBe(jobs[1]!.id);
    worker.reply({ kind: 'result', id: jobs[1]!.id, levels: [new Uint8Array([2])] });
    worker.reply({ kind: 'result', id: jobs[0]!.id, levels: [new Uint8Array([1])] });
    expect((await first)[0]).toEqual(new Uint8Array([1]));
    expect((await second)[0]).toEqual(new Uint8Array([2]));
    const third = run(runtime);
    await Promise.resolve();
    worker.reply({ kind: 'result', id: worker.messages.at(-1)!.id, levels: [new Uint8Array([3])] });
    expect((await third)[0]).toEqual(new Uint8Array([3]));
    expect(FakeWorker.instances).toHaveLength(1);
    runtime.destroy();
    expect(worker.terminated).toBe(true);
  });

  test.each([false, true])('abort settles while initialization/processing is pending (ready=%s)', async initialized => {
    vi.stubGlobal('Worker', FakeWorker);
    const runtime = new BasisKtx2Runtime(),
      controller = new AbortController();
    const job = run(runtime, controller.signal);
    const outcome = Promise.allSettled([job]);
    const worker = FakeWorker.instances[0]!;
    if (initialized) await ready();
    controller.abort();
    expect(await outcome).toMatchObject([{ status: 'rejected', reason: { name: 'AbortError' } }]);
    if (!initialized) await ready();
    expect(worker.messages.filter(message => message.kind === 'transcode')).toHaveLength(initialized ? 1 : 0);
    const next = run(runtime);
    await Promise.resolve();
    worker.reply({ kind: 'result', id: worker.messages.at(-1)!.id, levels: [] });
    expect(await next).toEqual([]);
    runtime.destroy();
  });

  test.each(['worker', 'init', 'message'])('propagates %s failure to every request and terminates', async mode => {
    vi.stubGlobal('Worker', FakeWorker);
    const runtime = new BasisKtx2Runtime();
    const outcomes = Promise.allSettled([run(runtime), run(runtime)]);
    const worker = FakeWorker.instances[0]!;
    if (mode === 'worker') worker.onerror?.({ message: 'worker failed', preventDefault() {} } as ErrorEvent);
    else if (mode === 'init') worker.reply({ kind: 'fatal', message: 'WASM init failed' });
    else worker.onmessageerror?.();
    expect(await outcomes).toMatchObject([
      { status: 'rejected', reason: { message: expect.stringMatching(/failed/) } },
      { status: 'rejected', reason: { message: expect.stringMatching(/failed/) } },
    ]);
    expect(worker.terminated).toBe(true);
    await expect(run(runtime)).rejects.toThrow(/failed/);
    runtime.destroy();
  });

  test('request failure does not poison other requests; destroy rejects pending work', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const runtime = new BasisKtx2Runtime();
    const bad = Promise.allSettled([run(runtime)]);
    const good = run(runtime);
    const worker = await ready(),
      jobs = worker.messages.filter(message => message.kind === 'transcode');
    worker.reply({ kind: 'error', id: jobs[0]!.id, message: 'malformed' });
    worker.reply({ kind: 'result', id: jobs[1]!.id, levels: [] });
    expect(await bad).toMatchObject([{ status: 'rejected', reason: { message: 'malformed' } }]);
    expect(await good).toEqual([]);
    const pending = Promise.allSettled([run(runtime)]);
    runtime.destroy();
    expect(await pending).toMatchObject([{ status: 'rejected', reason: { message: expect.stringMatching(/destroyed/) } }]);
    await expect(run(runtime)).rejects.toThrow(/destroyed/);
  });
});
