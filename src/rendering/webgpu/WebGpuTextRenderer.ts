/// <reference types="@webgpu/types" />

import { Matrix } from '#math/Matrix';
import { packAffineMat3Std140 } from '#rendering/affinePacking';
import type { RetainedGroupBundle } from '#rendering/plan/RetainedInstructionSet';
import type { RenderNode } from '#rendering/RenderNode';
import type { OwnTransformRowPatcher } from '#rendering/RetainedContainer';
import { type BitmapText } from '#rendering/text/BitmapText';
import type { TextPageQuads } from '#rendering/text/Text';
import { Text } from '#rendering/text/Text';
import type { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';
import type { View } from '#rendering/View';

import { AbstractWebGpuRenderer } from './AbstractWebGpuRenderer';
import type { WebGpuBackend } from './WebGpuBackend';
import { getWebGpuBlendState } from './WebGpuBlendState';
import type { WebGpuActiveRenderPass } from './WebGpuPassCoordinator';
import {
  type WebGpuRetainedBatchPayload,
  type WebGpuRetainedBatchReplayer,
  type WebGpuRetainedCaptureFrame,
  WebGpuRetainedGroupBundle,
  type WebGpuRetainedNodeIndexRange,
  type WebGpuRetainedRendererReplayState,
} from './WebGpuRetainedGroupResources';
import { packSnapViewport } from './webgpuSnapViewport';
import { stencilContentDepthStencilState } from './WebGpuStencilState';

// ── Node data layout (identical to WebGl2TextRenderer) ───────────────────────
//
// Storage buffer: array<vec4<f32>> — 10 entries per node.
//
// [ni*10+0]: (a,  c,  0,  tx)   transform col 0+2
// [ni*10+1]: (b,  d,  0,  ty)   transform col 1+2
// [ni*10+2]: (r,  g,  b,  a )   fillColor
// [ni*10+3]: (r,  g,  b,  a )   outlineColor
// [ni*10+4]: (outlineMin, shadowAlpha, softness, gradientEnabled)
// [ni*10+5]: (r,  g,  b,  a )   shadowColor
// [ni*10+6]: (shadowOffX_px, shadowOffY_px, gradientVertical, 0)
// [ni*10+7]: (r,  g,  b,  a )   gradientTop
// [ni*10+8]: (r,  g,  b,  a )   gradientBottom
// [ni*10+9]: (minX, minY, w, h) text block bounds

const nodeTexels = 10;
const nodeFloats = nodeTexels * 4;

// Per-vertex layout (20 bytes): pos f32x2 + uv f32x2 + nodeIndex f32
const vertexStrideBytes = 20;
const vertexStrideWords = vertexStrideBytes / 4;

const initialVertexCapacity = 256;
const initialIndexCapacity = 384;
const initialNodeCapacity = 32;

// FrameUniforms: 7 × vec4<f32> = 112 bytes (projection + group mat3x3,
// column-major, + device-pixel snap viewport rect)
const projectionBytes = 112;

type ShaderType = 'sdf' | 'msdf' | 'color';

interface PendingQuad {
  readonly quads: TextPageQuads;
  readonly nodeIndex: number;
  readonly shaderType: ShaderType;
  readonly atlasTexture: Texture;
}

interface BatchDraw {
  readonly shaderType: ShaderType;
  readonly atlasTexture: Texture;
  readonly firstVertex: number;
  readonly vertexCount: number;
  readonly firstIndex: number;
  readonly indexCount: number;
}

/**
 * Opaque, renderer-private snapshot carried on {@link WebGpuRetainedBatchPayload.rendererData}
 * for one recorded Text/BitmapText batch (Track B retained-batch record/replay).
 * Text opts out of the shared `TransformBuffer` (`_consumesSharedTransform ===
 * false`), so the generic bundle machinery has nothing to persist for it — this
 * is the renderer's own carrier from record time (`flush()`) through to replay
 * (`_replayRetainedBatch`), where `TextRetainedReplayState` uploads it into a
 * persistent, group-owned GPU buffer on first use.
 */
interface TextRetainedRendererData {
  /** Copy of this flush's packed per-node style+transform data (10 vec4s/node, dense, 0-based). */
  readonly nodeData: Float32Array;
  readonly nodeCount: number;
  /** Node `i`'s drawable, parallel to `nodeData`'s dense row `i` — backs the own-transform-move patch lookup. */
  readonly drawables: ReadonlyArray<Text | BitmapText>;
  readonly shaderType: ShaderType;
  readonly quadCount: number;
}

/**
 * Per-bundle Text replay state (Track B retained-batch opt-in), parked on
 * {@link WebGpuRetainedGroupBundle.rendererReplayState} so it shares the
 * bundle's grow-only / explicitly-freed lifecycle — mirrors Mesh's
 * `MeshRetainedReplayState`. Holds Text's OWN persistent per-node data buffer
 * (same 10-vec4/node layout the live path uses) and FrameUniforms buffer,
 * since Text's row format differs from both the shared `TransformBuffer` row
 * layout AND the shared 128-byte group UBO {@link WebGpuRetainedGroupBundle}
 * itself owns (Text's `FrameUniforms` is a 96-byte mat3x3 pair, not the
 * mat4x4 pair every other retained renderer's shared UBO uses).
 *
 * A bundle can hold at most ONE recorded Text batch per capture (`flush()`
 * poisons rather than recording a second one) — so this state is a single
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
  }
}

// ── WGSL: shared vertex + three fragment entry points ────────────────────────
/** WGSL source for the text pipeline (shared vertex + color/SDF/MSDF fragment entry points). @internal */
export const textShaderSource = `
struct FrameUniforms {
    projCol0 : vec4<f32>,
    projCol1 : vec4<f32>,
    projCol2 : vec4<f32>,
    groupCol0 : vec4<f32>,
    groupCol1 : vec4<f32>,
    groupCol2 : vec4<f32>,
    viewport : vec4<f32>,       // device-pixel snap rect (x, y, width, height)
};

@group(0) @binding(0) var<uniform>       frame : FrameUniforms;
@group(0) @binding(1) var<storage, read> nodes : array<vec4<f32>>;

@group(1) @binding(0) var atlasTexture : texture_2d<f32>;
@group(1) @binding(1) var atlasSampler : sampler;

struct VertexInput {
    @location(0) position  : vec2<f32>,
    @location(1) texcoord  : vec2<f32>,
    @location(2) nodeIndex : f32,
};

struct VertexOutput {
    @builtin(position)              clipPos  : vec4<f32>,
    @location(0)                    texcoord : vec2<f32>,
    @location(1)                    gradUV   : vec2<f32>,
    @location(2) @interpolate(flat) nodeIdx  : u32,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    let ni   = u32(input.nodeIndex);
    let base = ni * 10u;

    let t0 = nodes[base + 0u];
    let t1 = nodes[base + 1u];
    let t9 = nodes[base + 9u];

    let proj = mat3x3<f32>(
        frame.projCol0.xyz,
        frame.projCol1.xyz,
        frame.projCol2.xyz,
    );
    let xf = mat3x3<f32>(
        vec3<f32>(t0.x, t0.y, 0.0),
        vec3<f32>(t1.x, t1.y, 0.0),
        vec3<f32>(t0.w, t1.w, 1.0),
    );

    let grp = mat3x3<f32>(
        frame.groupCol0.xyz,
        frame.groupCol1.xyz,
        frame.groupCol2.xyz,
    );
    let worldPos = proj * grp * xf * vec3<f32>(input.position, 1.0);

    var clipPos = vec4<f32>(worldPos.xy, 0.0, 1.0);

    // Render-only pixel snapping (t0.z: 0 = none, non-zero = snap origin).
    // Snap the node ORIGIN (t0.w, t1.w)'s device-pixel position and
    // rigid-shift every glyph vertex by the same delta. floor(x + 0.5)
    // matches the CPU Math.round policy; WGSL round() is half-to-even. Grid
    // alignment is independent of the y-axis convention because the staged
    // viewport rect is whole device pixels.
    if (t0.z != 0.0) {
        let originClip = (proj * grp * vec3<f32>(t0.w, t1.w, 1.0)).xy;
        let originDevice = frame.viewport.xy + (originClip * 0.5 + vec2<f32>(0.5)) * frame.viewport.zw;
        let snapDelta = (floor(originDevice + vec2<f32>(0.5)) - originDevice) * 2.0 / max(frame.viewport.zw, vec2<f32>(1.0));
        clipPos = vec4<f32>(clipPos.xy + snapDelta, clipPos.z, clipPos.w);
    }

    let bSize  = t9.zw;
    var gradUV = vec2<f32>(0.0);
    if (bSize.x > 0.0 && bSize.y > 0.0) {
        gradUV = clamp((input.position - t9.xy) / bSize, vec2<f32>(0.0), vec2<f32>(1.0));
    }

    var out: VertexOutput;
    out.clipPos  = clipPos;
    out.texcoord = input.texcoord;
    out.gradUV   = gradUV;
    out.nodeIdx  = ni;
    return out;
}

// ── SDF (R8 atlas) ────────────────────────────────────────────────────────────

@fragment
fn fragmentSdf(in: VertexOutput) -> @location(0) vec4<f32> {
    let ni   = in.nodeIdx;
    let base = ni * 10u;

    let tFill    = nodes[base + 2u];
    let tOutline = nodes[base + 3u];
    let tParams  = nodes[base + 4u];
    let tShadow  = nodes[base + 5u];
    let tShadow2 = nodes[base + 6u];
    let tGradTop = nodes[base + 7u];
    let tGradBot = nodes[base + 8u];

    let outlineMin   = tParams.x;
    let shadowAlpha  = tParams.y;
    let soft         = max(tParams.z, 0.001);
    let gradEnabled  = tParams.w;
    let pageSize     = f32(textureDimensions(atlasTexture, 0).x);
    let shadowOffset = tShadow2.xy / pageSize;
    let gradVertical = tShadow2.z;

    let sd   = textureSample(atlasTexture, atlasSampler, in.texcoord).r;
    let fill = smoothstep(0.5 - soft, 0.5 + soft, sd);

    let shadowSd = textureSample(atlasTexture, atlasSampler, in.texcoord - shadowOffset).r;

    let outline = select(0.0,
        smoothstep(outlineMin - soft, outlineMin + soft, sd) * (1.0 - fill),
        outlineMin < 0.5);

    let shadow = smoothstep(0.5 - soft, 0.5 + soft, shadowSd)
                 * shadowAlpha * (1.0 - fill) * (1.0 - outline);

    var fillColor : vec4<f32>;
    if (gradEnabled > 0.5) {
        let t = select(in.gradUV.x, in.gradUV.y, gradVertical > 0.5);
        fillColor = mix(tGradBot, tGradTop, t);
    } else {
        fillColor = tFill;
    }

    return fillColor * fill + tOutline * outline + tShadow * shadow;
}

// ── MSDF (RGB atlas) ──────────────────────────────────────────────────────────

fn median3(r: f32, g: f32, b: f32) -> f32 {
    return max(min(r, g), min(max(r, g), b));
}

@fragment
fn fragmentMsdf(in: VertexOutput) -> @location(0) vec4<f32> {
    let ni   = in.nodeIdx;
    let base = ni * 10u;

    let tFill    = nodes[base + 2u];
    let tOutline = nodes[base + 3u];
    let tParams  = nodes[base + 4u];
    let tShadow  = nodes[base + 5u];
    let tShadow2 = nodes[base + 6u];
    let tGradTop = nodes[base + 7u];
    let tGradBot = nodes[base + 8u];

    let outlineMin   = tParams.x;
    let shadowAlpha  = tParams.y;
    let soft         = max(tParams.z, 0.001);
    let gradEnabled  = tParams.w;
    let pageSize     = f32(textureDimensions(atlasTexture, 0).x);
    let shadowOffset = tShadow2.xy / pageSize;
    let gradVertical = tShadow2.z;

    let msd  = textureSample(atlasTexture, atlasSampler, in.texcoord).rgb;
    let sd   = median3(msd.r, msd.g, msd.b);
    let fill = smoothstep(0.5 - soft, 0.5 + soft, sd);

    let shadowMsd = textureSample(atlasTexture, atlasSampler, in.texcoord - shadowOffset).rgb;
    let shadowSd  = median3(shadowMsd.r, shadowMsd.g, shadowMsd.b);

    let outline = select(0.0,
        smoothstep(outlineMin - soft, outlineMin + soft, sd) * (1.0 - fill),
        outlineMin < 0.5);

    let shadow = smoothstep(0.5 - soft, 0.5 + soft, shadowSd)
                 * shadowAlpha * (1.0 - fill) * (1.0 - outline);

    var fillColor : vec4<f32>;
    if (gradEnabled > 0.5) {
        let t = select(in.gradUV.x, in.gradUV.y, gradVertical > 0.5);
        fillColor = mix(tGradBot, tGradTop, t);
    } else {
        fillColor = tFill;
    }

    return fillColor * fill + tOutline * outline + tShadow * shadow;
}

// ── Color (RGBA atlas) ────────────────────────────────────────────────────────

@fragment
fn fragmentColor(in: VertexOutput) -> @location(0) vec4<f32> {
    let ni     = in.nodeIdx;
    let base   = ni * 10u;
    let tint   = nodes[base + 2u];
    let sample = textureSample(atlasTexture, atlasSampler, in.texcoord);
    return sample * tint;
}
`;

/**
 * WebGPU renderer for {@link Text} and {@link BitmapText} nodes.
 *
 * Mirrors {@link WebGl2TextRenderer}: per-node style data is packed once per
 * flush into a `var<storage, read>` buffer, three specialised WGSL fragment
 * variants handle SDF / MSDF / colour-atlas glyphs, and quads are sorted and
 * batched by (shaderType, atlasPage) to minimise draw calls within a single
 * render pass.
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
   * Retained-batch opt-in (Track B extension): a flush whose glyph quads all
   * share one (shaderType, atlasTexture) — the overwhelmingly common case, one
   * font/atlas per flush — is a recordable batch. A flush that mixes multiple
   * distinct (shaderType, atlasTexture) combinations, or a second Text flush
   * within the same capture window, poisons the capture instead (see
   * `_tryRecordRetainedBatch`) — always safe, just a missed optimization.
   * @internal
   */
  public readonly _supportsRetainedBatches = true;

  // Retained-batch record-time scratch: which capture windows this renderer
  // has already recorded a batch into (S3-D6 nesting-safe — a fresh
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
  // Weak cache: avoids retaining transient atlas textures via strong keys. The
  // bind group is stored alongside the texture view it was built from — a
  // mutable DataTexture (the glyph atlas) keeps the same view across content
  // updates but gets a fresh one when the backend recreates the GPU texture on
  // resize, so the cache is invalidated only then.
  private _texBindGroups = new WeakMap<Texture, { group: GPUBindGroup; view: GPUTextureView }>();

  private _projBuffer: GPUBuffer | null = null;
  private _nodeBuffer: GPUBuffer | null = null;
  private _vertexBuffer: GPUBuffer | null = null;
  private _indexBuffer: GPUBuffer | null = null;
  private _nodeBufferCapacity = 0;
  private _vertexBufferCapacity = 0;
  private _indexBufferCapacity = 0;

  private _frameBindGroup: GPUBindGroup | null = null;
  private _frameBindGroupDirty = true;

  // FrameUniforms (projection + group) skip state: a matching (view identity,
  // view.updateId, group-transform id) triple means the proj UBO already holds
  // this flush's transform, so the 96-byte write is skipped. Per-node style
  // data (the storage buffer) is uploaded unconditionally — it genuinely
  // changes per frame; only the shared projection is elided here.
  private _writtenView: View | null = null;
  private _writtenViewUpdateId = -1;
  private _writtenGroupTransformId = -1;
  private _hasWrittenProjection = false;

  // CPU-side working arrays
  private _vertexCapacity = initialVertexCapacity;
  private _indexCapacity = initialIndexCapacity;
  private _vertexData: ArrayBuffer = new ArrayBuffer(initialVertexCapacity * vertexStrideBytes);
  private _float32View: Float32Array = new Float32Array(this._vertexData);
  private _indexData: Uint16Array = new Uint16Array(initialIndexCapacity);
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

    // Sort by (shaderType, atlasTexture) so equal-key quads are contiguous
    this._pendingQuads.sort((a, b) => {
      const sc = a.shaderType.localeCompare(b.shaderType);
      if (sc !== 0) return sc;
      return (this._textureKeyMap.get(a.atlasTexture) ?? 0) - (this._textureKeyMap.get(b.atlasTexture) ?? 0);
    });

    // Upload FrameUniforms: projection + group as vec4-padded mat3x3 columns
    // plus the device-pixel snap viewport rect, packed via the shared canonical
    // (non-transposed) column order. The write is skipped when the UBO already
    // holds this exact (view, updateId, group-id, snap-rect) state — static
    // text then issues zero projection uploads.
    const view = backend.view;
    const viewportChanged = packSnapViewport(backend, this._projData, 24);

    if (
      !this._hasWrittenProjection ||
      this._writtenView !== view ||
      this._writtenViewUpdateId !== view.updateId ||
      this._writtenGroupTransformId !== backend.renderGroupTransformId ||
      viewportChanged
    ) {
      packAffineMat3Std140(view.getTransform(), this._projData, 0);
      packAffineMat3Std140(backend.renderGroupTransform ?? Matrix.identity, this._projData, 12);

      this._writtenView = view;
      this._writtenViewUpdateId = view.updateId;
      this._writtenGroupTransformId = backend.renderGroupTransformId;
      this._hasWrittenProjection = true;

      device.queue.writeBuffer(this._projBuffer!, 0, this._projData.buffer, 0, projectionBytes);
    }

    // Upload per-node style data (may reallocate the storage buffer)
    this._uploadNodeBuffer(device);

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
      const firstTextureKey = this._textureKeyMap.get(first.atlasTexture);

      let qj = qi + 1;
      while (qj < quads.length) {
        const pq = quads[qj]!;
        if (pq.shaderType !== first.shaderType || this._textureKeyMap.get(pq.atlasTexture) !== firstTextureKey) break;
        qj++;
      }

      const batchFirstVertex = packedV;
      const batchFirstIndex = packedI;
      let batchIndexCount = 0;

      for (let k = qi; k < qj; k++) {
        const { quads: batch, nodeIndex } = quads[k]!;
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
          this._float32View[w + 4] = nodeIndex;
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
        atlasTexture: first.atlasTexture,
        firstVertex: batchFirstVertex,
        vertexCount: packedV - batchFirstVertex,
        firstIndex: batchFirstIndex,
        indexCount: batchIndexCount,
      });

      qi = qj;
    }

    // Upload vertex/index buffers (reallocate GPU side when needed)
    this._ensureGpuVertexBuffer(device, packedV);
    this._ensureGpuIndexBuffer(device, packedI);
    device.queue.writeBuffer(this._vertexBuffer!, 0, this._vertexData, 0, packedV * vertexStrideBytes);
    device.queue.writeBuffer(this._indexBuffer!, 0, this._indexData.buffer, 0, packedI * 2);

    if (backend._retainedCaptureActive) {
      this._tryRecordRetainedBatch(backend, batches);
    }

    const format = backend.renderTargetFormat;
    const stencil = backend._passCoordinator.stencilActive;
    const frameBindGroup = this._getFrameBindGroup(device);

    // The coordinator owns the GPU pass (load/clear resolution, pass count and
    // scissor are applied there) and ends + submits it below.
    const pass = backend._passCoordinator.acquirePass().pass;

    pass.setVertexBuffer(0, this._vertexBuffer);
    pass.setIndexBuffer(this._indexBuffer!, 'uint16');

    let lastShaderType: ShaderType | null = null;
    let lastTexture: Texture | null = null;

    for (const batch of batches) {
      if (batch.shaderType !== lastShaderType) {
        pass.setPipeline(this._getPipeline(batch.shaderType, format, stencil));
        pass.setBindGroup(0, frameBindGroup);
        lastShaderType = batch.shaderType;
      }
      if (batch.atlasTexture !== lastTexture) {
        pass.setBindGroup(1, this._getTexBindGroup(device, backend, batch.atlasTexture));
        lastTexture = batch.atlasTexture;
      }
      pass.drawIndexed(batch.indexCount, 1, batch.firstIndex, 0, 0);
      backend.stats.batches++;
      backend.stats.drawCalls++;
    }

    backend._passCoordinator.endPass();

    this._resetFrameState();
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
        const key = `${shaderType}:${format}:n`;
        if (this._pipelines.has(key)) continue;

        promises.push(
          device.createRenderPipelineAsync(this._buildPipelineDescriptor(shaderType, format)).then(pipeline => {
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
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
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

    const indexBytes = initialIndexCapacity * 2;
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
    this._writtenGroupTransformId = -1;
    this._hasWrittenProjection = false;

    this._pipelines.clear();
    this._texBindGroups = new WeakMap<Texture, { group: GPUBindGroup; view: GPUTextureView }>();

    this._pipelineLayout = null;
    this._textureBindGroupLayout = null;
    this._frameBindGroupLayout = null;
    this._shaderModule = null;
    this._device = null;

    this._resetFrameState();
  }

  // ── Collection ───────────────────────────────────────────────────────────

  private _collectText(node: Text): void {
    node.syncDirty();
    const { pageQuads, atlas } = node;
    if (pageQuads.length === 0 || atlas === null) return;

    const nodeIndex = this._assignNodeIndex(node);
    const shaderType: ShaderType = node.colorGlyphs ? 'color' : 'sdf';
    const pages = atlas.pages;

    for (const batch of pageQuads) {
      const page = pages[batch.pageIndex];
      if (page === undefined) continue;
      this._pendingQuads.push({ quads: batch, nodeIndex, shaderType, atlasTexture: page.texture });
    }
  }

  private _collectBitmapText(node: BitmapText): void {
    const { pageQuads, textures, msdf } = node;
    if (pageQuads.length === 0) return;

    const nodeIndex = this._assignNodeIndex(node);
    const shaderType: ShaderType = msdf ? 'msdf' : 'color';

    for (const batch of pageQuads) {
      const tex = textures[batch.pageIndex];
      if (tex === undefined) continue;
      this._pendingQuads.push({ quads: batch, nodeIndex, shaderType, atlasTexture: tex });
    }
  }

  private _assignNodeIndex(node: Text | BitmapText): number {
    const existing = this._nodeIndexMap.get(node);
    if (existing !== undefined) return existing;

    const idx = this._nodeCount++;
    this._nodeIndexMap.set(node, idx);
    this._ensureNodeCapacity(idx + 1);
    this._packNodeData(idx, node);
    return idx;
  }

  // ── Node data packing (identical to WebGl2TextRenderer) ──────────────────

  private _packNodeData(ni: number, node: Text | BitmapText): void {
    const arr = this._nodeDataArray;
    const base = ni * nodeFloats;
    const style = node.style;

    // `toArray` returns a fixed Float32Array(9); indices 0..8 are always valid.
    const m = node.getGlobalTransform().toArray(false);
    arr[base + 0] = m[0]!;
    arr[base + 1] = m[1]!;
    // Texel 0's spare `.z` carries the snap-mode flag the vertex stage reads to
    // decide whether to snap the glyph origin to the device-pixel grid (spec D2:
    // this turns Text position snapping from a silent no-op into a real feature).
    arr[base + 2] = node.pixelSnapMode;
    arr[base + 3] = m[6]!;
    arr[base + 4] = m[3]!;
    arr[base + 5] = m[4]!;
    arr[base + 6] = m[5]!;
    arr[base + 7] = m[7]!;

    const fc = style.fillColor;
    arr[base + 8] = fc.r / 255;
    arr[base + 9] = fc.g / 255;
    arr[base + 10] = fc.b / 255;
    arr[base + 11] = fc.a;

    const oc = style.outlineColor;
    arr[base + 12] = oc.r / 255;
    arr[base + 13] = oc.g / 255;
    arr[base + 14] = oc.b / 255;
    arr[base + 15] = oc.a;

    const outlineMin = style.outlineWidth > 0 ? Math.max(0, 0.5 - style.outlineWidth) : 0.5;
    arr[base + 16] = outlineMin;
    arr[base + 17] = style.shadowAlpha;
    arr[base + 18] = Math.max(0.03, style.shadowBlur * 0.1);
    arr[base + 19] = style.gradientColors !== null ? 1 : 0;

    const sc = style.shadowColor;
    arr[base + 20] = sc.r / 255;
    arr[base + 21] = sc.g / 255;
    arr[base + 22] = sc.b / 255;
    arr[base + 23] = sc.a;

    arr[base + 24] = style.shadowOffsetX;
    arr[base + 25] = style.shadowOffsetY;
    arr[base + 26] = style.gradientAxis === 'vertical' ? 1 : 0;
    arr[base + 27] = 0;

    const gc = style.gradientColors;
    if (gc !== null) {
      arr[base + 28] = gc[0].r / 255;
      arr[base + 29] = gc[0].g / 255;
      arr[base + 30] = gc[0].b / 255;
      arr[base + 31] = gc[0].a;
      arr[base + 32] = gc[1].r / 255;
      arr[base + 33] = gc[1].g / 255;
      arr[base + 34] = gc[1].b / 255;
      arr[base + 35] = gc[1].a;
    } else {
      arr[base + 28] = arr[base + 29] = arr[base + 30] = arr[base + 31] = 0;
      arr[base + 32] = arr[base + 33] = arr[base + 34] = arr[base + 35] = 0;
    }

    const bounds = node.textBounds;
    arr[base + 36] = 0;
    arr[base + 37] = 0;
    arr[base + 38] = bounds.width;
    arr[base + 39] = bounds.height;
  }

  // ── GPU resource helpers ─────────────────────────────────────────────────

  private _uploadNodeBuffer(device: GPUDevice): void {
    const requiredBytes = this._nodeCount * nodeFloats * 4;

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

    device.queue.writeBuffer(this._nodeBuffer!, 0, this._nodeDataArray.buffer, 0, requiredBytes);
  }

  private _ensureGpuVertexBuffer(device: GPUDevice, vertexCount: number): void {
    const required = vertexCount * vertexStrideBytes;
    if (required <= this._vertexBufferCapacity) return;

    let newCap = this._vertexBufferCapacity;
    while (newCap < required) newCap *= 2;
    this._vertexBuffer?.destroy();
    this._vertexBuffer = device.createBuffer({
      label: 'WebGpuTextRenderer/vertices',
      size: newCap,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this._vertexBufferCapacity = newCap;
  }

  private _ensureGpuIndexBuffer(device: GPUDevice, indexCount: number): void {
    const required = indexCount * 2;
    if (required <= this._indexBufferCapacity) return;

    let newCap = this._indexBufferCapacity;
    while (newCap < required) newCap *= 2;
    this._indexBuffer?.destroy();
    this._indexBuffer = device.createBuffer({
      label: 'WebGpuTextRenderer/indices',
      size: newCap,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this._indexBufferCapacity = newCap;
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

  private _getTexBindGroup(device: GPUDevice, backend: WebGpuBackend, texture: Texture): GPUBindGroup {
    // Always resolve the binding so the backend syncs the texture first: a glyph
    // atlas that gained new glyphs (e.g. a scene switch introducing new
    // characters) uploads its dirty region here. Returning a cached bind group
    // without this call would leave those new glyphs un-uploaded — they sample
    // empty atlas texels and render invisibly.
    const { view, sampler } = backend.getTextureBinding(texture);

    const cached = this._texBindGroups.get(texture);
    if (cached?.view === view) return cached.group;

    const group = device.createBindGroup({
      label: 'WebGpuTextRenderer/texture-bind-group',
      layout: this._textureBindGroupLayout!,
      entries: [
        { binding: 0, resource: view },
        { binding: 1, resource: sampler },
      ],
    });
    this._texBindGroups.set(texture, { group, view });
    return group;
  }

  // ── Pipeline helpers ─────────────────────────────────────────────────────

  private _getPipeline(shaderType: ShaderType, format: GPUTextureFormat, stencil: boolean): GPURenderPipeline {
    const key = `${shaderType}:${format}:${stencil ? 's' : 'n'}`;
    const existing = this._pipelines.get(key);
    if (existing) return existing;

    const pipeline = this._device!.createRenderPipeline(this._buildPipelineDescriptor(shaderType, format, stencil));
    this._pipelines.set(key, pipeline);
    return pipeline;
  }

  private _buildPipelineDescriptor(shaderType: ShaderType, format: GPUTextureFormat, stencil = false): GPURenderPipelineDescriptor {
    let fragEntry: string;
    if (shaderType === 'sdf') {
      fragEntry = 'fragmentSdf';
    } else if (shaderType === 'msdf') {
      fragEntry = 'fragmentMsdf';
    } else {
      fragEntry = 'fragmentColor';
    }

    const descriptor: GPURenderPipelineDescriptor = {
      label: `WebGpuTextRenderer/${shaderType}`,
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
              { shaderLocation: 2, offset: 16, format: 'float32' },
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
            blend: getWebGpuBlendState(BlendModes.Normal),
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
  }

  private _ensureIndexCapacity(indexCount: number): void {
    if (indexCount <= this._indexCapacity) return;
    while (this._indexCapacity < indexCount) this._indexCapacity *= 2;
    this._indexData = new Uint16Array(this._indexCapacity);
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

  // ── Retained-batch record/replay (Track B extension) ─────────────────────
  // Text's per-vertex "node index" addresses its OWN dense, per-flush node
  // buffer (packed above), never a row in the shared `TransformBuffer` — so,
  // unlike every other retained renderer, its instance bytes carry no index
  // the generic bundle/scan/rebase machinery can meaningfully rebase. Both
  // hooks below are true no-ops; the renderer instead carries its own node
  // data end-to-end via `WebGpuRetainedBatchPayload.rendererData`, uploaded
  // into a group-owned buffer (`TextRetainedReplayState`) on first replay.

  /** @internal See {@link WebGpuRetainedBatchReplayer._scanRetainedNodeIndexRange}. */
  public _scanRetainedNodeIndexRange(_bytes: Uint8Array, _range: WebGpuRetainedNodeIndexRange): void {
    // Deliberately does not touch `_range`: widening it here would corrupt
    // the shared-transform-row span `WebGpuBackend._finalizeRetainedCapture`
    // computes across every OTHER (shared-transform-consuming) renderer's
    // batches recorded into the same bundle this capture.
  }

  /** @internal See {@link WebGpuRetainedBatchReplayer._rebaseRetainedNodeIndices}. */
  public _rebaseRetainedNodeIndices(_bytes: Uint8Array, _base: number): void {
    // Deliberately does not touch `_bytes`: Text's node indices are already
    // correct as packed (dense, 0-based, matching the parallel `rendererData`
    // uploaded alongside them) and have no relationship to the shared-buffer
    // rebase `base`.
  }

  /**
   * Stage this flush's ONE batch for retained replay, or poison the active
   * capture(s) when this flush is not a clean single-batch recording.
   * `TextRetainedReplayState` holds at most one recorded batch per bundle per
   * capture window (identified via `backend._currentRetainedCaptureFrame`,
   * unique per capture-open call) — a flush spanning multiple distinct
   * (shaderType, atlasTexture) combinations, or a second Text flush within the
   * same window, would need a second slot this design doesn't provide.
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

    backend._recordRetainedBatch(this, vertexBytes, vertexByteLength, this._nodeCount, BlendModes.Normal, [batch.atlasTexture], 1, null, rendererData);

    this._recordedCaptureFrames.add(frame);
  }

  /**
   * Replay one recorded Text batch from its group-owned bundle into the OPEN
   * pass. STATE is resolved live — pipeline, FrameUniforms (projection +
   * group) from the live view/group, the texture binding; DATA is reused —
   * the group-owned vertex bytes (`bundle.instanceBuffer` at
   * `payload.byteOffset`), the renderer-owned static quad-index pattern, and
   * Text's own persisted per-node style+transform buffer (uploaded once per
   * recording, on first replay).
   * @internal
   */
  public _replayRetainedBatch(payload: WebGpuRetainedBatchPayload): void {
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

    // Text's own recording always stages exactly one `Texture` (the atlas
    // page — see `_tryRecordRetainedBatch`'s `[batch.atlasTexture]`), never a
    // `RenderTexture`; the payload's shared type is wider only because other
    // renderers can target one.
    const textureBindGroup = this._getTexBindGroup(device, backend, payload.textures[0]! as Texture);
    const frameBindGroup = this._getTextReplayBindGroup(state, device);
    const indexBuffer = this._ensureRetainedQuadIndexBuffer(device, data.quadCount);

    const active = coordinator.acquirePass();
    const pass = active.pass;

    pass.setPipeline(this._getPipeline(data.shaderType, backend.renderTargetFormat, coordinator.stencilActive));
    pass.setBindGroup(0, frameBindGroup);
    pass.setBindGroup(1, textureBindGroup);
    pass.setVertexBuffer(0, bundle.instanceBuffer, payload.byteOffset);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(data.quadCount * 6, 1, 0, 0, 0);

    state.drawsInPass = active;
    backend.stats.batches++;
    backend.stats.drawCalls++;
  }

  /**
   * Own-transform-move O(1) patch ({@link OwnTransformRowPatcher}): recompute
   * only the moved node's transform-column pair (2 of its 10 vec4s) via
   * `getGlobalTransform()` (group-local — {@link RetainedContainer} composes
   * up to the enclosing boundary only) and `queue.writeBuffer` just that row's
   * byte range in the persisted node-data buffer. `base` (the shared-buffer
   * direct-draw base) is irrelevant to Text's own dense local indexing and is
   * unused. Returns `false` (ineligible — falls back to a full re-record) when
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

    // `toArray` returns a fixed Float32Array(9); indices 0..8 are always valid
    // (mirrors `_packNodeData`'s transform packing above).
    const m = drawable.getGlobalTransform().toArray(false);
    const row = this._patchRowScratch;

    row[0] = m[0]!;
    row[1] = m[1]!;
    row[2] = drawable.pixelSnapMode; // snap-mode flag (texel 0's spare .z)
    row[3] = m[6]!;
    row[4] = m[3]!;
    row[5] = m[4]!;
    row[6] = m[5]!;
    row[7] = m[7]!;

    const byteOffset = localIndex * nodeFloats * 4;

    device.queue.writeBuffer(state.nodeDataBuffer, byteOffset, row.buffer, row.byteOffset, row.byteLength);

    return true;
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
   * `[0,1,2,0,2,3] + 4*i` quad pattern up to `quadCount` quads — glyph quad
   * indices are ALWAYS this exact pattern (`buildTextPageQuads` never packs
   * anything else), so replay never needs to persist per-batch index bytes;
   * one shared, ever-growing buffer serves every recorded Text batch on this
   * renderer, exactly like `WebGpuNineSliceSpriteRenderer`'s static per-quad
   * index buffer serves every nine-slice instance.
   */
  private _ensureRetainedQuadIndexBuffer(device: GPUDevice, quadCount: number): GPUBuffer {
    if (this._retainedQuadIndexBuffer !== null && this._retainedQuadIndexCapacity >= quadCount) {
      return this._retainedQuadIndexBuffer;
    }

    let capacity = Math.max(this._retainedQuadIndexCapacity, 64);

    while (capacity < quadCount) capacity *= 2;

    const indices = new Uint16Array(capacity * 6);

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
