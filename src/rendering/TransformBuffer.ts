import type { Color } from '#core/Color';
import type { Matrix } from '#math/Matrix';
import { PixelSnapMode } from '#rendering/pixelSnap';

/**
 * Floats per transform row (2 rgba32f texels): the single source of truth for
 * the layout shared by {@link TransformBuffer}, the retained group transform
 * store, and the Slice-4b in-place row patch. Tint lives in a separate,
 * natively-8-bit-per-channel row (see {@link TRANSFORM_TINT_BYTES_PER_ROW} /
 * {@link packTintRow}) — GPU texture/buffer uploads round up to whole
 * texels/vec4s regardless of how few of a slot's floats are "real" data, so a
 * layout that keeps tint's 4 float32 channels inline never crosses the
 * 3-texel -> 2-texel boundary that actually reduces upload bandwidth and GPU
 * memory footprint. Splitting tint into its own rgba8 texture/buffer does,
 * without quantizing anything the engine doesn't already store at that
 * precision (r/g/b are already 0..255 integer channels on {@link Color}; only
 * alpha's continuous float precision would be lost if it were packed into a
 * shared float32 slot, which is why it isn't).
 */
export const TRANSFORM_FLOATS_PER_ROW = 8;

/**
 * Bytes per tint row (one rgba8 texel / one packed `u32`): r, g, b (0..255,
 * {@link Color}'s native integer channels — exact, not quantized) and alpha
 * rounded to 0..255 (the only lossy step, and it matches the precision every
 * mainstream 2D/WebGPU renderer already uses for a per-instance blend color,
 * via a native normalized 8-bit-per-channel vertex/texture format).
 * @internal
 */
export const TRANSFORM_TINT_BYTES_PER_ROW = 4;

const floatsPerSlot = TRANSFORM_FLOATS_PER_ROW;
const tintBytesPerSlot = TRANSFORM_TINT_BYTES_PER_ROW;
const initialCapacity = 16;
const hashPrime = 0x01000193;
const hashOffset = 0x811c9dc5;

const hashFloatScratch = new Float32Array(1);
const hashUintScratch = new Uint32Array(hashFloatScratch.buffer);

/**
 * Write one transform row into `target` at `offset` in the canonical layout
 * (a,b,c,d, tx,ty, snapMode,0). The single packer shared by
 * {@link TransformBuffer.write} and the Slice-4b row patch, so the frame buffer
 * and a patched retained row stay bit-identical by construction — a layout change
 * lands in exactly one place.
 *
 * `snapMode` rides in the row's spare slot (`m1.z`): both backends now upload
 * the RAW world transform and snap the drawable's device-pixel origin in the
 * vertex stage, gated on this flag (spec D3-D5).
 * @internal
 */
export const packTransformRow = (target: Float32Array, offset: number, transform: Matrix, snapMode: PixelSnapMode = PixelSnapMode.None): void => {
  target[offset + 0] = transform.a;
  target[offset + 1] = transform.b;
  target[offset + 2] = transform.c;
  target[offset + 3] = transform.d;
  target[offset + 4] = transform.x;
  target[offset + 5] = transform.y;
  target[offset + 6] = snapMode;
  target[offset + 7] = 0;
};

/**
 * Write one tint row into `target` (a `Uint8Array`) at byte `offset`, as
 * `(r, g, b, a)` — r/g/b are {@link Color}'s native 0..255 integer channels
 * (copied exactly), alpha is `Color.a` (0..1 float) rounded to 0..255. Shares
 * the {@link packTransformRow} write-site, so the two rows stay in lockstep.
 * @internal
 */
export const packTintRow = (target: Uint8Array, offset: number, tint: Color): void => {
  target[offset + 0] = tint.r;
  target[offset + 1] = tint.g;
  target[offset + 2] = tint.b;
  target[offset + 3] = Math.round(tint.a * 255);
};

/** @internal */
export interface TransformBufferFrameSnapshot {
  readonly count: number;
  readonly hash: number;
  readonly changed: boolean;
  readonly version: number;
}

/**
 * Internal per-frame transform+tint storage for draw-command node indices.
 *
 * Transform slot layout (8 floats):
 * - 0..3:  (a, b, c, d)
 * - 4..7:  (tx, ty, snapMode, 0)
 *
 * Tint row layout ({@link tintData}, parallel array, one rgba8 texel/row):
 * - (r, g, b, a) as 0..255 bytes.
 *
 * @internal
 */
export class TransformBuffer {
  private _data: Float32Array = new Float32Array(initialCapacity * floatsPerSlot);
  private _tintData: Uint8Array = new Uint8Array(initialCapacity * tintBytesPerSlot);
  private _count = 0;
  private _version = 0;
  private _frameHash = hashOffset >>> 0;
  private _lastCommittedHash = 0;
  private _lastCommittedCount = -1;
  private _writeCount = 0;
  private _skippedWriteCount = 0;
  private _uploadCount = 0;
  private _uploadedRecordCount = 0;
  // Dirty row range [_dirtyMin, _dirtyMax] written since the last upload — the
  // exact rows a delta upload must push. Empty when `_dirtyMax < _dirtyMin`.
  // Tracked by slot (not a high-water mark) so a reused slot (nested-plan
  // rewind, filter composite) is correctly re-uploaded.
  private _dirtyMin = 0;
  private _dirtyMax = -1;

  public get count(): number {
    return this._count;
  }

  /**
   * Number of transform rows written into the buffer (via {@link write} /
   * {@link push}) since the last {@link begin}. Internal stat for profiling and
   * regression guards; does not affect packing.
   * @internal
   */
  public get writeCount(): number {
    return this._writeCount;
  }

  /**
   * Number of draw commands whose transform write was skipped since the last
   * {@link begin} — recorded by the backend for renderers that opt out of the
   * shared transform storage (`_consumesSharedTransform === false`).
   * @internal
   */
  public get skippedWriteCount(): number {
    return this._skippedWriteCount;
  }

  /**
   * Number of GPU uploads (texture / storage writes) issued for this buffer
   * since the last {@link begin}. Recorded by the backend at its upload
   * boundary; an unchanged frame uploads zero times.
   * @internal
   */
  public get uploadCount(): number {
    return this._uploadCount;
  }

  /**
   * Total transform rows pushed to the GPU across all uploads since the last
   * {@link begin}.
   * @internal
   */
  public get uploadedRecordCount(): number {
    return this._uploadedRecordCount;
  }

  public get capacity(): number {
    return this._data.length / floatsPerSlot;
  }

  public get data(): Float32Array {
    return this._data;
  }

  /** Parallel per-row tint bytes (rgba, 0..255) — see {@link packTintRow}. @internal */
  public get tintData(): Uint8Array {
    return this._tintData;
  }

  public get version(): number {
    return this._version;
  }

  /** Running content hash of the rows written since begin(). @internal */
  public get frameHash(): number {
    return this._frameHash;
  }

  public begin(expectedCount = 0): this {
    if (expectedCount > 0) {
      this._ensureCapacity(expectedCount);
    }

    this._count = 0;
    this._frameHash = hashOffset >>> 0;
    this._writeCount = 0;
    this._skippedWriteCount = 0;
    this._uploadCount = 0;
    this._uploadedRecordCount = 0;
    this._dirtyMin = 0;
    this._dirtyMax = -1;

    return this;
  }

  public push(transform: Matrix, tint: Color, snapMode: PixelSnapMode = PixelSnapMode.None): number {
    const slot = this._count;

    this.write(slot, transform, tint, snapMode);

    return slot;
  }

  /**
   * Rewind the write cursor to `count`, freeing the rows above it for reuse, and
   * (optionally) restore the running content hash to its pre-rewind value so the
   * freed rows' writes don't linger in the hash and trigger spurious re-uploads.
   * Used by nested draw plans (filters / cacheAsBitmap) to isolate their slots.
   * @internal
   */
  public rewindTo(count: number, frameHash?: number): this {
    if (count >= 0 && count < this._count) {
      this._count = count;

      if (frameHash !== undefined) {
        this._frameHash = frameHash >>> 0;
      }
    }

    return this;
  }

  /**
   * Consume the dirty row range written since the last upload, clamped to
   * `[0, maxCount)`, and clear it. Returns the contiguous `[firstRow, firstRow +
   * rowCount)` a delta upload should push (`rowCount === 0` when nothing is
   * dirty). The backend calls this at its upload boundary.
   * @internal
   */
  public consumeDirtyRange(maxCount: number): { firstRow: number; rowCount: number } {
    if (this._dirtyMax < this._dirtyMin) {
      return { firstRow: 0, rowCount: 0 };
    }

    const firstRow = Math.max(0, this._dirtyMin);
    const lastRow = Math.min(this._dirtyMax, maxCount - 1);
    const rowCount = lastRow >= firstRow ? lastRow - firstRow + 1 : 0;

    this._dirtyMin = 0;
    this._dirtyMax = -1;

    return { firstRow, rowCount };
  }

  public write(slot: number, transform: Matrix, tint: Color, snapMode: PixelSnapMode = PixelSnapMode.None): this {
    if (!Number.isInteger(slot) || slot < 0) {
      throw new Error(`TransformBuffer slot must be a non-negative integer (got ${slot}).`);
    }

    this._ensureCapacity(slot + 1);

    const offset = slot * floatsPerSlot;

    packTransformRow(this._data, offset, transform, snapMode);
    packTintRow(this._tintData, slot * tintBytesPerSlot, tint);

    if (slot >= this._count) {
      this._count = slot + 1;
    }

    // Track the exact written-slot range so a delta upload pushes precisely the
    // changed rows — including a slot reused below the high-water mark.
    if (this._dirtyMax < this._dirtyMin) {
      this._dirtyMin = slot;
      this._dirtyMax = slot;
    } else {
      if (slot < this._dirtyMin) this._dirtyMin = slot;
      if (slot > this._dirtyMax) this._dirtyMax = slot;
    }

    this._frameHash = this._mix(this._frameHash, slot);

    const data = this._data;

    for (let i = 0; i < floatsPerSlot; i++) {
      // In-bounds: offset..offset+floatsPerSlot-1 is the just-written slot.
      this._frameHash = this._mix(this._frameHash, this._hashFloat(data[offset + i]!));
    }

    // Tint lives in a separate byte array (see the class doc) — fold it into the
    // same content hash, otherwise a frame that only changes tint (identical
    // transform) would hash identically to the previous frame and commitSnapshot
    // would wrongly report `changed: false`, skipping the tint texture's upload.
    const tintOffset = slot * tintBytesPerSlot;
    const tintData = this._tintData;
    const packedTint = (tintData[tintOffset]! << 24) | (tintData[tintOffset + 1]! << 16) | (tintData[tintOffset + 2]! << 8) | tintData[tintOffset + 3]!;

    this._frameHash = this._mix(this._frameHash, packedTint >>> 0);

    this._writeCount++;

    return this;
  }

  /**
   * Record that a draw command's transform write was intentionally skipped
   * because its renderer opts out of the shared transform storage. Counts
   * toward {@link skippedWriteCount} only — buffer contents are untouched.
   * @internal
   */
  public recordSkippedWrite(): this {
    this._skippedWriteCount++;

    return this;
  }

  /**
   * Record a GPU upload of `recordCount` transform rows. Called by the backend
   * at its upload boundary after committing a snapshot; affects stats only.
   * @internal
   */
  public recordUpload(recordCount: number): this {
    this._uploadCount++;
    this._uploadedRecordCount += recordCount;

    return this;
  }

  public commitSnapshot(minCount = 0): TransformBufferFrameSnapshot {
    const count = Math.max(this._count, minCount);
    const hash = this._mix(this._frameHash, count);
    const changed = hash !== this._lastCommittedHash || count !== this._lastCommittedCount;

    if (changed) {
      this._version++;
      this._lastCommittedHash = hash;
      this._lastCommittedCount = count;
    }

    return {
      count,
      hash,
      changed,
      version: this._version,
    };
  }

  private _ensureCapacity(requiredSlots: number): void {
    const current = this.capacity;

    if (requiredSlots <= current) {
      return;
    }

    let next = Math.max(current, initialCapacity);

    while (next < requiredSlots) {
      next *= 2;
    }

    const nextData = new Float32Array(next * floatsPerSlot);
    const nextTintData = new Uint8Array(next * tintBytesPerSlot);

    nextData.set(this._data);
    nextTintData.set(this._tintData);
    this._data = nextData;
    this._tintData = nextTintData;
  }

  private _hashFloat(value: number): number {
    hashFloatScratch[0] = value;

    // hashUintScratch is a 1-element view aliasing hashFloatScratch.
    return hashUintScratch[0]! >>> 0;
  }

  private _mix(hash: number, value: number): number {
    return Math.imul((hash ^ value) >>> 0, hashPrime) >>> 0;
  }
}
