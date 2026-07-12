// CPU-STUB backend, no GPU submission — MEASUREMENT ONLY, never a CI gate.
// Not comparable to the real WebGL2/WebGPU backend, nor to the GPU-baseline
// suite (`test/perf/baseline/`, `pnpm perf:baseline`) — see review S3/B1d.
// Sub-30% deltas between runs are noise, not signal.
import { bench, describe } from 'vitest';

import { Container } from '../../src/rendering/Container';
import { Drawable } from '../../src/rendering/Drawable';
import { RenderPlanBuilder } from '../../src/rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '../../src/rendering/plan/RenderPlanOptimizer';
import { RenderPlanPlayer } from '../../src/rendering/plan/RenderPlanPlayer';
import type { RenderBackend } from '../../src/rendering/RenderBackend';
import { RenderBackendType } from '../../src/rendering/RenderBackendType';
import { createRenderStats } from '../../src/rendering/RenderStats';
import { RenderTarget } from '../../src/rendering/RenderTarget';

const NODE_COUNT = 4096;
const PLAY_COUNT = 240;
const VIEWPORT = 200_000; // huge view so nothing culls — every node reaches playback

// Sprite-like drawable carrying a texture identity so material keys can vary.
class TexturedDrawable extends Drawable {
  public readonly texture: object;

  public constructor(x: number, y: number, texture: object) {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
    this.setPosition(x, y);
    this.texture = texture;
  }
}

// Minimal stub backend: enough surface for RenderPlanBuilder.build (view / stats)
// and RenderPlanPlayer.play (draw). It deliberately implements none of the
// optional playback hooks — in particular not `_prepareRenderInstructionSlot`.
// That mirrors every shipped backend (no backend consumes the per-draw slot) and
// keeps the measurement on the player's own per-draw / per-group overhead rather
// than GPU work.
const createStub = (): RenderBackend => {
  const renderTarget = new RenderTarget(VIEWPORT, VIEWPORT, true);
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
    acquireRenderTexture() {
      throw new Error('not needed for play bench');
    },
    releaseRenderTexture() {
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
  } as unknown as RenderBackend;
};

// `oneMaterial`: every node shares a texture → one coalesced render group, so the
// per-group upload boundary fires once and the run is dominated by per-draw cost.
// `manyMaterial`: every node gets its own texture → 4096 singleton groups, so the
// per-group boundary cost dominates instead.
const buildScene = (oneMaterial: boolean): Container => {
  const root = new Container();
  const shared = {};
  const cols = Math.ceil(Math.sqrt(NODE_COUNT));

  for (let i = 0; i < NODE_COUNT; i++) {
    root.addChild(new TexturedDrawable((i % cols) * 16, Math.floor(i / cols) * 16, oneMaterial ? shared : {}));
  }

  return root;
};

// Build + optimize the plan exactly once, outside the timed loop: each bench
// iteration replays the same optimized plan so the signal is the playback hot
// path alone, free of build / optimize / cull noise.
const prepare = (oneMaterial: boolean): { plan: ReturnType<RenderPlanBuilder['build']>; backend: RenderBackend; root: Container } => {
  const backend = createStub();
  const root = buildScene(oneMaterial);
  const builder = RenderPlanBuilder.acquire();
  const plan = builder.build(root, backend);

  RenderPlanOptimizer.optimize(plan);
  RenderPlanBuilder.release(builder);

  return { plan, backend, root };
};

const oneMaterial = prepare(true);
const manyMaterial = prepare(false);

describe('render-plan-play', () => {
  // Pure playback of a single coalesced render group (best case for batching).
  // A regression that reintroduces unconditional per-draw slot allocation
  // (`Object.freeze` + map insert) in RenderPlanPlayer shows up here first.
  bench('one-material (4096 draws, 1 group, 240 replays)', () => {
    for (let i = 0; i < PLAY_COUNT; i++) {
      RenderPlanPlayer.play(oneMaterial.plan, oneMaterial.backend);
    }
  });

  // Playback dominated by per-group upload boundaries (4096 singleton groups).
  bench('many-material (4096 draws, 4096 groups, 240 replays)', () => {
    for (let i = 0; i < PLAY_COUNT; i++) {
      RenderPlanPlayer.play(manyMaterial.plan, manyMaterial.backend);
    }
  });
});
