import type { ActionMap } from './ActionMap';
import type { ActionSample, ChannelEvent, ChannelEventBatch } from './types';

/**
 * Owner side of a scope level — the two facts a level needs to re-baseline the
 * maps on it when its mask changes. @internal
 */
export interface ScopeLevelOwner {
  _currentBatchSequence(): number;
  _snapshotActionChannels(): Float32Array;
}

/**
 * One priority level of a {@link SceneInputs} scope stack: the maps on it, plus
 * the derived {@link ActionSample} they see once higher levels have claimed
 * controls away from them.
 *
 * Masking has to cover `batches` as well as `values`. An action reconstructs
 * its `pressed`/`released` edges by replaying this frame's batch log, so a
 * level that only zeroed the live values would still hand a lower action the
 * full press-and-release history of a control a higher scope owns — the exact
 * leak the scope stack exists to prevent.
 *
 * The derived sample object is reused across frames so its identity stays
 * stable, which is what tells an {@link ActionOwnership} that the same owner is
 * simply delivering its next frame. Identity deliberately DOES change when a
 * level goes from unmasked (it forwards the owner's own sample verbatim, with
 * no copying at all) to masked or back, and the maps are re-armed at that
 * moment: gaining or losing a control mid-play must re-seed from the true
 * current channel state rather than manufacture an edge out of the change
 * itself.
 *
 * @internal
 */
export class ScopeLevel {
  private readonly _maps = new Set<ActionMap>();
  private readonly _mask = new Set<number>();
  private _values: Float32Array | null = null;
  private _batches: ChannelEventBatch[] = [];
  private _derived: ActionSample | null = null;
  private _wasMasked = false;
  /**
   * `false` until this level has seen its first claim set.
   *
   * The first one is not a CHANGE: the maps on this level were armed when they
   * were attached, moments earlier, and re-arming them here would swallow
   * whatever happened in between — a key pressed in the same frame a scope was
   * pushed would never reach the level it belongs to.
   */
  private _maskKnown = false;

  public get maps(): ReadonlySet<ActionMap> {
    return this._maps;
  }

  public add(map: ActionMap): void {
    this._maps.add(map);
  }

  public delete(map: ActionMap): boolean {
    return this._maps.delete(map);
  }

  public clear(): void {
    this._maps.clear();
  }

  /**
   * Update every map on this level against `sample`, with `masked` (the union
   * of every higher level's claims) removed first.
   */
  public update(owner: ScopeLevelOwner, sample: ActionSample, masked: ReadonlySet<number>): void {
    const effective = this._prepare(owner, sample, masked);

    for (const map of this._maps) {
      map._update(effective);
    }
  }

  /**
   * Re-arm every map on this level against the masked channel state — the
   * suspend/resume and push/pop path, where the maps must resume from the true
   * current state without replaying anything that happened while they were not
   * watching.
   */
  public resync(owner: ScopeLevelOwner, sample: ActionSample, masked: ReadonlySet<number>): void {
    const effective = this._prepare(owner, sample, masked);
    const watermark = owner._currentBatchSequence();

    for (const map of this._maps) {
      map._armBaseline(watermark, this._maskedSnapshot(owner, masked));
      map._update(effective);
    }
  }

  /** Reset every map on this level, as when its scene suspends. */
  public reset(): void {
    for (const map of this._maps) {
      map._reset();
    }
  }

  private _prepare(owner: ScopeLevelOwner, sample: ActionSample, masked: ReadonlySet<number>): ActionSample {
    const isMasked = masked.size > 0;

    if (isMasked !== this._wasMasked || !sameChannels(this._mask, masked)) {
      const known = this._maskKnown;

      this._wasMasked = isMasked;
      this._maskKnown = true;
      this._mask.clear();

      for (const channel of masked) {
        this._mask.add(channel);
      }

      if (known) {
        this._rearm(owner, masked);
      }
    }

    if (!isMasked) {
      return sample;
    }

    return this._derive(sample, masked);
  }

  /**
   * Re-establish every map's baseline because this level's claim set just
   * changed. Without it a control a higher scope released back would seed from
   * zero and read as a fresh press on the very next frame.
   */
  private _rearm(owner: ScopeLevelOwner, masked: ReadonlySet<number>): void {
    const watermark = owner._currentBatchSequence();

    for (const map of this._maps) {
      map._reset();
      map._armBaseline(watermark, this._maskedSnapshot(owner, masked));
    }
  }

  private _maskedSnapshot(owner: ScopeLevelOwner, masked: ReadonlySet<number>): Float32Array {
    const snapshot = owner._snapshotActionChannels();

    for (const channel of masked) {
      snapshot[channel] = 0;
    }

    return snapshot;
  }

  private _derive(sample: ActionSample, masked: ReadonlySet<number>): ActionSample {
    const values = this._values ?? new Float32Array(sample.values.length);

    values.set(sample.values);

    for (const channel of masked) {
      values[channel] = 0;
    }

    this._values = values;
    this._batches = filterBatches(sample.batches, masked);

    const derived = this._derived;

    if (derived === null) {
      this._derived = { values, batches: this._batches, frameId: sample.frameId, timestamp: sample.timestamp };

      return this._derived;
    }

    // The derived sample keeps its identity across frames on purpose (see the
    // class doc comment), so `batches` is re-pointed rather than the object
    // replaced.
    (derived as { batches: readonly ChannelEventBatch[] }).batches = this._batches;
    derived.frameId = sample.frameId;
    derived.timestamp = sample.timestamp;

    return derived;
  }
}

/** `batches` with every event on a masked channel removed, dropping batches that empty out. */
function filterBatches(batches: readonly ChannelEventBatch[], masked: ReadonlySet<number>): ChannelEventBatch[] {
  const result: ChannelEventBatch[] = [];

  for (const batch of batches) {
    let kept: ChannelEvent[] | null = null;

    for (let i = 0; i < batch.channels.length; i++) {
      const event = batch.channels[i]!;

      if (masked.has(event.channel)) {
        kept ??= batch.channels.slice(0, i);
        continue;
      }

      kept?.push(event);
    }

    if (kept === null) {
      result.push(batch);
      continue;
    }

    if (kept.length > 0) {
      result.push({ channels: kept, sequence: batch.sequence, timestamp: batch.timestamp });
    }
  }

  return result;
}

function sameChannels(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) {
    return false;
  }

  for (const channel of a) {
    if (!b.has(channel)) {
      return false;
    }
  }

  return true;
}
