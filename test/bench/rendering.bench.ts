import { bench, describe } from 'vitest';

import { Container } from '../../src/rendering/Container';
import { Drawable } from '../../src/rendering/Drawable';
import type { RenderBackend } from '../../src/rendering/RenderBackend';
import { RenderBackendType } from '../../src/rendering/RenderBackendType';
import { createRenderStats, resetRenderStats } from '../../src/rendering/RenderStats';
import { RenderTarget } from '../../src/rendering/RenderTarget';
import { RenderTexture } from '../../src/rendering/texture/RenderTexture';

const VIEWPORT_W = 800;
const VIEWPORT_H = 600;
const FRAME_COUNT = 240;

const createStubRuntime = (): RenderBackend => {
  const renderTarget = new RenderTarget(VIEWPORT_W, VIEWPORT_H, true);
  const stats = createRenderStats();

  return {
    backendType: RenderBackendType.WebGl2,
    stats,
    renderTarget,
    get view() {
      return renderTarget.view;
    },
    async initialize() {
      return this;
    },
    resetStats() {
      resetRenderStats(stats);
      return this;
    },
    clear() {
      return this;
    },
    resize(w, h) {
      renderTarget.resize(w, h);
      return this;
    },
    setView(v) {
      renderTarget.setView(v);
      return this;
    },
    setRenderTarget() {
      return this;
    },
    pushScissorRect() {
      return this;
    },
    popScissorRect() {
      return this;
    },
    composeWithAlphaMask() {
      return this;
    },
    acquireRenderTexture(w, h) {
      return new RenderTexture(w, h);
    },
    releaseRenderTexture(t) {
      t.destroy();
      return this;
    },
    draw() {
      stats.submittedNodes++;
      return this;
    },
    execute() {
      return this;
    },
    flush() {
      return this;
    },
    destroy() {
      renderTarget.destroy();
    },
  };
};

const createNode = (x: number, y: number, size = 16): Drawable => {
  const node = new Drawable();
  node.getLocalBounds().set(0, 0, size, size);
  node.setPosition(x, y);
  return node;
};

const createGridScene = (cols: number, rows: number, spacing: number, ox = 0, oy = 0): Container => {
  const root = new Container();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      root.addChild(createNode(ox + c * spacing, oy + r * spacing));
    }
  }
  return root;
};

describe('rendering', () => {
  bench('dense-visible (8k nodes, 240 frames)', () => {
    const root = createGridScene(200, 40, 20);
    const runtime = createStubRuntime();

    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      runtime.resetStats();
      root.render(runtime);
      runtime.flush();
    }

    root.destroy();
    runtime.destroy();
  });

  bench('dense-mostly-offscreen (8k nodes placed far off-screen, 240 frames)', () => {
    const root = createGridScene(200, 40, 20, 5000, 5000);
    const runtime = createStubRuntime();

    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      runtime.resetStats();
      root.render(runtime);
      runtime.flush();
    }

    root.destroy();
    runtime.destroy();
  });

  bench('camera-pan (6k nodes, 240 frames, panning view)', () => {
    const root = createGridScene(300, 20, 18);
    const runtime = createStubRuntime();

    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      runtime.resetStats();
      runtime.view.setCenter(400 + frame * 18, 300);
      root.render(runtime);
      runtime.flush();
    }

    root.destroy();
    runtime.destroy();
  });
});
