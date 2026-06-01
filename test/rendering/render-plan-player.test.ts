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

const createDrawCommand = (
  drawable: Drawable,
  seq: number,
  groupIndex: number | undefined,
  key: number,
): DrawCommand => ({
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
}

const createPlaybackSpy = (): PlaybackSpy => {
  const events: string[] = [];
  const draws: string[] = [];

  const backend = {
    _beginRenderGroup(group: RenderGroup) {
      events.push(`begin:${group.instructions.map(command => (command.drawable as BoxDrawable).id).join(',')}`);
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

  return { backend, events, draws };
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
      'prepare:a',
      'draw:a',
      'prepare:b',
      'draw:b',
      'end:a,b',
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
  });

  test('undefined groupIndex draws remain singleton groups', () => {
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');
    const root = groupScope([
      drawEntry(createDrawCommand(a, 0, undefined, 1)),
      drawEntry(createDrawCommand(b, 1, undefined, 1)),
    ]);
    const spy = createPlaybackSpy();

    RenderPlanPlayer.playScope(root, spy.backend);

    expect(spy.events).toEqual([
      'begin:a',
      'prepare:a',
      'draw:a',
      'end:a',
      'begin:b',
      'prepare:b',
      'draw:b',
      'end:b',
    ]);
  });
});
