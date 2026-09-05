/// <reference types="@webgpu/types" />

import { Matrix } from '#math/Matrix';
import { affineMat3Std140FloatCount, packAffineMat3Std140, packedGroupChanged } from '#rendering/affinePacking';
import type { RetainedGroupBundle } from '#rendering/plan/RetainedInstructionSet';
import type { OwnTransformRowPatcher } from '#rendering/plan/retainedTransformRowPatch';
import type { RenderNode } from '#rendering/RenderNode';
import { fillShaderSource } from '#rendering/shader/fillShaderSource';
import {
  packTextNodeAtlasSlot,
  textAtlasSlotShift,
  textAtlasTextureSlots,
  textAtlasTextureSlotWgsl,
  textNodeIndexMask,
} from '#rendering/text/atlasTextureSlots';
import { type BitmapText } from '#rendering/text/BitmapText';
import { packTextNodeData, packTextNodeTransform, textNodeDataFloats } from '#rendering/text/nodeDataPacker';
import type { TextPageQuads } from '#rendering/text/Text';
import { Text } from '#rendering/text/Text';
import type { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';
import type { View } from '#rendering/View';

import { AbstractWebGpuRenderer } from './AbstractWebGpuRenderer';
import { getWebGpuBlendState } from './blendState';
import { DirtyRowTracker } from './DirtyRowTracker';
import {
  type WebGpuRetainedBatchPayload,
  type WebGpuRetainedBatchReplayer,
  type WebGpuRetainedNodeIndexRange,
  type WebGpuRetainedRendererReplayState,
} from './retainedGroupResources';
import textShaderTemplate from './shaders/text.wgsl';
import { packSnapViewport } from './snapViewport';
import { stencilContentDepthStencilState } from './stencilState';
import type { WebGpuBackend } from './WebGpuBackend';
import type { WebGpuActiveRenderPass } from './WebGpuPassCoordinator';
import { type WebGpuRetainedCaptureFrame } from './WebGpuRetainedCaptureFrame';
import { WebGpuRetainedGroupBundle } from './WebGpuRetainedGroupBundle';

// ── Node data layout (identical to WebGl2TextRenderer) ───────────────────────
//
// Storage buffer: array<vec4<f32>> - 10 entries per node.
//
// [ni*10+0]: (a,  c,  0,  tx)   transform col 0+2
// [ni*10+1]: (b,  d,  0,  ty)   transform col 1+2
// [ni*10+2]: (r,  g,  b,  a )   fillColor
// [ni*10+3]: (r,  g,  b,  a )   outlineColor
// [ni*10+4]: (outlineMin, shadowAlpha, shadowBlur, gradientEnabled)
// [ni*10+5]: (r,  g,  b,  a )   shadowColor
// [ni*10+6]: (shadowOffX_px, shadowOffY_px, gradientVertical, sdfRadius_logical)
// [ni*10+7]: (r,  g,  b,  a )   gradientTop
// [ni*10+8]: (r,  g,  b,  a )   gradientBottom
// [ni*10+9]: (minX, minY, w, h) text block bounds

const nodeFloats = textNodeDataFloats;

/**
 * Node rows one patch block covers. Smaller than the sprite store's block
 * because a text row is 160 bytes against a sprite transform row's 32, so this
 * lands on the same couple of kilobytes per block.
 */
const rowsPerPatchBlock = 16;

// Per-vertex layout (20 bytes): pos f32x2 + uv f32x2 + packed node/atlas u32
const vertexStrideBytes = 20;
const vertexStrideWords = vertexStrideBytes / 4;
// Word offset of the per-vertex node index within one vertex.
const nodeIndexWord = 4;

/**
 * Byte size of `indexCount` uint32 indices. `GPUQueue.writeBuffer` rejects byte
 * counts and offsets that are not a multiple of 4 - with 4-byte indices every
 * index count already lands on a 4-byte boundary, so no rounding is needed
 * (unlike the uint16 index type this renderer used before: 16-bit indices
 * needed an explicit round-up to satisfy that same constraint).
 */
const alignIndexBytes = (indexCount: number): number => indexCount * Uint32Array.BYTES_PER_ELEMENT;

const initialVertexCapacity = 256;
const initialIndexCapacity = 384;
const initialNodeCapacity = 32;
// One short line of text is already ~64 quads, so that floor made almost
// every real retained draw pay several doubling steps (createBuffer + a CPU
// index fill + writeBuffer each, plus - since the pass-open growth guard -
// an extra submit). 1024 quads is 24 KiB (uint32 indices) and covers normal
// text scenes in one allocation.
const initialRetainedQuadCapacity = 1024;

// FrameUniforms: 7 × vec4<f32> = 112 bytes (projection + group mat3x3,
// column-major, + device-pixel snap viewport rect)
const projectionBytes = 112;

type ShaderType = 'sdf' | 'msdf' | 'color';

interface PendingQuad {
  readonly quads: TextPageQuads;
  readonly nodeIndex: number;
  readonly shaderType: ShaderType;
  readonly atlasTexture: Texture;
  readonly blendMode: BlendModes;
}

interface BatchDraw {
  readonly shaderType: ShaderType;
  readonly blendMode: BlendModes;
  readonly atlasTextures: readonly Texture[];
  readonly firstVertex: number;
  readonly vertexCount: number;
  readonly firstIndex: number;
  readonly indexCount: number;
}

interface TextTextureSetBindGroupEntry {
  readonly textures: readonly Texture[];
  views: GPUTextureView[];
  samplers: GPUSampler[];
  group: GPUBindGroup;
}

const maxTextureSetsPerAnchor = 8;

const sharesAtlasBatchClass = (a: PendingQuad, b: PendingQuad): boolean =>
  a.shaderType === b.shaderType &&
  a.blendMode === b.blendMode &&
  a.atlasTexture.width === b.atlasTexture.width &&
  a.atlasTexture.height === b.atlasTexture.height;

/**
 * Opaque, renderer-private snapshot carried on {@link WebGpuRetainedBatchPayload.rendererData}
 * for one recorded Text/BitmapText batch.
 * Text opts out of the shared `TransformBuffer` (`_consumesSharedTransform ===
 * false`), so the generic bundle machinery has nothing to persist for it - this
 * is the renderer's own carrier from record time (`flush()`) through to replay
 * (`replayRetainedBatch`), where `TextRetainedReplayState` uploads it into a
 * persistent, group-owned GPU buffer on first use.
 */
interface TextRetainedRendererData {
  /** Copy of this flush's packed per-node style+transform data (10 vec4s/node, dense, 0-based). */
  readonly nodeData: Float32Array;
  readonly nodeCount: number;
  /** Node `i`'s drawable, parallel to `nodeData`'s dense row `i` - backs the own-transform-move patch lookup. */
  readonly drawables: ReadonlyArray<Text | BitmapText>;
  readonly shaderType: ShaderType;
  readonly quadCount: number;
}

/**
 * Per-bundle Text replay state (retained-batch opt-in), parked on
 * {@link WebGpuRetainedGroupBundle.rendererReplayState} so it shares the
 * bundle's grow-only / explicitly-freed lifecycle - mirrors Mesh's
 * `MeshRetainedReplayState`. Holds Text's OWN persistent per-node data buffer
 * (same 10-vec4/node layout the live path uses) and FrameUniforms buffer,
 * since Text's row format differs from both the shared `TransformBuffer` row
 * layout AND the shared 128-byte group UBO {@link WebGpuRetainedGroupBundle}
 * itself owns (Text's `FrameUniforms` is a 96-byte mat3x3 pair, not the
 * mat4x4 pair every other retained renderer's shared UBO uses).
 *
 * A bundle can hold at most ONE recorded Text batch per capture (`flush()`
 * poisons rather than recording a second one) - so this state is a single
 * slot, not a per-batch array: `lastPayload` identifies which recording's
 * node data currently lives in `nodeDataBuffer`, re-uploaded only when a
 * fresh recording replaces it.
 * @internal
 */
class TextRetainedReplayState implements WebGpuRetainedRendererReplayState {
  public uniformBuffer: GPUBuffer | null = null;
  public nodeDataBuffer: GPUBuffer | null = null;
  public nodeDataCapacity = 0;
  public bindGroup: GPUBindGroup | null = null;
  public readonly uboData = new Float32Array(projectionBytes / Float32Array.BYTES_PER_ELEMENT);
  public uboWritten = false;
  public lastPayload: WebGpuRetainedBatchPayload | null = null;
  public readonly nodeIndexByDrawable = new Map<Text | BitmapText, number>();
  public drawsInPass: WebGpuActiveRenderPass | null = null;

  /**
   * The recording's own packed rows, doubling as the CPU mirror an in-place
   * transform patch writes into, and the device its upload goes through.
   *
   * Patching the recording's array rather than a second copy is what keeps the
   * two consistent: a later full re-upload of `nodeData` then carries the moves
   * that have happened since it was recorded, instead of resurrecting the
   * positions the nodes had at record time.
   */
  private _nodeData: Float32Array | null = null;
  private _device: GPUDevice | null = null;
  private readonly _dirtyRows = new DirtyRowTracker(rowsPerPatchBlock, nodeFloats * Float32Array.BYTES_PER_ELEMENT);

  /** Adopt the rows a fresh recording uploaded, as the mirror later patches write into. */
  public adoptNodeData(device: GPUDevice, nodeData: Float32Array, nodeCount: number): void {
    this._device = device;
    this._nodeData = nodeData;
    this._dirtyRows.reset(nodeCount);
  }

  /**
   * Overwrite one node's transform texels in the mirror and mark its block.
   * `false` when no recording's rows are held, which leaves the caller on the
   * re-record path.
   */
  public patchNodeTransform(localIndex: number, row: Float32Array): boolean {
    if (this._nodeData === null) {
      return false;
    }

    this._nodeData.set(row, localIndex * nodeFloats);
    this._dirtyRows.mark(localIndex);

    return true;
  }

  public flushRowPatches(): void {
    if (this._device !== null && this.nodeDataBuffer !== null && this._nodeData !== null) {
      this._dirtyRows.flush(this._device, this.nodeDataBuffer, this._nodeData);
    }
  }

  public destroy(): void {
    this.uniformBuffer?.destroy();
    this.nodeDataBuffer?.destroy();
    this.uniformBuffer = null;
    this.nodeDataBuffer = null;
    this.nodeDataCapacity = 0;
    this.bindGroup = null;
    this.uboWritten = false;
    this.lastPayload = null;
    this.nodeIndexByDrawable.clear();
    this.drawsInPass = null;
    this._nodeData = null;
    this._device = null;
    this._dirtyRows.reset(0);
  }
}

// ── WGSL: shared vertex + three fragment entry points ────────────────────────
/** WGSL source for the text pipeline (shared vertex + color/SDF/MSDF fragment entry points). @internal */
export const textShaderSource = fillShaderSource(textShaderTemplate, {
  atlasTextureSlots: textAtlasTextureSlotWgsl,
  nodeIndexMask: textNodeIndexMask,
  atlasSlotShift: textAtlasSlotShift,
});

/**
 * WebGPU renderer for {@link Text} and {@link BitmapText} nodes.
 *
 * Mirrors {@link WebGl2TextRenderer}: per-node style data is packed once per
 * flush into a `var<storage, read>` buffer, three specialised WGSL fragment
 * variants handle SDF / MSDF / colour-atlas glyphs, and quads are sorted and
 * batched by compatible shader/page classes with up to eight atlas textures
 * per draw.
 */
export class WebGpuTextRenderer extends AbstractWebGpuRenderer<Text | BitmapText> implements WebGpuRetainedBatchReplayer, OwnTransformRowPatcher {
  /**
   * Text packs its world transform into its own per-node data buffer and never
   * reads the shared transform storage, so the plan player skips writing
   * transform records for text draws.
   * @internal
   */
  public readonly _consumesSharedTransform = false;

  /**
   * Retained-batch opt-in: one compatible shader/page class containing at most
   * eight atlas textures is recordable. A flush that needs several batches, or
   * a second Text flush within the same capture window, poisons the capture
   * instead (see `_tryRecordRetainedBatch`) - always safe, just a missed
   * optimization.
   * @internal
   */
  public readonly _supportsRetainedBatches = true;

  // Retained-batch record-time scratch: which capture windows this renderer
  // has already recorded a batch into (nesting-safe - a fresh
  // WebGpuRetainedCaptureFrame instance per capture-open call means a stale
  // entry can never alias a later, unrelated capture).
  private readonly _recordedCaptureFrames = new WeakSet<WebGpuRetainedCaptureFrame>();

  // Retained-batch replay-time scratch, reused across replay calls (mirrors
  // `_projData` below, just sized/shaped for the frame-uniform-only write).
  private readonly _retainedFrameScratch = new Float32Array(projectionBytes / Float32Array.BYTES_PER_ELEMENT);
  // Own-transform-move patch scratch: 2 vec4s (transform cols 0-1).
  private readonly _patchRowScratch = new Float32Array(8);
  private _retainedQuadIndexBuffer: GPUBuffer | null = null;
  private _retainedQuadIndexCapacity = 0;

  private _device: GPUDevice | null = null;
  private _shaderModule: GPUShaderModule | null = null;
  private _frameBindGroupLayout: GPUBindGroupLayout | null = null;
  private _textureBindGroupLayout: GPUBindGroupLayout | null = null;
  private _pipelineLayout: GPUPipelineLayout | null = null;

  private readonly _pipelines = new Map<string, GPURenderPipeline>();
  // Ordered texture sets are cached under their slot-0 texture. Weak anchoring
  // avoids retaining dead atlases; a small per-anchor bound covers stable UI
  // combinations without letting pathological rotations grow indefinitely.
  private _textureSetBindGroups = new WeakMap<Texture, TextTextureSetBindGroupEntry[]>();

  private _projBuffer: GPUBuffer | null = null;
  private _nodeBuffer: GPUBuffer | null = null;
  private _vertexBuffer: GPUBuffer | null = null;
  private _indexBuffer: GPUBuffer | null = null;
  private _nodeBufferCapacity = 0;
  private _vertexBufferCapacity = 0;
  private _indexBufferCapacity = 0;

  private _frameBindGroup: GPUBindGroup | null = null;
  private _frameBindGroupDirty = true;

  // The pass this renderer's live-path draws were last recorded into, plus the
  // write cursors scoped to it. The pass survives a renderer switch, so several
  // `flush()` calls now record into ONE pass and ONE submit: a flush that
  // rewrote the shared vertex / index / node buffers from offset 0 would have
  // the earlier flush's draws read the later flush's bytes, because
  // `queue.writeBuffer` is ordered against the submit and not against the
  // individual draws inside it. Each flush therefore APPENDS at these cursors
  // and adds the base at bind time. The coordinator builds a fresh active-pass
  // object per acquire, so reference identity also covers a pass ended by
  // someone else entirely (target switch, stencil clip, another renderer).
  private _ownDrawsPass: WebGpuActiveRenderPass | null = null;
  private _vertexPassBytes = 0;
  private _indexPassBytes = 0;
  private _nodePassCount = 0;

  // FrameUniforms (projection + group) skip state: a matching (view identity,
  // view.updateId) pair AND unchanged group-matrix CONTENT (compared against
  // the packed floats at [12, 24), staged into `_stagedGroupData` by
  // `_groupContentChanged`) mean the proj UBO already holds this flush's
  // transform, so the 96-byte write is skipped. Per-node style data (the
  // storage buffer) is uploaded unconditionally - it genuinely changes per
  // frame; only the shared projection is elided here.
  //
  // Content comparison, not the backend's group-transform id: a projection
  // rewrite is a PASS boundary below, so a group boundary that restores
  // byte-identical group bytes must not read as a change - otherwise a retained
  // group entered and left around text splits the single-submit frame.
  private _writtenView: View | null = null;
  private _writtenViewUpdateId = -1;
  private _hasWrittenProjection = false;
  private readonly _stagedGroupData = new Float32Array(affineMat3Std140FloatCount);

  // CPU-side working arrays
  private _vertexCapacity = initialVertexCapacity;
  private _indexCapacity = initialIndexCapacity;
  private _vertexData: ArrayBuffer = new ArrayBuffer(initialVertexCapacity * vertexStrideBytes);
  private _float32View: Float32Array = new Float32Array(this._vertexData);
  private _uint32View: Uint32Array = new Uint32Array(this._vertexData);
  private _indexData: Uint32Array = new Uint32Array(initialIndexCapacity);
  private _projData: Float32Array = new Float32Array(projectionBytes / 4);

  private _nodeDataArray: Float32Array = new Float32Array(initialNodeCapacity * nodeFloats);
  private _nodeCapacity = initialNodeCapacity;
  private _nodeCount = 0;

  private readonly _pendingQuads: PendingQuad[] = [];
  private readonly _nodeIndexMap = new Map<Text | BitmapText, number>();
  private readonly _textureKeyMap = new Map<Texture, number>();
  private _textureKeyCounter = 0;

  // ── Public API ──────────────────────────────────────────────────────────────

  public render(node: Text | BitmapText): void {
    if (!this._device) throw new Error('WebGpuTextRenderer is not connected to a backend.');

    if (node instanceof Text) {
      this._collectText(node);
    } else {
      this._collectBitmapText(node);
    }
  }

  public flush(): void {
    if (this._pendingQuads.length === 0) {
      this._resetFrameState();
      return;
    }

    const backend = this.getBackend();
    const device = this._device!;

    // Assign stable sort keys to atlas textures seen this flush
    for (const pq of this._pendingQuads) {
      if (!this._textureKeyMap.has(pq.atlasTexture)) {
        this._textureKeyMap.set(pq.atlasTexture, this._textureKeyCounter++);
      }
    }

    // Sort by blend mode, then compatible atlas class, then texture identity.
    // Up to eight textures of one class share a draw through the shader slot
    // table; a differing blend mode breaks the batch because it selects a
    // different pipeline variant.
    this._pendingQuads.sort((a, b) => {
      const bc = a.blendMode - b.blendMode;
      if (bc !== 0) return bc;
      const sc = a.shaderType.localeCompare(b.shaderType);
      if (sc !== 0) return sc;
      const wc = a.atlasTexture.width - b.atlasTexture.width;
      if (wc !== 0) return wc;
      const hc = a.atlasTexture.height - b.atlasTexture.height;
      if (hc !== 0) return hc;
      return (this._textureKeyMap.get(a.atlasTexture) ?? 0) - (this._textureKeyMap.get(b.atlasTexture) ?? 0);
    });

    // Stage FrameUniforms: projection + group as vec4-padded mat3x3 columns
    // plus the device-pixel snap viewport rect, packed via the shared canonical
    // (non-transposed) column order. The write is skipped when the UBO already
    // holds this exact (view, updateId, group bytes, snap-rect) state - static
    // text then issues zero projection uploads. Whether it changes is decided
    // here but applied below, because a rewrite of this single-slot UBO would
    // retroactively re-project draws of ours already recorded into the open
    // pass: appending cannot cover it, so it is a pass boundary.
    const view = backend.view;
    const viewportChanged = packSnapViewport(backend, this._projData, 24);
    const projectionChanged =
      !this._hasWrittenProjection ||
      this._writtenView !== view ||
      this._writtenViewUpdateId !== view.updateId ||
      viewportChanged ||
      this._groupContentChanged(backend);

    // Build interleaved vertex/index data for all batches in one pass
    const quads = this._pendingQuads;
    const batches: BatchDraw[] = [];

    let totalV = 0,
      totalI = 0;
    for (const pq of quads) {
      totalV += pq.quads.quadCount * 4;
      totalI += pq.quads.indices.length;
    }
    this._ensureVertexCapacity(totalV);
    this._ensureIndexCapacity(totalI);

    let packedV = 0,
      packedI = 0,
      qi = 0;

    while (qi < quads.length) {
      // qi/qj/k are all bounded by `quads.length` via the loop guards above.
      const first = quads[qi]!;
      const atlasSlots = new Map<Texture, number>();
      const atlasTextures: Texture[] = [];
      let qj = qi;

      while (qj < quads.length) {
        const pq = quads[qj]!;
        if (!sharesAtlasBatchClass(first, pq)) break;

        if (!atlasSlots.has(pq.atlasTexture)) {
          if (atlasTextures.length === textAtlasTextureSlots) break;
          atlasSlots.set(pq.atlasTexture, atlasTextures.length);
          atlasTextures.push(pq.atlasTexture);
        }

        qj++;
      }

      const batchFirstVertex = packedV;
      const batchFirstIndex = packedI;
      let batchIndexCount = 0;

      for (let k = qi; k < qj; k++) {
        const { quads: batch, nodeIndex, atlasTexture } = quads[k]!;
        const atlasSlot = atlasSlots.get(atlasTexture)!;
        const qVerts = batch.quadCount * 4;
        const { vertices, uvs, indices } = batch;

        // vertices/uvs hold quadCount*4 vec2 entries; indices is fully iterated.
        for (let v = 0; v < qVerts; v++) {
          const w = (packedV + v) * vertexStrideWords;
          const vp = v * 2;
          this._float32View[w + 0] = vertices[vp]!;
          this._float32View[w + 1] = vertices[vp + 1]!;
          this._float32View[w + 2] = uvs[vp]!;
          this._float32View[w + 3] = uvs[vp + 1]!;
          this._uint32View[w + 4] = packTextNodeAtlasSlot(nodeIndex, atlasSlot);
        }

        for (let x = 0; x < indices.length; x++) {
          this._indexData[packedI + x] = indices[x]! + packedV;
        }

        packedV += qVerts;
        packedI += indices.length;
        batchIndexCount += indices.length;
      }

      batches.push({
        shaderType: first.shaderType,
        blendMode: first.blendMode,
        atlasTextures,
        firstVertex: batchFirstVertex,
        vertexCount: packedV - batchFirstVertex,
        firstIndex: batchFirstIndex,
        indexCount: batchIndexCount,
      });

      qi = qj;
    }

    // The recording carries this flush's OWN dense, 0-based node indices, so it
    // has to take its copy of the staged vertex bytes before they are rebased
    // onto the pass cursor below.
    if (backend._retainedCaptureActive) {
      this._tryRecordRetainedBatch(backend, batches);
    }

    const coordinator = backend._passCoordinator;
    const flushVertexBytes = packedV * vertexStrideBytes;
    const flushIndexBytes = alignIndexBytes(packedI);

    // The writes below land in the shared vertex / index / node buffers and may
    // reallocate them. Draws of OURS left in the open pass - from an earlier
    // flush - still read those exact buffers, and `queue.writeBuffer` lands
    // ahead of the whole submit, so this flush APPENDS at the pass cursors
    // rather than rewriting from offset 0. Ending the pass is the fallback for
    // the two cases appending cannot cover: a reallocation (which frees the
    // buffer those draws read) and a projection rewrite (a single-slot UBO
    // every draw of ours reads). Another renderer's draws in the pass are not
    // at risk: none of these buffers is shared, and the pass survives a
    // renderer switch precisely so they can stay.
    const ownDrawsInPass = this._ownDrawsPass !== null && this._ownDrawsPass === coordinator.activePass;
    // Sized for everything this pass has taken SO FAR plus this flush, captured
    // BEFORE the guard below may reset the cursors - and used to size the
    // buffers even when it does split. Sizing to the lone flush that remains
    // after a split would peg every buffer at one flush forever: the guard
    // would split, the split would shrink the requirement back, the capacity
    // would never ratchet, and every flush would open its own pass.
    const targetVertexBytes = this._vertexPassBytes + flushVertexBytes;
    const targetIndexBytes = this._indexPassBytes + flushIndexBytes;
    const targetNodeCount = this._nodePassCount + this._nodeCount;

    if (ownDrawsInPass && (projectionChanged || this._flushAppendWouldGrow(targetVertexBytes, targetIndexBytes, targetNodeCount))) {
      coordinator.endPass();
      this._resetPassCursors();
    } else if (!ownDrawsInPass) {
      // No draws of ours are held by the open pass (it was ended by a boundary,
      // or never opened), so every cursor restarts.
      this._resetPassCursors();
    }

    const vertexBase = this._vertexPassBytes;
    const indexBase = this._indexPassBytes;
    const nodeBase = this._nodePassCount;

    if (projectionChanged) {
      packAffineMat3Std140(view.getTransform(), this._projData, 0);
      packAffineMat3Std140(backend.renderGroupTransform ?? Matrix.identity, this._projData, 12);

      this._writtenView = view;
      this._writtenViewUpdateId = view.updateId;
      this._hasWrittenProjection = true;

      device.queue.writeBuffer(this._projBuffer!, 0, this._projData.buffer, 0, projectionBytes);
    }

    // Upload per-node style data at this flush's sub-range of the pass, and
    // shift the staged per-vertex node indices to match: the storage binding
    // covers the whole buffer (no dynamic offset), so the rebase has to travel
    // in the vertex attribute the shader indexes with.
    this._uploadNodeBuffer(device, nodeBase, targetNodeCount);

    if (nodeBase > 0) {
      for (let v = 0; v < packedV; v++) {
        const w = v * vertexStrideWords + nodeIndexWord;
        const packedNodeSlot = this._uint32View[w]!;
        const nodeIndex = (packedNodeSlot & textNodeIndexMask) + nodeBase;

        if (nodeIndex > textNodeIndexMask) {
          throw new Error(`WebGpuTextRenderer: packed node index ${nodeIndex} exceeds the 24-bit vertex limit.`);
        }

        this._uint32View[w] = (packedNodeSlot & ~textNodeIndexMask) | nodeIndex;
      }
    }

    // Upload vertex/index buffers (reallocate GPU side when needed), sized to
    // the pass totals and written at this flush's base offsets.
    this._ensureGpuVertexBuffer(device, targetVertexBytes);
    this._ensureGpuIndexBuffer(device, targetIndexBytes);
    device.queue.writeBuffer(this._vertexBuffer!, vertexBase, this._vertexData, 0, flushVertexBytes);
    device.queue.writeBuffer(this._indexBuffer!, indexBase, this._indexData.buffer, 0, flushIndexBytes);

    const format = backend.renderTargetFormat;
    const stencil = coordinator.stencilActive;
    const frameBindGroup = this._getFrameBindGroup(device);

    // The pass survives a renderer switch, so it can still hold another
    // renderer's draws - or an earlier flush of ours this one appended after.
    // Resolving an atlas bind group below syncs a dirty glyph page on the queue
    // timeline, ahead of the deferred submit, which would retroactively change
    // a recorded draw sampling that same atlas.
    //
    // Ending the pass here does NOT rewind the cursors: this flush's bytes are
    // already written at the base offsets, and its draws (recorded below into
    // the freshly opened pass) still read them there. Rewinding would let a
    // later append overwrite bytes those draws read.
    if (coordinator.passHasDraws) {
      outer: for (const batch of batches) {
        for (const texture of batch.atlasTextures) {
          if (backend.textureUploadWouldMutate(texture)) {
            coordinator.endPass();
            break outer;
          }
        }
      }
    }

    // The coordinator owns the GPU pass (load/clear resolution, pass count and
    // scissor are applied there). It stays OPEN afterwards so a following flush,
    // or another renderer, merges into the same submit.
    const active = coordinator.acquirePass();
    const pass = active.pass;

    pass.setVertexBuffer(0, this._vertexBuffer, vertexBase);
    pass.setIndexBuffer(this._indexBuffer!, 'uint32', indexBase);

    let lastShaderType: ShaderType | null = null;
    let lastBlendMode: BlendModes | null = null;
    for (const batch of batches) {
      if (batch.shaderType !== lastShaderType || batch.blendMode !== lastBlendMode) {
        pass.setPipeline(this._getPipeline(batch.shaderType, batch.blendMode, format, stencil));
        pass.setBindGroup(0, frameBindGroup);
        lastShaderType = batch.shaderType;
        lastBlendMode = batch.blendMode;
      }
      pass.setBindGroup(1, this._getTexBindGroup(device, backend, batch.atlasTextures));
      pass.drawIndexed(batch.indexCount, 1, batch.firstIndex, 0, 0);
      coordinator.markPassDraws();
      backend.stats.batches++;
      backend.stats.drawCalls++;
    }

    // Carry this flush's consumption forward so a following flush in the same
    // pass appends AFTER these draws' slices instead of overwriting the bytes
    // they read.
    this._ownDrawsPass = active;
    this._vertexPassBytes = vertexBase + flushVertexBytes;
    this._indexPassBytes = indexBase + flushIndexBytes;
    this._nodePassCount = nodeBase + this._nodeCount;

    this._resetFrameState();
  }

  /**
   * Whether the packed floats of the active group matrix differ from what the
   * FrameUniforms buffer currently holds at [12, 24). Stages the packed matrix
   * into `_stagedGroupData` as a side effect (idempotent - safe to call more
   * than once per flush).
   */
  private _groupContentChanged(backend: WebGpuBackend): boolean {
    packAffineMat3Std140(backend.renderGroupTransform ?? Matrix.identity, this._stagedGroupData, 0);

    if (!this._hasWrittenProjection) {
      return true;
    }

    return packedGroupChanged(this._stagedGroupData, this._projData, affineMat3Std140FloatCount);
  }

  public destroy(): void {
    this.disconnect();
  }

  /**
   * Pre-create render pipelines for every (shaderType × targetFormat) pair
   * asynchronously. Called from the backend init path so first-frame draws
   * do not block on synchronous pipeline compilation.
   */
  public async prewarmPipelines(formats: readonly GPUTextureFormat[]): Promise<void> {
    const device = this._device;
    if (!device || !this._shaderModule || !this._pipelineLayout) return;
    if (typeof device.createRenderPipelineAsync !== 'function') return;

    const shaderTypes: ShaderType[] = ['sdf', 'msdf', 'color'];
    const promises: Array<Promise<void>> = [];

    for (const shaderType of shaderTypes) {
      for (const format of formats) {
        // Prewarm only the no-clip variant (matches the _getPipeline cache key
        // for stencil = false); stencil variants compile lazily under a clip.
        // Likewise only the default blend mode: text away from `Normal` is rare
        // enough that three more compiles per format per mode would cost more
        // than the first draw it saves.
        const key = `${shaderType}:${BlendModes.Normal}:${format}:n`;
        if (this._pipelines.has(key)) continue;

        promises.push(
          device.createRenderPipelineAsync(this._buildPipelineDescriptor(shaderType, BlendModes.Normal, format)).then(pipeline => {
            this._pipelines.set(key, pipeline);
          }),
        );
      }
    }

    await Promise.all(promises);
  }

  // ── Connection lifecycle ─────────────────────────────────────────────────

  protected onConnect(backend: WebGpuBackend): void {
    const device = backend.device;
    this._device = device;

    this._shaderModule = device.createShaderModule({
      label: 'WebGpuTextRenderer',
      code: textShaderSource,
    });

    this._frameBindGroupLayout = device.createBindGroupLayout({
      label: 'WebGpuTextRenderer/frame',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'read-only-storage' },
        },
      ],
    });

    this._textureBindGroupLayout = device.createBindGroupLayout({
      label: 'WebGpuTextRenderer/texture',
      entries: [
        ...Array.from({ length: textAtlasTextureSlots }, (_, binding) => ({
          binding,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        })),
        ...Array.from({ length: textAtlasTextureSlots }, (_, slot) => ({
          binding: textAtlasTextureSlots + slot,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' as const },
        })),
      ],
    });

    this._pipelineLayout = device.createPipelineLayout({
      label: 'WebGpuTextRenderer',
      bindGroupLayouts: [this._frameBindGroupLayout, this._textureBindGroupLayout],
    });

    this._projBuffer = device.createBuffer({
      label: 'WebGpuTextRenderer/proj',
      size: projectionBytes,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const nodeBytes = initialNodeCapacity * nodeFloats * 4;
    this._nodeBuffer = device.createBuffer({
      label: 'WebGpuTextRenderer/nodes',
      size: nodeBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this._nodeBufferCapacity = nodeBytes;

    const vertexBytes = initialVertexCapacity * vertexStrideBytes;
    this._vertexBuffer = device.createBuffer({
      label: 'WebGpuTextRenderer/vertices',
      size: vertexBytes,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this._vertexBufferCapacity = vertexBytes;

    const indexBytes = initialIndexCapacity * Uint32Array.BYTES_PER_ELEMENT;
    this._indexBuffer = device.createBuffer({
      label: 'WebGpuTextRenderer/indices',
      size: indexBytes,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this._indexBufferCapacity = indexBytes;

    this._frameBindGroupDirty = true;
  }

  protected onDisconnect(): void {
    this._projBuffer?.destroy();
    this._nodeBuffer?.destroy();
    this._vertexBuffer?.destroy();
    this._indexBuffer?.destroy();
    this._retainedQuadIndexBuffer?.destroy();

    this._projBuffer = null;
    this._nodeBuffer = null;
    this._vertexBuffer = null;
    this._indexBuffer = null;
    this._retainedQuadIndexBuffer = null;
    this._retainedQuadIndexCapacity = 0;
    this._nodeBufferCapacity = 0;
    this._vertexBufferCapacity = 0;
    this._indexBufferCapacity = 0;

    this._frameBindGroup = null;
    this._frameBindGroupDirty = true;
    this._writtenView = null;
    this._writtenViewUpdateId = -1;
    this._hasWrittenProjection = false;
    this._resetPassCursors();

    this._pipelines.clear();
    this._textureSetBindGroups = new WeakMap<Texture, TextTextureSetBindGroupEntry[]>();

    this._pipelineLayout = null;
    this._textureBindGroupLayout = null;
    this._frameBindGroupLayout = null;
    this._shaderModule = null;
    this._device = null;

    this._resetFrameState();
  }

  // ── Collection ───────────────────────────────────────────────────────────

  private _collectText(node: Text): void {
    // Before the layout pass, not after: this is what a node with no explicit
    // `pixelRatio` inherits, and the pass it drives is the one that resolves
    // which atlas the node rasterizes into.
    node._setSurfacePixelRatio(this.getBackend().surfacePixelRatio);
    node.syncDirty();
    const { pageQuads, textPages: pages } = node;
    if (pageQuads.length === 0 || pages.length === 0) return;

    const nodeIndex = this._assignNodeIndex(node);
    const shaderType: ShaderType = node.colorGlyphs ? 'color' : 'sdf';
    const blendMode = node.blendMode;

    for (const batch of pageQuads) {
      const page = pages[batch.pageIndex];
      if (page === undefined) continue;
      this._pendingQuads.push({ quads: batch, nodeIndex, shaderType, atlasTexture: page.texture, blendMode });
    }
  }

  private _collectBitmapText(node: BitmapText): void {
    const { pageQuads, textures, msdf } = node;
    if (pageQuads.length === 0) return;

    const nodeIndex = this._assignNodeIndex(node);
    const shaderType: ShaderType = msdf ? 'msdf' : 'color';
    const blendMode = node.blendMode;

    for (const batch of pageQuads) {
      const tex = textures[batch.pageIndex];
      if (tex === undefined) continue;
      this._pendingQuads.push({ quads: batch, nodeIndex, shaderType, atlasTexture: tex, blendMode });
    }
  }

  private _assignNodeIndex(node: Text | BitmapText): number {
    const existing = this._nodeIndexMap.get(node);
    if (existing !== undefined) return existing;

    const idx = this._nodeCount++;

    if (idx > textNodeIndexMask) {
      throw new Error(`WebGpuTextRenderer: node index ${idx} exceeds the 24-bit packed vertex limit.`);
    }
    this._nodeIndexMap.set(node, idx);
    this._ensureNodeCapacity(idx + 1);
    this._packNodeData(idx, node);
    return idx;
  }

  // ── Node data packing ─────────────────────────────────────────────────────
  // The 10-texel/40-float layout is packed by the shared, backend-free
  // `packTextNodeData` (mirrors `WebGl2TextRenderer`, byte for byte) - see
  // `textNodeDataPacker.ts` for the texel-by-texel layout comment.

  private _packNodeData(ni: number, node: Text | BitmapText): void {
    packTextNodeData(this._nodeDataArray, ni * nodeFloats, node);
  }

  // ── GPU resource helpers ─────────────────────────────────────────────────

  /**
   * Upload this flush's per-node style data into the pass-wide node buffer at
   * node `base`, sizing the buffer for `passNodeCount` nodes. Staging holds only
   * this flush's nodes; the buffer must also keep the rows earlier draws in the
   * open pass still read.
   */
  private _uploadNodeBuffer(device: GPUDevice, base: number, passNodeCount: number): void {
    const requiredBytes = passNodeCount * nodeFloats * 4;

    if (requiredBytes > this._nodeBufferCapacity) {
      let newCap = this._nodeBufferCapacity;
      while (newCap < requiredBytes) newCap *= 2;
      this._nodeBuffer?.destroy();
      this._nodeBuffer = device.createBuffer({
        label: 'WebGpuTextRenderer/nodes',
        size: newCap,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this._nodeBufferCapacity = newCap;
      this._frameBindGroupDirty = true;
    }

    const flushBytes = this._nodeCount * nodeFloats * 4;

    if (flushBytes > 0) {
      device.queue.writeBuffer(this._nodeBuffer!, base * nodeFloats * 4, this._nodeDataArray.buffer, 0, flushBytes);
    }
  }

  private _ensureGpuVertexBuffer(device: GPUDevice, requiredBytes: number): void {
    if (requiredBytes <= this._vertexBufferCapacity) return;

    let newCap = this._vertexBufferCapacity;
    while (newCap < requiredBytes) newCap *= 2;
    this._vertexBuffer?.destroy();
    this._vertexBuffer = device.createBuffer({
      label: 'WebGpuTextRenderer/vertices',
      size: newCap,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this._vertexBufferCapacity = newCap;
  }

  private _ensureGpuIndexBuffer(device: GPUDevice, requiredBytes: number): void {
    if (requiredBytes <= this._indexBufferCapacity) return;

    let newCap = this._indexBufferCapacity;
    while (newCap < requiredBytes) newCap *= 2;
    this._indexBuffer?.destroy();
    this._indexBuffer = device.createBuffer({
      label: 'WebGpuTextRenderer/indices',
      size: newCap,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this._indexBufferCapacity = newCap;
  }

  /**
   * Whether sizing the shared buffers to the pass totals a flush would reach by
   * appending reallocates any of them. Reallocation destroys the buffer the draws
   * already recorded into the open pass read, so the caller must end that pass
   * (which zeroes the cursors) instead of appending. All arguments are pass
   * totals, not this flush's deltas.
   */
  private _flushAppendWouldGrow(vertexBytes: number, indexBytes: number, nodeCount: number): boolean {
    return vertexBytes > this._vertexBufferCapacity || indexBytes > this._indexBufferCapacity || nodeCount * nodeFloats * 4 > this._nodeBufferCapacity;
  }

  /** Drop the pass association so the next flush restarts every cursor. */
  private _resetPassCursors(): void {
    this._ownDrawsPass = null;
    this._vertexPassBytes = 0;
    this._indexPassBytes = 0;
    this._nodePassCount = 0;
  }

  private _getFrameBindGroup(device: GPUDevice): GPUBindGroup {
    if (!this._frameBindGroupDirty && this._frameBindGroup !== null) {
      return this._frameBindGroup;
    }
    this._frameBindGroup = device.createBindGroup({
      label: 'WebGpuTextRenderer/frame-bind-group',
      layout: this._frameBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: this._projBuffer! } },
        { binding: 1, resource: { buffer: this._nodeBuffer! } },
      ],
    });
    this._frameBindGroupDirty = false;
    return this._frameBindGroup;
  }

  private _getTexBindGroup(device: GPUDevice, backend: WebGpuBackend, textures: readonly Texture[]): GPUBindGroup {
    if (textures.length === 0 || textures.length > textAtlasTextureSlots) {
      throw new Error(`WebGpuTextRenderer: expected 1-${textAtlasTextureSlots} atlas textures, got ${textures.length}.`);
    }

    // WebGPU bind groups are fixed-layout. Duplicate slot 0 into unused entries;
    // packed vertices can only select the real prefix. Resolve every live
    // binding before the cache lookup so dirty pages still upload and sampler
    // mutations are visible even when their texture view stays stable.
    const fallbackTexture = textures[0]!;
    const fallbackBinding = backend.getTextureBinding(fallbackTexture);
    const resolvedTextures = new Array<Texture>(textAtlasTextureSlots);
    const bindings = new Array<ReturnType<WebGpuBackend['getTextureBinding']>>(textAtlasTextureSlots);

    for (let slot = 0; slot < textAtlasTextureSlots; slot++) {
      const texture = textures[slot] ?? fallbackTexture;

      resolvedTextures[slot] = texture;
      bindings[slot] = texture === fallbackTexture ? fallbackBinding : backend.getTextureBinding(texture);
    }

    let cachedEntries = this._textureSetBindGroups.get(fallbackTexture);

    if (cachedEntries === undefined) {
      cachedEntries = [];
      this._textureSetBindGroups.set(fallbackTexture, cachedEntries);
    }

    for (const cached of cachedEntries) {
      if (!cached.textures.every((texture, slot) => texture === resolvedTextures[slot])) continue;

      const bindingChanged = cached.views.some((view, slot) => view !== bindings[slot]!.view || cached.samplers[slot] !== bindings[slot]!.sampler);

      if (bindingChanged) {
        cached.views = bindings.map(binding => binding.view);
        cached.samplers = bindings.map(binding => binding.sampler);
        cached.group = this._buildTextureBindGroup(device, bindings);
      }

      return cached.group;
    }

    const group = this._buildTextureBindGroup(device, bindings);

    cachedEntries.push({
      textures: resolvedTextures,
      views: bindings.map(binding => binding.view),
      samplers: bindings.map(binding => binding.sampler),
      group,
    });

    if (cachedEntries.length > maxTextureSetsPerAnchor) cachedEntries.shift();

    return group;
  }

  private _buildTextureBindGroup(device: GPUDevice, bindings: ReadonlyArray<ReturnType<WebGpuBackend['getTextureBinding']>>): GPUBindGroup {
    return device.createBindGroup({
      label: 'WebGpuTextRenderer/texture-bind-group',
      layout: this._textureBindGroupLayout!,
      entries: [
        ...bindings.map(({ view }, binding) => ({ binding, resource: view })),
        ...bindings.map(({ sampler }, slot) => ({ binding: textAtlasTextureSlots + slot, resource: sampler })),
      ],
    });
  }

  // ── Pipeline helpers ─────────────────────────────────────────────────────

  private _getPipeline(shaderType: ShaderType, blendMode: BlendModes, format: GPUTextureFormat, stencil: boolean): GPURenderPipeline {
    const key = `${shaderType}:${blendMode}:${format}:${stencil ? 's' : 'n'}`;
    const existing = this._pipelines.get(key);
    if (existing) return existing;

    const pipeline = this._device!.createRenderPipeline(this._buildPipelineDescriptor(shaderType, blendMode, format, stencil));
    this._pipelines.set(key, pipeline);
    return pipeline;
  }

  private _buildPipelineDescriptor(shaderType: ShaderType, blendMode: BlendModes, format: GPUTextureFormat, stencil = false): GPURenderPipelineDescriptor {
    let fragEntry: string;
    if (shaderType === 'sdf') {
      fragEntry = 'fragmentSdf';
    } else if (shaderType === 'msdf') {
      fragEntry = 'fragmentMsdf';
    } else {
      fragEntry = 'fragmentColor';
    }

    const descriptor: GPURenderPipelineDescriptor = {
      label: `WebGpuTextRenderer/${shaderType}/${blendMode}`,
      layout: this._pipelineLayout!,
      vertex: {
        module: this._shaderModule!,
        entryPoint: 'vertexMain',
        buffers: [
          {
            arrayStride: vertexStrideBytes,
            stepMode: 'vertex',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32x2' },
              { shaderLocation: 2, offset: 16, format: 'uint32' },
            ],
          },
        ],
      },
      fragment: {
        module: this._shaderModule!,
        entryPoint: fragEntry,
        targets: [
          {
            format,
            blend: getWebGpuBlendState(blendMode),
            writeMask: GPUColorWrite.ALL,
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    };

    if (stencil) {
      descriptor.depthStencil = stencilContentDepthStencilState();
    }

    return descriptor;
  }

  // ── Capacity helpers ─────────────────────────────────────────────────────

  private _ensureVertexCapacity(vertexCount: number): void {
    if (vertexCount <= this._vertexCapacity) return;
    while (this._vertexCapacity < vertexCount) this._vertexCapacity *= 2;
    this._vertexData = new ArrayBuffer(this._vertexCapacity * vertexStrideBytes);
    this._float32View = new Float32Array(this._vertexData);
    this._uint32View = new Uint32Array(this._vertexData);
  }

  private _ensureIndexCapacity(indexCount: number): void {
    if (indexCount <= this._indexCapacity) return;
    while (this._indexCapacity < indexCount) this._indexCapacity *= 2;
    this._indexData = new Uint32Array(this._indexCapacity);
  }

  private _ensureNodeCapacity(nodeCount: number): void {
    if (nodeCount <= this._nodeCapacity) return;
    while (this._nodeCapacity < nodeCount) this._nodeCapacity *= 2;
    const next = new Float32Array(this._nodeCapacity * nodeFloats);
    next.set(this._nodeDataArray);
    this._nodeDataArray = next;
  }

  private _resetFrameState(): void {
    this._pendingQuads.length = 0;
    this._nodeIndexMap.clear();
    this._textureKeyMap.clear();
    this._textureKeyCounter = 0;
    this._nodeCount = 0;
  }

  // ── Retained-batch record/replay ──────────────────────────────────────────
  // Text's per-vertex "node index" addresses its OWN dense, per-flush node
  // buffer (packed above), never a row in the shared `TransformBuffer` - so,
  // unlike every other retained renderer, its instance bytes carry no index
  // the generic bundle/scan/rebase machinery can meaningfully rebase. Both
  // hooks below are true no-ops; the renderer instead carries its own node
  // data end-to-end via `WebGpuRetainedBatchPayload.rendererData`, uploaded
  // into a group-owned buffer (`TextRetainedReplayState`) on first replay.

  /** @internal See {@link WebGpuRetainedBatchReplayer.scanRetainedNodeIndexRange}. */
  public scanRetainedNodeIndexRange(_bytes: Uint8Array, _range: WebGpuRetainedNodeIndexRange): void {
    // Deliberately does not touch `_range`: widening it here would corrupt
    // the shared-transform-row span `WebGpuBackend._finalizeRetainedCapture`
    // computes across every OTHER (shared-transform-consuming) renderer's
    // batches recorded into the same bundle this capture.
  }

  /** @internal See {@link WebGpuRetainedBatchReplayer.rebaseRetainedNodeIndices}. */
  public rebaseRetainedNodeIndices(_bytes: Uint8Array, _base: number): void {
    // Deliberately does not touch `_bytes`: Text's node indices are already
    // correct as packed (dense, 0-based, matching the parallel `rendererData`
    // uploaded alongside them) and have no relationship to the shared-buffer
    // rebase `base`.
  }

  /**
   * Stage this flush's ONE multi-atlas batch for retained replay, or poison the active
   * capture(s) when this flush is not a clean single-batch recording.
   * `TextRetainedReplayState` holds at most one recorded batch per bundle per
   * capture window (identified via `backend._currentRetainedCaptureFrame`,
   * unique per capture-open call) - a flush spanning multiple distinct
   * incompatible shader/page classes or more than eight atlas textures, or a
   * second Text flush within the same window, would need a second slot this
   * design doesn't provide.
   * Poisoning is always safe: the group falls back to entry replay for this
   * frame only, never wrong pixels.
   */
  private _tryRecordRetainedBatch(backend: WebGpuBackend, batches: readonly BatchDraw[]): void {
    const frame = backend._currentRetainedCaptureFrame;

    if (frame === null) {
      return;
    }

    if (batches.length !== 1 || this._recordedCaptureFrames.has(frame)) {
      backend._poisonActiveRetainedCaptures();

      return;
    }

    const batch = batches[0]!;
    const vertexByteLength = batch.vertexCount * vertexStrideBytes;
    // Copy: `_vertexData`/`_nodeDataArray` are reused (overwritten) next flush.
    const vertexBytes = this._vertexData.slice(batch.firstVertex * vertexStrideBytes, batch.firstVertex * vertexStrideBytes + vertexByteLength);
    const nodeData = this._nodeDataArray.slice(0, this._nodeCount * nodeFloats);
    const drawables = [...this._nodeIndexMap.keys()];

    const rendererData: TextRetainedRendererData = {
      nodeData,
      nodeCount: this._nodeCount,
      drawables,
      shaderType: batch.shaderType,
      quadCount: batch.indexCount / 6,
    };

    // The batch's instances are its glyph quads; its NODES are the text runs the
    // quads came from - a single run contributes one to `submittedNodes` however
    // many glyphs it draws, on this tier as on the live one.
    backend.recordRetainedBatch(
      this,
      vertexBytes,
      vertexByteLength,
      rendererData.quadCount,
      batch.blendMode,
      batch.atlasTextures,
      batch.atlasTextures.length,
      null,
      rendererData,
      this._nodeCount,
    );

    this._recordedCaptureFrames.add(frame);
  }

  /**
   * Replay one recorded Text batch from its group-owned bundle into the OPEN
   * pass. STATE is resolved live - pipeline, FrameUniforms (projection +
   * group) from the live view/group, the texture binding; DATA is reused -
   * the group-owned vertex bytes (`bundle.instanceBuffer` at
   * `payload.byteOffset`), the renderer-owned static quad-index pattern, and
   * Text's own persisted per-node style+transform buffer (uploaded once per
   * recording, on first replay).
   * @internal
   */
  public replayRetainedBatch(payload: WebGpuRetainedBatchPayload): void {
    const backend = this._backend;
    const device = this._device;
    const bundle = payload.bundle;
    const data = payload.rendererData as TextRetainedRendererData | null;

    if (
      backend === null ||
      device === null ||
      data === null ||
      !(bundle instanceof WebGpuRetainedGroupBundle) ||
      !bundle.isReady ||
      bundle.instanceBuffer === null
    ) {
      return;
    }

    // Drain any pending live text draws first so replay draws follow them in
    // order (mirrors NineSlice/Mesh).
    this.flush();

    const scissor = backend.getScissorRect();

    if (scissor !== null && (scissor.width <= 0 || scissor.height <= 0)) {
      return;
    }

    const coordinator = backend._passCoordinator;
    const state = this._getTextReplayState(bundle, device);

    if (state.lastPayload !== payload) {
      this._uploadRetainedNodeData(state, device, data);
      state.lastPayload = payload;
    }

    const view = backend.view;
    const scratch = this._retainedFrameScratch;

    packAffineMat3Std140(view.getTransform(), scratch, 0);
    packAffineMat3Std140(backend.renderGroupTransform ?? Matrix.identity, scratch, 12);
    // The snap viewport rides in the same scratch, so the full content compare
    // below already covers a snap-rect change (attachment resize).
    packSnapViewport(backend, scratch, 24);

    let uboDirty = !state.uboWritten;

    if (!uboDirty) {
      for (let i = 0; i < scratch.length; i++) {
        if (scratch[i] !== state.uboData[i]) {
          uboDirty = true;
          break;
        }
      }
    }

    if (uboDirty) {
      const activePass = coordinator.activePass;

      if (activePass !== null && state.drawsInPass === activePass) {
        // Rewriting FrameUniforms would retroactively re-project this
        // bundle's draws already recorded into the open pass: end it first.
        coordinator.endPass();
        state.drawsInPass = null;
      }

      state.uboData.set(scratch);
      state.uboWritten = true;
      device.queue.writeBuffer(state.uniformBuffer!, 0, state.uboData.buffer, state.uboData.byteOffset, projectionBytes);
    }

    // Text's own recording stages one or more atlas `Texture`s in packed-slot
    // order, never a `RenderTexture`; the payload's shared type is wider only
    // because other renderers can target one.
    // Same-frame atlas-mutation guard: syncing a dirty glyph page below lands on
    // the queue timeline ahead of the deferred submit, retroactively changing
    // draws already recorded into the open pass - from any renderer, since the
    // pass survives a renderer switch.
    if (coordinator.passHasDraws) {
      for (const texture of payload.textures) {
        if (backend.textureUploadWouldMutate(texture)) {
          coordinator.endPass();
          state.drawsInPass = null;
          break;
        }
      }
    }

    const textureBindGroup = this._getTexBindGroup(device, backend, payload.textures as readonly Texture[]);
    const frameBindGroup = this._getTextReplayBindGroup(state, device);
    const indexBuffer = this._ensureRetainedQuadIndexBuffer(device, data.quadCount, coordinator);

    const active = coordinator.acquirePass();
    const pass = active.pass;

    pass.setPipeline(this._getPipeline(data.shaderType, payload.blendMode, backend.renderTargetFormat, coordinator.stencilActive));
    pass.setBindGroup(0, frameBindGroup);
    pass.setBindGroup(1, textureBindGroup);
    pass.setVertexBuffer(0, bundle.instanceBuffer, payload.byteOffset);
    pass.setIndexBuffer(indexBuffer, 'uint32');
    pass.drawIndexed(data.quadCount * 6, 1, 0, 0, 0);

    state.drawsInPass = active;
    coordinator.markPassDraws();
    backend.stats.batches++;
    backend.stats.drawCalls++;
  }

  /**
   * Own-transform-move O(1) patch ({@link OwnTransformRowPatcher}): recompute
   * only the moved node's transform-column pair (2 of its 10 vec4s) via
   * `getGlobalTransform()` (group-local - {@link RetainedContainer} composes
   * up to the enclosing boundary only) and `queue.writeBuffer` just that row's
   * byte range in the persisted node-data buffer. `base` (the shared-buffer
   * direct-draw base) is irrelevant to Text's own dense local indexing and is
   * unused. Returns `false` (ineligible - falls back to a full re-record) when
   * `bundle` isn't a WebGPU bundle with a live Text replay state, or `node`
   * wasn't part of the recorded batch.
   * @internal
   */
  public _patchOwnTransformRow(node: RenderNode, bundle: RetainedGroupBundle, _base: number): boolean {
    const device = this._device;

    if (device === null || !(bundle instanceof WebGpuRetainedGroupBundle)) {
      return false;
    }

    const state = bundle.rendererReplayState;

    if (!(state instanceof TextRetainedReplayState) || state.nodeDataBuffer === null) {
      return false;
    }

    const drawable = node as unknown as Text | BitmapText;
    const localIndex = state.nodeIndexByDrawable.get(drawable);

    if (localIndex === undefined) {
      return false;
    }

    const row = this._patchRowScratch;

    packTextNodeTransform(row, 0, drawable);

    return state.patchNodeTransform(localIndex, row);
  }

  private _getTextReplayState(bundle: WebGpuRetainedGroupBundle, device: GPUDevice): TextRetainedReplayState {
    const existing = bundle.rendererReplayState;
    const state = existing instanceof TextRetainedReplayState ? existing : new TextRetainedReplayState();

    if (existing !== state) {
      bundle.rendererReplayState = state;
    }

    if (state.uniformBuffer === null) {
      state.uniformBuffer = device.createBuffer({
        label: 'WebGpuTextRenderer/retained-uniform',
        size: projectionBytes,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      state.bindGroup = null;
    }

    return state;
  }

  private _uploadRetainedNodeData(state: TextRetainedReplayState, device: GPUDevice, data: TextRetainedRendererData): void {
    const requiredBytes = data.nodeCount * nodeFloats * 4;

    if (state.nodeDataBuffer === null || state.nodeDataCapacity < requiredBytes) {
      let capacity = Math.max(state.nodeDataCapacity, nodeFloats * 4);

      while (capacity < requiredBytes) capacity *= 2;

      state.nodeDataBuffer?.destroy();
      state.nodeDataBuffer = device.createBuffer({
        label: 'WebGpuTextRenderer/retained-node-data',
        size: capacity,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      state.nodeDataCapacity = capacity;
      state.bindGroup = null;
    }

    if (requiredBytes > 0) {
      device.queue.writeBuffer(state.nodeDataBuffer, 0, data.nodeData.buffer, data.nodeData.byteOffset, requiredBytes);
    }

    state.adoptNodeData(device, data.nodeData, data.nodeCount);
    state.nodeIndexByDrawable.clear();

    for (let i = 0; i < data.drawables.length; i++) {
      state.nodeIndexByDrawable.set(data.drawables[i]!, i);
    }
  }

  private _getTextReplayBindGroup(state: TextRetainedReplayState, device: GPUDevice): GPUBindGroup {
    if (state.bindGroup !== null) {
      return state.bindGroup;
    }

    state.bindGroup = device.createBindGroup({
      label: 'WebGpuTextRenderer/retained-frame-bind-group',
      layout: this._frameBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: state.uniformBuffer! } },
        { binding: 1, resource: { buffer: state.nodeDataBuffer! } },
      ],
    });

    return state.bindGroup;
  }

  /**
   * Renderer-owned, grow-only index buffer holding the deterministic
   * `[0,1,2,0,2,3] + 4*i` quad pattern up to `quadCount` quads - glyph quad
   * indices are ALWAYS this exact pattern (`buildTextPageQuads` never packs
   * anything else), so replay never needs to persist per-batch index bytes;
   * one shared, ever-growing buffer serves every recorded Text batch on this
   * renderer, exactly like `WebGpuNineSliceSpriteRenderer`'s static per-quad
   * index buffer serves every nine-slice instance.
   */
  private _ensureRetainedQuadIndexBuffer(device: GPUDevice, quadCount: number, coordinator: WebGpuBackend['_passCoordinator']): GPUBuffer {
    if (this._retainedQuadIndexBuffer !== null && this._retainedQuadIndexCapacity >= quadCount) {
      return this._retainedQuadIndexBuffer;
    }

    // Growing below destroys the current buffer. An earlier retained replay
    // in this same still-open pass may still have a draw bound to it, and
    // the pass no longer ends at the tail of a replay call - end it first so
    // that draw reaches the queue against a live buffer.
    if (this._retainedQuadIndexBuffer !== null && coordinator.passHasDraws) {
      coordinator.endPass();
    }

    let capacity = Math.max(this._retainedQuadIndexCapacity, initialRetainedQuadCapacity);

    while (capacity < quadCount) capacity *= 2;

    const indices = new Uint32Array(capacity * 6);

    for (let i = 0; i < capacity; i++) {
      const baseV = i * 4;
      const o = i * 6;

      indices[o + 0] = baseV;
      indices[o + 1] = baseV + 1;
      indices[o + 2] = baseV + 2;
      indices[o + 3] = baseV;
      indices[o + 4] = baseV + 2;
      indices[o + 5] = baseV + 3;
    }

    this._retainedQuadIndexBuffer?.destroy();
    this._retainedQuadIndexBuffer = device.createBuffer({
      label: 'WebGpuTextRenderer/retained-quad-indices',
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this._retainedQuadIndexBuffer, 0, indices.buffer, 0, indices.byteLength);
    this._retainedQuadIndexCapacity = capacity;

    return this._retainedQuadIndexBuffer;
  }
}
