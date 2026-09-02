import type { SceneNode } from './SceneNode';

/**
 * What changed about a node. A single mark carries a mask, so one mutation that
 * touches two channels costs one entry.
 * @internal
 */
export const enum DirtyChannel {
  /** The node's own transform moved; its baked row is out of date. */
  Transform = 1 << 0,
  /**
   * The node's visual content changed in a way a recorded product cannot
   * express by rewriting a row - a different texture, geometry, blend mode,
   * filter, or visibility. A consumer that sees one has to rebuild.
   */
  Content = 1 << 1,
  /**
   * Only the node's tint changed. Split out of {@link Content} because it is
   * the one content change a recorded product CAN express in place: tint lives
   * in a per-row store parallel to the transform rows, so the change is a row
   * write rather than a re-record. A tint write marks this channel and not
   * `Content`, which is what lets a consumer tell "only tints moved" from
   * "something changed that I cannot patch".
   */
  Tint = 1 << 2,
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
  /**
   * Highest mark sequence written into this bucket - the skip test reads it. A
   * reader whose cursor is at or past it has already seen everything here, and
   * scanning the entries would only re-derive that one comparison at a time.
   */
  lastSequence: number;
  count: number;
  readonly nodes: SceneNode[];
  readonly channels: number[];
}

const createBucket = (): DirtyBucket => ({ generation: -1, firstSequence: 0, lastSequence: 0, count: 0, nodes: [], channels: [] });

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
 * generation, and what carries the ordering is the node's own per-channel mark
 * sequence - its per-record revision on that channel. A thousand writes to one
 * node in a frame therefore cost one entry, and the retained marks are bounded
 * by the number of distinct nodes that changed in the window, never by the
 * number of changes. Falling out of the window is reported rather than papered
 * over: {@link covers} answers `false` and the consumer rebuilds.
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
    bucket.lastSequence = this._sequence;
    bucket.count = 0;

    const oldestGeneration = this._generation - RETAINED_GENERATIONS + 1;
    const oldest = this._buckets[((oldestGeneration % RETAINED_GENERATIONS) + RETAINED_GENERATIONS) % RETAINED_GENERATIONS]!;

    if (oldest.generation === oldestGeneration) {
      this._windowStartSequence = oldest.firstSequence;
    }
  }

  /**
   * Record that `node` changed on `channels`, and stamp each of those channels
   * with a fresh mark sequence. A node already marked in this generation keeps
   * its entry and has the channels folded into it; the new sequences are what
   * make the repeat visible to a consumer that read in between.
   */
  public mark(node: SceneNode, channels: number): void {
    const bucket = this._buckets[this._slot]!;
    const live = node._dirtyMarkGeneration >= 0 ? this._buckets[node._dirtyMarkGeneration % RETAINED_GENERATIONS]! : null;
    const held = live !== null && live.generation === node._dirtyMarkGeneration && live.nodes[node._dirtyMarkSlot] === node;
    const sequence = ++this._sequence;

    if ((channels & DirtyChannel.Transform) !== 0) {
      node._transformMarkSequence = sequence;
    }

    if ((channels & DirtyChannel.Content) !== 0) {
      node._contentMarkSequence = sequence;
    }

    if ((channels & DirtyChannel.Tint) !== 0) {
      node._tintMarkSequence = sequence;
    }

    bucket.lastSequence = sequence;

    // Already standing in this generation: fold the channels in. A node written
    // a thousand times in a frame stays one entry, which is what makes this an
    // index rather than a journal.
    if (held && node._dirtyMarkGeneration === this._generation) {
      live.channels[node._dirtyMarkSlot]! |= channels;

      return;
    }

    // An older generation's entry: carry its channels into the new one before
    // retiring it. Dropping them would lose a mark no consumer had read yet -
    // a content change followed one frame later by a move would leave only the
    // move behind, and the content reader would be told nothing changed. The
    // carried bits cost nothing in precision because each channel is dated by
    // its own sequence, so a cursor past a carried mark still filters it out.
    const carried = held ? live.channels[node._dirtyMarkSlot]! : 0;

    if (held) {
      live.channels[node._dirtyMarkSlot] = 0;
    }

    const slot = bucket.count++;

    node._dirtyMarkGeneration = this._generation;
    node._dirtyMarkSlot = slot;

    if (slot < bucket.nodes.length) {
      bucket.nodes[slot] = node;
      bucket.channels[slot] = channels | carried;
    } else {
      bucket.nodes.push(node);
      bucket.channels.push(channels | carried);
    }
  }

  /**
   * The subset of `marked` whose own mark sequence is newer than `sequence` -
   * what this reader has not accounted for yet.
   */
  private _markedSince(node: SceneNode, marked: number, sequence: number): number {
    let changed = 0;

    if ((marked & DirtyChannel.Transform) !== 0 && node._transformMarkSequence > sequence) {
      changed |= DirtyChannel.Transform;
    }

    if ((marked & DirtyChannel.Content) !== 0 && node._contentMarkSequence > sequence) {
      changed |= DirtyChannel.Content;
    }

    if ((marked & DirtyChannel.Tint) !== 0 && node._tintMarkSequence > sequence) {
      changed |= DirtyChannel.Tint;
    }

    return changed;
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
  public readSince(sequence: number, channels: number, visit: (node: SceneNode, marked: number) => boolean): boolean {
    if (!this.covers(sequence)) {
      return false;
    }

    for (let step = Math.max(0, this._generation - RETAINED_GENERATIONS + 1); step <= this._generation; step++) {
      const bucket = this._buckets[step % RETAINED_GENERATIONS]!;

      // A generation whose newest mark is already accounted for holds nothing
      // for this reader. Skipping it whole is what keeps a read proportional to
      // what changed since the cursor rather than to everything the window
      // still remembers - with a consumer that looks every frame, only the
      // current generation is ever scanned.
      if (bucket.generation !== step || bucket.lastSequence <= sequence) {
        continue;
      }

      for (let index = 0; index < bucket.count; index++) {
        const node = bucket.nodes[index]!;
        const marked = this._markedSince(node, bucket.channels[index]! & channels, sequence);

        if (marked !== 0 && !visit(node, marked)) {
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
      bucket.lastSequence = 0;
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
