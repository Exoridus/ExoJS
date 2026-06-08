import { Color } from '#core/Color';
import { Drawable } from '#rendering/Drawable';
import { type DrawCommand, drawCommandUsesSharedTransform, type MaterialKey, RenderEntryKind } from '#rendering/plan/RenderCommand';
import type { RenderBackend } from '#rendering/RenderBackend';
import { WebGpuTransformStorage } from '#rendering/webgpu/WebGpuTransformStorage';

// Sprite/Mesh-like: renderer reads the shared transform storage.
class ConsumingDrawable extends Drawable {
  public constructor(x: number, y: number, tint: Color) {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
    this.setPosition(x, y);
    this.setTint(tint);
  }
}

// Text/Particle-like: renderer packs its own per-node data and opts out.
class NonConsumingDrawable extends Drawable {
  public constructor(x: number, y: number, tint: Color) {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
    this.setPosition(x, y);
    this.setTint(tint);
  }
}

const consumingRenderer = {};
const nonConsumingRenderer = { _consumesSharedTransform: false };

const material = (key: number): MaterialKey => ({
  rendererId: 1,
  blendMode: 0,
  textureId: -1,
  shaderId: -1,
  pipelineKey: key,
  bindKey: key,
});

const createDrawCommand = (drawable: Drawable, nodeIndex: number): DrawCommand => ({
  kind: RenderEntryKind.Draw,
  drawable,
  nodeIndex,
  seq: nodeIndex,
  zIndex: 0,
  material: material(1),
  groupIndex: 1,
  minX: 0,
  minY: 0,
  maxX: 16,
  maxY: 16,
});

// Mirror WebGpuBackend._prepareDrawCommand: write consuming commands into the
// shared storage, record skips for renderers that opt out — routed through the
// production `drawCommandUsesSharedTransform` predicate.
const backend = {
  rendererRegistry: {
    resolve(drawable: Drawable): unknown {
      return drawable instanceof NonConsumingDrawable ? nonConsumingRenderer : consumingRenderer;
    },
  },
} as unknown as RenderBackend;

const prepare = (storage: WebGpuTransformStorage, command: DrawCommand): void => {
  if (drawCommandUsesSharedTransform(command, backend)) {
    storage.writeCommand(command);
  } else {
    storage.recordSkippedWrite();
  }
};

describe('WebGpuTransformStorage transform write stats', () => {
  test('consuming commands increment the write count, non-consuming the skip count', () => {
    const storage = new WebGpuTransformStorage();

    storage.begin(5);
    prepare(storage, createDrawCommand(new ConsumingDrawable(10, 20, new Color()), 0));
    prepare(storage, createDrawCommand(new ConsumingDrawable(30, 40, new Color()), 1));
    prepare(storage, createDrawCommand(new NonConsumingDrawable(50, 60, new Color()), 2));
    prepare(storage, createDrawCommand(new ConsumingDrawable(70, 80, new Color()), 3));
    prepare(storage, createDrawCommand(new NonConsumingDrawable(90, 100, new Color()), 4));

    expect(storage.buffer.writeCount).toBe(3);
    expect(storage.buffer.skippedWriteCount).toBe(2);
    // Only the consuming rows are packed; the highest written slot is node 3.
    expect(storage.buffer.count).toBe(4);
  });

  test('a batch of only non-consuming commands performs zero writes', () => {
    const storage = new WebGpuTransformStorage();

    storage.begin(3);
    prepare(storage, createDrawCommand(new NonConsumingDrawable(10, 20, new Color()), 0));
    prepare(storage, createDrawCommand(new NonConsumingDrawable(30, 40, new Color()), 1));
    prepare(storage, createDrawCommand(new NonConsumingDrawable(50, 60, new Color()), 2));

    expect(storage.buffer.writeCount).toBe(0);
    expect(storage.buffer.skippedWriteCount).toBe(3);
    expect(storage.buffer.count).toBe(0);
  });

  test('begin resets the storage write/skip counters between frames', () => {
    const storage = new WebGpuTransformStorage();

    storage.begin(2);
    prepare(storage, createDrawCommand(new ConsumingDrawable(10, 20, new Color()), 0));
    prepare(storage, createDrawCommand(new NonConsumingDrawable(30, 40, new Color()), 1));

    expect(storage.buffer.writeCount).toBe(1);
    expect(storage.buffer.skippedWriteCount).toBe(1);

    storage.begin(2);

    expect(storage.buffer.writeCount).toBe(0);
    expect(storage.buffer.skippedWriteCount).toBe(0);
  });
});
