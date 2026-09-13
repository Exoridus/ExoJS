import { detachedNodeDirtyIndex, DirtyChannel } from '#core/nodeDirtyIndex';
import type { SceneNode } from '#core/SceneNode';
import { Container } from '#rendering/Container';

/** Every node marked on `channels` since `cursor`, in visit order. */
const readSince = (cursor: number, channels: number = DirtyChannel.Transform): SceneNode[] => {
  const seen: SceneNode[] = [];

  detachedNodeDirtyIndex.readSince(cursor, channels, node => {
    seen.push(node);

    return true;
  });

  return seen;
};

/** Every node the index still holds a reference to, across all of its buckets. */
const retainedNodes = (): unknown[] => {
  const buckets = (detachedNodeDirtyIndex as unknown as Record<string, unknown>)['_buckets'] as Array<{ nodes: unknown[] }>;

  return buckets.flatMap(bucket => bucket.nodes.filter(node => node !== null));
};

beforeEach(() => {
  detachedNodeDirtyIndex.reset();
});

afterEach(() => {
  detachedNodeDirtyIndex.reset();
});

describe('NodeDirtyIndex', () => {
  test('a mark is visible to a cursor taken before it and invisible to one taken after', () => {
    const node = new Container();
    const before = detachedNodeDirtyIndex.sequence;

    detachedNodeDirtyIndex.mark(node, DirtyChannel.Transform);

    const after = detachedNodeDirtyIndex.sequence;

    expect(readSince(before)).toEqual([node]);
    expect(readSince(after)).toEqual([]);

    node.destroy();
  });

  test('a cursor taken between two marks of the SAME node still sees the second', () => {
    // The trap the generation alone cannot catch: a consumer that captured in
    // the middle of a frame must still be told about a move made after it, even
    // though the node already had an entry in that generation.
    const node = new Container();

    detachedNodeDirtyIndex.mark(node, DirtyChannel.Transform);

    const between = detachedNodeDirtyIndex.sequence;

    detachedNodeDirtyIndex.mark(node, DirtyChannel.Transform);

    expect(readSince(between)).toEqual([node]);

    node.destroy();
  });

  test('a node marked a thousand times in one generation holds one entry', () => {
    const node = new Container();
    const before = detachedNodeDirtyIndex.sequence;

    for (let index = 0; index < 1000; index++) {
      detachedNodeDirtyIndex.mark(node, DirtyChannel.Transform);
    }

    expect(readSince(before)).toEqual([node]);

    node.destroy();
  });

  test('a node marked in two retained generations is visited once, not once per generation', () => {
    // A consumer that writes on every visit - a renderer patching its own
    // private row - would otherwise do the work twice for one moved node.
    const node = new Container();
    const before = detachedNodeDirtyIndex.sequence;

    detachedNodeDirtyIndex.mark(node, DirtyChannel.Transform);
    detachedNodeDirtyIndex.advance();
    detachedNodeDirtyIndex.mark(node, DirtyChannel.Transform);

    expect(readSince(before)).toEqual([node]);

    node.destroy();
  });

  test('a content change and a later tint stay apart, so a cursor between them sees only the tint', () => {
    // The distinction the whole channel split exists for: a retained product
    // has to tell "only tints changed since I looked" from "something changed
    // that I cannot patch", and folding both into one entry's mask would make
    // every tint after any content change unpatchable.
    const node = new Container();
    const seen: number[] = [];

    detachedNodeDirtyIndex.mark(node, DirtyChannel.Content);

    const between = detachedNodeDirtyIndex.sequence;

    detachedNodeDirtyIndex.mark(node, DirtyChannel.Tint);

    detachedNodeDirtyIndex.readSince(between, DirtyChannel.Content | DirtyChannel.Tint, (_node, marked) => {
      seen.push(marked);

      return true;
    });

    expect(seen).toEqual([DirtyChannel.Tint]);

    node.destroy();
  });

  test('an effect mark is its own channel: read apart from content, and not mistaken for it', () => {
    const node = new Container();
    const before = detachedNodeDirtyIndex.sequence;

    detachedNodeDirtyIndex.mark(node, DirtyChannel.Effect);

    const seen: number[] = [];

    detachedNodeDirtyIndex.readSince(before, DirtyChannel.Content | DirtyChannel.Tint | DirtyChannel.Effect, (_node, marked) => {
      seen.push(marked);

      return true;
    });

    expect(seen).toEqual([DirtyChannel.Effect]);
    expect(detachedNodeDirtyIndex.hasMarksSince(before, DirtyChannel.Content)).toBe(false);
    expect(detachedNodeDirtyIndex.hasMarksSince(before, DirtyChannel.Effect)).toBe(true);
  });

  test('a mark on one channel does not erase an unread mark on another', () => {
    // A node that changes its content and then moves - a sprite whose deferred
    // texture arrives in a frame it is also being animated in. Losing the
    // content mark tells the reader nothing but a move happened, and a retained
    // product replays a stale recording for as long as the node keeps moving.
    const node = new Container();
    const before = detachedNodeDirtyIndex.sequence;
    const seen: number[] = [];

    detachedNodeDirtyIndex.mark(node, DirtyChannel.Content);
    detachedNodeDirtyIndex.advance();
    detachedNodeDirtyIndex.mark(node, DirtyChannel.Transform);

    detachedNodeDirtyIndex.readSince(before, DirtyChannel.Content | DirtyChannel.Tint, (_node, marked) => {
      seen.push(marked);

      return true;
    });

    expect(seen).toEqual([DirtyChannel.Content]);
    expect(readSince(before, DirtyChannel.Transform)).toEqual([node]);

    node.destroy();
  });

  test('a mark on one channel does not erase an unread mark made on another in the same generation', () => {
    const node = new Container();
    const before = detachedNodeDirtyIndex.sequence;
    const seen: number[] = [];

    detachedNodeDirtyIndex.mark(node, DirtyChannel.Content);
    detachedNodeDirtyIndex.mark(node, DirtyChannel.Transform);

    detachedNodeDirtyIndex.readSince(before, DirtyChannel.Content | DirtyChannel.Tint, (_node, marked) => {
      seen.push(marked);

      return true;
    });

    expect(seen).toEqual([DirtyChannel.Content]);

    node.destroy();
  });

  test('marks are filtered by channel', () => {
    const moved = new Container();
    const before = detachedNodeDirtyIndex.sequence;

    detachedNodeDirtyIndex.mark(moved, DirtyChannel.Transform);

    expect(readSince(before, DirtyChannel.Transform)).toEqual([moved]);
    expect(readSince(before, 1 << 5)).toEqual([]);

    moved.destroy();
  });

  test('a visit that stops the walk reports the read as incomplete', () => {
    const first = new Container();
    const second = new Container();
    const before = detachedNodeDirtyIndex.sequence;
    const seen: SceneNode[] = [];

    detachedNodeDirtyIndex.mark(first, DirtyChannel.Transform);
    detachedNodeDirtyIndex.mark(second, DirtyChannel.Transform);

    const complete = detachedNodeDirtyIndex.readSince(before, DirtyChannel.Transform, node => {
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
    const stale = detachedNodeDirtyIndex.sequence;

    detachedNodeDirtyIndex.mark(node, DirtyChannel.Transform);

    for (let generation = 0; generation < 16; generation++) {
      detachedNodeDirtyIndex.advance();
      detachedNodeDirtyIndex.mark(node, DirtyChannel.Transform);
    }

    expect(detachedNodeDirtyIndex.covers(stale)).toBe(false);
    expect(detachedNodeDirtyIndex.readSince(stale, DirtyChannel.Transform, () => true)).toBe(false);

    node.destroy();
  });

  test('a generation that falls out of the window stops holding its nodes', () => {
    // The index is process-wide and only recycles a bucket by resetting its
    // logical length, so an entry left above that length pinned the node - and
    // through its parent link, the whole graph it belonged to - for the life of
    // the process, long after `covers()` stopped answering for it.
    const node = new Container();
    const stale = detachedNodeDirtyIndex.sequence;

    detachedNodeDirtyIndex.mark(node, DirtyChannel.Transform);

    for (let generation = 0; generation < 8; generation++) {
      detachedNodeDirtyIndex.advance();
    }

    expect(detachedNodeDirtyIndex.covers(stale)).toBe(false);
    expect(retainedNodes()).not.toContain(node);

    node.destroy();
  });

  test('destroying a node drops the entry the index is still holding for it', () => {
    // What makes Application.destroy() leave nothing pinned: a destroyed scene
    // graph is released at once rather than eight advances later, and a
    // destroyed application performs no further advance at all.
    const node = new Container();

    detachedNodeDirtyIndex.mark(node, DirtyChannel.Transform);

    expect(retainedNodes()).toContain(node);

    node.destroy();

    expect(retainedNodes()).not.toContain(node);
  });

  test('a read still reports the marks that outlived a destroyed neighbour', () => {
    const first = new Container();
    const second = new Container();
    const before = detachedNodeDirtyIndex.sequence;

    detachedNodeDirtyIndex.mark(first, DirtyChannel.Transform);
    detachedNodeDirtyIndex.mark(second, DirtyChannel.Transform);

    first.destroy();

    expect(readSince(before)).toEqual([second]);

    second.destroy();
  });

  test('a fresh cursor of -1 is never covered, so nothing starts out silently up to date', () => {
    expect(detachedNodeDirtyIndex.covers(-1)).toBe(false);
  });
});
