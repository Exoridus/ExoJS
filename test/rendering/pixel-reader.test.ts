/**
 * `PixelReader` over an inert backend: the slot ring, refusal, release, the
 * handle contract and what a resize or a destroy does to reads in flight.
 * Whether pixels actually land is the browser specs' business.
 */

import { logger } from '#core/Logger';
import { Rectangle } from '#math/Rectangle';
import { RenderingContext } from '#rendering/RenderingContext';
import { PixelReader } from '#rendering/texture/PixelReader';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { TextureFormat } from '#rendering/types';

import type { PixelReadbackDouble } from '../support/pixel-readback-double';
import { createRenderBackendDouble } from '../support/render-backend-double';

const createRuntime = () => {
  const readbacks: PixelReadbackDouble[] = [];
  const base = createRenderBackendDouble();
  const backend = {
    ...base,
    createPixelReadback(...args: Parameters<typeof base.createPixelReadback>) {
      const readback = base.createPixelReadback(...args) as PixelReadbackDouble;

      readbacks.push(readback);

      return readback;
    },
  };
  const context = new RenderingContext(backend);

  return { context, backend, readbacks, latest: () => readbacks[readbacks.length - 1]! };
};

describe('PixelReader', () => {
  beforeEach(() => {
    logger._resetOnce();
  });

  test('a fresh request is neither ready nor failed until the backend drains it', () => {
    const { context, latest } = createRuntime();
    const reader = context.createPixelReader(new RenderTexture(8, 4));
    const read = reader.request()!;

    expect(read).not.toBeNull();
    expect([read.ready, read.failed, read.data]).toEqual([false, false, null]);
    expect(reader.inFlight).toBe(1);

    latest().settle(7);

    expect(read.ready).toBe(true);
    expect(read.data).toEqual({ width: 8, height: 4, data: new Uint8ClampedArray(8 * 4 * 4).fill(7) });
  });

  test('refuses with null once every slot is held and warns exactly once per reader', () => {
    const warnings: string[] = [];
    const unsubscribe = logger.addSink(entry => {
      warnings.push(entry.message);
    });
    const { context } = createRuntime();
    const reader = context.createPixelReader(new RenderTexture(2, 2), { slots: 2 });

    try {
      expect(reader.request()).not.toBeNull();
      expect(reader.request()).not.toBeNull();
      expect(reader.request()).toBeNull();
      expect(reader.request()).toBeNull();
      expect(reader.inFlight).toBe(2);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/all 2 slots are held/);
    } finally {
      unsubscribe();
    }
  });

  test('release returns the slot, and the pooled handle is handed out again', () => {
    const { context, latest } = createRuntime();
    const reader = context.createPixelReader(new RenderTexture(2, 2), { slots: 1 });
    const first = reader.request()!;

    expect(reader.request()).toBeNull();

    latest().settle(1);
    first.release();
    first.release();

    expect(reader.inFlight).toBe(0);
    expect([first.ready, first.failed]).toEqual([false, false]);

    const second = reader.request();

    expect(second).toBe(first);
    expect(second!.ready).toBe(false);
  });

  test('releasing a pending read abandons it without counting it twice', () => {
    const { context, latest } = createRuntime();
    const reader = context.createPixelReader(new RenderTexture(2, 2), { slots: 1 });
    const read = reader.request()!;

    read.release();

    expect(reader.inFlight).toBe(0);
    expect(latest().pending).toEqual([]);
    expect(latest().settle()).toBe(-1);
    expect(reader.request()).not.toBeNull();
  });

  test('a failed read stays failed until released, then the slot is free again', () => {
    const { context, latest } = createRuntime();
    const reader = context.createPixelReader(new RenderTexture(2, 2), { slots: 1 });
    const read = reader.request()!;

    latest().fail();

    expect([read.ready, read.failed, read.data]).toEqual([false, true, null]);
    expect(reader.request()).toBeNull();

    read.release();

    expect(reader.request()).not.toBeNull();
  });

  test('destroying the reader fails reads in flight, releases the backend readback, and refuses further requests', () => {
    const { context, latest } = createRuntime();
    const reader = context.createPixelReader(new RenderTexture(2, 2));
    const read = reader.request()!;

    reader.destroy();
    reader.destroy();

    expect(latest().destroyed).toBe(true);
    expect([read.ready, read.failed]).toEqual([false, true]);
    expect(reader.isDestroyed).toBe(true);
    expect(() => reader.request()).toThrow(/destroyed reader/);
    expect(() => read.release()).not.toThrow();
  });

  test('a whole-texture reader follows a resized source and fails the reads it had out', () => {
    const { context, readbacks } = createRuntime();
    const source = new RenderTexture(4, 4);
    const reader = context.createPixelReader(source);
    const stale = reader.request()!;

    source.setSize(8, 2);

    const fresh = reader.request()!;

    expect(readbacks).toHaveLength(2);
    expect(readbacks[0]!.destroyed).toBe(true);
    expect([reader.width, reader.height]).toEqual([8, 2]);
    expect([stale.ready, stale.failed]).toEqual([false, true]);
    expect(fresh.failed).toBe(false);
    expect(reader.inFlight).toBe(1);

    readbacks[1]!.settle();

    expect(fresh.data!.width).toBe(8);
  });

  test('a region reader keeps its rectangle across a resize and refuses once it no longer fits', () => {
    const { context, readbacks } = createRuntime();
    const source = new RenderTexture(8, 8);
    const reader = context.createPixelReader(source, { region: new Rectangle(4, 4, 2, 2) });

    source.setSize(16, 16);

    expect(reader.request()).not.toBeNull();
    expect(readbacks).toHaveLength(1);

    source.setSize(5, 5);

    expect(() => reader.request()).toThrow(/does not lie inside the 5x5 texture/);
  });

  test('a destroyed source throws on request', () => {
    const { context } = createRuntime();
    const source = new RenderTexture(2, 2);
    const reader = context.createPixelReader(source);

    source.destroy();

    expect(() => reader.request()).toThrow();
  });

  test('refuses the same inputs as readPixels with the same words', () => {
    const { context } = createRuntime();

    expect(() => context.createPixelReader(new RenderTexture(2, 2, { format: TextureFormat.Rgba16F }))).toThrow(/'rgba16f'/);
    expect(() => context.createPixelReader(new RenderTexture(2, 2), { region: new Rectangle(1, 0, 4, 4) })).toThrow(/does not lie inside/);
    expect(() => context.createPixelReader(new RenderTexture(2, 2), { slots: 0 })).toThrow(/at least one slot/);
    expect(() => new PixelReader(createRenderBackendDouble(), new RenderTexture(2, 2), { slots: 1.5 })).toThrow(/at least one slot/);
  });

  test('the backend readback is created over the resolved rectangle', () => {
    const base = createRenderBackendDouble();
    const spy = vi.spyOn(base, 'createPixelReadback');
    const source = new RenderTexture(64, 32);

    new PixelReader(base, source, { region: new Rectangle(10.9, 2.1, 5.5, 3.9), slots: 3 });

    expect(spy).toHaveBeenCalledWith(source, 10, 2, 5, 3, 3);
  });
});
