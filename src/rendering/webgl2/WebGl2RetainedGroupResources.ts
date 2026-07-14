import type { GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import type { RetainedGroupBundle } from '#rendering/plan/RetainedInstructionSet';
import { DataTexture } from '#rendering/texture/DataTexture';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import { TRANSFORM_FLOATS_PER_ROW } from '#rendering/TransformBuffer';
import { type BlendModes, BufferTypes, BufferUsage, RenderingPrimitives } from '#rendering/types';

import { WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';

const transformFloatsPerRow = TRANSFORM_FLOATS_PER_ROW;
const initialInstanceWordCapacity = 256;
const initialTransformRowCapacity = 16;

/**
 * Mutable node-index range scratch used at capture end (S3-D4): the backend
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
 * list (S3-D3 collect-time validation — the WebGPU view-identity guard's
 * WebGL2 counterpart). The recorded per-instance UV words are normalized
 * against the texture size with the flipY swap baked in
 * (`WebGl2SpriteRenderer._packInstance`), and a resize bumps only the texture
 * VERSION — never a node revision — so the fragment stays clean and only
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
 * retained batch draws (Track B Slice 3 mesh opt-in). The vertex + index
 * buffers live in the recording renderer's own long-lived cache (the mesh
 * renderer's `_staticGeometryCache`, uploaded once per `Geometry`, shared
 * across frames/groups); the group bundle stores only the thin per-instance
 * node-index stream, never the geometry bytes. Absent (`geometry` omitted /
 * `null`) for the self-contained instance-stream renderers (sprite / nine-
 * slice / repeating), whose batch VAO carries no index buffer and draws with
 * `drawArraysInstanced` — the existing path, unchanged.
 * @internal
 */
export interface WebGl2RetainedGeometryRef {
  readonly vertexBuffer: WebGl2RenderBuffer;
  readonly indexBuffer: WebGl2RenderBuffer;
  readonly indexCount: number;
}

/**
 * Backend-side replay descriptor for one recorded sprite flush (S3-D1). This
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
   * Per-batch VAO with attribute pointers pre-based at {@link byteOffset}
   * (WebGL2 has no baseInstance). Assigned at capture end; `null` only for a
   * capture that failed to finalize — replay then skips the draw, and the
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
  /** Replay the batch: live state (blend, uniforms, textures), cached data (bytes, transforms). */
  _replayRetainedBatch(payload: WebGl2RetainedBatchPayload): void;
}

/**
 * Group-owned WebGL2 GPU resources for one retained instruction set (Track B
 * Slice 3, S3-D3/S3-D4): the persistent instance buffer holding the recorded
 * batch bytes, the group's own rgba32f transform DataTexture (3 texels per
 * row, same layout as the shared frame-scoped `TransformBuffer` texture so
 * the sprite shader is reused unchanged), and one small VAO per recorded
 * batch (attribute pointers pre-based at the batch's byte offset).
 *
 * Resources are grow-only per group and reused across recaptures (no realloc
 * churn under motion-stop/start). The {@link generation} counter bumps on
 * every capture rewrite, on device restore, and on growth (subsumed by the
 * rewrite bump) — a plan-level instruction whose recorded generation no
 * longer matches is rejected at collect time and degrades to entry replay
 * (S3-D3 belt-and-braces).
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
  private _transformTexture: DataTexture<'rgba32f'> | null = null;

  // Device-side resources, created lazily at the first capture finalize.
  private _gl: WebGL2RenderingContext | null = null;
  private _accountant: GpuResourceAccountant | null = null;
  private _instanceBuffer: WebGl2RenderBuffer | null = null;
  private readonly _vaos: WebGl2VertexArrayObject[] = [];

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
  public get transformTexture(): DataTexture<'rgba32f'> | null {
    return this._transformTexture;
  }

  /** Transform rows stored by the current/last capture. */
  public get transformRowCount(): number {
    return this._transformRowCount;
  }

  /**
   * The shared-buffer row the stored rows were rebased from (`range.min` at
   * capture end, S3-D4). A group-local row is `sharedNodeIndex - base`, so the
   * Slice-4b fast patch maps a moved node's captured node index back to the
   * group-owned store without re-recording.
   */
  public get transformRowBase(): number {
    return this._transformRowBase;
  }

  /**
   * Start rewriting the bundle for a fresh capture. Bumps the generation —
   * the contents recorded by any previous capture are about to be replaced,
   * so instructions referencing them (including an OUTER group's set holding
   * this bundle's batches verbatim, S3-D6) must stop validating.
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
   * Copy `rowCount` transform rows starting at `firstRow` from the shared
   * frame-scoped transform buffer into the group-owned store (rows rebased to
   * 0) and mark them for upload. Growth recreates the DataTexture (its buffer
   * reference is fixed); the generation was already bumped by
   * {@link _beginCapture}, so growth needs no extra invalidation.
   */
  public _storeTransformRows(source: Float32Array, firstRow: number, rowCount: number): void {
    if (rowCount <= 0) {
      return;
    }

    if (this._transformTexture === null || this._transformRowCapacity < rowCount) {
      let next = Math.max(initialTransformRowCapacity, this._transformRowCapacity);

      while (next < rowCount) {
        next *= 2;
      }

      this._transformTexture?.destroy();
      this._transformFloats = new Float32Array(next * transformFloatsPerRow);
      this._transformTexture = new DataTexture({
        width: 3,
        height: next,
        format: 'rgba32f',
        data: this._transformFloats,
      });
      this._transformRowCapacity = next;
    }

    // Non-null: the branch above allocated it when missing (the texture null
    // check narrows the texture itself, but not the floats field).
    this._transformFloats!.set(source.subarray(firstRow * transformFloatsPerRow, (firstRow + rowCount) * transformFloatsPerRow), 0);
    this._transformTexture.commitRect(0, 0, 3, rowCount);
    this._transformRowCount = rowCount;
    this._transformRowBase = firstRow;
  }

  /**
   * Slice 4b fast patch: overwrite one group-local transform row in place with
   * `floats` (12 = 3 rgba32f texels, the {@link TransformBuffer} row layout)
   * and mark ONLY that row's sub-range for upload. Deliberately does NOT bump
   * the generation — the recorded instance bytes reference this row by index
   * and stay valid; only the transform behind the index moved. Out-of-range
   * rows are ignored (a stale queue entry after a recapture shrank the store).
   */
  public _patchTransformRow(localRow: number, floats: Float32Array): void {
    if (this._transformTexture === null || this._transformFloats === null || localRow < 0 || localRow >= this._transformRowCount) {
      return;
    }

    this._transformFloats.set(floats.subarray(0, transformFloatsPerRow), localRow * transformFloatsPerRow);
    this._transformTexture.commitRect(0, localRow, 3, 1);
  }

  /** Attach the GL context + accountant the device resources are created against. */
  public _connectDevice(gl: WebGL2RenderingContext, accountant: GpuResourceAccountant): void {
    this._gl = gl;
    this._accountant = accountant;
  }

  /** Upload the used instance range into the group's persistent GPU buffer. */
  public _uploadInstances(): void {
    if (this._gl === null) {
      throw new Error('WebGl2RetainedGroupResources: device not connected before instance upload.');
    }

    const view = this._instanceFloats.subarray(0, this._usedWords);

    if (this._instanceBuffer === null) {
      this._instanceBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, view, BufferUsage.DynamicDraw).connect(
        this._createBufferRuntime(this._gl),
        this._accountant ?? undefined,
      );
    } else {
      this._instanceBuffer.upload(view);
    }
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
   * context restore (the old handles died with the lost context) — every
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
    this._transformRowCapacity = 0;
    this._transformRowCount = 0;
    this._usedWords = 0;
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
   * Per-bundle buffer runtime — same shape as the sprite renderer's, with the
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
        const data = buffer.data;

        gl.bindBuffer(buffer.type, handle);

        if (allocatedBytes >= data.byteLength && allocatedBytes > 0) {
          gl.bufferSubData(buffer.type, offset, data as ArrayBufferView);
        } else {
          gl.bufferData(buffer.type, data as ArrayBufferView, buffer.usage);
          allocatedBytes = data.byteLength;
        }
      },
      destroy: (buffer): void => {
        gl.deleteBuffer(handle);
        buffer.disconnect();
      },
    };
  }

  /**
   * Per-VAO runtime — one GL vertex-array handle per recorded batch, pointer
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

          // Indexed batches (mesh opt-in) carry an index buffer; capturing its
          // ELEMENT_ARRAY_BUFFER binding into this VAO is what lets replay use
          // drawElementsInstanced. Sprite/nine-slice/repeating VAOs have no
          // index buffer, so this is a no-op for them (drawArrays path).
          vao.indexBuffer?.bind();

          appliedVersion = vao.version;
        }
      },
      unbind: (): void => {
        gl.bindVertexArray(null);
      },
      draw: (vao, size, start, type): void => {
        if (vao.indexBuffer !== null) {
          gl.drawElements(type, size, gl.UNSIGNED_SHORT, start);
        } else {
          gl.drawArrays(type, start, size);
        }
      },
      drawInstanced: (vao, count, start, instanceCount, type): void => {
        if (vao.indexBuffer !== null) {
          gl.drawElementsInstanced(type, count, gl.UNSIGNED_SHORT, start, instanceCount);
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
