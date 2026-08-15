import type { Drawable } from '#rendering/Drawable';

import { copyMaterialKeyInto, type DrawCommand, type MaterialKey } from './RenderCommand';

/**
 * The replayable payload of one previously-collected draw: everything
 * `RenderPlanBuilder.emitDraw` computed for it (material key, bounds in the
 * capture's space convention, seq/zIndex placement). Base shape shared by the
 * per-child {@link RetainedDrawSlot} and the whole-fragment
 * {@link RetainedFragmentDraw}.
 * @internal
 */
export interface RetainedDrawData {
  readonly drawable: Drawable;
  readonly seq: number;
  readonly zIndex: number;
  readonly material: MaterialKey;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * The writable half of {@link RetainedDrawData}: what a pooled record exposes to
 * the code that fills it. `material` stays readonly here on purpose — the key
 * object is pooled with its record and rewritten field by field
 * ({@link copyRetainedDrawData}), never replaced.
 * @internal
 */
export interface MutableRetainedDrawData {
  drawable: Drawable;
  seq: number;
  zIndex: number;
  readonly material: MaterialKey;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * @internal
 *
 * A grow-only pool of records that are rewritten in place, and the one
 * implementation of that idiom for every retained capture that keeps one: the
 * draw, group and barrier records of a {@link RetainedGroupFragment}, and the
 * per-child slots of a {@link RetainedPlanCache}.
 *
 * The contract is what makes a steady-state recapture allocation-free.
 * {@link rewind} declares the previous capture's records reusable without
 * dropping them, and {@link acquire} hands the next one back — constructing one
 * only the first time a capture ever reaches that depth. So a subtree that keeps
 * its shape allocates on its first capture and never again, however often it is
 * invalidated and re-taken.
 *
 * `_create` is a factory rather than a shape descriptor because the records are
 * deliberately NOT built by spreading a shared base: each pool's records are
 * created at exactly one site with every field present in a fixed order, which
 * is what keeps one hidden class per record type on the hottest path the
 * renderer has.
 */
export class RetainedRecordPool<T> {
  private readonly _records: T[] = [];
  private _cursor = 0;

  public constructor(private readonly _create: () => T) {}

  /** How many records the capture in progress has taken. */
  public get used(): number {
    return this._cursor;
  }

  /** Record `index` of the capture in progress; callers hold `index < used`. */
  public at(index: number): T {
    return this._records[index]!;
  }

  /** Begin a capture: every record the previous one took becomes reusable. */
  public rewind(): void {
    this._cursor = 0;
  }

  /** The next record of this capture, constructed only if the pool never grew this far. */
  public acquire(): T {
    const pooled = this._records[this._cursor];

    if (pooled !== undefined) {
      this._cursor++;

      return pooled;
    }

    const record = this._create();

    this._records[this._cursor] = record;
    this._cursor++;

    return record;
  }
}

/**
 * Drop a draw pool's strong references to their drawables so an evicted or
 * destroyed drawable can be garbage-collected. The pooled record objects
 * survive and their `drawable` is rewritten in place on the next capture, so
 * pool reuse is unaffected.
 *
 * Only the records the last capture actually took are cleared: beyond `used`
 * the pool holds records whose `drawable` was already cleared by an earlier
 * pass or never written at all.
 * @internal
 */
export const releasePooledDrawables = <T extends { drawable: Drawable }>(pool: RetainedRecordPool<T>): void => {
  for (let index = 0; index < pool.used; index++) {
    pool.at(index).drawable = undefined as unknown as Drawable;
  }
};

/**
 * Copy the eight fields every captured draw shares — the drawable, its
 * `(zIndex, seq)` placement, its material key and its snapshotted screen AABB —
 * out of a live command into a pooled record.
 *
 * One function rather than two identical field lists, because these are the
 * fields a replay reads back verbatim: a copy that silently skipped one would
 * not fail a type check, it would paint the previous capture's value.
 * @internal
 */
export const copyRetainedDrawData = (target: MutableRetainedDrawData, command: DrawCommand): void => {
  target.drawable = command.drawable;
  target.seq = command.seq;
  target.zIndex = command.zIndex;
  copyMaterialKeyInto(target.material, command.material);
  target.minX = command.minX;
  target.minY = command.minY;
  target.maxX = command.maxX;
  target.maxY = command.maxY;
};
