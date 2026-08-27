import type { SceneNode } from './SceneNode';

/**
 * What changed about a node. A single mark carries a mask, so one mutation that
 * touches two channels costs one entry.
 * @internal
 */
export const enum DirtyChannel {
  /** The node's own transform moved; its baked row is out of date. */
  Transform = 1 << 0,
}

/**
 * Generations retained at once. A consumer that has not looked for longer than
 * this rebuilds from the scene graph instead, which is the same answer it gets
 * today when its keys no longer match - so the window is a cost/benefit choice,
 * not a correctness one.
 *
 * Eight frames: long enough that a root drawn every frame, or every other frame
 * behind a paused scene, always finds its cursor inside the window, and short
 * enough that the retained marks stay proportional to what recently moved
 * rather than to the scene.
 */
const RETAINED_GENERATIONS = 8;

/**
 * One generation's marks. `nodes` keeps its backing store across recycles;
 * `count` is the logical length.
 */
interface DirtyBucket {
  generation: number;
  /** Mark sequence when this generation opened - the window test reads it. */
  firstSequence: number;
  count: number;
  readonly nodes: SceneNode[];
  readonly channels: number[];
}

const createBucket = (): DirtyBucket => ({ generation: -1, firstSequence: 0, count: 0, nodes: [], channels: [] });

/**
 * The changed-record index: which nodes changed since a given point, in time
 * proportional to what recently changed rather than to the scene.
 *
 * One index for the whole process, and deliberately not one per consumer. A
 * moved node has no idea which retained products recorded it - render roots may
 * overlap, a transform-group boundary may sit between them, a node may be under
 * several - so a push model has to walk the ancestor chain on every single
 * mutation and offer the node to each consumer it passes. That walk is what
 * this replaces: a mutation writes one entry, and each consumer resolves the
 * entries it cares about through the row map it already keeps.
 *
 * **An index, not a journal.** A node marked repeatedly holds ONE entry per
 * generation, and what carries the ordering is the node's own mark sequence -
 * its per-record revision. A thousand writes to one node in a frame therefore
 * cost one entry and one number, and the retained marks are bounded by the
 * number of distinct nodes that changed in the window, never by the number of
 * changes. Falling out of the window is reported rather than papered over:
 * {@link covers} answers `false` and the consumer rebuilds.
 *
 * Marking is gated by the caller (see `SceneNode`'s consumer counts), so a
 * scene with no retained consumer writes nothing here.
 * @internal
 */
class NodeDirtyIndex {
  private _generation = 0;
  private _slot = 0;
  private _sequence = 0;
  private _windowStartSequence = 0;
  private readonly _buckets: DirtyBucket[] = Array.from({ length: RETAINED_GENERATIONS }, createBucket);

  public constructor() {
    this._buckets[0]!.generation = 0;
  }

  /**
   * The current mark sequence: a consumer stores it once it has accounted for
   * everything so far and passes it back to {@link readSince}.
   */
  public get sequence(): number {
    return this._sequence;
  }

  /**
   * Open the next generation, recycling the bucket that falls out of the
   * window. Called once per frame - not once per render, which would rotate the
   * window several times a frame and push every consumer out of it.
   */
  public advance(): void {
    this._generation++;
    this._slot = this._generation % RETAINED_GENERATIONS;

    const bucket = this._buckets[this._slot]!;

    bucket.generation = this._generation;
    bucket.firstSequence = this._sequence;
    bucket.count = 0;

    const oldestGeneration = this._generation - RETAINED_GENERATIONS + 1;
    const oldest = this._buckets[((oldestGeneration % RETAINED_GENERATIONS) + RETAINED_GENERATIONS) % RETAINED_GENERATIONS]!;

    if (oldest.generation === oldestGeneration) {
      this._windowStartSequence = oldest.firstSequence;
    }
  }

  /**
   * Record that `node` changed on `channels`, and stamp it with a fresh mark
   * sequence. A node already marked in this generation keeps its entry and has
   * the channels folded into it; the new sequence is what makes the repeat
   * visible to a consumer that read in between.
   */
  public mark(node: SceneNode, channels: number): void {
    const bucket = this._buckets[this._slot]!;

    node._dirtyMarkSequence = ++this._sequence;

    if (node._dirtyMarkGeneration === this._generation) {
      bucket.channels[node._dirtyMarkSlot] = bucket.channels[node._dirtyMarkSlot]! | channels;

      return;
    }

    // Retire the entry an earlier retained generation may still hold for this
    // node, so the window carries exactly one live entry per node. Without it a
    // node marked in two retained generations would be visited twice by one
    // read, and a consumer that writes on every visit - a renderer patching its
    // own private row - would do the work twice.
    if (node._dirtyMarkGeneration >= 0) {
      const previous = this._buckets[node._dirtyMarkGeneration % RETAINED_GENERATIONS]!;

      if (previous.generation === node._dirtyMarkGeneration && previous.nodes[node._dirtyMarkSlot] === node) {
        previous.channels[node._dirtyMarkSlot] = 0;
      }
    }

    const slot = bucket.count++;

    node._dirtyMarkGeneration = this._generation;
    node._dirtyMarkSlot = slot;

    if (slot < bucket.nodes.length) {
      bucket.nodes[slot] = node;
      bucket.channels[slot] = channels;
    } else {
      bucket.nodes.push(node);
      bucket.channels.push(channels);
    }
  }

  /**
   * Whether the window still reaches back to `sequence`, i.e. whether an answer
   * about everything since then would be complete.
   */
  public covers(sequence: number): boolean {
    return sequence >= this._windowStartSequence;
  }

  /**
   * Visit every node marked on `channels` after `sequence`, oldest generation
   * first. Returns `false` when `sequence` has fallen out of the window - the
   * caller must then treat the channel as unproven and rebuild - or when
   * `visit` stopped the walk, which is how a consumer abandons an attempt on
   * the first change it cannot apply.
   *
   * A node is visited at most once per read: re-marking retires the entry an
   * older retained generation held for it, so the window never carries the same
   * node twice.
   */
  public readSince(sequence: number, channels: number, visit: (node: SceneNode) => boolean): boolean {
    if (!this.covers(sequence)) {
      return false;
    }

    for (let step = Math.max(0, this._generation - RETAINED_GENERATIONS + 1); step <= this._generation; step++) {
      const bucket = this._buckets[step % RETAINED_GENERATIONS]!;

      if (bucket.generation !== step) {
        continue;
      }

      for (let index = 0; index < bucket.count; index++) {
        const node = bucket.nodes[index]!;

        if ((bucket.channels[index]! & channels) !== 0 && node._dirtyMarkSequence > sequence && !visit(node)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Whether anything at all was marked on `channels` after `sequence` - the
   * question a consumer asks before deciding that a frame changed nothing it
   * owns. `false` also when the window no longer covers `sequence`, so pair it
   * with {@link covers} wherever the difference between "quiet" and
   * "unprovable" matters.
   */
  public hasMarksSince(sequence: number, channels: number): boolean {
    let marked = false;

    this.readSince(sequence, channels, () => {
      marked = true;

      return false;
    });

    return marked;
  }

  /** Drop every mark and start over - for tests and for a full teardown. */
  public reset(): void {
    for (const bucket of this._buckets) {
      bucket.generation = -1;
      bucket.firstSequence = 0;
      bucket.count = 0;
      bucket.nodes.length = 0;
      bucket.channels.length = 0;
    }

    this._generation = 0;
    this._slot = 0;
    this._sequence = 0;
    this._windowStartSequence = 0;
    this._buckets[0]!.generation = 0;
  }
}

/** The process-wide changed-record index; see {@link NodeDirtyIndex}. @internal */
export const nodeDirtyIndex = new NodeDirtyIndex();
