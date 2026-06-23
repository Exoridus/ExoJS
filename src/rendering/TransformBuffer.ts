import type { Color } from '#core/Color';
import type { Matrix } from '#math/Matrix';

const floatsPerSlot = 12;
const initialCapacity = 16;
const hashPrime = 0x01000193;
const hashOffset = 0x811c9dc5;

const hashFloatScratch = new Float32Array(1);
const hashUintScratch = new Uint32Array(hashFloatScratch.buffer);

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
 * Slot layout (12 floats):
 * - 0..3:  (a, b, c, d)
 * - 4..7:  (tx, ty, 0, 0)
 * - 8..11: (tintR, tintG, tintB, tintA) with RGB in 0..1
 *
 * @internal
 */
export class TransformBuffer {
  private _data: Float32Array = new Float32Array(initialCapacity * floatsPerSlot);
  private _count = 0;
  private _version = 0;
  private _frameHash = hashOffset >>> 0;
  private _lastCommittedHash = 0;
  private _lastCommittedCount = -1;
  private _writeCount = 0;
  private _skippedWriteCount = 0;
  private _uploadCount = 0;
  private _uploadedRecordCount = 0;

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

  public get version(): number {
    return this._version;
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

    return this;
  }

  public push(transform: Matrix, tint: Color): number {
    const slot = this._count;

    this.write(slot, transform, tint);

    return slot;
  }

  public write(slot: number, transform: Matrix, tint: Color): this {
    if (!Number.isInteger(slot) || slot < 0) {
      throw new Error(`TransformBuffer slot must be a non-negative integer (got ${slot}).`);
    }

    this._ensureCapacity(slot + 1);

    const offset = slot * floatsPerSlot;
    const data = this._data;

    data[offset + 0] = transform.a;
    data[offset + 1] = transform.b;
    data[offset + 2] = transform.c;
    data[offset + 3] = transform.d;
    data[offset + 4] = transform.x;
    data[offset + 5] = transform.y;
    data[offset + 6] = 0;
    data[offset + 7] = 0;
    data[offset + 8] = tint.r / 255;
    data[offset + 9] = tint.g / 255;
    data[offset + 10] = tint.b / 255;
    data[offset + 11] = tint.a;

    if (slot >= this._count) {
      this._count = slot + 1;
    }

    this._frameHash = this._mix(this._frameHash, slot);

    for (let i = 0; i < floatsPerSlot; i++) {
      // In-bounds: offset..offset+floatsPerSlot-1 is the just-written slot.
      this._frameHash = this._mix(this._frameHash, this._hashFloat(data[offset + i]!));
    }

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

    nextData.set(this._data);
    this._data = nextData;
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
