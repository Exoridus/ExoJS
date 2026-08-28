import type { GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import type { MeshIndexFormat } from '#rendering/mesh/meshIndices';
import type { RetainedGroupBundle } from '#rendering/plan/RetainedInstructionSet';
import {
  createTransformTextureLayout,
  createTransformTextureRect,
  tintTextureRect,
  type TransformTextureLayout,
  transformTextureRect,
  WEBGL2_MIN_MAX_TEXTURE_SIZE,
} from '#rendering/shader/transformTextureLayout';
import { DataTexture } from '#rendering/texture/DataTexture';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import { TRANSFORM_FLOATS_PER_ROW, TRANSFORM_TINT_BYTES_PER_ROW } from '#rendering/TransformBuffer';
import { type BlendModes, BufferTypes, BufferUsage, RenderingPrimitives, TextureFormat } from '#rendering/types';

import { uploadBufferRange, uploadBufferStore, WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';

const transformFloatsPerRow = TRANSFORM_FLOATS_PER_ROW;
const tintBytesPerRow = TRANSFORM_TINT_BYTES_PER_ROW;
const initialInstanceWordCapacity = 256;
const initialTransformRowCapacity = 16;

/**
 * Mutable node-index range scratch used at capture end: the backend
 * scans every recorded batch for the smallest/largest shared-transform row it
 * references, then rebases all instance node indices to `min` so the cached
 * bytes address the group-owned transform store at rows `0..max-min`.
 * @internal
 */
export interface WebGl2RetainedNodeIndexRange {
  min: number;
  max: number;
}

/**
 * Record-time state of one texture slot, parallel to a payload's `textures`
 * list (collect-time validation - the WebGPU view-identity guard's
 * WebGL2 counterpart). The recorded per-instance UV words are normalized
 * against the texture size with the flipY swap baked in
 * (`WebGl2SpriteRenderer._packInstance`), and a resize bumps only the texture
 * VERSION - never a node revision - so the fragment stays clean and only
 * `_validateRetainedInstructionSet` can force the recapture. Same-size
 * content updates stay replayable (textures are re-bound live at replay).
 * @internal
 */
export interface WebGl2RecordedTextureState {
  readonly width: number;
  readonly height: number;
  readonly flipY: boolean;
}

/**
 * Reference to the renderer-owned, persistent, SHARED geometry an indexed
 * retained batch draws (mesh opt-in). The vertex + index
 * buffers live in the recording renderer's own long-lived cache (the mesh
 * renderer's `_staticGeometryCache`, uploaded once per `Geometry`, shared
 * across frames/groups); the group bundle stores only the thin per-instance
 * node-index stream, never the geometry bytes. Absent (`geometry` omitted /
 * `null`) for the self-contained instance-stream renderers (sprite / nine-
 * slice / repeating), whose batch VAO carries no index buffer and draws with
 * `drawArraysInstanced` - the existing path, unchanged.
 * @internal
 */
export interface WebGl2RetainedGeometryRef {
  readonly vertexBuffer: WebGl2RenderBuffer;
  readonly indexBuffer: WebGl2RenderBuffer;
  readonly indexCount: number;
  /** Width `indexBuffer` holds, so replay draws it with the type it was packed at. */
  readonly indexFormat: MeshIndexFormat;
}

/**
 * Auxiliary, renderer-owned replay state parked on a bundle for a renderer
 * that opts out of the shared `TransformBuffer` (`_consumesSharedTransform ===
 * false`, e.g. Text): its per-node style data lives in a private, group-owned
 * store the generic bundle machinery never touches, so the renderer attaches
 * it here and the bundle only has to release it on destroy. Mirrors the WebGPU
 * bundle's `rendererReplayState` slot.
 * @internal
 */
export interface WebGl2RetainedRendererReplayState {
  /** Release any GPU resources this state owns (called from the bundle). */
  destroy(): void;
}

/**
 * Backend-side replay descriptor for one recorded sprite flush. This
 * is the opaque `payload` carried by a plan-level `RetainedBatchInstruction`:
 * everything the owning renderer needs to re-issue the batch from group-owned
 * resources with all STATE (pipeline/blend, projection/group uniforms,
 * texture bindings) resolved live at replay time.
 * @internal
 */
export interface WebGl2RetainedBatchPayload {
  /** The group bundle whose instance buffer / transform store this batch references. */
  readonly bundle: WebGl2RetainedGroupResources;
  /** The renderer that recorded the batch and replays it (v1: the sprite renderer). */
  readonly replayer: WebGl2RetainedBatchReplayer;
  /** Blend mode the batch was flushed under (re-applied per replay). */
  readonly blendMode: BlendModes;
  /** Base textures in recorded slot order (bound to units `0..length-1` at replay). */
  readonly textures: ReadonlyArray<Texture | RenderTexture>;
  /** Record-time size/flipY per slot (see {@link WebGl2RecordedTextureState}). */
  readonly recordedTextureState: readonly WebGl2RecordedTextureState[];
  /** Instances drawn by this batch. */
  readonly instanceCount: number;
  /** Byte offset of this batch's instance data inside the bundle's instance buffer. */
  readonly byteOffset: number;
  /**
   * Shared, persistent geometry for an INDEXED batch (mesh opt-in): the
   * renderer-owned vertex + index buffers this batch's node-index stream
   * instances. `null`/absent for the self-contained instance-stream renderers
   * (sprite / nine-slice / repeating), whose VAO carries no index buffer and
   * replays with `drawArraysInstanced` over four strip vertices.
   */
  readonly geometry?: WebGl2RetainedGeometryRef | null;
  /**
   * Opaque, renderer-owned record-time data for a renderer that carries its
   * own per-node store instead of the shared `TransformBuffer` (Text: the
   * packed per-node style rows, the group-local glyph geometry, the drawable
   * list for the own-transform patch). `null`/absent for the shared-transform
   * renderers (sprite / nine-slice / repeating / mesh).
   */
  readonly rendererData?: unknown;
  /**
   * Per-batch VAO with attribute pointers pre-based at {@link byteOffset}
   * (WebGL2 has no baseInstance). Assigned at capture end; `null` only for a
   * capture that failed to finalize - replay then skips the draw, and the
   * generation mechanism keeps such a set from ever validating.
   */
  vao: WebGl2VertexArrayObject | null;
}

/**
 * Renderer-side contract for recorded-batch finalization and replay. The
 * bundle stores raw instance bytes; only the renderer that packed them knows
 * the layout (where the node index lives, which attributes the VAO needs), so
 * the backend delegates the layout-aware steps here per batch.
 * @internal
 */
export interface WebGl2RetainedBatchReplayer {
  /** Widen `range` to cover every shared-transform row this batch's instances reference. */
  _scanRetainedNodeIndexRange(payload: WebGl2RetainedBatchPayload, range: WebGl2RetainedNodeIndexRange): void;
  /** Rewrite this batch's instance node indices to group-local (`index - base`). */
  _rebaseRetainedNodeIndices(payload: WebGl2RetainedBatchPayload, base: number): void;
  /** Point `payload.vao`'s attributes at the bundle instance buffer, based at `payload.byteOffset`. */
  _configureRetainedVao(payload: WebGl2RetainedBatchPayload): void;
  /** Preflight structural live state before any instruction in the set draws. */
  _validateRetainedBatch?(payload: WebGl2RetainedBatchPayload): boolean;
  /** Replay the batch: live state (blend, uniforms, textures), cached data (bytes, transforms). */
  _replayRetainedBatch(payload: WebGl2RetainedBatchPayload): void;
}

/**
 * Group-owned WebGL2 GPU resources for one retained instruction set: the
 * persistent instance buffer holding the recorded
 * batch bytes, the group's own rgba32f transform DataTexture (3 texels per
 * row, same layout as the shared frame-scoped `TransformBuffer` texture so
 * the sprite shader is reused unchanged), and one small VAO per recorded
 * batch (attribute pointers pre-based at the batch's byte offset).
 *
 * Resources are grow-only per group and reused across recaptures (no realloc
 * churn under motion-stop/start). The {@link generation} counter bumps on
 * every capture rewrite, on device restore, and on growth (subsumed by the
 * rewrite bump) - a plan-level instruction whose recorded generation no
 * longer matches is rejected at collect time and degrades to entry replay
 * (belt-and-braces).
 *
 * GPU memory is booked with the backend's {@link GpuResourceAccountant}: the
 * instance buffer books through {@link WebGl2RenderBuffer}'s own accounting,
 * the transform texture through the backend's managed-texture sync.
 * @internal
 */
export class WebGl2RetainedGroupResources implements RetainedGroupBundle {
  private _generation = 1;

  // CPU-side instance store (grow-only). Two views over one ArrayBuffer: the
  // renderer packs/reads u32 words, the GPU upload takes the f32 view.
  private _instanceWords = new Uint32Array(0);
  private _instanceFloats = new Float32Array(0);
  private _usedWords = 0;

  // Group-owned transform rows (grow-only). The Float32Array doubles as the
  // DataTexture's backing buffer, so a capacity change recreates the texture.
  private _transformFloats: Float32Array | null = null;
  private _transformRowCapacity = 0;
  private _transformRowCount = 0;
  private _transformRowBase = 0;
  private _transformTexture: DataTexture<TextureFormat.Rgba32F> | null = null;
  // Row -> texel mapping the current stores were allocated under. Rebuilt with
  // the textures on growth; `null` while there are none. The scratch rect keeps
  // the per-patch upload region allocation-free.
  private _transformLayout: TransformTextureLayout | null = null;
  private readonly _rectScratch = createTransformTextureRect();
  // Parallel tint rows (see TransformBuffer's class doc): same row capacity/
  // count/base as the transform store, grown and stored together.
  private _tintBytes: Uint8Array | null = null;
  private _tintTexture: DataTexture<TextureFormat.Rgba8> | null = null;

  // Device-side resources, created lazily at the first capture finalize.
  private _gl: WebGL2RenderingContext | null = null;
  // The connected context's `gl.MAX_TEXTURE_SIZE`, which caps both transform
  // texture dimensions. Defaults to the value every WebGL2 context is required
  // to support, so a bundle whose rows are stored before `_connectDevice` (unit
  // tests) still gets a layout that any real context can hold.
  private _maxTextureSize = WEBGL2_MIN_MAX_TEXTURE_SIZE;
  private _accountant: GpuResourceAccountant | null = null;
  private _instanceBuffer: WebGl2RenderBuffer | null = null;
  private readonly _vaos: WebGl2VertexArrayObject[] = [];

  /**
   * Auxiliary replay state owned by a renderer that keeps its own per-node
   * store (Text). Null for the shared-transform renderers. Released on device
   * invalidation and destroy.
   */
  public rendererReplayState: WebGl2RetainedRendererReplayState | null = null;

  private _destroyed = false;

  public constructor(private readonly _onDestroyed: ((bundle: WebGl2RetainedGroupResources) => void) | null = null) {}

  /** Monotonic resource generation (see {@link RetainedGroupBundle.generation}). */
  public get generation(): number {
    return this._generation;
  }

  /** Full CPU-side instance word store; the used range is `[0, usedWords)`. */
  public get instanceWords(): Uint32Array {
    return this._instanceWords;
  }

  /** Words appended by the current/last capture. */
  public get usedWords(): number {
    return this._usedWords;
  }

  /** The group's persistent GPU instance buffer (`null` before the first finalize). */
  public get instanceBuffer(): WebGl2RenderBuffer | null {
    return this._instanceBuffer;
  }

  /** Group-owned transform store (`null` until the first capture stored rows). */
  public get transformTexture(): DataTexture<TextureFormat.Rgba32F> | null {
    return this._transformTexture;
  }

  /** Group-owned tint store (`null` until the first capture stored rows). */
  public get tintTexture(): DataTexture<TextureFormat.Rgba8> | null {
    return this._tintTexture;
  }

  /** Transform rows stored by the current/last capture. */
  public get transformRowCount(): number {
    return this._transformRowCount;
  }

  /**
   * The shared-buffer row the stored rows were rebased from (`range.min` at
   * capture end). A group-local row is `sharedNodeIndex - base`, so the
   * fast patch maps a moved node's captured node index back to the
   * group-owned store without re-recording.
   */
  public get transformRowBase(): number {
    return this._transformRowBase;
  }

  /**
   * Start rewriting the bundle for a fresh capture. Bumps the generation -
   * the contents recorded by any previous capture are about to be replaced,
   * so instructions referencing them (including an OUTER group's set holding
   * this bundle's batches verbatim) must stop validating.
   */
  public _beginCapture(): void {
    this._generation++;
    this._usedWords = 0;
    this._transformRowCount = 0;
  }

  /**
   * Append one recorded batch's instance words (copied) and return the byte
   * offset the batch starts at inside the instance buffer.
   */
  public _appendInstanceWords(words: Uint32Array): number {
    this._ensureInstanceCapacity(this._usedWords + words.length);

    const byteOffset = this._usedWords * Uint32Array.BYTES_PER_ELEMENT;

    this._instanceWords.set(words, this._usedWords);
    this._usedWords += words.length;

    return byteOffset;
  }

  /**
   * Copy `rowCount` transform + tint rows starting at `firstRow` from the
   * shared frame-scoped buffers into the group-owned stores (rows rebased to
   * 0) and mark them for upload. Growth recreates both DataTextures (their
   * buffer references are fixed); the generation was already bumped by
   * {@link _beginCapture}, so growth needs no extra invalidation.
   */
  public _storeTransformRows(source: Float32Array, tintSource: Uint8Array, firstRow: number, rowCount: number): void {
    if (rowCount <= 0) {
      return;
    }

    if (this._transformTexture === null || this._transformRowCapacity < rowCount) {
      let next = Math.max(initialTransformRowCapacity, this._transformRowCapacity);

      while (next < rowCount) {
        next *= 2;
      }

      // Same packing as the shared frame-scoped store, so the group's rows are
      // addressed by the one shader mapping and a group can hold more than
      // MAX_TEXTURE_SIZE rows.
      const layout = createTransformTextureLayout(next, this._maxTextureSize);

      this._transformTexture?.destroy();
      this._tintTexture?.destroy();
      this._transformFloats = new Float32Array(next * transformFloatsPerRow);
      this._transformTexture = new DataTexture({
        width: layout.transformWidth,
        height: layout.transformHeight,
        format: TextureFormat.Rgba32F,
        data: this._transformFloats,
      });
      this._tintBytes = new Uint8Array(next * tintBytesPerRow);
      this._tintTexture = new DataTexture({
        width: layout.tintWidth,
        height: layout.tintHeight,
        format: TextureFormat.Rgba8,
        data: this._tintBytes,
      });
      this._transformRowCapacity = next;
      this._transformLayout = layout;
    }

    // Non-null: the branch above allocated it when missing (the texture null
    // check narrows the texture itself, but not the floats/bytes/layout fields).
    const layout = this._transformLayout!;
    const transformRect = transformTextureRect(layout, 0, rowCount);
    const tintRect = tintTextureRect(layout, 0, rowCount);

    this._transformFloats!.set(source.subarray(firstRow * transformFloatsPerRow, (firstRow + rowCount) * transformFloatsPerRow), 0);
    this._transformTexture.commitRect(transformRect.x, transformRect.y, transformRect.width, transformRect.height);
    this._tintBytes!.set(tintSource.subarray(firstRow * tintBytesPerRow, (firstRow + rowCount) * tintBytesPerRow), 0);
    this._tintTexture!.commitRect(tintRect.x, tintRect.y, tintRect.width, tintRect.height);
    this._transformRowCount = rowCount;
    this._transformRowBase = firstRow;
  }

  /**
   * Fast patch: overwrite one group-local transform row in place with
   * `floats` and mark ONLY that row's sub-range for upload. Deliberately does
   * NOT bump the generation - the recorded instance bytes reference this row by
   * index and stay valid; only the transform behind the index moved. Tint is not
   * touched (a moved node's tint doesn't change - see
   * {@link RetainedContainer._tryPatchTransformRow}). Out-of-range rows are
   * ignored (a stale queue entry after a recapture shrank the store).
   *
   * `floats` is exactly one row - `TRANSFORM_FLOATS_PER_ROW` (8 = 2 rgba32f
   * texels, the {@link TransformBuffer} row layout) - so it is copied whole. It
   * is deliberately NOT narrowed with `subarray()` first: this runs once per
   * moved node per frame, and a view per patch was the single largest per-node
   * allocation on the transform-patch path.
   */
  public _patchTransformRow(localRow: number, floats: Float32Array): void {
    if (
      this._transformTexture === null ||
      this._transformFloats === null ||
      this._transformLayout === null ||
      localRow < 0 ||
      localRow >= this._transformRowCount
    ) {
      return;
    }

    // One logical row never straddles a texture line, so this stays a
    // single-row texel span whatever the row's index - the O(k) patch keeps its
    // upload size.
    const rect = transformTextureRect(this._transformLayout, localRow, 1, this._rectScratch);

    this._transformFloats.set(floats, localRow * transformFloatsPerRow);
    this._transformTexture.commitRect(rect.x, rect.y, rect.width, rect.height);
  }

  /**
   * Fast patch: overwrite one group-local tint row in place and mark ONLY that
   * row's texel for upload. Same contract as {@link _patchTransformRow} on the
   * parallel store - no generation bump, out-of-range rows ignored - and the
   * reason the two stores are separate: a tint change and a move touch
   * different bytes, so neither pays for the other's upload.
   */
  public _patchTintRow(localRow: number, bytes: Uint8Array): void {
    if (this._tintTexture === null || this._tintBytes === null || this._transformLayout === null || localRow < 0 || localRow >= this._transformRowCount) {
      return;
    }

    const rect = tintTextureRect(this._transformLayout, localRow, 1, this._rectScratch);

    this._tintBytes.set(bytes, localRow * tintBytesPerRow);
    this._tintTexture.commitRect(rect.x, rect.y, rect.width, rect.height);
  }

  /**
   * CPU-side vertex re-bake patch, for a renderer that bakes world
   * positions into its instance bytes rather than reading a shared-transform
   * row live (Text on WebGL2, the confirmed ANGLE/D3D11 vertex-texel-fetch
   * workaround). Overwrite `floats.length` words at `wordOffset` in the
   * instance store and upload just that sub-range. Deliberately does NOT bump
   * the generation - the recorded byte LAYOUT is unchanged, only the baked
   * position values move. Out-of-range writes are ignored (a stale patch after
   * a recapture shrank the store).
   */
  public _patchInstanceWords(wordOffset: number, floats: Float32Array): void {
    if (this._instanceBuffer === null || wordOffset < 0 || wordOffset + floats.length > this._usedWords) {
      return;
    }

    this._instanceFloats.set(floats, wordOffset);
    this._instanceBuffer.upload(floats, wordOffset * Float32Array.BYTES_PER_ELEMENT);
  }

  /** Attach the GL context + accountant the device resources are created against. */
  public _connectDevice(gl: WebGL2RenderingContext, accountant: GpuResourceAccountant): void {
    this._gl = gl;
    this._accountant = accountant;
    this._maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  }

  /** Upload the used instance range into the group's persistent GPU buffer. */
  public _uploadInstances(): void {
    if (this._gl === null) {
      throw new Error('WebGl2RetainedGroupResources: device not connected before instance upload.');
    }

    if (this._instanceBuffer === null) {
      // Only the constructor still needs a narrowed view: it sizes the initial
      // GPU store from what it is handed and takes no element count. That runs
      // once per group; every later upload states the range instead.
      this._instanceBuffer = new WebGl2RenderBuffer(
        BufferTypes.ArrayBuffer,
        this._instanceFloats.subarray(0, this._usedWords),
        BufferUsage.DynamicDraw,
      ).connect(this._createBufferRuntime(this._gl), this._accountant ?? undefined);

      return;
    }

    this._instanceBuffer.upload(this._instanceFloats, 0, this._usedWords);
  }

  /**
   * Pooled per-batch VAO for batch `index` (grow-only pool, reused across
   * recaptures). A reused VAO is cleared; the renderer re-adds its attribute
   * pointers for the new byte offset.
   */
  public _acquireVao(index: number): WebGl2VertexArrayObject {
    let vao = this._vaos[index];

    if (vao === undefined) {
      if (this._gl === null) {
        throw new Error('WebGl2RetainedGroupResources: device not connected before VAO acquisition.');
      }

      vao = new WebGl2VertexArrayObject(RenderingPrimitives.TriangleStrip).connect(this._createVaoRuntime(this._gl));
      this._vaos[index] = vao;
    } else {
      vao.clear();
    }

    return vao;
  }

  /**
   * Drop all device-side resources and bump the generation. Called on GL
   * context restore (the old handles died with the lost context) - every
   * instruction set referencing this bundle stops validating and re-records,
   * recreating the resources against the restored context.
   */
  public _invalidateDeviceResources(): void {
    this._generation++;
    this._instanceBuffer?.destroy();
    this._instanceBuffer = null;

    for (const vao of this._vaos) {
      vao.destroy();
    }

    this._vaos.length = 0;
    this._transformTexture?.destroy();
    this._transformTexture = null;
    this._transformFloats = null;
    this._tintTexture?.destroy();
    this._tintTexture = null;
    this._tintBytes = null;
    this._transformLayout = null;
    this._transformRowCapacity = 0;
    this._transformRowCount = 0;
    this._usedWords = 0;
    this.rendererReplayState?.destroy();
    this.rendererReplayState = null;
  }

  /** Release all resources (container destroy / boundary disengage / backend switch). Idempotent. */
  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;
    this._invalidateDeviceResources();
    this._instanceWords = new Uint32Array(0);
    this._instanceFloats = new Float32Array(0);
    this._gl = null;
    this._accountant = null;
    this._onDestroyed?.(this);
  }

  private _ensureInstanceCapacity(requiredWords: number): void {
    if (requiredWords <= this._instanceWords.length) {
      return;
    }

    let next = Math.max(initialInstanceWordCapacity, this._instanceWords.length);

    while (next < requiredWords) {
      next *= 2;
    }

    const buffer = new ArrayBuffer(next * Uint32Array.BYTES_PER_ELEMENT);
    const words = new Uint32Array(buffer);

    words.set(this._instanceWords.subarray(0, this._usedWords));
    this._instanceWords = words;
    this._instanceFloats = new Float32Array(buffer);
  }

  /**
   * Per-bundle buffer runtime - same shape as the sprite renderer's, with the
   * GL handle owned by this bundle so the buffer survives across frames.
   */
  private _createBufferRuntime(gl: WebGL2RenderingContext): WebGl2RenderBufferRuntime {
    const handle = gl.createBuffer();

    if (handle === null) {
      throw new Error('WebGl2RetainedGroupResources: could not create instance buffer.');
    }

    let allocatedBytes = 0;

    return {
      bind: (buffer): void => {
        gl.bindBuffer(buffer.type, handle);
      },
      upload: (buffer, offset): void => {
        gl.bindBuffer(buffer.type, handle);

        if (allocatedBytes >= buffer.uploadByteLength && allocatedBytes > 0) {
          uploadBufferRange(gl, buffer, offset);
        } else {
          uploadBufferStore(gl, buffer);
          allocatedBytes = buffer.uploadByteLength;
        }
      },
      destroy: (buffer): void => {
        gl.deleteBuffer(handle);
        buffer.disconnect();
      },
    };
  }

  /**
   * Per-VAO runtime - one GL vertex-array handle per recorded batch, pointer
   * application identical to the sprite renderer's VAO runtime (version-gated
   * re-apply after `clear()` + attribute re-add on recapture).
   */
  private _createVaoRuntime(gl: WebGL2RenderingContext): WebGl2VertexArrayObjectRuntime {
    const handle = gl.createVertexArray();

    if (handle === null) {
      throw new Error('WebGl2RetainedGroupResources: could not create vertex array object.');
    }

    let appliedVersion = -1;

    return {
      bind: (vao): void => {
        gl.bindVertexArray(handle);

        if (appliedVersion !== vao.version) {
          let lastBuffer: WebGl2RenderBuffer | null = null;

          for (const attribute of vao.attributes) {
            if (lastBuffer !== attribute.buffer) {
              attribute.buffer.bind();
              lastBuffer = attribute.buffer;
            }

            if (attribute.integer) {
              gl.vertexAttribIPointer(attribute.location, attribute.size, attribute.type, attribute.stride, attribute.start);
            } else {
              gl.vertexAttribPointer(attribute.location, attribute.size, attribute.type, attribute.normalized, attribute.stride, attribute.start);
            }

            gl.enableVertexAttribArray(attribute.location);
            gl.vertexAttribDivisor(attribute.location, attribute.divisor);
          }

          // Indexed batches (mesh opt-in, and Text's static glyph-quad pattern)
          // carry an index buffer; capturing its ELEMENT_ARRAY_BUFFER binding
          // into this VAO is what lets replay use drawElements(Instanced).
          // Sprite/nine-slice/repeating VAOs have no index buffer, so this is a
          // no-op for them (drawArrays path). Each renderer's `addIndex` call
          // stamps the matching element type (`vao.indexType`, read below) -
          // mesh's Uint16 geometry and Text's Uint32 glyph pattern share this
          // one runtime but never assume each other's width.
          vao.indexBuffer?.bind();

          appliedVersion = vao.version;
        }
      },
      unbind: (): void => {
        gl.bindVertexArray(null);
      },
      draw: (vao, size, start, type): void => {
        if (vao.indexBuffer !== null) {
          gl.drawElements(type, size, vao.indexType, start);
        } else {
          gl.drawArrays(type, start, size);
        }
      },
      drawInstanced: (vao, count, start, instanceCount, type): void => {
        if (vao.indexBuffer !== null) {
          gl.drawElementsInstanced(type, count, vao.indexType, start, instanceCount);
        } else {
          gl.drawArraysInstanced(type, start, count, instanceCount);
        }
      },
      destroy: (vao): void => {
        gl.deleteVertexArray(handle);
        vao.disconnect();
      },
    };
  }
}
