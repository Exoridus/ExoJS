import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import type { PersistentSlotBundle } from '#rendering/plan/persistentSlotDraw';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import { RenderPlanPlayer } from '#rendering/plan/RenderPlanPlayer';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { RenderNode } from '#rendering/RenderNode';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { View } from '#rendering/View';

/**
 * What the plan does when a backend's persistent slot store cannot represent the
 * selection it was just handed.
 *
 * The store's buffers are bounded by the GRANTED device limits, and the bound is
 * only knowable once the selection's slot count exists - a root of ten million
 * items whose camera never admits more than a few thousand is perfectly
 * representable, so refusing at acquisition on the item count would cost the
 * fast path exactly the scenes it exists for. The answer is therefore asked per
 * selection, and a refusal has to put the root back on the ordinary path rather
 * than let the backend allocate something the device will reject.
 */

class Leaf extends Drawable {
  public constructor(public readonly id: string) {
    super();
    this.setLocalBounds(0, 0, 16, 16);
  }
}

const flaggedRenderer = { _supportsRetainedBatches: true, _supportsPersistentSlots: true };

interface PersistentHarness {
  backend: RenderBackend;
  /** Ids passed to `backend.draw`, i.e. what the ORDINARY path drew. */
  draws: string[];
  /** One entry per `_drawPersistentOrder`, holding the order stream's length. */
  persistentDraws: number[];
  acquisitions: number;
  writes: number;
  /** Selections the store admits; a higher slot count is refused. */
  representableSlots: number;
}

const createHarness = (): PersistentHarness => {
  const renderTarget = new RenderTarget(800, 600, true);
  const harness = {
    draws: [] as string[],
    persistentDraws: [] as number[],
    acquisitions: 0,
    writes: 0,
    representableSlots: Number.POSITIVE_INFINITY,
  };

  const bundle: PersistentSlotBundle = {
    generation: 1,
    destroy() {},
    canRepresent(slots: number): boolean {
      return slots <= harness.representableSlots;
    },
  };

  const backend = {
    backendType: RenderBackendType.WebGl2,
    stats: createRenderStats(),
    renderTarget,
    rendererRegistry: {
      resolve(): unknown {
        return flaggedRenderer;
      },
    },
    get view() {
      return renderTarget.view;
    },
    async initialize() {
      return backend;
    },
    resetStats() {
      return backend;
    },
    clear() {
      return backend;
    },
    resize() {
      return backend;
    },
    setView(view: View) {
      renderTarget.setView(view);

      return backend;
    },
    setRenderTarget() {
      return backend;
    },
    pushScissorRect() {
      return backend;
    },
    popScissorRect() {
      return backend;
    },
    composeWithAlphaMask() {
      return backend;
    },
    acquireRenderTexture() {
      throw new Error('not used in this test');
    },
    releaseRenderTexture() {
      return backend;
    },
    draw(drawable: unknown) {
      harness.draws.push((drawable as Leaf).id);

      return backend;
    },
    execute() {
      return backend;
    },
    flush() {
      return backend;
    },
    destroy() {
      renderTarget.destroy();
    },
    _endDrawPlan(): void {},
    _setRenderGroupTransform(): void {},
    _acquirePersistentSlots(): PersistentSlotBundle | null {
      harness.acquisitions++;

      return bundle;
    },
    _writePersistentSlots(): void {
      harness.writes++;
    },
    _drawPersistentOrder(_bundle: PersistentSlotBundle, _order: Uint32Array, count: number): void {
      harness.persistentDraws.push(count);
    },
  } as unknown as RenderBackend;

  return Object.assign(harness, { backend });
};

const playFrame = (root: RenderNode, backend: RenderBackend): void => {
  const builder = RenderPlanBuilder.acquire();

  try {
    const plan = builder.build(root, backend);

    RenderPlanOptimizer.optimize(plan);
    RenderPlanPlayer.play(plan, backend);
  } finally {
    RenderPlanBuilder.release(builder);
  }
};

const viewAt = (centerX: number, centerY = 300): View => new View(centerX, centerY, 800, 600);

const addRow = (parent: Container, count: number, startX: number, spacing: number): void => {
  for (let i = 0; i < count; i++) {
    const leaf = new Leaf(`n${i}`);

    leaf.setPosition(startX + i * spacing, 300);
    parent.addChild(leaf);
  }
};

/**
 * Drive `root` to the tier where it selects from a persistent source and leave
 * the camera at `centerX`. The build gate wants two consecutive rebuild frames
 * over unchanged content, so the camera has to force a second rebuild first.
 */
const driveToSourceTier = (root: RenderNode, backend: RenderBackend, centerX = 400): void => {
  backend.setView(viewAt(400));
  playFrame(root, backend);

  backend.setView(viewAt(100000));
  playFrame(root, backend);

  backend.setView(viewAt(centerX));
  playFrame(root, backend);
};

const createScene = (): Container => {
  const root = new Container();

  root.cullable = false;
  addRow(root, 200, -1000, 24);

  return root;
};

describe('persistent slots: a store that cannot represent the selection', () => {
  test('draws through the store while the selection fits', () => {
    const harness = createHarness();
    const root = createScene();

    driveToSourceTier(root, harness.backend);
    harness.draws.length = 0;
    harness.persistentDraws.length = 0;

    harness.backend.setView(viewAt(600));
    playFrame(root, harness.backend);

    expect(harness.persistentDraws.length).toBe(1);
    expect(harness.draws).toEqual([]);

    root.destroy();
    harness.backend.destroy();
  });

  test('falls back to the ordinary path instead of letting the backend allocate', () => {
    const harness = createHarness();
    const root = createScene();

    driveToSourceTier(root, harness.backend);

    // Every slot this camera admits is now one too many. The refusal has to
    // land BEFORE the write hook, which is where a real backend would size its
    // buffers against the device.
    harness.representableSlots = 0;
    harness.draws.length = 0;
    harness.persistentDraws.length = 0;
    harness.writes = 0;

    harness.backend.setView(viewAt(600));
    playFrame(root, harness.backend);

    expect(harness.persistentDraws).toEqual([]);
    expect(harness.writes).toBe(0);
    expect(harness.draws.length).toBeGreaterThan(0);

    root.destroy();
    harness.backend.destroy();
  });

  test('remembers the refusal rather than re-asking every frame', () => {
    const harness = createHarness();
    const root = createScene();

    driveToSourceTier(root, harness.backend);
    harness.representableSlots = 0;
    harness.persistentDraws.length = 0;

    harness.backend.setView(viewAt(600));
    playFrame(root, harness.backend);

    const afterRefusal = harness.acquisitions;

    for (let i = 0; i < 3; i++) {
      harness.backend.setView(viewAt(600 + i * 40));
      playFrame(root, harness.backend);
    }

    // Re-acquiring would re-run the backend's whole eligibility walk over every
    // item, once a frame, for a root that has already been answered.
    expect(harness.acquisitions).toBe(afterRefusal);
    expect(harness.persistentDraws).toEqual([]);

    root.destroy();
    harness.backend.destroy();
  });
});
