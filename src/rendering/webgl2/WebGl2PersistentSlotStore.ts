import type { GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import type { PersistentSlotBundle } from '#rendering/plan/persistentSlotDraw';
import type { RenderRootSource } from '#rendering/plan/RenderRootSource';
import {
  createTransformTextureLayout,
  createTransformTextureRect,
  type MutableTransformTextureRect,
  tintTextureRect,
  TRANSFORM_ROWS_PER_TEXTURE_LINE,
  TRANSFORM_TEXELS_PER_ROW,
  type TransformTextureLayout,
  transformTextureRect,
  WEBGL2_MIN_MAX_TEXTURE_SIZE,
} from '#rendering/shader/transformTextureLayout';
import { DataTexture } from '#rendering/texture/DataTexture';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import { TRANSFORM_TINT_BYTES_PER_ROW } from '#rendering/TransformBuffer';
import { BlendModes, BufferTypes, BufferUsage, TextureFormat } from '#rendering/types';

import type { WebGl2Backend } from './WebGl2Backend';
import { WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import type { WebGl2VertexArrayObject } from './WebGl2VertexArrayObject';

/**
 * Floats one slot occupies in each of the two rgba32f stores. Both hold two
 * texels, which is what lets the shader address them with the single row
 * mapping the shared transform texture already publishes - and what keeps the
 * textures 2048 texels wide, the width every WebGL2 context guarantees.
 */
const floatsPerSlotRow = TRANSFORM_TEXELS_PER_ROW * 4;
const tintBytesPerSlot = TRANSFORM_TINT_BYTES_PER_ROW;
const initialSlotCapacity = 1024;

/**
 * @internal
 *
 * One render root's persistent per-slot GPU state on WebGL2: the quad
 * attributes, the world transform (with the batch's texture slot riding in its
 * spare component), the tint, and the order buffer the draw walks.
 *
 * # What makes this cheap
 *
 * Every store is addressed by DERIVED SLOT, which is stable for as long as an
 * item stays visible. A camera step therefore writes only the rows of the items
 * that just entered; the rest of the store is already correct and is not read,
 * not rewritten and not re-uploaded. What does change every selection is the
 * order buffer - four bytes per visible item - because that is the draw order
 * and insertions move it.
 *
 * # Upload granularity
 *
 * Entered slots are scattered (they come off a free list), so the dirty set is
 * tracked per TEXTURE LINE rather than as one min/max span. A line is exactly
 * `rowsPerLine` slots by construction, so a dirty line is one `commitRect` and
 * the upload stays proportional to the lines the arrivals actually landed on
 * instead of to the whole store. In practice they cluster: a free list is LIFO
 * and the items leaving a scrolling view were admitted together, so their slots
 * were too.
 *
 * # Growth
 *
 * Capacity doubles and COPIES, so a slot keeps both its number and its contents
 * across a growth - which is why growth does not bump {@link generation}. The
 * generation exists for the cases where the contents genuinely stop being
 * trustworthy: a lost device, or an explicit release.
 */
/**
 * The renderer that owns a store's row layout and issues its draw. Assigned by
 * the backend at acquisition; the backend routes the write and draw hooks back
 * through it rather than re-resolving a renderer per call.
 * @internal
 */
export interface PersistentSlotCapableRenderer {
  readonly _supportsPersistentSlots?: boolean;
  _acquirePersistentSlotStore(source: RenderRootSource, backend: WebGl2Backend): WebGl2PersistentSlotStore | null;
  _rekeyPersistentSlotStore(store: WebGl2PersistentSlotStore, source: RenderRootSource, carried: Int32Array, previousHandleCount: number): boolean;
  _writePersistentSlotRows(store: WebGl2PersistentSlotStore, source: RenderRootSource, entered: Int32Array, count: number): void;
  _drawPersistentSlots(store: WebGl2PersistentSlotStore, order: Uint32Array, offset: number, count: number, backend: WebGl2Backend): void;
}

export class WebGl2PersistentSlotStore implements PersistentSlotBundle {
  /** Set by the backend at acquisition; see {@link PersistentSlotCapableRenderer}. */
  public owner: PersistentSlotCapableRenderer | null = null;

  private _generation = 1;
  private _capacity = 0;
  private _layout: TransformTextureLayout | null = null;

  private _attributes = new Float32Array(0);
  private _transforms = new Float32Array(0);
  private _tints = new Uint8Array(0);

  private _attributeTexture: DataTexture<TextureFormat.Rgba32F> | null = null;
  private _transformTexture: DataTexture<TextureFormat.Rgba32F> | null = null;
  private _tintTexture: DataTexture<TextureFormat.Rgba8> | null = null;

  /** One flag per texture line; a line is `layout.rowsPerLine` slots. */
  private _dirtyLines = new Uint8Array(0);
  private _dirtyLineCount = 0;
  private readonly _rectScratch: MutableTransformTextureRect = createTransformTextureRect();

  private _order = new Uint32Array(0);
  private _orderBuffer: WebGl2RenderBuffer | null = null;
  /**
   * The vertex array object the owner draws this store's order buffer through.
   * Created by the owner on first draw, held here because its lifetime is the
   * order buffer's: whatever replaces or releases the buffer drops it too.
   */
  public indexedVao: WebGl2VertexArrayObject | null = null;

  /**
   * The root's base textures, in the slot order the packed rows reference.
   *
   * Append-only for the store's whole life. That is the promise which makes a
   * slot's texture index item-stable: an entry never moves, and a source whose
   * distinct textures do not all fit one table is refused - so neither a
   * membership change nor a structure delta bringing a new texture in can force
   * a re-slotting of what is already written.
   */
  public readonly textures: Array<Texture | RenderTexture> = [];

  /**
   * The one blend mode the whole source agreed on. A blend change is a hard
   * flush boundary for the batcher, so a source that mixes modes never gets a
   * store at all - which is why this can be a single value rather than per slot.
   */
  public blendMode: BlendModes = BlendModes.Normal;

  /**
   * Which entry of {@link textures} each source item uses, indexed by GLOBAL
   * item handle.
   *
   * Derived, not source data: it names a position in THIS store's table. Filled
   * during acquisition, which already walks every item to build that table, so
   * an ENTER never has to ask a drawable for its texture; a structure delta
   * re-derives only the entries of the items it did not carry.
   */
  public textureIndexOfHandle = new Uint8Array(0);

  /** See {@link PersistentSpriteSlotStore.spareTextureIndexOfHandle}. */
  public spareTextureIndexOfHandle = new Uint8Array(0);

  private _gl: WebGL2RenderingContext | null = null;
  private _accountant: GpuResourceAccountant | null = null;
  private _maxTextureSize = WEBGL2_MIN_MAX_TEXTURE_SIZE;
  private _destroyed = false;

  public get generation(): number {
    return this._generation;
  }

  public get slotCapacity(): number {
    return this._capacity;
  }

  public get attributeTexture(): DataTexture<TextureFormat.Rgba32F> | null {
    return this._attributeTexture;
  }

  public get transformTexture(): DataTexture<TextureFormat.Rgba32F> | null {
    return this._transformTexture;
  }

  public get tintTexture(): DataTexture<TextureFormat.Rgba8> | null {
    return this._tintTexture;
  }

  public get orderBuffer(): WebGl2RenderBuffer | null {
    return this._orderBuffer;
  }

  /** GPU bytes the three stores plus the order buffer hold, for the memory report. */
  public get byteLength(): number {
    return this._attributes.byteLength + this._transforms.byteLength + this._tints.byteLength + this._order.byteLength;
  }

  /** Attach the context the device resources are created against. */
  public connectDevice(gl: WebGL2RenderingContext, accountant: GpuResourceAccountant): void {
    this._gl = gl;
    this._accountant = accountant;
    this._maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  }

  /**
   * Whether a selection of `slots` fits the row textures this context can
   * allocate. Asked by the plan before the first write, so a root past the
   * ceiling is refused onto the ordinary path instead of failing the frame in
   * {@link ensureCapacity}. The order buffer has no such ceiling on WebGL2.
   */
  public canRepresent(slots: number, _orderEntries: number): boolean {
    const capacity = this._growthCapacity(slots);
    const rowsPerLine = Math.min(TRANSFORM_ROWS_PER_TEXTURE_LINE, capacity);

    return rowsPerLine * TRANSFORM_TEXELS_PER_ROW <= this._maxTextureSize && capacity / rowsPerLine <= this._maxTextureSize;
  }

  /** The capacity a growth to hold `slots` rows would settle on: doubling from the current one. */
  private _growthCapacity(slots: number): number {
    let next = Math.max(initialSlotCapacity, this._capacity);

    while (next < slots) {
      next *= 2;
    }

    return next;
  }

  /**
   * Grow the stores to hold at least `slots` rows, preserving every row already
   * written. Deliberately does not bump {@link generation}: a slot survives a
   * growth with its number and its contents intact, so nothing the plan believes
   * about it stops being true.
   */
  public ensureCapacity(slots: number): void {
    if (slots <= this._capacity) {
      return;
    }

    const next = this._growthCapacity(slots);
    const layout = createTransformTextureLayout(next, this._maxTextureSize);
    const attributes = new Float32Array(next * floatsPerSlotRow);
    const transforms = new Float32Array(next * floatsPerSlotRow);
    const tints = new Uint8Array(next * tintBytesPerSlot);

    attributes.set(this._attributes);
    transforms.set(this._transforms);
    tints.set(this._tints);

    this._attributeTexture?.destroy();
    this._transformTexture?.destroy();
    this._tintTexture?.destroy();

    this._attributes = attributes;
    this._transforms = transforms;
    this._tints = tints;
    this._attributeTexture = new DataTexture({
      width: layout.transformWidth,
      height: layout.transformHeight,
      format: TextureFormat.Rgba32F,
      data: attributes,
    });
    this._transformTexture = new DataTexture({
      width: layout.transformWidth,
      height: layout.transformHeight,
      format: TextureFormat.Rgba32F,
      data: transforms,
    });
    this._tintTexture = new DataTexture({
      width: layout.tintWidth,
      height: layout.tintHeight,
      format: TextureFormat.Rgba8,
      data: tints,
    });
    this._capacity = next;
    this._layout = layout;

    // Every row moved into a fresh texture, so the whole store is pending
    // regardless of which rows the caller is about to write.
    this._dirtyLines = new Uint8Array(layout.transformHeight);
    this._dirtyLines.fill(1);
    this._dirtyLineCount = layout.transformHeight;
  }

  /**
   * Fill one slot from the source's prepacked tables.
   *
   * Deliberately takes offsets into typed arrays rather than a drawable: the
   * whole point of the source-side prepack is that an item entering the view is
   * never read out of the scene graph again, so this method must have no way to
   * do so. The quad record's eight floats are already in this store's attribute
   * layout - local bounds then UV - so they copy straight across.
   *
   * `textureIndex` overwrites the canonical transform row's spare fourth
   * component, which the shared packer leaves at zero and no other shader reads.
   * It is the one genuinely derived field here, because which slot of the
   * store's table a texture occupies is a batching fact, not a property of the
   * item - see `sprite-indexed.vert`.
   */
  public writeSlotFrom(
    slot: number,
    rows: Float32Array,
    rowOffset: number,
    tints: Uint8Array,
    tintOffset: number,
    quads: Float32Array,
    quadOffset: number,
    textureIndex: number,
  ): void {
    const offset = slot * floatsPerSlotRow;
    const attributes = this._attributes;
    const transforms = this._transforms;

    for (let i = 0; i < floatsPerSlotRow; i++) {
      attributes[offset + i] = quads[quadOffset + i]!;
      transforms[offset + i] = rows[rowOffset + i]!;
    }

    transforms[offset + floatsPerSlotRow - 1] = textureIndex;

    const tintTarget = slot * tintBytesPerSlot;

    for (let i = 0; i < tintBytesPerSlot; i++) {
      this._tints[tintTarget + i] = tints[tintOffset + i]!;
    }

    this._markDirty(slot);
  }

  /** Push every dirty texture line to the GPU and clear the dirty set. */
  public commitDirtyRows(): number {
    const layout = this._layout;

    if (layout === null || this._dirtyLineCount === 0) {
      return 0;
    }

    const rowsPerLine = layout.rowsPerLine;
    const lines = this._dirtyLines;
    let uploadedRows = 0;

    for (let line = 0; line < lines.length; line++) {
      if (lines[line] === 0) {
        continue;
      }

      lines[line] = 0;

      const firstRow = line * rowsPerLine;
      const rows = transformTextureRect(layout, firstRow, rowsPerLine, this._rectScratch);

      this._attributeTexture!.commitRect(rows.x, rows.y, rows.width, rows.height);
      this._transformTexture!.commitRect(rows.x, rows.y, rows.width, rows.height);

      const tint = tintTextureRect(layout, firstRow, rowsPerLine, this._rectScratch);

      this._tintTexture!.commitRect(tint.x, tint.y, tint.width, tint.height);
      uploadedRows += rowsPerLine;
    }

    this._dirtyLineCount = 0;

    return uploadedRows;
  }

  /**
   * Upload the `count` order entries at `offset` and return the buffer they
   * live in, at its start: WebGL2 has no base instance, so every segment of a
   * cut stream is uploaded to position zero and drawn from there. GL orders
   * the upload against the draws before it, so the rewrite never reaches an
   * earlier segment.
   *
   * This is the one per-frame upload proportional to the VISIBLE set rather than
   * to the delta, and it is four bytes an entry: an insertion moves every later
   * position, so a diff would have to answer where each survivor went, which
   * costs more than rewriting the stream.
   */
  public uploadOrder(
    order: Uint32Array,
    offset: number,
    count: number,
    createRuntime: (gl: WebGL2RenderingContext) => WebGl2RenderBufferRuntime,
  ): WebGl2RenderBuffer {
    const gl = this._gl;

    if (gl === null) {
      throw new Error('WebGl2PersistentSlotStore: device not connected before order upload.');
    }

    if (this._order.length < count) {
      let next = Math.max(initialSlotCapacity, this._order.length);

      while (next < count) {
        next *= 2;
      }

      this._order = new Uint32Array(next);
      this._releaseOrderBuffer();
    }

    this._order.set(order.subarray(offset, offset + count));

    // At least one element: a zero-length store is not a valid buffer.
    const uploadCount = Math.max(1, count);

    if (this._orderBuffer === null) {
      // Only the constructor still needs a narrowed view - it sizes the initial
      // store from what it is handed and takes no element count.
      this._orderBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this._order.subarray(0, uploadCount), BufferUsage.DynamicDraw).connect(
        createRuntime(gl),
        this._accountant ?? undefined,
      );
    } else {
      this._orderBuffer.upload(this._order, 0, uploadCount);
    }

    return this._orderBuffer;
  }

  /**
   * Invalidate every written slot (device loss). The plan reads
   * {@link generation} and treats the next selection as all-entering.
   */
  public invalidateDeviceResources(): void {
    this._generation++;
    this._attributeTexture?.destroy();
    this._transformTexture?.destroy();
    this._tintTexture?.destroy();
    this._releaseOrderBuffer();
    this._attributeTexture = null;
    this._transformTexture = null;
    this._tintTexture = null;
    this._capacity = 0;
    this._layout = null;
    this._attributes = new Float32Array(0);
    this._transforms = new Float32Array(0);
    this._tints = new Uint8Array(0);
    this._dirtyLines = new Uint8Array(0);
    this._dirtyLineCount = 0;
  }

  /** Drop the order buffer and the vertex array object pointing into it, together. */
  private _releaseOrderBuffer(): void {
    this.indexedVao?.destroy();
    this.indexedVao = null;
    this._orderBuffer?.destroy();
    this._orderBuffer = null;
  }

  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;
    this.invalidateDeviceResources();
    this.textures.length = 0;
    this.textureIndexOfHandle = new Uint8Array(0);
    this.spareTextureIndexOfHandle = new Uint8Array(0);
    this._order = new Uint32Array(0);
  }

  private _markDirty(slot: number): void {
    const layout = this._layout;

    if (layout === null) {
      return;
    }

    const line = (slot / layout.rowsPerLine) | 0;

    if (this._dirtyLines[line] === 0) {
      this._dirtyLines[line] = 1;
      this._dirtyLineCount++;
    }
  }
}
