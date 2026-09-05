/// <reference types="@webgpu/types" />

/**
 * Dirty-block runs above which the whole dirty SPAN is uploaded in one call
 * instead of one call per run.
 *
 * Runs alone are not enough: rows are addressed by the capture's draw order, so
 * a scene moving a small random fraction of its nodes dirties blocks all over
 * the store and coalescing adjacent ones saves nothing. Past this many runs the
 * span's redundant bytes are cheaper than the calls they replace, and below it
 * a clustered patch keeps its tight upload.
 */
const maxRuns = 4;

/**
 * @internal
 *
 * Which rows of a CPU-mirrored GPU row store have been patched since the last
 * upload, and how to push them.
 *
 * The alternative - one `queue.writeBuffer` per patched row - makes the
 * per-frame upload count scale with the number of moving nodes, which is what
 * the WebGL2 backends never did: their row stores are textures whose dirty
 * rects are unioned and committed once. `writeBuffer` is priced per CALL far
 * more than per byte, so re-sending a whole block for a single moved row is
 * cheaper than the call it saves.
 *
 * Rows are tracked per BLOCK rather than individually for the same reason;
 * {@link rowsPerBlock} is the store's own trade between redundant bytes and
 * calls, and should land in the low kilobytes per block.
 */
export class DirtyRowTracker {
  private _blocks = new Uint8Array(0);
  private _blockCount = 0;
  private _rowCount = 0;
  private _hasDirty = false;

  /**
   * @param rowsPerBlock Rows one dirty block covers.
   * @param rowBytes Bytes one row occupies in the store.
   */
  public constructor(
    private readonly rowsPerBlock: number,
    private readonly rowBytes: number,
  ) {}

  /** Whether any row has been marked since the last {@link flush} or {@link reset}. */
  public get hasDirty(): boolean {
    return this._hasDirty;
  }

  /** Re-key the tracker to a store of `rowCount` rows and drop every pending mark. */
  public reset(rowCount: number): void {
    const blocks = Math.ceil(rowCount / this.rowsPerBlock);

    if (this._blocks.length < blocks) {
      this._blocks = new Uint8Array(blocks);
    } else {
      this._blocks.fill(0, 0, this._blockCount);
    }

    this._blockCount = blocks;
    this._rowCount = rowCount;
    this._hasDirty = false;
  }

  /** Mark one row's block for upload. Out-of-range rows are ignored. */
  public mark(row: number): void {
    if (row < 0 || row >= this._rowCount) {
      return;
    }

    this._blocks[(row / this.rowsPerBlock) | 0] = 1;
    this._hasDirty = true;
  }

  /**
   * Upload every marked block of `rows` into `buffer` and clear the marks - as
   * tight runs while the marks cluster, as one span over `[first, last]` once
   * they scatter past the run cap.
   *
   * `rows` is the CPU mirror in the store's own layout, so a row's byte offset
   * is the same on both sides.
   */
  public flush(device: GPUDevice, buffer: GPUBuffer, rows: ArrayBufferView): void {
    if (!this._hasDirty) {
      return;
    }

    const blocks = this._blocks;
    let runs = 0;
    let firstBlock = -1;
    let lastBlock = -1;

    for (let block = 0; block < this._blockCount; block++) {
      if (blocks[block] === 0) {
        continue;
      }

      if (firstBlock < 0) {
        firstBlock = block;
      }

      lastBlock = block;

      if (block === 0 || blocks[block - 1] === 0) {
        runs++;
      }
    }

    if (firstBlock >= 0) {
      if (runs > maxRuns) {
        this._writeRows(device, buffer, rows, firstBlock * this.rowsPerBlock, (lastBlock + 1) * this.rowsPerBlock);
      } else {
        this._writeRuns(device, buffer, rows, firstBlock, lastBlock);
      }
    }

    blocks.fill(0, 0, this._blockCount);
    this._hasDirty = false;
  }

  /** One `writeBuffer` per maximal run of adjacent dirty blocks. */
  private _writeRuns(device: GPUDevice, buffer: GPUBuffer, rows: ArrayBufferView, firstBlock: number, lastBlock: number): void {
    const blocks = this._blocks;
    let block = firstBlock;

    while (block <= lastBlock) {
      if (blocks[block] === 0) {
        block++;

        continue;
      }

      const runStart = block;

      while (block <= lastBlock && blocks[block] !== 0) {
        block++;
      }

      this._writeRows(device, buffer, rows, runStart * this.rowsPerBlock, block * this.rowsPerBlock);
    }
  }

  /** One `writeBuffer` covering rows `[firstRow, endRow)`, clamped to the store. */
  private _writeRows(device: GPUDevice, buffer: GPUBuffer, rows: ArrayBufferView, firstRow: number, endRow: number): void {
    const bytes = (Math.min(endRow, this._rowCount) - firstRow) * this.rowBytes;

    if (bytes <= 0) {
      return;
    }

    device.queue.writeBuffer(buffer, firstRow * this.rowBytes, rows.buffer, rows.byteOffset + firstRow * this.rowBytes, bytes);
  }
}
