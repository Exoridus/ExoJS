import { Color } from '#core/Color';
import type { Matrix } from '#math/Matrix';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import type { DrawCommand } from '#rendering/plan/RenderCommand';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import { RenderPlanPlayer } from '#rendering/plan/RenderPlanPlayer';
import type { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import {
  type RetainedBatchInstruction,
  retainedGenerationUnstamped,
  type RetainedGroupBundle,
  RetainedInstructionKind,
  type RetainedInstructionSet,
  stampRetainedBatchGeneration,
} from '#rendering/plan/RetainedInstructionSet';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { BlendModes } from '#rendering/types';

// ---------------------------------------------------------------------------
// Task 11 (S3-D10): the instruction-replay tier must reproduce the EXACT
// batch payloads the slow path's flush sequence produces — same batch count,
// same order, per batch the same blend mode, instance count, instance BYTES
// (after rebasing node indices group-local) and the same transform rows.
//
// The harness below models the real sprite renderers' flush pipeline at the
// byte level, deterministically in the unit suite: every draw packs a
// 6-word instance (bounds, packed tint, node index), batches split on blend
// change, group boundaries are flush boundaries, captures stage byte copies
// owned by the innermost bundle, and capture end rebases node indices and
// copies the referenced transform rows — exactly the S3-D4 model the real
// backends implement (their true bytes are covered by the backend suites and
// the browser pixel cells; THIS suite pins that the collect switch, player,
// and optimizer feed both tiers identical data in identical order).
// ---------------------------------------------------------------------------

const wordsPerInstance = 6;
const nodeIndexWord = 5;

class ByteLeaf extends Drawable {
  public constructor(public readonly id = '') {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
  }
}

const flaggedRenderer = { _supportsRetainedBatches: true };

const packTint = (color: Color): number => color.r + color.g * 256 + color.b * 65536 + Math.round(color.a * 255) * 16777216;

/** One modeled renderer flush: what the slow path uploads for the batch. */
interface ModelBatch {
  readonly blend: BlendModes;
  readonly instanceCount: number;
  readonly bytes: Float32Array;
}

/** The backend-opaque replay payload: the staged (rebased) byte copy. */
interface ModelPayload {
  readonly bundle: ModelBundle;
  readonly blend: BlendModes;
  readonly instanceCount: number;
  readonly bytes: Float32Array;
}

class ModelBundle implements RetainedGroupBundle {
  public generation = 0;
  /** Group-owned transform-row copy `[base..max]`, 2 floats per row (x, y). */
  public transformRows: Float32Array | null = null;

  public destroy(): void {
    this.transformRows = null;
    this.generation++;
  }
}

interface ModelCaptureFrame {
  readonly set: RetainedInstructionSet;
  readonly bundle: ModelBundle;
  readonly staged: ModelPayload[];
  readonly instructions: RetainedBatchInstruction[];
}

type ModelEvent =
  | { type: 'flush'; batch: ModelBatch }
  | { type: 'replay'; payload: ModelPayload }
  | { type: 'transform'; active: boolean }
  | { type: 'beginCapture' }
  | { type: 'endCapture' };

interface ByteBackendHarness {
  readonly backend: RenderBackend;
  readonly log: ModelEvent[];
  /** Frame-scoped node-index -> [x, y] rows (the Phase-1 model). */
  readonly frameRows: Map<number, readonly [number, number]>;
}

const createByteBackend = (): ByteBackendHarness => {
  const renderTarget = new RenderTarget(800, 600, true);
  const log: ModelEvent[] = [];
  const frameRows = new Map<number, readonly [number, number]>();
  const captures: ModelCaptureFrame[] = [];
  const pending: number[] = [];
  let pendingBlend: BlendModes | null = null;
  let currentCommand: DrawCommand | null = null;

  const flushPending = (): void => {
    if (pending.length === 0) {
      return;
    }

    const bytes = Float32Array.from(pending);
    const batch: ModelBatch = { blend: pendingBlend!, instanceCount: bytes.length / wordsPerInstance, bytes };

    pending.length = 0;
    pendingBlend = null;
    log.push({ type: 'flush', batch });

    if (captures.length === 0) {
      return;
    }

    // Bytes are stored once, owned by the INNERMOST capture's bundle (S3-D6);
    // one shared instruction is appended to every active set.
    const owner = captures[captures.length - 1]!;
    const payload: ModelPayload = { bundle: owner.bundle, blend: batch.blend, instanceCount: batch.instanceCount, bytes: batch.bytes.slice() };
    const instruction: RetainedBatchInstruction = {
      kind: RetainedInstructionKind.Batch,
      bundle: owner.bundle,
      generation: retainedGenerationUnstamped,
      instanceCount: batch.instanceCount,
      drawCalls: 1,
      payload,
    };

    owner.staged.push(payload);
    owner.instructions.push(instruction);

    for (const frame of captures) {
      frame.set.append(instruction);
    }
  };

  const backend = {
    backendType: RenderBackendType.WebGl2,
    stats: createRenderStats(),
    renderTarget,
    rendererRegistry: {
      resolve(drawable: Drawable) {
        if (drawable instanceof ByteLeaf) {
          return flaggedRenderer;
        }

        throw new Error('no renderer registered');
      },
    },
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
    resize() {
      return this;
    },
    setView(v: unknown) {
      renderTarget.setView(v as never);

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
      throw new Error('not used in this test');
    },
    releaseRenderTexture() {
      return this;
    },
    execute() {
      return this;
    },
    destroy() {
      renderTarget.destroy();
    },
    _beginDrawPlan(): void {
      frameRows.clear();
    },
    _endDrawPlan(): void {
      flushPending();
    },
    _prepareDrawCommand(command: DrawCommand): void {
      currentCommand = command;
    },
    draw(drawable: Drawable) {
      const command = currentCommand!;

      // The real batcher breaks on material/pipeline change; blend mode is
      // the model's stand-in.
      if (pending.length > 0 && pendingBlend !== drawable.blendMode) {
        flushPending();
      }

      pendingBlend = drawable.blendMode;
      pending.push(command.minX, command.minY, command.maxX, command.maxY, packTint((drawable as ByteLeaf).tint), command.nodeIndex);

      // Phase-1 model: the row for this node index, group-relative inside
      // groups (getGlobalTransform stops at the boundary).
      const matrix = drawable.getGlobalTransform();

      frameRows.set(command.nodeIndex, [matrix.x, matrix.y]);

      return this;
    },
    flush() {
      flushPending();

      return this;
    },
    _setRenderGroupTransform(transform: Matrix | null): void {
      flushPending(); // a group is a flush boundary (hook contract)
      log.push({ type: 'transform', active: transform !== null });
    },
    _beginRetainedCapture(set: RetainedInstructionSet): void {
      flushPending();

      let bundle = set.ownedBundle instanceof ModelBundle ? set.ownedBundle : null;

      if (bundle === null) {
        bundle = new ModelBundle();
        set.ownedBundle = bundle;
      }

      // WebGL2-style: the rewrite bumps the generation once per capture.
      bundle.generation++;
      bundle.transformRows = null;
      captures.push({ set, bundle, staged: [], instructions: [] });
      log.push({ type: 'beginCapture' });
    },
    _endRetainedCapture(set: RetainedInstructionSet): void {
      flushPending(); // trailing draws land inside the still-open captures

      let index = captures.length - 1;

      while (index >= 0 && captures[index]!.set !== set) {
        index--;
      }

      if (index === -1) {
        return;
      }

      const frame = captures.splice(index, 1)[0]!;

      log.push({ type: 'endCapture' });

      // Finalize (S3-D4 model): rebase node indices group-local, copy the
      // referenced transform rows into the group-owned store, then stamp the
      // instructions with the final generation (official plan-layer seam).
      let min = Number.POSITIVE_INFINITY;
      let max = -1;

      for (const staged of frame.staged) {
        for (let i = nodeIndexWord; i < staged.bytes.length; i += wordsPerInstance) {
          const value = staged.bytes[i]!;

          min = Math.min(min, value);
          max = Math.max(max, value);
        }
      }

      if (max >= min) {
        for (const staged of frame.staged) {
          for (let i = nodeIndexWord; i < staged.bytes.length; i += wordsPerInstance) {
            staged.bytes[i] = staged.bytes[i]! - min;
          }
        }

        const rows = new Float32Array((max - min + 1) * 2);

        for (let nodeIndex = min; nodeIndex <= max; nodeIndex++) {
          const row = frameRows.get(nodeIndex);

          if (row !== undefined) {
            rows.set(row, (nodeIndex - min) * 2);
          }
        }

        frame.bundle.transformRows = rows;
      }

      for (const instruction of frame.instructions) {
        stampRetainedBatchGeneration(instruction);
      }
    },
    _replayRetainedBatch(batch: RetainedBatchInstruction): void {
      flushPending(); // belt-and-braces; the boundary switch already drained

      log.push({ type: 'replay', payload: batch.payload as ModelPayload });
    },
  } as unknown as RenderBackend;

  return { backend, log, frameRows };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FragmentCarrier {
  _fragment: RetainedGroupFragment;
}

const playFrame = (root: Container, backend: RenderBackend): void => {
  const builder = RenderPlanBuilder.acquire();
  const plan = builder.build(root, backend);

  RenderPlanOptimizer.optimize(plan);
  RenderPlanBuilder.release(builder);
  RenderPlanPlayer.play(plan, backend);
};

/** Batches flushed INSIDE the outermost group segment (transform on..off). */
const groupSegmentBatches = (log: readonly ModelEvent[]): ModelBatch[] => {
  const batches: ModelBatch[] = [];
  let depth = 0;

  for (const event of log) {
    if (event.type === 'transform') {
      depth += event.active ? 1 : -1;
    } else if (event.type === 'flush' && depth > 0) {
      batches.push(event.batch);
    }
  }

  return batches;
};

const replayedPayloads = (log: readonly ModelEvent[]): ModelPayload[] =>
  log.filter(event => event.type === 'replay').map(event => (event as { payload: ModelPayload }).payload);

/**
 * Normalize slow-path batches the way capture finalization does: rebase the
 * node-index word by the SEGMENT-wide minimum (all batches of one group share
 * one base) so slow bytes become comparable with the group-local fast bytes.
 */
const rebaseSegment = (batches: readonly ModelBatch[]): Array<{ blend: BlendModes; instanceCount: number; bytes: number[] }> => {
  let min = Number.POSITIVE_INFINITY;

  for (const batch of batches) {
    for (let i = nodeIndexWord; i < batch.bytes.length; i += wordsPerInstance) {
      min = Math.min(min, batch.bytes[i]!);
    }
  }

  return batches.map(batch => {
    const bytes = Array.from(batch.bytes);

    for (let i = nodeIndexWord; i < bytes.length; i += wordsPerInstance) {
      bytes[i] = bytes[i]! - min;
    }

    return { blend: batch.blend, instanceCount: batch.instanceCount, bytes };
  });
};

/** The rows `[min..max]` the segment's instances reference, 2 floats per row. */
const segmentRows = (batches: readonly ModelBatch[], rows: ReadonlyMap<number, readonly [number, number]>): number[] => {
  let min = Number.POSITIVE_INFINITY;
  let max = -1;

  for (const batch of batches) {
    for (let i = nodeIndexWord; i < batch.bytes.length; i += wordsPerInstance) {
      min = Math.min(min, batch.bytes[i]!);
      max = Math.max(max, batch.bytes[i]!);
    }
  }

  const result = new Array<number>((max - min + 1) * 2).fill(0);

  for (let nodeIndex = min; nodeIndex <= max; nodeIndex++) {
    const row = rows.get(nodeIndex);

    if (row !== undefined) {
      result[(nodeIndex - min) * 2] = row[0];
      result[(nodeIndex - min) * 2 + 1] = row[1];
    }
  }

  return result;
};

const fragmentOf = (group: RetainedContainer): RetainedGroupFragment => (group as unknown as FragmentCarrier)._fragment;

// ---------------------------------------------------------------------------

describe('S3-D10 equivalence: instruction replay reproduces the slow-path batch payloads byte for byte', () => {
  const buildScene = (): { root: Container; group: RetainedContainer; a: ByteLeaf; mid: Container } => {
    const root = new Container();
    const outside = new ByteLeaf('x'); // shifts the group's frame-local node indices
    const group = new RetainedContainer();
    const mid = new Container();
    const a = new ByteLeaf('a');
    const b = new ByteLeaf('b');
    const c = new ByteLeaf('c');

    outside.setPosition(50, 60);
    a.setPosition(3, 4);
    a.setTint(new Color(255, 0, 0));
    b.setPosition(10, 0);
    b.setBlendMode(BlendModes.Add); // forces a batch split inside the group
    c.setPosition(7, 8);
    mid.addChild(a);
    mid.addChild(b);
    group.addChild(mid);
    group.addChild(c);
    group.setPosition(5, 5);
    root.addChild(outside);
    root.addChild(group);

    return { root, group, a, mid };
  };

  test('recorded set == slow flush sequence: batch count, order, blend, counts, group-local instance bytes, transform rows', () => {
    const { backend, log, frameRows } = createByteBackend();
    const { root, group } = buildScene();

    // F1: slow baseline — full collect, normal playback.
    playFrame(root, backend);

    const slow = rebaseSegment(groupSegmentBatches(log));
    const slowRows = segmentRows(groupSegmentBatches(log), frameRows);

    expect(slow).toHaveLength(3); // [a], [b] (Add split), [c] — pins the model

    // F2: clean -> entry replay + record.
    log.length = 0;
    playFrame(root, backend);

    const set = fragmentOf(group).instructions!;

    expect(set.hasRecording).toBe(true);

    // F3: clean + valid -> instruction splice.
    log.length = 0;
    playFrame(root, backend);

    const fast = replayedPayloads(log);

    expect(log.some(event => event.type === 'flush' && groupSegmentBatches([event]).length > 0)).toBe(false);
    expect(fast).toHaveLength(slow.length);

    for (let i = 0; i < slow.length; i++) {
      expect(fast[i]!.blend).toBe(slow[i]!.blend);
      expect(fast[i]!.instanceCount).toBe(slow[i]!.instanceCount);
      expect(Array.from(fast[i]!.bytes)).toEqual(slow[i]!.bytes);
    }

    // Transform rows: the group-owned copy equals the rows the slow path
    // wrote for the same (rebased) index range.
    const bundle = set.ownedBundle as ModelBundle;

    expect(Array.from(bundle.transformRows!)).toEqual(slowRows);

    // Stats-parity source: replayed instances cover the slow path's draws.
    const slowInstances = slow.reduce((sum, batch) => sum + batch.instanceCount, 0);
    const fastInstances = fast.reduce((sum, payload) => sum + payload.instanceCount, 0);

    expect(fastInstances).toBe(slowInstances);

    root.destroy();
    backend.destroy();
  });

  test('sensitivity: a tint change produces DIFFERENT bytes, and the re-recorded set matches the new slow baseline', () => {
    const { backend, log, frameRows } = createByteBackend();
    const { root, group, a } = buildScene();

    playFrame(root, backend); // F1 baseline
    playFrame(root, backend); // F2 record

    const oldBytes = replayFirstBatchBytes(fragmentOf(group).instructions!);

    // Mutate: dirty -> F4 slow baseline (fresh), F5 re-record, F6 splice.
    a.setTint(new Color(0, 255, 0, 0.5));
    log.length = 0;
    playFrame(root, backend); // F4: full collect

    const newSlow = rebaseSegment(groupSegmentBatches(log));
    const newSlowRows = segmentRows(groupSegmentBatches(log), frameRows);

    playFrame(root, backend); // F5: record
    log.length = 0;
    playFrame(root, backend); // F6: splice

    const fast = replayedPayloads(log);

    // The comparator is not vacuous: the tint word actually moved.
    expect(Array.from(fast[0]!.bytes)).not.toEqual(Array.from(oldBytes));

    expect(fast).toHaveLength(newSlow.length);

    for (let i = 0; i < newSlow.length; i++) {
      expect(Array.from(fast[i]!.bytes)).toEqual(newSlow[i]!.bytes);
    }

    const bundle = fragmentOf(group).instructions!.ownedBundle as ModelBundle;

    expect(Array.from(bundle.transformRows!)).toEqual(newSlowRows);

    root.destroy();
    backend.destroy();
  });

  test('camera pan and group move between record and replay leave the cached bytes and rows untouched (the live-matrix wins)', () => {
    const { backend, log } = createByteBackend();
    const { root, group } = buildScene();

    playFrame(root, backend); // F1
    playFrame(root, backend); // F2 record

    const set = fragmentOf(group).instructions!;
    const bundle = set.ownedBundle as ModelBundle;

    log.length = 0;
    playFrame(root, backend); // F3 splice (reference)

    const before = replayedPayloads(log).map(payload => Array.from(payload.bytes));
    const rowsBefore = Array.from(bundle.transformRows!);

    backend.view.setCenter(30, 30); // camera pan (bumps View.updateId)
    group.setPosition(20, 25); // group move (bumps only the group matrix)

    log.length = 0;
    playFrame(root, backend); // F4: must STILL splice

    const after = replayedPayloads(log);

    expect(log.filter(event => event.type === 'beginCapture')).toHaveLength(0); // no recapture
    expect(after).toHaveLength(before.length);

    for (let i = 0; i < before.length; i++) {
      expect(Array.from(after[i]!.bytes)).toEqual(before[i]);
    }

    expect(Array.from(bundle.transformRows!)).toEqual(rowsBefore);

    root.destroy();
    backend.destroy();
  });

  test('nested groups: the outer set replays the same per-batch bytes the slow path flushed on either side of the boundary', () => {
    const { backend, log } = createByteBackend();
    const root = new Container();
    const outer = new RetainedContainer();
    const inner = new RetainedContainer();
    const dynamic = new ByteLeaf('d');
    const b = new ByteLeaf('b');

    dynamic.setPosition(1, 1);
    b.setPosition(4, 4);
    inner.setPosition(2, 3);
    outer.addChild(dynamic);
    inner.addChild(b);
    outer.addChild(inner);
    root.addChild(outer);

    // F1: slow baseline for the whole nested tree.
    playFrame(root, backend);

    // Each batch is single-owner here, so per-batch rebasing (index -> 0)
    // matches what each owning capture produces for its own bytes.
    const slow1 = groupSegmentBatches(log).map(batch => rebaseSegment([batch])[0]!);

    expect(slow1).toHaveLength(2); // [d] under outer, [b] under inner

    // b never mutates again: F1's slow flush is ITS byte baseline.
    const slowB = slow1[1]!;

    // Ladder to the fully-spliced state (see the collect-switch suite):
    // inner records first while outer thrashes, then outer records with the
    // inner batch verbatim.
    // Slice 4b: a move on the direct child would be row-patched (outer stays
    // clean), breaking the thrash cadence — content-dirty the outer instead.
    dynamic.invalidateContent();
    playFrame(root, backend); // inner records
    dynamic.invalidateContent();
    playFrame(root, backend); // inner splices, outer suppressed

    // F4: outer recovery capture — a genuine slow collect for d's FINAL
    // content (the inner subtree splices, so d's flush is the last slow
    // baseline the scene will produce).
    log.length = 0;
    playFrame(root, backend);

    const slowD = groupSegmentBatches(log).map(batch => rebaseSegment([batch])[0]!);

    expect(slowD).toHaveLength(1); // only d flushed; b replayed from the inner set

    playFrame(root, backend); // F5: outer records (verbatim inner batch)

    expect(fragmentOf(outer).instructions?.hasRecording).toBe(true);

    log.length = 0;
    playFrame(root, backend); // F6: outer splices everything

    const fast = replayedPayloads(log);

    expect(fast).toHaveLength(2);
    expect(fast[1]!.bundle).not.toBe(fast[0]!.bundle); // b's bytes live in the INNER bundle (S3-D6)

    // d's replayed bytes equal its last slow flush; b's equal its F1 flush.
    expect(fast[0]!.blend).toBe(slowD[0]!.blend);
    expect(Array.from(fast[0]!.bytes)).toEqual(slowD[0]!.bytes);
    expect(fast[1]!.blend).toBe(slowB.blend);
    expect(Array.from(fast[1]!.bytes)).toEqual(slowB.bytes);

    root.destroy();
    backend.destroy();
  });
});

/** The first recorded batch's byte copy (for sensitivity comparisons). */
const replayFirstBatchBytes = (set: RetainedInstructionSet): Float32Array => {
  for (const instruction of set.instructions) {
    if (instruction.kind === RetainedInstructionKind.Batch) {
      return (instruction.payload as ModelPayload).bytes.slice();
    }
  }

  throw new Error('set holds no batch instruction');
};
