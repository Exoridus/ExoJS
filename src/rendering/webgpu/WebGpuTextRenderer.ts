/// <reference types="@webgpu/types" />

import { type BitmapText } from '@/rendering/text/BitmapText';
import type { TextPageQuads } from '@/rendering/text/Text';
import { Text } from '@/rendering/text/Text';
import type { Texture } from '@/rendering/texture/Texture';
import { BlendModes } from '@/rendering/types';

import { AbstractWebGpuRenderer } from './AbstractWebGpuRenderer';
import type { WebGpuBackend } from './WebGpuBackend';
import { getWebGpuBlendState } from './WebGpuBlendState';

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
const initialIndexCapacity  = 384;
const initialNodeCapacity   = 32;

// FrameUniforms: 3 × vec4<f32> = 48 bytes (projection mat3x3 column-major)
const projectionBytes = 48;

type ShaderType = 'sdf' | 'msdf' | 'color';

interface PendingQuad {
  readonly quads:        TextPageQuads;
  readonly nodeIndex:    number;
  readonly shaderType:   ShaderType;
  readonly atlasTexture: Texture;
}

interface BatchDraw {
  readonly shaderType:   ShaderType;
  readonly atlasTexture: Texture;
  readonly firstIndex:   number;
  readonly indexCount:   number;
}

// ── WGSL: shared vertex + three fragment entry points ────────────────────────
const textShaderSource = `
struct FrameUniforms {
    projCol0 : vec4<f32>,
    projCol1 : vec4<f32>,
    projCol2 : vec4<f32>,
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

    let worldPos = proj * xf * vec3<f32>(input.position, 1.0);

    let bSize  = t9.zw;
    var gradUV = vec2<f32>(0.0);
    if (bSize.x > 0.0 && bSize.y > 0.0) {
        gradUV = clamp((input.position - t9.xy) / bSize, vec2<f32>(0.0), vec2<f32>(1.0));
    }

    var out: VertexOutput;
    out.clipPos  = vec4<f32>(worldPos.xy, 0.0, 1.0);
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
export class WebGpuTextRenderer extends AbstractWebGpuRenderer<Text | BitmapText> {
  private _device: GPUDevice | null = null;
  private _shaderModule: GPUShaderModule | null = null;
  private _frameBindGroupLayout: GPUBindGroupLayout | null = null;
  private _textureBindGroupLayout: GPUBindGroupLayout | null = null;
  private _pipelineLayout: GPUPipelineLayout | null = null;

  private readonly _pipelines     = new Map<string, GPURenderPipeline>();
  private readonly _texBindGroups = new Map<Texture, GPUBindGroup>();

  private _projBuffer:          GPUBuffer | null = null;
  private _nodeBuffer:          GPUBuffer | null = null;
  private _vertexBuffer:        GPUBuffer | null = null;
  private _indexBuffer:         GPUBuffer | null = null;
  private _nodeBufferCapacity   = 0;
  private _vertexBufferCapacity = 0;
  private _indexBufferCapacity  = 0;

  private _frameBindGroup:     GPUBindGroup | null = null;
  private _frameBindGroupDirty = true;

  // CPU-side working arrays
  private _vertexCapacity = initialVertexCapacity;
  private _indexCapacity  = initialIndexCapacity;
  private _vertexData:   ArrayBuffer  = new ArrayBuffer(initialVertexCapacity * vertexStrideBytes);
  private _float32View:  Float32Array = new Float32Array(this._vertexData);
  private _indexData:    Uint16Array  = new Uint16Array(initialIndexCapacity);
  private _projData:     Float32Array = new Float32Array(projectionBytes / 4);

  private _nodeDataArray: Float32Array = new Float32Array(initialNodeCapacity * nodeFloats);
  private _nodeCapacity = initialNodeCapacity;
  private _nodeCount    = 0;

  private readonly _pendingQuads:  PendingQuad[]                   = [];
  private readonly _nodeIndexMap  = new Map<Text | BitmapText, number>();
  private readonly _textureKeyMap            = new Map<Texture, number>();
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
    const device  = this._device!;

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
      return (this._textureKeyMap.get(a.atlasTexture) ?? 0)
           - (this._textureKeyMap.get(b.atlasTexture) ?? 0);
    });

    // Upload projection (3 × vec4<f32> = column-major mat3x3)
    const m = backend.view.getTransform().toArray(false);
    this._projData[0]  = m[0]; this._projData[1]  = m[1]; this._projData[2]  = m[2]; this._projData[3]  = 0;
    this._projData[4]  = m[3]; this._projData[5]  = m[4]; this._projData[6]  = m[5]; this._projData[7]  = 0;
    this._projData[8]  = m[6]; this._projData[9]  = m[7]; this._projData[10] = m[8]; this._projData[11] = 0;
    device.queue.writeBuffer(this._projBuffer!, 0, this._projData.buffer, 0, projectionBytes);

    // Upload per-node style data (may reallocate the storage buffer)
    this._uploadNodeBuffer(device);

    // Build interleaved vertex/index data for all batches in one pass
    const quads = this._pendingQuads;
    const batches: BatchDraw[] = [];

    let totalV = 0, totalI = 0;
    for (const pq of quads) {
      totalV += pq.quads.quadCount * 4;
      totalI += pq.quads.indices.length;
    }
    this._ensureVertexCapacity(totalV);
    this._ensureIndexCapacity(totalI);

    let packedV = 0, packedI = 0, qi = 0;

    while (qi < quads.length) {
      const first     = quads[qi];
      const firstTextureKey = this._textureKeyMap.get(first.atlasTexture);

      let qj = qi + 1;
      while (qj < quads.length) {
        const pq = quads[qj];
        if (pq.shaderType !== first.shaderType ||
            this._textureKeyMap.get(pq.atlasTexture) !== firstTextureKey) break;
        qj++;
      }

      const batchFirstIndex = packedI;
      let batchIndexCount   = 0;

      for (let k = qi; k < qj; k++) {
        const { quads: batch, nodeIndex } = quads[k];
        const qVerts = batch.quadCount * 4;
        const { vertices, uvs, indices } = batch;

        for (let v = 0; v < qVerts; v++) {
          const w  = (packedV + v) * vertexStrideWords;
          const vp = v * 2;
          this._float32View[w + 0] = vertices[vp];
          this._float32View[w + 1] = vertices[vp + 1];
          this._float32View[w + 2] = uvs[vp];
          this._float32View[w + 3] = uvs[vp + 1];
          this._float32View[w + 4] = nodeIndex;
        }

        for (let x = 0; x < indices.length; x++) {
          this._indexData[packedI + x] = indices[x] + packedV;
        }

        packedV         += qVerts;
        packedI         += indices.length;
        batchIndexCount += indices.length;
      }

      batches.push({
        shaderType:   first.shaderType,
        atlasTexture: first.atlasTexture,
        firstIndex:   batchFirstIndex,
        indexCount:   batchIndexCount,
      });

      qi = qj;
    }

    // Upload vertex/index buffers (reallocate GPU side when needed)
    this._ensureGpuVertexBuffer(device, packedV);
    this._ensureGpuIndexBuffer(device, packedI);
    device.queue.writeBuffer(this._vertexBuffer!, 0, this._vertexData, 0, packedV * vertexStrideBytes);
    device.queue.writeBuffer(this._indexBuffer!,  0, this._indexData.buffer, 0, packedI * 2);

    const scissor        = backend.getScissorRect();
    const format         = backend.renderTargetFormat;
    const frameBindGroup = this._getFrameBindGroup(device);

    const encoder = device.createCommandEncoder({ label: 'WebGpuTextRenderer' });
    const pass    = encoder.beginRenderPass({
      colorAttachments: [backend.createColorAttachment()],
      label: 'WebGpuTextRenderer pass',
    });
    backend.stats.renderPasses++;

    if (scissor !== null) {
      pass.setScissorRect(scissor.x, scissor.y, scissor.width, scissor.height);
    }

    pass.setVertexBuffer(0, this._vertexBuffer);
    pass.setIndexBuffer(this._indexBuffer!, 'uint16');

    let lastShaderType: ShaderType | null = null;
    let lastTexture:    Texture    | null = null;

    for (const batch of batches) {
      if (batch.shaderType !== lastShaderType) {
        pass.setPipeline(this._getPipeline(batch.shaderType, format));
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

    pass.end();
    backend.submit(encoder.finish());

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
        const key = `${shaderType}:${format}`;
        if (this._pipelines.has(key)) continue;

        promises.push(
          device.createRenderPipelineAsync(this._buildPipelineDescriptor(shaderType, format))
            .then(pipeline => { this._pipelines.set(key, pipeline); }),
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

    this._projBuffer  = null;
    this._nodeBuffer  = null;
    this._vertexBuffer = null;
    this._indexBuffer  = null;
    this._nodeBufferCapacity   = 0;
    this._vertexBufferCapacity = 0;
    this._indexBufferCapacity  = 0;

    this._frameBindGroup      = null;
    this._frameBindGroupDirty = true;

    this._pipelines.clear();
    this._texBindGroups.clear();

    this._pipelineLayout         = null;
    this._textureBindGroupLayout = null;
    this._frameBindGroupLayout   = null;
    this._shaderModule           = null;
    this._device                 = null;

    this._resetFrameState();
  }

  // ── Collection ───────────────────────────────────────────────────────────

  private _collectText(node: Text): void {
    node.syncDirty();
    const { pageQuads, atlas } = node;
    if (pageQuads.length === 0 || atlas === null) return;

    const nodeIndex  = this._assignNodeIndex(node);
    const shaderType: ShaderType = node.colorGlyphs ? 'color' : 'sdf';
    const pages      = atlas.pages;

    for (const batch of pageQuads) {
      const page = pages[batch.pageIndex];
      if (page === undefined) continue;
      this._pendingQuads.push({ quads: batch, nodeIndex, shaderType, atlasTexture: page.texture });
    }
  }

  private _collectBitmapText(node: BitmapText): void {
    const { pageQuads, textures, msdf } = node;
    if (pageQuads.length === 0) return;

    const nodeIndex  = this._assignNodeIndex(node);
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
    const arr  = this._nodeDataArray;
    const base = ni * nodeFloats;
    const style = node.style;

    const m = node.getGlobalTransform().toArray(false);
    arr[base +  0] = m[0]; arr[base +  1] = m[1]; arr[base +  2] = m[2]; arr[base +  3] = m[6];
    arr[base +  4] = m[3]; arr[base +  5] = m[4]; arr[base +  6] = m[5]; arr[base +  7] = m[7];

    const fc = style.fillColor;
    arr[base +  8] = fc.r / 255; arr[base +  9] = fc.g / 255; arr[base + 10] = fc.b / 255; arr[base + 11] = fc.a;

    const oc = style.outlineColor;
    arr[base + 12] = oc.r / 255; arr[base + 13] = oc.g / 255; arr[base + 14] = oc.b / 255; arr[base + 15] = oc.a;

    const outlineMin = style.outlineWidth > 0 ? Math.max(0, 0.5 - style.outlineWidth) : 0.5;
    arr[base + 16] = outlineMin;
    arr[base + 17] = style.shadowAlpha;
    arr[base + 18] = Math.max(0.03, style.shadowBlur * 0.1);
    arr[base + 19] = style.gradientColors !== null ? 1 : 0;

    const sc = style.shadowColor;
    arr[base + 20] = sc.r / 255; arr[base + 21] = sc.g / 255; arr[base + 22] = sc.b / 255; arr[base + 23] = sc.a;

    arr[base + 24] = style.shadowOffsetX;
    arr[base + 25] = style.shadowOffsetY;
    arr[base + 26] = style.gradientAxis === 'vertical' ? 1 : 0;
    arr[base + 27] = 0;

    const gc = style.gradientColors;
    if (gc !== null) {
      arr[base + 28] = gc[0].r / 255; arr[base + 29] = gc[0].g / 255;
      arr[base + 30] = gc[0].b / 255; arr[base + 31] = gc[0].a;
      arr[base + 32] = gc[1].r / 255; arr[base + 33] = gc[1].g / 255;
      arr[base + 34] = gc[1].b / 255; arr[base + 35] = gc[1].a;
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
      this._nodeBufferCapacity  = newCap;
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
    const existing = this._texBindGroups.get(texture);
    if (existing !== undefined) return existing;

    const { view, sampler } = backend.getTextureBinding(texture);
    const group = device.createBindGroup({
      layout: this._textureBindGroupLayout!,
      entries: [
        { binding: 0, resource: view },
        { binding: 1, resource: sampler },
      ],
    });
    this._texBindGroups.set(texture, group);
    return group;
  }

  // ── Pipeline helpers ─────────────────────────────────────────────────────

  private _getPipeline(shaderType: ShaderType, format: GPUTextureFormat): GPURenderPipeline {
    const key      = `${shaderType}:${format}`;
    const existing = this._pipelines.get(key);
    if (existing) return existing;

    const pipeline = this._device!.createRenderPipeline(this._buildPipelineDescriptor(shaderType, format));
    this._pipelines.set(key, pipeline);
    return pipeline;
  }

  private _buildPipelineDescriptor(shaderType: ShaderType, format: GPUTextureFormat): GPURenderPipelineDescriptor {
    const fragEntry = shaderType === 'sdf'  ? 'fragmentSdf'
                    : shaderType === 'msdf' ? 'fragmentMsdf'
                    : 'fragmentColor';

    return {
      label: `WebGpuTextRenderer/${shaderType}`,
      layout: this._pipelineLayout!,
      vertex: {
        module: this._shaderModule!,
        entryPoint: 'vertexMain',
        buffers: [{
          arrayStride: vertexStrideBytes,
          stepMode: 'vertex',
          attributes: [
            { shaderLocation: 0, offset: 0,  format: 'float32x2' },
            { shaderLocation: 1, offset: 8,  format: 'float32x2' },
            { shaderLocation: 2, offset: 16, format: 'float32'   },
          ],
        }],
      },
      fragment: {
        module: this._shaderModule!,
        entryPoint: fragEntry,
        targets: [{
          format,
          blend: getWebGpuBlendState(BlendModes.Normal),
          writeMask: GPUColorWrite.ALL,
        }],
      },
      primitive: { topology: 'triangle-list' },
    };
  }

  // ── Capacity helpers ─────────────────────────────────────────────────────

  private _ensureVertexCapacity(vertexCount: number): void {
    if (vertexCount <= this._vertexCapacity) return;
    while (this._vertexCapacity < vertexCount) this._vertexCapacity *= 2;
    this._vertexData  = new ArrayBuffer(this._vertexCapacity * vertexStrideBytes);
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
}
