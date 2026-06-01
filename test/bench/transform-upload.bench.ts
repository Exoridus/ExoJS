import { bench, describe } from 'vitest';

import { Drawable } from '../../src/rendering/Drawable';
import { type DrawCommand, drawCommandUsesSharedTransform, type MaterialKey, RenderEntryKind } from '../../src/rendering/plan/RenderCommand';
import type { RenderBackend } from '../../src/rendering/RenderBackend';
import { TransformBuffer } from '../../src/rendering/TransformBuffer';

const NODE_COUNT = 4096;
const FRAME_COUNT = 240;

// Sprite/Mesh-like: consumes the shared transform storage.
class ConsumingDrawable extends Drawable {
  public constructor(x: number, y: number) {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
    this.setPosition(x, y);
  }
}

// Text/Particle-like: packs its own per-node data and opts out.
class NonConsumingDrawable extends Drawable {
  public constructor(x: number, y: number) {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
    this.setPosition(x, y);
  }
}

const material = (key: number): MaterialKey => ({
  rendererId: 1,
  blendMode: 0,
  textureId: -1,
  shaderId: -1,
  pipelineKey: key,
  bindKey: key,
});

const createCommand = (drawable: Drawable, nodeIndex: number): DrawCommand => ({
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

const consumingRenderer = {};
const nonConsumingRenderer = { _consumesSharedTransform: false };

// Mirrors the real RendererRegistry resolve-by-type used at the group-upload boundary.
const backend = {
  rendererRegistry: {
    resolve(drawable: Drawable): unknown {
      return drawable instanceof NonConsumingDrawable ? nonConsumingRenderer : consumingRenderer;
    },
  },
} as unknown as RenderBackend;

// Build the scenes once: per-iteration cost is the transform packing, not scene setup.
const buildCommands = (nonConsumingEvery: number): DrawCommand[] => {
  const commands: DrawCommand[] = [];

  for (let i = 0; i < NODE_COUNT; i++) {
    const x = (i % 64) * 18;
    const y = Math.floor(i / 64) * 18;
    const drawable = nonConsumingEvery > 0 && i % nonConsumingEvery === 0 ? new NonConsumingDrawable(x, y) : new ConsumingDrawable(x, y);

    commands.push(createCommand(drawable, i));
  }

  return commands;
};

// Faithful reproduction of the WebGL2 group-upload boundary: write the rows of
// consuming commands, skip the rest, then commit a snapshot — once per frame.
const packFrame = (buffer: TransformBuffer, commands: DrawCommand[]): void => {
  buffer.begin(NODE_COUNT);

  for (const command of commands) {
    if (drawCommandUsesSharedTransform(command, backend)) {
      buffer.write(command.nodeIndex, command.drawable.getGlobalTransform(), command.drawable.tint);
    } else {
      buffer.recordSkippedWrite();
    }
  }

  buffer.commitSnapshot(NODE_COUNT);
};

const allConsuming = buildCommands(0);
const halfNonConsuming = buildCommands(2);

describe('transform-upload', () => {
  bench('all-consuming (4k nodes, 240 frames)', () => {
    const buffer = new TransformBuffer();

    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      packFrame(buffer, allConsuming);
    }
  });

  // Half the nodes opt out — their per-draw writes must be skipped, not packed.
  // A regression that reintroduces per-draw writes for non-consuming renderers
  // would close the gap between these two cases.
  bench('half-non-consuming (4k nodes, 240 frames)', () => {
    const buffer = new TransformBuffer();

    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      packFrame(buffer, halfNonConsuming);
    }
  });
});
