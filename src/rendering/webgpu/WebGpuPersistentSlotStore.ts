/// <reference types="@webgpu/types" />

import type { GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import type { PersistentSlotBundle } from '#rendering/plan/PersistentSlotDraw';
import type { RenderRootSource } from '#rendering/plan/RenderRootSource';
import { SOURCE_QUAD_FLOATS } from '#rendering/sourceQuadRecord';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import { TRANSFORM_FLOATS_PER_ROW, TRANSFORM_TINT_BYTES_PER_ROW } from '#rendering/TransformBuffer';
import { BlendModes } from '#rendering/types';

import type { WebGpuBackend } from './WebGpuBackend';
import type { WebGpuActiveRenderPass } from './WebGpuPassCoordinator';

const floatsPerTransformRow = TRANSFORM_FLOATS_PER_ROW;
const floatsPerQuadRecord = SOURCE_QUAD_FLOATS;
const tintBytesPerSlot = TRANSFORM_TINT_BYTES_PER_ROW;
const transformBytesPerSlot = floatsPerTransformRow * Float32Array.BYTES_PER_ELEMENT;
const quadBytesPerSlot = floatsPerQuadRecord * Float32Array.BYTES_PER_ELEMENT;
const orderBytesPerEntry = Uint32Array.BYTES_PER_ELEMENT;
const initialSlotCapacity = 1024;

/**
 * Slots one dirty block covers.
 *
 * Arrivals are scattered — they come off a free list — so the dirty set is
 * tracked per BLOCK rather than as one min/max span, and each dirty block is one
 * `writeBuffer` per store. 256 slots is 8 KB of transform rows, 8 KB of quad
 * records and 1 KB of tints: large enough that the per-call overhead is
 * amortised, small enough that a lone arrival does not re-upload the store. In
 * practice they cluster anyway — the free list is LIFO, and the items leaving a
 * scrolling view were admitted together, so their slots were too.
 */
const slotsPerBlock = 256;

/**
 * Bytes of the persistent pipeline's uniform block: mat4x4 projection + mat4x4
 * group + vec4 snap viewport + the premultiply mask, padded to the 16-byte
 * struct alignment WGSL requires.
 * @internal
 */
export const persistentUniformBytes = 160;

/** Word index of the premultiply mask inside a store's `uniformWords` view. */
export const persistentPremultiplyMaskIndex = 36;

/**
 * The renderer that owns a store's row layout and issues its draw. Assigned by
 * the backend at acquisition; the backend routes the write and draw hooks back
 * through it rather than re-resolving a renderer per call.
 * @internal
 */
export interface WebGpuPersistentSlotCapableRenderer {
  readonly _supportsPersistentSlots?: boolean;
  _acquirePersistentSlotStore(source: RenderRootSource, backend: WebGpuBackend): WebGpuPersistentSlotStore | null;
  _writePersistentSlotRows(store: WebGpuPersistentSlotStore, source: RenderRootSource, entered: Int32Array, count: number): void;
  _drawPersistentSlots(store: WebGpuPersistentSlotStore, order: Uint32Array, count: number, backend: WebGpuBackend): void;
}

/**
 * @internal
 *
 * One render root's persistent per-slot GPU state on WebGPU: the static quad
 * records, the world transforms (with the batch's texture slot riding in the
 * spare fourth component), the packed tints, and the order stream the draw
 * walks. Four storage buffers, plus the pipeline's own small uniform block.
 *
 * # Relationship to the WebGL2 store
 *
 * Same SEMANTICS, deliberately different representation. WebGL2 addresses its
 * slots through three data textures because that is what a WebGL2 vertex stage
 * can random-access; here a storage buffer indexes directly, so there is no
 * texel mapping, no `MAX_TEXTURE_SIZE` ceiling to route around and no row/line
 * geometry — a slot is just an array element. The order stream is a storage
 * buffer too rather than an instanced vertex attribute, which is what lets the
 * pipeline declare no vertex buffers at all.
 *
 * # What makes this cheap
 *
 * Every store is addressed by DERIVED SLOT, which is stable for as long as an
 * item stays visible. A camera step therefore writes only the rows of the items
 * that just entered; the rest of the store is already correct and is not read,
 * not rewritten and not re-uploaded. What does change every selection is the
 * order buffer — four bytes per visible item — because that IS the draw order
 * and an insertion moves everything behind it.
 *
 * # Growth
 *
 * Capacity doubles and the CPU staging arrays carry every written slot across,
 * so a slot keeps both its number and its contents — which is why growth does
 * not bump {@link generation}. The GPU buffers are replaced (WebGPU buffers do
 * not resize), so growth marks the whole store dirty and invalidates the cached
 * bind group; the plan is told nothing, because nothing it believes stopped
 * being true.
 *
 * The generation exists for the case where the contents genuinely stop being
 * trustworthy: a lost device, or an explicit release.
 */
export class WebGpuPersistentSlotStore implements PersistentSlotBundle {
  /** Set by the backend at acquisition; see {@link WebGpuPersistentSlotCapableRenderer}. */
  public owner: WebGpuPersistentSlotCapableRenderer | null = null;

  private _generation = 1;
  private _capacity = 0;

  private _transforms = new Float32Array(0);
  private _quads = new Float32Array(0);
  private _tints = new Uint8Array(0);

  private _transformBuffer: GPUBuffer | null = null;
  private _quadBuffer: GPUBuffer | null = null;
  private _tintBuffer: GPUBuffer | null = null;
  private _orderBuffer: GPUBuffer | null = null;
  private _uniformBuffer: GPUBuffer | null = null;

  /** One flag per block of {@link slotsPerBlock} slots. */
  private _dirtyBlocks = new Uint8Array(0);
  private _dirtyBlockCount = 0;

  private _order = new Uint32Array(0);
  private _orderCapacity = 0;

  /**
   * The group(0) bind group, cached against the buffer identities it was built
   * from. Growth replaces buffers, which is exactly when it must be rebuilt.
   */
  private _bindGroup: GPUBindGroup | null = null;

  /**
   * The pass this store's draws were last recorded into, and the uniform bytes
   * that pass saw.
   *
   * `queue.writeBuffer` is ordered against the SUBMIT, not against the
   * individual draws inside it, so rewriting a buffer an already-recorded draw
   * reads would retroactively change it. Same hazard the retained bundles face,
   * and the same answer: end the pass first.
   */
  public drawsInPass: WebGpuActiveRenderPass | null = null;

  /**
   * Projection + group + snap viewport + premultiply mask, as the pipeline sees
   * them. Two views over one block because the mask is a `u32` sitting behind
   * three matrices of `f32` — writing it through the float view would store its
   * bit pattern as a float.
   */
  public readonly uniformData = new Float32Array(persistentUniformBytes / Float32Array.BYTES_PER_ELEMENT);
  public readonly uniformWords = new Uint32Array(this.uniformData.buffer);
  public uniformWritten = false;

  private _device: GPUDevice | null = null;
  private _accountant: GpuResourceAccountant | null = null;
  private _accountedBytes = 0;
  private _accountedOrderBytes = 0;
  private _destroyed = false;

  /**
   * The root's base textures, in the slot order the packed rows reference.
   *
   * Fixed for the store's whole life. That is the promise which makes a slot's
   * texture index item-stable: the acquisition check refuses a source whose
   * distinct textures do not all fit one table, so no membership change can ever
   * force a re-slotting.
   */
  public readonly textures: Array<Texture | RenderTexture> = [];

  /**
   * The one blend mode the whole source agreed on. A blend change is a hard
   * flush boundary for the batcher, so a source that mixes modes never gets a
   * store at all — which is why this can be a single value rather than per slot.
   */
  public blendMode: BlendModes = BlendModes.Normal;

  /**
   * Which entry of {@link textures} each source item uses, indexed by GLOBAL
   * item handle.
   *
   * Derived, not source data: it names a position in THIS store's table. Filled
   * once during acquisition, which already walks every item to build that table,
   * so an ENTER never has to ask a drawable for its texture.
   */
  public textureIndexOfHandle = new Uint8Array(0);

  public get generation(): number {
    return this._generation;
  }

  public get slotCapacity(): number {
    return this._capacity;
  }

  public get transformBuffer(): GPUBuffer | null {
    return this._transformBuffer;
  }

  public get quadBuffer(): GPUBuffer | null {
    return this._quadBuffer;
  }

  public get tintBuffer(): GPUBuffer | null {
    return this._tintBuffer;
  }

  public get orderBuffer(): GPUBuffer | null {
    return this._orderBuffer;
  }

  public get uniformBuffer(): GPUBuffer | null {
    return this._uniformBuffer;
  }

  /** GPU bytes the four slot stores plus the uniform block hold, for the memory report. */
  public get byteLength(): number {
    return this._accountedBytes + this._accountedOrderBytes;
  }

  /** Attach the device the GPU resources are created against. */
  public connectDevice(device: GPUDevice, accountant: GpuResourceAccountant): void {
    this._device = device;
    this._accountant = accountant;
    this._uniformBuffer ??= device.createBuffer({
      label: 'sprite:persistent-uniform-buffer',
      size: persistentUniformBytes,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
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

    let next = Math.max(initialSlotCapacity, this._capacity);

    while (next < slots) {
      next *= 2;
    }

    const transforms = new Float32Array(next * floatsPerTransformRow);
    const quads = new Float32Array(next * floatsPerQuadRecord);
    const tints = new Uint8Array(next * tintBytesPerSlot);

    transforms.set(this._transforms);
    quads.set(this._quads);
    tints.set(this._tints);

    this._transforms = transforms;
    this._quads = quads;
    this._tints = tints;
    this._capacity = next;

    // Every row moved into fresh GPU buffers, so the whole store is pending
    // regardless of which rows the caller is about to write.
    const blocks = Math.ceil(next / slotsPerBlock);

    this._dirtyBlocks = new Uint8Array(blocks);
    this._dirtyBlocks.fill(1);
    this._dirtyBlockCount = blocks;
    this._allocateSlotBuffers(next);
  }

  /**
   * Fill one slot from the source's prepacked tables.
   *
   * Deliberately takes offsets into typed arrays rather than a drawable: the
   * whole point of the source-side prepack is that an item entering the view is
   * never read out of the scene graph again, so this method must have no way to
   * do so. The quad record's eight floats are already this store's quad layout —
   * local bounds then UV — so they copy straight across.
   *
   * `textureIndex` overwrites the canonical transform row's spare fourth
   * component, which the shared packer leaves at zero and no other shader reads.
   * It is the one genuinely derived field here, because which slot of the
   * store's table a texture occupies is a batching fact, not a property of the
   * item.
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
    const transformTarget = slot * floatsPerTransformRow;
    const quadTarget = slot * floatsPerQuadRecord;
    const transforms = this._transforms;
    const quadRecords = this._quads;

    for (let i = 0; i < floatsPerTransformRow; i++) {
      transforms[transformTarget + i] = rows[rowOffset + i]!;
    }

    transforms[transformTarget + floatsPerTransformRow - 1] = textureIndex;

    for (let i = 0; i < floatsPerQuadRecord; i++) {
      quadRecords[quadTarget + i] = quads[quadOffset + i]!;
    }

    const tintTarget = slot * tintBytesPerSlot;

    for (let i = 0; i < tintBytesPerSlot; i++) {
      this._tints[tintTarget + i] = tints[tintOffset + i]!;
    }

    this._markDirty(slot);
  }

  /** Push every dirty block to the GPU and clear the dirty set; returns the slots uploaded. */
  public commitDirtySlots(): number {
    const device = this._device;

    if (device === null || this._dirtyBlockCount === 0 || this._transformBuffer === null) {
      return 0;
    }

    const blocks = this._dirtyBlocks;
    let uploadedSlots = 0;

    for (let block = 0; block < blocks.length; block++) {
      if (blocks[block] === 0) {
        continue;
      }

      blocks[block] = 0;

      const firstSlot = block * slotsPerBlock;
      const slots = Math.min(slotsPerBlock, this._capacity - firstSlot);

      if (slots <= 0) {
        continue;
      }

      device.queue.writeBuffer(
        this._transformBuffer,
        firstSlot * transformBytesPerSlot,
        this._transforms.buffer,
        this._transforms.byteOffset + firstSlot * transformBytesPerSlot,
        slots * transformBytesPerSlot,
      );
      device.queue.writeBuffer(
        this._quadBuffer!,
        firstSlot * quadBytesPerSlot,
        this._quads.buffer,
        this._quads.byteOffset + firstSlot * quadBytesPerSlot,
        slots * quadBytesPerSlot,
      );
      device.queue.writeBuffer(
        this._tintBuffer!,
        firstSlot * tintBytesPerSlot,
        this._tints.buffer,
        this._tints.byteOffset + firstSlot * tintBytesPerSlot,
        slots * tintBytesPerSlot,
      );

      uploadedSlots += slots;
    }

    this._dirtyBlockCount = 0;
    this._accountant?.recordBufferUpload(uploadedSlots * (transformBytesPerSlot + quadBytesPerSlot + tintBytesPerSlot));

    return uploadedSlots;
  }

  /** Whether committing the pending slot writes would replace a GPU buffer. */
  public wouldGrow(slots: number): boolean {
    return slots > this._capacity;
  }

  /** Whether uploading `count` order entries would replace the order buffer. */
  public orderWouldGrow(count: number): boolean {
    return count > this._orderCapacity;
  }

  /**
   * Upload `count` order entries and return the buffer they live in.
   *
   * This is the one per-frame upload proportional to the VISIBLE set rather than
   * to the delta, and it is four bytes an entry: an insertion moves every later
   * position, so a diff would have to answer where each survivor went, which
   * costs more than rewriting the stream.
   */
  public uploadOrder(order: Uint32Array, count: number): GPUBuffer {
    const device = this._device;

    if (device === null) {
      throw new Error('WebGpuPersistentSlotStore: device not connected before order upload.');
    }

    if (count > this._orderCapacity || this._orderBuffer === null) {
      let next = Math.max(initialSlotCapacity, this._orderCapacity);

      while (next < count) {
        next *= 2;
      }

      this._order = new Uint32Array(next);
      this._orderBuffer?.destroy();
      this._orderBuffer = device.createBuffer({
        label: 'sprite:persistent-order-buffer',
        size: next * orderBytesPerEntry,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this._orderCapacity = next;
      this._bindGroup = null;
      this._accountedOrderBytes = this._accountant?.reallocate(this._accountedOrderBytes, next * orderBytesPerEntry) ?? next * orderBytesPerEntry;
    }

    this._order.set(order.subarray(0, count));

    // Rounded up to four bytes is a no-op here (entries are u32), but
    // writeBuffer requires a multiple of 4 and a non-zero size is never asked
    // for — the draw hook returns early on an empty order.
    device.queue.writeBuffer(this._orderBuffer, 0, this._order.buffer, this._order.byteOffset, count * orderBytesPerEntry);
    this._accountant?.recordBufferUpload(count * orderBytesPerEntry);

    return this._orderBuffer;
  }

  /**
   * The group(0) bind group for this store, built once per buffer generation.
   * `layout` is the renderer's persistent group(0) layout, fixed per connection.
   */
  public bindGroup(device: GPUDevice, layout: GPUBindGroupLayout): GPUBindGroup {
    if (this._bindGroup !== null) {
      return this._bindGroup;
    }

    this._bindGroup = device.createBindGroup({
      label: 'sprite:persistent-bind-group',
      layout,
      entries: [
        { binding: 0, resource: { buffer: this._uniformBuffer! } },
        { binding: 1, resource: { buffer: this._transformBuffer! } },
        { binding: 2, resource: { buffer: this._tintBuffer! } },
        { binding: 3, resource: { buffer: this._quadBuffer! } },
        { binding: 4, resource: { buffer: this._orderBuffer! } },
      ],
    });

    return this._bindGroup;
  }

  /**
   * Invalidate every written slot (device loss). The plan reads
   * {@link generation} and treats the next selection as all-entering.
   */
  public invalidateDeviceResources(): void {
    this._generation++;
    this._releaseBuffers();
    this._capacity = 0;
    this._orderCapacity = 0;
    this._transforms = new Float32Array(0);
    this._quads = new Float32Array(0);
    this._tints = new Uint8Array(0);
    this._order = new Uint32Array(0);
    this._dirtyBlocks = new Uint8Array(0);
    this._dirtyBlockCount = 0;
    this.uniformWritten = false;
    this.drawsInPass = null;
    this._device = null;
  }

  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;
    this.invalidateDeviceResources();
    this.textures.length = 0;
    this.textureIndexOfHandle = new Uint8Array(0);
  }

  private _allocateSlotBuffers(slots: number): void {
    const device = this._device;

    this._transformBuffer?.destroy();
    this._quadBuffer?.destroy();
    this._tintBuffer?.destroy();
    this._transformBuffer = null;
    this._quadBuffer = null;
    this._tintBuffer = null;
    this._bindGroup = null;

    if (device === null) {
      return;
    }

    this._transformBuffer = device.createBuffer({
      label: 'sprite:persistent-transform-buffer',
      size: slots * transformBytesPerSlot,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this._quadBuffer = device.createBuffer({
      label: 'sprite:persistent-quad-buffer',
      size: slots * quadBytesPerSlot,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this._tintBuffer = device.createBuffer({
      label: 'sprite:persistent-tint-buffer',
      size: slots * tintBytesPerSlot,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const bytes = slots * (transformBytesPerSlot + quadBytesPerSlot + tintBytesPerSlot) + persistentUniformBytes;

    this._accountedBytes = this._accountant?.reallocate(this._accountedBytes, bytes) ?? bytes;
  }

  private _releaseBuffers(): void {
    this._transformBuffer?.destroy();
    this._quadBuffer?.destroy();
    this._tintBuffer?.destroy();
    this._orderBuffer?.destroy();
    this._uniformBuffer?.destroy();
    this._transformBuffer = null;
    this._quadBuffer = null;
    this._tintBuffer = null;
    this._orderBuffer = null;
    this._uniformBuffer = null;
    this._bindGroup = null;

    if (this._accountedBytes > 0) {
      this._accountant?.free(this._accountedBytes);
      this._accountedBytes = 0;
    }

    if (this._accountedOrderBytes > 0) {
      this._accountant?.free(this._accountedOrderBytes);
      this._accountedOrderBytes = 0;
    }
  }

  private _markDirty(slot: number): void {
    const block = (slot / slotsPerBlock) | 0;

    if (this._dirtyBlocks[block] === 0) {
      this._dirtyBlocks[block] = 1;
      this._dirtyBlockCount++;
    }
  }
}
