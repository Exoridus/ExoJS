import type { Matrix } from '#math/Matrix';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { RenderEntryKind } from '#rendering/plan/RenderCommand';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import { RenderPlanPlayer } from '#rendering/plan/RenderPlanPlayer';
import type { GroupScope, GroupScopeEntry } from '#rendering/plan/RenderScope';
import type { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import {
  type RetainedBatchInstruction,
  retainedGenerationUnstamped,
  RetainedInstructionKind,
  RetainedInstructionSet,
  retainedLeaveGroupInstruction,
  stampRetainedBatchGeneration,
} from '#rendering/plan/RetainedInstructionSet';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { RetainedContainer } from '#rendering/RetainedContainer';

// ---------------------------------------------------------------------------
// File-local drawable types resolved by the fake renderer registry below.
// ---------------------------------------------------------------------------

class RecordableLeaf extends Drawable {
  public constructor(public readonly id = '') {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
  }
}

class UnflaggedLeaf extends Drawable {
  public constructor() {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
  }
}

class MaterialLeaf extends Drawable {
  // Structural own-material carrier (drawableHasOwnMaterial reads `.material`).
  public readonly material = { pipelineKey: 1, bindKey: 1 };

  public constructor() {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
  }
}

class UnregisteredLeaf extends Drawable {
  public constructor() {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
  }
}

// v1 capability flag carrier (S3-D5.1): sprite-renderer default path only.
const flaggedRenderer = { _supportsRetainedBatches: true };
const unflaggedRenderer = {};

// File-local fake backend (repo convention keeps test harnesses file-local).
// Carries a renderer registry so the recordability predicate can resolve
// renderers exactly like the real collect path does.
const createTestBackend = (): RenderBackend => {
  const renderTarget = new RenderTarget(800, 600, true);

  return {
    backendType: RenderBackendType.WebGl2,
    stats: createRenderStats(),
    renderTarget,
    rendererRegistry: {
      resolve(drawable: Drawable) {
        if (drawable instanceof RecordableLeaf || drawable instanceof MaterialLeaf) {
          return flaggedRenderer;
        }

        if (drawable instanceof UnflaggedLeaf) {
          return unflaggedRenderer;
        }

        throw new Error(`no renderer registered for ${drawable.constructor.name}`);
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
      throw new Error('not used in this test');
    },
    releaseRenderTexture() {
      return this;
    },
    draw() {
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

interface FragmentCarrier {
  _fragment: RetainedGroupFragment;
}

// Full collect of `root` so every RetainedContainer below it captures its
// fragment (matches the real playRenderTree collect step).
const collectOnce = (root: Container, backend: RenderBackend): void => {
  const builder = RenderPlanBuilder.acquire();

  RenderPlanOptimizer.optimize(builder.build(root, backend));
  RenderPlanBuilder.release(builder);
};

const captureFragment = (group: RetainedContainer, backend: RenderBackend): RetainedGroupFragment => {
  const root = new Container();

  root.addChild(group);
  collectOnce(root, backend);

  return (group as unknown as FragmentCarrier)._fragment;
};

describe('recordability predicate (S3-D5): v1 records default-path flagged renderers only', () => {
  test('a fragment of flagged default-path drawables is recordable, including through nested plain containers', () => {
    const backend = createTestBackend();
    const group = new RetainedContainer();
    const mid = new Container();

    mid.addChild(new RecordableLeaf('a'));
    group.addChild(mid);
    group.addChild(new RecordableLeaf('b'));

    const fragment = captureFragment(group, backend);

    expect(fragment.hasCapture).toBe(true);
    expect(fragment.isRecordable(backend)).toBe(true);

    group.parent!.destroy();
    backend.destroy();
  });

  test('a renderer without the capability flag makes the fragment non-recordable (S3-D5.1)', () => {
    const backend = createTestBackend();
    const group = new RetainedContainer();

    group.addChild(new RecordableLeaf('a'));
    group.addChild(new UnflaggedLeaf());

    const fragment = captureFragment(group, backend);

    expect(fragment.isRecordable(backend)).toBe(false);

    group.parent!.destroy();
    backend.destroy();
  });

  test('a drawable with its own material makes the fragment non-recordable (S3-D5.2)', () => {
    const backend = createTestBackend();
    const group = new RetainedContainer();

    group.addChild(new MaterialLeaf());

    const fragment = captureFragment(group, backend);

    expect(fragment.isRecordable(backend)).toBe(false);

    group.parent!.destroy();
    backend.destroy();
  });

  test("pixelSnapMode !== 'none' makes the fragment non-recordable (S3-D5.3)", () => {
    const backend = createTestBackend();
    const group = new RetainedContainer();
    const snapped = new RecordableLeaf('a');

    snapped.pixelSnapMode = 'geometry';
    group.addChild(snapped);

    const fragment = captureFragment(group, backend);

    expect(fragment.isRecordable(backend)).toBe(false);

    group.parent!.destroy();
    backend.destroy();
  });

  test('any barrier record in the fragment makes it non-recordable (S3-D5.4)', () => {
    const backend = createTestBackend();
    const group = new RetainedContainer();
    const clipped = new RecordableLeaf('clipped');

    clipped.clip = true;
    clipped.clipShape = new Rectangle(0, 0, 8, 8);
    group.addChild(clipped); // direct-child barrier: supported, but blocks recording
    group.addChild(new RecordableLeaf('plain'));

    const fragment = captureFragment(group, backend);

    expect(fragment.isRecordable(backend)).toBe(false);

    group.parent!.destroy();
    backend.destroy();
  });

  test('a drawable without a registered renderer makes the fragment non-recordable', () => {
    const backend = createTestBackend();
    const group = new RetainedContainer();

    group.addChild(new UnregisteredLeaf());

    const fragment = captureFragment(group, backend);

    expect(fragment.isRecordable(backend)).toBe(false);

    group.parent!.destroy();
    backend.destroy();
  });

  test('recordability is re-evaluated after a recapture (structure change can flip it)', () => {
    const backend = createTestBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const bad = new UnflaggedLeaf();

    group.addChild(new RecordableLeaf('a'));
    group.addChild(bad);
    root.addChild(group);

    collectOnce(root, backend);

    const fragment = (group as unknown as FragmentCarrier)._fragment;

    expect(fragment.isRecordable(backend)).toBe(false);

    group.removeChild(bad);
    collectOnce(root, backend); // recapture without the blocker
    collectOnce(root, backend); // (splice; recordability follows the capture)

    expect(fragment.isRecordable(backend)).toBe(true);

    bad.destroy();
    root.destroy();
    backend.destroy();
  });
});

describe('RetainedInstructionSet: recording lifecycle and validity (S3-D3)', () => {
  const makeBatch = (bundle: { generation: number }, generation = bundle.generation): RetainedBatchInstruction => ({
    kind: RetainedInstructionKind.Batch,
    bundle,
    generation,
    instanceCount: 4,
    drawCalls: 1,
    payload: null,
  });

  test('a fresh set is not valid for any backend', () => {
    const backend = createTestBackend();
    const set = new RetainedInstructionSet();

    expect(set.hasRecording).toBe(false);
    expect(set.isValidFor(backend)).toBe(false);

    backend.destroy();
  });

  test('begin -> append -> commit yields a set valid exactly for the recording backend', () => {
    const backendA = createTestBackend();
    const backendB = createTestBackend();
    const set = new RetainedInstructionSet();
    const bundle = { generation: 1 };

    set.beginRecording(backendA);

    expect(set.isRecording).toBe(true);
    expect(set.isValidFor(backendA)).toBe(false); // not until commit

    set.append(makeBatch(bundle));
    set.commitRecording();

    expect(set.isRecording).toBe(false);
    expect(set.hasRecording).toBe(true);
    expect(set.instructions).toHaveLength(1);
    expect(set.isValidFor(backendA)).toBe(true);
    expect(set.isValidFor(backendB)).toBe(false); // backend identity is part of the key

    backendA.destroy();
    backendB.destroy();
  });

  test('generation stamping seam: unstamped instructions never validate; stampRetainedBatchGeneration at capture end makes them live', () => {
    const backend = createTestBackend();
    const set = new RetainedInstructionSet();
    const bundle = { generation: 1 };

    // A backend whose bundle generation moves during capture finalization
    // (grow-only buffers are (re)created at capture end) records with the
    // unstamped sentinel...
    const instruction = makeBatch(bundle, retainedGenerationUnstamped);

    set.beginRecording(backend);
    set.append(instruction);
    set.commitRecording();

    // ...so a capture whose finalize never ran (device loss mid-capture) can
    // never validate...
    expect(set.isValidFor(backend)).toBe(false);

    // ...even if the bundle generation were somehow -1-adjacent; the sentinel
    // is out of the generation domain (generations start at 1).
    bundle.generation = 2; // growth during finalize

    stampRetainedBatchGeneration(instruction);

    expect(instruction.generation).toBe(2); // the FINAL generation, post-growth
    expect(set.isValidFor(backend)).toBe(true);

    // Stamping is per-instruction by design: a poison instruction (forced
    // generation mismatch) is simply never stamped and keeps its veto.
    const poison = makeBatch(bundle, bundle.generation - 1);

    set.beginRecording(backend);
    set.append(makeBatch(bundle));
    set.append(poison);
    set.commitRecording();

    expect(set.isValidFor(backend)).toBe(false);

    backend.destroy();
  });

  test('a stale bundle generation invalidates the set (S3-D6 belt-and-braces)', () => {
    const backend = createTestBackend();
    const set = new RetainedInstructionSet();
    const bundle = { generation: 1 };

    set.beginRecording(backend);
    set.append(makeBatch(bundle));
    set.commitRecording();

    expect(set.isValidFor(backend)).toBe(true);

    bundle.generation = 2; // backend recreated the group resources

    expect(set.isValidFor(backend)).toBe(false);

    backend.destroy();
  });

  test('beginRecording drops the previous recording; abortRecording leaves the set invalid', () => {
    const backend = createTestBackend();
    const set = new RetainedInstructionSet();
    const bundle = { generation: 1 };

    set.beginRecording(backend);
    set.append(makeBatch(bundle));
    set.commitRecording();

    set.beginRecording(backend);

    expect(set.instructions).toHaveLength(0);
    expect(set.isValidFor(backend)).toBe(false);

    set.append(makeBatch(bundle));
    set.abortRecording();

    expect(set.isRecording).toBe(false);
    expect(set.hasRecording).toBe(false);
    expect(set.isValidFor(backend)).toBe(false);

    backend.destroy();
  });

  test('group markers record the live node reference; LeaveGroup is a shared singleton', () => {
    const backend = createTestBackend();
    const set = new RetainedInstructionSet();
    const node = new Container();
    const bundle = { generation: 1 };

    set.beginRecording(backend);
    set.append({ kind: RetainedInstructionKind.EnterGroup, node });
    set.append(makeBatch(bundle));
    set.append(retainedLeaveGroupInstruction);
    set.commitRecording();

    const [enter, batch, leave] = set.instructions;

    expect(enter!.kind).toBe(RetainedInstructionKind.EnterGroup);

    if (enter!.kind === RetainedInstructionKind.EnterGroup) {
      expect(enter!.node).toBe(node); // live reference, never a captured matrix
    }

    expect(batch!.kind).toBe(RetainedInstructionKind.Batch);
    expect(leave).toBe(retainedLeaveGroupInstruction);
    expect(set.isValidFor(backend)).toBe(true);

    node.destroy();
    backend.destroy();
  });

  test('invalidate() clears the recording but is reusable for the next capture', () => {
    const backend = createTestBackend();
    const set = new RetainedInstructionSet();
    const bundle = { generation: 3 };

    set.beginRecording(backend);
    set.append(makeBatch(bundle));
    set.commitRecording();
    set.invalidate();

    expect(set.hasRecording).toBe(false);
    expect(set.isValidFor(backend)).toBe(false);

    set.beginRecording(backend);
    set.append(makeBatch(bundle));
    set.commitRecording();

    expect(set.isValidFor(backend)).toBe(true);

    backend.destroy();
  });
});

// ---------------------------------------------------------------------------
// Task 4: player record/replay wiring, pinned against a fake backend that
// implements the retained hooks with a pending-batch model faithful to the
// real backends' flush contract (a group-transform switch is a flush
// boundary; begin/end capture flush before/into the capture window).
// ---------------------------------------------------------------------------

interface FakeBatchPayload {
  readonly ids: readonly string[];
}

interface RecordingBackendHarness {
  readonly backend: RenderBackend;
  readonly events: string[];
  readonly bundle: { generation: number };
}

const createRecordingBackend = (): RecordingBackendHarness => {
  const base = createTestBackend();
  const events: string[] = [];
  const pending: string[] = [];
  const activeCaptures: RetainedInstructionSet[] = [];
  const bundle = { generation: 1 };
  let activeTransform: Matrix | null = null;

  const transformLabel = (): string => (activeTransform === null ? 'null' : `${activeTransform.x},${activeTransform.y}`);

  const flushPending = (): void => {
    if (pending.length === 0) {
      return;
    }

    const ids = pending.slice();

    pending.length = 0;
    events.push(`flush:${ids.join(',')}`);

    if (activeCaptures.length > 0) {
      const batch: RetainedBatchInstruction = {
        kind: RetainedInstructionKind.Batch,
        bundle,
        generation: bundle.generation,
        instanceCount: ids.length,
        drawCalls: 1,
        payload: { ids } satisfies FakeBatchPayload,
      };

      for (const set of activeCaptures) {
        set.append(batch);
      }
    }
  };

  const backend = Object.assign(base, {
    draw(drawable: Drawable) {
      pending.push((drawable as RecordableLeaf).id);

      return backend;
    },
    flush() {
      flushPending();

      return backend;
    },
    _endDrawPlan(): void {
      flushPending();
    },
    _setRenderGroupTransform(transform: Matrix | null): void {
      flushPending(); // groups are flush boundaries (S2-D2 / hook contract)
      activeTransform = transform;
      events.push(`transform:${transformLabel()}`);
    },
    _beginRetainedCapture(set: RetainedInstructionSet): void {
      flushPending(); // no batch may span into the capture window
      activeCaptures.push(set);
      events.push('beginCapture');
    },
    _endRetainedCapture(set: RetainedInstructionSet): void {
      flushPending(); // trailing draws land INSIDE the still-active captures

      const index = activeCaptures.lastIndexOf(set);

      if (index !== -1) {
        activeCaptures.splice(index, 1);
      }

      events.push('endCapture');
    },
    _replayRetainedBatch(batch: RetainedBatchInstruction): void {
      flushPending();
      events.push(`replay:${(batch.payload as FakeBatchPayload).ids.join(',')}@${transformLabel()}`);
    },
  }) as unknown as RenderBackend;

  return { backend, events, bundle };
};

// Locate the Group entry whose scope belongs to `node` (transformNode match),
// searching the whole scope tree (same convention as retained-container.test.ts).
const findGroupEntryFor = (scope: GroupScope, node: Container): GroupScopeEntry | undefined => {
  for (const entry of scope.entries) {
    if (entry.kind === RenderEntryKind.Group) {
      if (entry.scope.transformNode === node) {
        return entry;
      }

      const nested = findGroupEntryFor(entry.scope, node);

      if (nested !== undefined) {
        return nested;
      }
    }
  }

  return undefined;
};

const buildPlan = (root: Container, backend: RenderBackend) => {
  const builder = RenderPlanBuilder.acquire();
  const plan = builder.build(root, backend);

  RenderPlanOptimizer.optimize(plan);
  RenderPlanBuilder.release(builder);

  return plan;
};

describe('RenderPlanPlayer: retained capture (Task 4 record hooks)', () => {
  test('a record-armed group scope wraps its playback in begin/end capture and records one batch per flush boundary', () => {
    const { backend, events } = createRecordingBackend();
    const root = new Container();
    const group = new RetainedContainer();

    root.addChild(new RecordableLeaf('x')); // outside the group: must NOT be recorded
    group.addChild(new RecordableLeaf('a'));
    group.addChild(new RecordableLeaf('b'));
    root.addChild(group);

    const plan = buildPlan(root, backend);
    const groupEntry = findGroupEntryFor(plan.passes[0]!.root, group);
    const set = new RetainedInstructionSet();

    groupEntry!.scope.retainedRecordTarget = set;

    RenderPlanPlayer.play(plan, backend);

    expect(set.hasRecording).toBe(true);
    expect(set.instructions).toHaveLength(1);

    const batch = set.instructions[0] as RetainedBatchInstruction;

    expect(batch.kind).toBe(RetainedInstructionKind.Batch);
    expect(batch.payload).toEqual({ ids: ['a', 'b'] });
    expect(batch.instanceCount).toBe(2);

    // The pre-group draw flushed at the group boundary, BEFORE the capture
    // window opened; the group content flushed inside it.
    expect(events).toEqual(['flush:x', 'transform:0,0', 'beginCapture', 'flush:a,b', 'endCapture', 'transform:null']);

    root.destroy();
    backend.destroy();
  });

  test('nested transform groups record Enter/Leave markers holding the LIVE node, batches split at the boundary', () => {
    const { backend } = createRecordingBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const inner = new RetainedContainer();

    inner.setPosition(10, 5);
    group.addChild(new RecordableLeaf('a'));
    inner.addChild(new RecordableLeaf('b'));
    group.addChild(inner);
    group.addChild(new RecordableLeaf('c'));
    root.addChild(group);

    const plan = buildPlan(root, backend);
    const groupEntry = findGroupEntryFor(plan.passes[0]!.root, group);
    const set = new RetainedInstructionSet();

    groupEntry!.scope.retainedRecordTarget = set;

    RenderPlanPlayer.play(plan, backend);

    const kinds = set.instructions.map(i => i.kind);

    expect(kinds).toEqual([
      RetainedInstructionKind.Batch, // a
      RetainedInstructionKind.EnterGroup,
      RetainedInstructionKind.Batch, // b
      RetainedInstructionKind.LeaveGroup,
      RetainedInstructionKind.Batch, // c
    ]);

    const enter = set.instructions[1]!;

    if (enter.kind === RetainedInstructionKind.EnterGroup) {
      expect(enter.node).toBe(inner); // live node reference, no captured matrix
    }

    expect((set.instructions[2] as RetainedBatchInstruction).payload).toEqual({ ids: ['b'] });

    // Stats parity source: recorded instance counts cover every drawn node.
    const instanceSum = set.instructions.reduce((sum, i) => (i.kind === RetainedInstructionKind.Batch ? sum + i.instanceCount : sum), 0);

    expect(instanceSum).toBe(3);

    root.destroy();
    backend.destroy();
  });

  test('record-once: replaying the same plan does not re-record a valid set (multi-render guard)', () => {
    const { backend, events } = createRecordingBackend();
    const root = new Container();
    const group = new RetainedContainer();

    group.addChild(new RecordableLeaf('a'));
    root.addChild(group);

    const plan = buildPlan(root, backend);
    const groupEntry = findGroupEntryFor(plan.passes[0]!.root, group);
    const set = new RetainedInstructionSet();

    groupEntry!.scope.retainedRecordTarget = set;

    RenderPlanPlayer.play(plan, backend);
    RenderPlanPlayer.play(plan, backend); // e.g. the same plan played twice in one frame

    expect(events.filter(e => e === 'beginCapture')).toHaveLength(1);
    expect(set.instructions).toHaveLength(1); // not duplicated

    root.destroy();
    backend.destroy();
  });
});

describe('RenderPlanPlayer: retained replay (Task 4 replay hook)', () => {
  test('a spliced scope replays batches through the backend and composes nested group matrices LIVE', () => {
    const { backend, events } = createRecordingBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const inner = new RetainedContainer();

    inner.setPosition(10, 5);
    group.addChild(new RecordableLeaf('a'));
    inner.addChild(new RecordableLeaf('b'));
    group.addChild(inner);
    group.addChild(new RecordableLeaf('c'));
    root.addChild(group);

    // Frame 1: record during normal playback.
    const plan1 = buildPlan(root, backend);
    const set = new RetainedInstructionSet();

    findGroupEntryFor(plan1.passes[0]!.root, group)!.scope.retainedRecordTarget = set;
    RenderPlanPlayer.play(plan1, backend);

    expect(set.hasRecording).toBe(true);

    // The inner group MOVES after recording — replay must compose the matrix
    // of the day, not the recorded one (the group-move win).
    inner.setPosition(20, 7);

    // Frame 2: splice. The player must ignore entries entirely and dispatch
    // the recorded batches (the collect switch will hand it an EMPTY scope;
    // ignoring entries is the same code path).
    const plan2 = buildPlan(root, backend);

    findGroupEntryFor(plan2.passes[0]!.root, group)!.scope.retainedInstructions = set;
    events.length = 0;
    RenderPlanPlayer.play(plan2, backend);

    expect(events).toEqual([
      'transform:0,0', // outer group matrix (live)
      'replay:a@0,0',
      'transform:20,7', // inner group matrix composed LIVE from the moved node
      'replay:b@20,7',
      'transform:0,0',
      'replay:c@0,0',
      'transform:null',
    ]);

    root.destroy();
    backend.destroy();
  });

  test('an inner set replayed while an outer group records is appended verbatim — same descriptor objects (S3-D6)', () => {
    const { backend, events } = createRecordingBackend();
    const root = new Container();
    const outer = new RetainedContainer();
    const inner = new RetainedContainer();

    outer.addChild(new RecordableLeaf('a'));
    inner.addChild(new RecordableLeaf('b'));
    outer.addChild(inner);
    outer.addChild(new RecordableLeaf('c'));
    root.addChild(outer);

    // Step 1: record the INNER set alone.
    const plan1 = buildPlan(root, backend);
    const innerSet = new RetainedInstructionSet();

    findGroupEntryFor(plan1.passes[0]!.root, inner)!.scope.retainedRecordTarget = innerSet;
    RenderPlanPlayer.play(plan1, backend);

    expect(innerSet.hasRecording).toBe(true);
    expect(innerSet.instructions).toHaveLength(1);

    // Step 2: outer records while inner replays from its valid set.
    const plan2 = buildPlan(root, backend);
    const outerSet = new RetainedInstructionSet();

    findGroupEntryFor(plan2.passes[0]!.root, outer)!.scope.retainedRecordTarget = outerSet;
    findGroupEntryFor(plan2.passes[0]!.root, inner)!.scope.retainedInstructions = innerSet;
    events.length = 0;
    RenderPlanPlayer.play(plan2, backend);

    expect(outerSet.hasRecording).toBe(true);

    const kinds = outerSet.instructions.map(i => i.kind);

    expect(kinds).toEqual([
      RetainedInstructionKind.Batch, // a
      RetainedInstructionKind.EnterGroup,
      RetainedInstructionKind.Batch, // b -- the inner set's descriptor, verbatim
      RetainedInstructionKind.LeaveGroup,
      RetainedInstructionKind.Batch, // c
    ]);

    // Verbatim: the SAME instruction object (same buffers, same bundle).
    expect(outerSet.instructions[2]).toBe(innerSet.instructions[0]);

    // And the replayed inner batch was actually dispatched during recording.
    expect(events).toContain('replay:b@0,0');

    root.destroy();
    backend.destroy();
  });
});

// ---------------------------------------------------------------------------
// Task 5: the collect switch, end-to-end through the REAL collect path —
// RetainedContainer._collectContent decides the tier per frame:
// instruction splice -> entry replay (+ record arming) -> plain collect.
// ---------------------------------------------------------------------------

const playFrame = (root: Container, backend: RenderBackend): void => {
  RenderPlanPlayer.play(buildPlan(root, backend), backend);
};

describe('collect switch: fallback ladder end-to-end (Task 5)', () => {
  test('ladder progression: dirty collect -> clean entry replay records -> next clean frame splices', () => {
    const { backend, events } = createRecordingBackend();
    const root = new Container();
    const group = new RetainedContainer();

    group.addChild(new RecordableLeaf('a'));
    group.addChild(new RecordableLeaf('b'));
    root.addChild(group);

    const fragment = (group as unknown as FragmentCarrier)._fragment;

    // F1: dirty (first) collect + fragment capture. Recording does NOT arm on
    // the capture frame (record-on-first-clean-frame policy).
    playFrame(root, backend);

    expect(events).not.toContain('beginCapture');
    expect(fragment.instructions).toBeNull();
    expect(events).toContain('flush:a,b');

    // F2: clean -> entry replay + arm -> the player records this playback.
    events.length = 0;
    playFrame(root, backend);

    expect(events.filter(e => e === 'beginCapture')).toHaveLength(1);
    expect(events).toContain('flush:a,b'); // record frame still draws normally
    expect(fragment.instructions?.hasRecording).toBe(true);

    const batch = fragment.instructions!.instructions[0] as RetainedBatchInstruction;

    expect(batch.payload).toEqual({ ids: ['a', 'b'] });

    // F3: clean + valid set -> instruction splice; O(batches) replay, no
    // re-record, no per-draw flush.
    events.length = 0;
    playFrame(root, backend);

    expect(events).toContain('replay:a,b@0,0');
    expect(events).not.toContain('flush:a,b');
    expect(events).not.toContain('beginCapture');

    root.destroy();
    backend.destroy();
  });

  test('a stale bundle generation degrades to entry replay and re-records (S3-D3 validation)', () => {
    const { backend, events, bundle } = createRecordingBackend();
    const root = new Container();
    const group = new RetainedContainer();

    group.addChild(new RecordableLeaf('a'));
    root.addChild(group);

    const fragment = (group as unknown as FragmentCarrier)._fragment;

    playFrame(root, backend); // F1: capture
    playFrame(root, backend); // F2: record
    playFrame(root, backend); // F3: splice

    bundle.generation++; // the backend recreated the group resources

    // F4: set invalid -> entry replay + re-record with the live generation.
    events.length = 0;
    playFrame(root, backend);

    expect(events.filter(e => e === 'beginCapture')).toHaveLength(1);
    expect(events).toContain('flush:a');

    const batch = fragment.instructions!.instructions[0] as RetainedBatchInstruction;

    expect(batch.generation).toBe(bundle.generation);

    // F5: splices again.
    events.length = 0;
    playFrame(root, backend);

    expect(events).toContain('replay:a@0,0');
    expect(events).not.toContain('beginCapture');

    root.destroy();
    backend.destroy();
  });

  test('a child mutation invalidates the set with the fragment; the ladder re-runs from full collect', () => {
    const { backend, events } = createRecordingBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const leaf = new RecordableLeaf('a');

    group.addChild(leaf);
    root.addChild(group);

    const fragment = (group as unknown as FragmentCarrier)._fragment;

    playFrame(root, backend); // F1: capture
    playFrame(root, backend); // F2: record

    const recordedBatch = fragment.instructions!.instructions[0];

    playFrame(root, backend); // F3: splice

    // Slice 4b: a transform move would be row-patched (set stays valid); a
    // genuine content change is what invalidates the recording + fragment.
    leaf.invalidateContent();

    // F4: dirty -> full collect; the stale recording is gone, nothing replays.
    events.length = 0;
    playFrame(root, backend);

    expect(fragment.instructions!.hasRecording).toBe(false);
    expect(events).not.toContain('beginCapture'); // capture frame never arms
    expect(events.some(e => e.startsWith('replay:'))).toBe(false);
    expect(events).toContain('flush:a');

    // F5: clean -> entry replay + re-record (fresh descriptor, fresh data).
    playFrame(root, backend);

    expect(fragment.instructions!.hasRecording).toBe(true);
    expect(fragment.instructions!.instructions[0]).not.toBe(recordedBatch);

    // F6: splice.
    events.length = 0;
    playFrame(root, backend);

    expect(events).toContain('replay:a@0,0');

    root.destroy();
    backend.destroy();
  });

  test('a transform-only child move on a backend WITHOUT row-patch support drops the recording (no stale splice) — CRITICAL-1 regression', () => {
    // The fake bundle has no `_patchTransformRow` — the WebGPU shape (4c not
    // built). A recorded group's baked transform rows cannot be patched, so a
    // transform-only descendant move MUST drop the recording and fall to entry
    // replay (live transforms), never keep splicing the stale rows.
    const { backend, events } = createRecordingBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const leaf = new RecordableLeaf('a');

    group.addChild(leaf);
    root.addChild(group);

    const fragment = (group as unknown as FragmentCarrier)._fragment;

    playFrame(root, backend); // F1: capture
    playFrame(root, backend); // F2: record
    playFrame(root, backend); // F3: splice

    expect(fragment.instructions!.hasRecording).toBe(true);

    leaf.setPosition(37, 41); // transform-only move; bundle cannot patch rows

    // F4: the stale recording must be dropped -> entry replay draws the moved
    // leaf LIVE (flush), re-records this frame; crucially NO stale splice.
    events.length = 0;
    playFrame(root, backend);

    expect(events.some(e => e.startsWith('replay:'))).toBe(false); // no stale splice
    expect(events).toContain('flush:a'); // drew the moved leaf live
    expect(events.filter(e => e === 'beginCapture')).toHaveLength(1); // re-recorded

    // F5: the fresh recording splices again — the moved leaf is now baked in.
    events.length = 0;
    playFrame(root, backend);

    expect(events.some(e => e.startsWith('replay:'))).toBe(true);
    expect(events).not.toContain('beginCapture');

    root.destroy();
    backend.destroy();
  });

  test('a non-recordable fragment (unflagged renderer) never arms recording — Slice-2 entry replay forever', () => {
    const { backend, events } = createRecordingBackend();
    const root = new Container();
    const group = new RetainedContainer();

    group.addChild(new RecordableLeaf('a'));
    group.addChild(new UnflaggedLeaf());
    root.addChild(group);

    const fragment = (group as unknown as FragmentCarrier)._fragment;

    playFrame(root, backend);
    playFrame(root, backend);
    playFrame(root, backend);

    expect(events).not.toContain('beginCapture');
    expect(fragment.instructions).toBeNull(); // arm never even created the set

    root.destroy();
    backend.destroy();
  });

  test('a backend without the retained hooks stays fully dormant: no arming, no set, shipped behavior', () => {
    const backend = createTestBackend(); // registry, but NO record/replay hooks
    const root = new Container();
    const group = new RetainedContainer();

    group.addChild(new RecordableLeaf('a'));
    root.addChild(group);

    const fragment = (group as unknown as FragmentCarrier)._fragment;

    collectOnce(root, backend); // F1: capture

    // F2 (clean): inspect the built plan BEFORE play — the scope must carry
    // neither a record target nor spliced instructions.
    const builder = RenderPlanBuilder.acquire();
    const plan = builder.build(root, backend);
    const groupEntry = findGroupEntryFor(plan.passes[0]!.root, group);

    expect(groupEntry).toBeDefined();
    expect(groupEntry!.scope.retainedRecordTarget).toBeNull();
    expect(groupEntry!.scope.retainedInstructions).toBeNull();
    expect(groupEntry!.scope.entries.length).toBeGreaterThan(0); // entry replay, not an empty splice
    expect(fragment.instructions).toBeNull();

    RenderPlanBuilder.release(builder);
    root.destroy();
    backend.destroy();
  });

  test('nested groups through the collect switch: inner set splices inside the outer fragment and records verbatim into the outer set (S3-D6)', () => {
    const { backend, events } = createRecordingBackend();
    const root = new Container();
    const outer = new RetainedContainer();
    const inner = new RetainedContainer();
    const dynamic = new RecordableLeaf('d');

    outer.addChild(dynamic);
    inner.addChild(new RecordableLeaf('b'));
    outer.addChild(inner);
    root.addChild(outer);

    const outerFragment = (outer as unknown as FragmentCarrier)._fragment;
    const innerFragment = (inner as unknown as FragmentCarrier)._fragment;

    // F1: everything dirty -> captures, no arming.
    playFrame(root, backend);

    // F2: outer dirty (mutated direct child, content-dirty — Slice 4b: a move
    // would patch instead), inner clean -> inner arms and records its own set
    // during the outer's full collect.
    dynamic.invalidateContent();
    playFrame(root, backend);

    expect(innerFragment.instructions?.hasRecording).toBe(true);

    const innerBatch = innerFragment.instructions!.instructions[0];

    // F3: outer dirty again (thrash-suppressed), inner clean + valid set ->
    // inner SPLICES its instructions while the outer collects normally.
    dynamic.invalidateContent();
    events.length = 0;
    playFrame(root, backend);

    expect(events).toContain('replay:b@0,0');

    // F4: mutation stops -> outer recovery capture; the outer fragment now
    // holds the inner group record WITH the spliced set reference.
    playFrame(root, backend);

    // F5: outer clean -> entry replay reproduces the inner splice, outer arms
    // and records: the inner set's batch lands in the outer set VERBATIM,
    // wrapped in Enter/Leave markers.
    events.length = 0;
    playFrame(root, backend);

    expect(outerFragment.instructions?.hasRecording).toBe(true);

    const outerInstructions = outerFragment.instructions!.instructions;
    const kinds = outerInstructions.map(i => i.kind);

    expect(kinds).toEqual([
      RetainedInstructionKind.Batch, // d
      RetainedInstructionKind.EnterGroup,
      RetainedInstructionKind.Batch, // b — verbatim from the inner set
      RetainedInstructionKind.LeaveGroup,
    ]);
    expect(outerInstructions[2]).toBe(innerBatch);
    expect((outerInstructions[0] as RetainedBatchInstruction).payload).toEqual({ ids: ['d'] });

    // F6: outer clean + valid set -> the whole nested tree replays O(batches).
    events.length = 0;
    playFrame(root, backend);

    expect(events).toContain('replay:d@0,0');
    expect(events).toContain('replay:b@0,0');
    expect(events).not.toContain('beginCapture');
    expect(events.some(e => e.startsWith('flush:'))).toBe(false);

    root.destroy();
    backend.destroy();
  });

  test('a stale inner set inside a spliced-captured outer fragment re-dispatches the inner node (never an empty scope)', () => {
    const { backend, events, bundle } = createRecordingBackend();
    const root = new Container();
    const outer = new RetainedContainer();
    const inner = new RetainedContainer();
    const dynamic = new RecordableLeaf('d');

    outer.addChild(dynamic);
    inner.addChild(new RecordableLeaf('b'));
    outer.addChild(inner);
    root.addChild(outer);

    // Same cadence as above up to the outer capture holding the spliced set.
    playFrame(root, backend); // F1
    dynamic.invalidateContent(); // content-dirty keeps the OUTER dirty (Slice 4b: a move would patch)
    playFrame(root, backend); // F2: inner records
    dynamic.invalidateContent();
    playFrame(root, backend); // F3: inner splices, outer suppressed
    playFrame(root, backend); // F4: outer recovery capture (inner record carries the set)

    // The backend recreates the group resources: every recorded set is stale.
    bundle.generation++;

    // F5: the outer entry replay finds the inner set invalid -> the inner
    // node is re-dispatched through _collect and draws LIVE (flush:b), while
    // both groups re-arm and re-record.
    events.length = 0;
    playFrame(root, backend);

    expect(events).toContain('flush:b');
    expect(events.some(e => e.startsWith('replay:'))).toBe(false);

    // F6: the re-recorded outer set splices the whole tree again.
    events.length = 0;
    playFrame(root, backend);

    expect(events).toContain('replay:d@0,0');
    expect(events).toContain('replay:b@0,0');

    root.destroy();
    backend.destroy();
  });
});
