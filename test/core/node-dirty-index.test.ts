import { DirtyChannel, nodeDirtyIndex } from '#core/NodeDirtyIndex';
import type { SceneNode } from '#core/SceneNode';
import { Container } from '#rendering/Container';

/** Every node marked on `channels` since `cursor`, in visit order. */
const readSince = (cursor: number, channels: number = DirtyChannel.Transform): SceneNode[] => {
  const seen: SceneNode[] = [];

  nodeDirtyIndex.readSince(cursor, channels, node => {
    seen.push(node);

    return true;
  });

  return seen;
};

beforeEach(() => {
  nodeDirtyIndex.reset();
});

afterEach(() => {
  nodeDirtyIndex.reset();
});

describe('NodeDirtyIndex', () => {
  test('a mark is visible to a cursor taken before it and invisible to one taken after', () => {
    const node = new Container();
    const before = nodeDirtyIndex.sequence;

    nodeDirtyIndex.mark(node, DirtyChannel.Transform);

    const after = nodeDirtyIndex.sequence;

    expect(readSince(before)).toEqual([node]);
    expect(readSince(after)).toEqual([]);

    node.destroy();
  });

  test('a cursor taken between two marks of the SAME node still sees the second', () => {
    // The trap the generation alone cannot catch: a consumer that captured in
    // the middle of a frame must still be told about a move made after it, even
    // though the node already had an entry in that generation.
    const node = new Container();

    nodeDirtyIndex.mark(node, DirtyChannel.Transform);

    const between = nodeDirtyIndex.sequence;

    nodeDirtyIndex.mark(node, DirtyChannel.Transform);

    expect(readSince(between)).toEqual([node]);

    node.destroy();
  });

  test('a node marked a thousand times in one generation holds one entry', () => {
    const node = new Container();
    const before = nodeDirtyIndex.sequence;

    for (let index = 0; index < 1000; index++) {
      nodeDirtyIndex.mark(node, DirtyChannel.Transform);
    }

    expect(readSince(before)).toEqual([node]);

    node.destroy();
  });

  test('a node marked in two retained generations is visited once, not once per generation', () => {
    // A consumer that writes on every visit - a renderer patching its own
    // private row - would otherwise do the work twice for one moved node.
    const node = new Container();
    const before = nodeDirtyIndex.sequence;

    nodeDirtyIndex.mark(node, DirtyChannel.Transform);
    nodeDirtyIndex.advance();
    nodeDirtyIndex.mark(node, DirtyChannel.Transform);

    expect(readSince(before)).toEqual([node]);

    node.destroy();
  });

  test('marks are filtered by channel', () => {
    const moved = new Container();
    const before = nodeDirtyIndex.sequence;

    nodeDirtyIndex.mark(moved, DirtyChannel.Transform);

    expect(readSince(before, DirtyChannel.Transform)).toEqual([moved]);
    expect(readSince(before, 1 << 5)).toEqual([]);

    moved.destroy();
  });

  test('a visit that stops the walk reports the read as incomplete', () => {
    const first = new Container();
    const second = new Container();
    const before = nodeDirtyIndex.sequence;
    const seen: SceneNode[] = [];

    nodeDirtyIndex.mark(first, DirtyChannel.Transform);
    nodeDirtyIndex.mark(second, DirtyChannel.Transform);

    const complete = nodeDirtyIndex.readSince(before, DirtyChannel.Transform, node => {
      seen.push(node);

      return false;
    });

    expect(complete).toBe(false);
    expect(seen).toEqual([first]);

    first.destroy();
    second.destroy();
  });

  test('a cursor that falls out of the window is reported rather than answered incompletely', () => {
    // The bounded half of the design: a consumer that has not looked for longer
    // than the window gets `false` and rebuilds, instead of a partial answer it
    // cannot tell from a complete one.
    const node = new Container();
    const stale = nodeDirtyIndex.sequence;

    nodeDirtyIndex.mark(node, DirtyChannel.Transform);

    for (let generation = 0; generation < 16; generation++) {
      nodeDirtyIndex.advance();
      nodeDirtyIndex.mark(node, DirtyChannel.Transform);
    }

    expect(nodeDirtyIndex.covers(stale)).toBe(false);
    expect(nodeDirtyIndex.readSince(stale, DirtyChannel.Transform, () => true)).toBe(false);

    node.destroy();
  });

  test('a fresh cursor of -1 is never covered, so nothing starts out silently up to date', () => {
    expect(nodeDirtyIndex.covers(-1)).toBe(false);
  });
});
