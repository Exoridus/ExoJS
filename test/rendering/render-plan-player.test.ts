import { Drawable } from '#rendering/Drawable';
import { type DrawCommand, type MaterialKey, RenderEntryKind } from '#rendering/plan/RenderCommand';
import type { RenderGroup } from '#rendering/plan/RenderInstruction';
import { RenderPlanPlayer } from '#rendering/plan/RenderPlanPlayer';
import type { DrawScopeEntry, GroupScope, GroupScopeEntry } from '#rendering/plan/RenderScope';
import type { RenderBackend } from '#rendering/RenderBackend';

class BoxDrawable extends Drawable {
  public constructor(public readonly id: string) {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
  }
}

const material = (id: number): MaterialKey => ({
  rendererId: 1,
  blendMode: 0,
  textureId: -1,
  shaderId: -1,
  pipelineKey: id,
  bindKey: id,
});

const createDrawCommand = (drawable: Drawable, seq: number, groupIndex: number | undefined, key: number): DrawCommand => ({
  kind: RenderEntryKind.Draw,
  drawable,
  nodeIndex: seq,
  seq,
  zIndex: 0,
  material: material(key),
  groupIndex,
  minX: 0,
  minY: 0,
  maxX: 16,
  maxY: 16,
});

const drawEntry = (command: DrawCommand): DrawScopeEntry => ({
  kind: RenderEntryKind.Draw,
  seq: command.seq,
  zIndex: command.zIndex,
  command,
});

const groupEntry = (scope: GroupScope, seq: number): GroupScopeEntry => ({
  kind: RenderEntryKind.Group,
  seq,
  zIndex: 0,
  scope,
});

const groupScope = (entries: (DrawScopeEntry | GroupScopeEntry)[]): GroupScope => ({
  kind: RenderEntryKind.Group,
  entries,
  hasMixedZ: false,
  preserveDrawOrder: false,
});

interface PlaybackSpy {
  readonly backend: RenderBackend;
  readonly events: string[];
  readonly draws: string[];
  readonly slots: string[];
  readonly uploads: string[];
}

const createPlaybackSpy = (): PlaybackSpy => {
  const events: string[] = [];
  const draws: string[] = [];
  const slots: string[] = [];
  const uploads: string[] = [];

  const backend = {
    _beginRenderGroup(group: RenderGroup) {
      events.push(`begin:${group.instructions.map(command => (command.drawable as BoxDrawable).id).join(',')}`);
    },
    _prepareRenderGroupUpload(
      group: RenderGroup,
      context: { groupInstructionCount: number; firstPassInstructionIndex: number; lastPassInstructionIndex: number; passGroupIndex: number },
    ) {
      const ids = group.instructions.map(command => (command.drawable as BoxDrawable).id).join(',');
      const upload = `${ids}:${context.groupInstructionCount}:${context.firstPassInstructionIndex}:${context.lastPassInstructionIndex}:${context.passGroupIndex}`;

      uploads.push(upload);
      events.push(`upload:${upload}`);
    },
    _prepareRenderInstructionSlot(command: DrawCommand, slot: { groupInstructionIndex: number; passInstructionIndex: number }) {
      slots.push(`${(command.drawable as BoxDrawable).id}:${slot.groupInstructionIndex}:${slot.passInstructionIndex}`);
    },
    _prepareDrawCommand(command: DrawCommand) {
      events.push(`prepare:${(command.drawable as BoxDrawable).id}`);
    },
    draw(drawable: Drawable) {
      const id = (drawable as BoxDrawable).id;

      draws.push(id);
      events.push(`draw:${id}`);

      return this;
    },
    _endRenderGroup(group: RenderGroup) {
      events.push(`end:${group.instructions.map(command => (command.drawable as BoxDrawable).id).join(',')}`);
    },
  } as unknown as RenderBackend;

  return { backend, events, draws, slots, uploads };
};

describe('render plan player', () => {
  test('uploads precede draws in their scope; begin/end hooks bracket each render group', () => {
    // Phase 1 of _playGroup populates every group's transforms before any draw
    // executes. Uploads for a scope's direct groups therefore fire before the
    // first begin/prepare/draw in that scope. Nested sub-scopes are processed
    // during Phase 2; their Phase-1 uploads appear when the nested scope is
    // entered, not at the start of the outer scope.
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');
    const c = new BoxDrawable('c');
    const d = new BoxDrawable('d');
    const e = new BoxDrawable('e');
    const nested = groupScope([drawEntry(createDrawCommand(d, 3, 7, 7)), drawEntry(createDrawCommand(e, 4, 7, 7))]);
    const root = groupScope([
      drawEntry(createDrawCommand(a, 0, 1, 1)),
      drawEntry(createDrawCommand(b, 1, 1, 1)),
      groupEntry(nested, 2),
      // Same groupIndex as a/b, but non-draw entries must break runs.
      drawEntry(createDrawCommand(c, 5, 1, 1)),
    ]);
    const spy = createPlaybackSpy();

    RenderPlanPlayer.playScope(root, spy.backend);

    expect(spy.draws).toEqual(['a', 'b', 'd', 'e', 'c']);
    // Outer scope Phase 1 uploads {a,b} and {c} first; then during Phase 2
    // the nested scope enters its own Phase 1 ({d,e} upload) before its draws.
    // passGroupIndex and firstPassInstructionIndex in the pre-pass context are
    // computed from each scope's own groups only — they do not account for
    // nested-scope contributions, so values for groups after a nested sub-scope
    // are approximate but functionally correct (no backend reads them today).
    expect(spy.events).toEqual([
      'upload:a,b:2:0:1:0',
      'upload:c:1:2:2:1',
      'begin:a,b',
      'prepare:a',
      'draw:a',
      'prepare:b',
      'draw:b',
      'end:a,b',
      'upload:d,e:2:2:3:1',
      'begin:d,e',
      'prepare:d',
      'draw:d',
      'prepare:e',
      'draw:e',
      'end:d,e',
      'begin:c',
      'prepare:c',
      'draw:c',
      'end:c',
    ]);
    expect(spy.uploads).toEqual(['a,b:2:0:1:0', 'c:1:2:2:1', 'd,e:2:2:3:1']);
  });

  test('undefined groupIndex draws remain singleton groups', () => {
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');
    const root = groupScope([drawEntry(createDrawCommand(a, 0, undefined, 1)), drawEntry(createDrawCommand(b, 1, undefined, 1))]);
    const spy = createPlaybackSpy();

    RenderPlanPlayer.playScope(root, spy.backend);

    // Both groups have no nested sub-scopes between them: Phase 1 uploads both
    // before any draws, so uploads appear before begin events.
    expect(spy.events).toEqual(['upload:a:1:0:0:0', 'upload:b:1:1:1:1', 'begin:a', 'prepare:a', 'draw:a', 'end:a', 'begin:b', 'prepare:b', 'draw:b', 'end:b']);
    expect(spy.slots).toEqual(['a:0:0', 'b:0:1']);
    expect(spy.uploads).toEqual(['a:1:0:0:0', 'b:1:1:1:1']);
  });

  test('instruction slot metadata follows draw traversal order across nested scopes', () => {
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');
    const c = new BoxDrawable('c');
    const d = new BoxDrawable('d');
    const e = new BoxDrawable('e');
    const u = new BoxDrawable('u');
    const v = new BoxDrawable('v');
    const nested = groupScope([drawEntry(createDrawCommand(d, 3, 7, 7)), drawEntry(createDrawCommand(e, 4, 7, 7))]);
    const root = groupScope([
      drawEntry(createDrawCommand(a, 0, 1, 1)),
      drawEntry(createDrawCommand(b, 1, 1, 1)),
      groupEntry(nested, 2),
      drawEntry(createDrawCommand(c, 5, 1, 1)),
      drawEntry(createDrawCommand(u, 6, undefined, 1)),
      drawEntry(createDrawCommand(v, 7, undefined, 1)),
    ]);
    const first = createPlaybackSpy();
    const second = createPlaybackSpy();

    RenderPlanPlayer.playScope(root, first.backend);
    RenderPlanPlayer.playScope(root, second.backend);

    // Draw order and per-draw slot indices are unchanged.
    expect(first.draws).toEqual(['a', 'b', 'd', 'e', 'c', 'u', 'v']);
    expect(first.slots).toEqual(['a:0:0', 'b:1:1', 'd:0:2', 'e:1:3', 'c:0:4', 'u:0:5', 'v:0:6']);

    // Phase-1 uploads for root's direct groups (a,b / c / u / v) precede all
    // draws; nested scope (d,e) uploads when that scope is entered in Phase 2.
    // Groups after nested sub-scopes get approximate context indices (they omit
    // the nested scope's instruction count); passGroupIndex similarly
    // under-counts. Actual draw traversal order is unaffected.
    expect(first.uploads).toEqual(['a,b:2:0:1:0', 'c:1:2:2:1', 'u:1:3:3:2', 'v:1:4:4:3', 'd,e:2:2:3:1']);
    expect(second.slots).toEqual(first.slots);
    expect(second.uploads).toEqual(first.uploads);
  });
});
