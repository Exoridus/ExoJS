import { Drawable } from '@/rendering/Drawable';
import { type DrawCommand, type MaterialKey, RenderEntryKind } from '@/rendering/plan/RenderCommand';
import type { RenderGroup } from '@/rendering/plan/RenderInstruction';
import { RenderPlanPlayer } from '@/rendering/plan/RenderPlanPlayer';
import type { DrawScopeEntry, GroupScope, GroupScopeEntry } from '@/rendering/plan/RenderScope';
import type { RenderBackend } from '@/rendering/RenderBackend';

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
  test('playback order stays identical while begin/end hooks bracket each render group', () => {
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
    expect(spy.events).toEqual([
      'begin:a,b',
      'upload:a,b:2:0:1:0',
      'prepare:a',
      'draw:a',
      'prepare:b',
      'draw:b',
      'end:a,b',
      'begin:d,e',
      'upload:d,e:2:2:3:1',
      'prepare:d',
      'draw:d',
      'prepare:e',
      'draw:e',
      'end:d,e',
      'begin:c',
      'upload:c:1:4:4:2',
      'prepare:c',
      'draw:c',
      'end:c',
    ]);
    expect(spy.uploads).toEqual(['a,b:2:0:1:0', 'd,e:2:2:3:1', 'c:1:4:4:2']);
  });

  test('undefined groupIndex draws remain singleton groups', () => {
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');
    const root = groupScope([drawEntry(createDrawCommand(a, 0, undefined, 1)), drawEntry(createDrawCommand(b, 1, undefined, 1))]);
    const spy = createPlaybackSpy();

    RenderPlanPlayer.playScope(root, spy.backend);

    expect(spy.events).toEqual(['begin:a', 'upload:a:1:0:0:0', 'prepare:a', 'draw:a', 'end:a', 'begin:b', 'upload:b:1:1:1:1', 'prepare:b', 'draw:b', 'end:b']);
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

    expect(first.draws).toEqual(['a', 'b', 'd', 'e', 'c', 'u', 'v']);
    expect(first.slots).toEqual(['a:0:0', 'b:1:1', 'd:0:2', 'e:1:3', 'c:0:4', 'u:0:5', 'v:0:6']);
    expect(first.uploads).toEqual(['a,b:2:0:1:0', 'd,e:2:2:3:1', 'c:1:4:4:2', 'u:1:5:5:3', 'v:1:6:6:4']);
    expect(second.slots).toEqual(first.slots);
    expect(second.uploads).toEqual(first.uploads);
  });
});
