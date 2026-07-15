import type { RetainedGroupBundle } from '#rendering/plan/RetainedInstructionSet';
import type { RenderNode } from '#rendering/RenderNode';
import type { OwnTransformRowPatcher } from '#rendering/RetainedContainer';
import { Shader } from '#rendering/shader/Shader';
import { type BitmapText } from '#rendering/text/BitmapText';
import type { TextPageQuads } from '#rendering/text/Text';
import { Text } from '#rendering/text/Text';
import { DataTexture } from '#rendering/texture/DataTexture';
import type { Texture } from '#rendering/texture/Texture';
import { BlendModes, BufferTypes, BufferUsage, RenderingPrimitives } from '#rendering/types';

import { AbstractWebGl2Renderer } from './AbstractWebGl2Renderer';
import textVertSource from './glsl/text.vert';
import textColorFragSource from './glsl/text-color.frag';
import textMsdfFragSource from './glsl/text-msdf.frag';
import textSdfFragSource from './glsl/text-sdf.frag';
import type { WebGl2Backend } from './WebGl2Backend';
import { WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import {
  type WebGl2RetainedBatchPayload,
  type WebGl2RetainedBatchReplayer,
  WebGl2RetainedGroupResources,
  type WebGl2RetainedNodeIndexRange,
  type WebGl2RetainedRendererReplayState,
} from './WebGl2RetainedGroupResources';
import { createWebGl2ShaderProgram } from './WebGl2ShaderProgram';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';

// ── Node data texture layout ─────────────────────────────────────────────────
//
// RGBA32F texture: width = nodeTexels, height = number of nodes this flush.
//
// Row index = nodeIndex (one row per node rendered this frame).
//
// Texel 0 : (a,  c,  0,  tx)  — mat3 column-major: col0 + translate.x
// Texel 1 : (b,  d,  0,  ty)  — mat3 column-major: col1 + translate.y
// Texel 2 : (r,  g,  b,  a )  — fillColor (linear 0-1)
// Texel 3 : (r,  g,  b,  a )  — outlineColor
// Texel 4 : (outlineMin, shadowAlpha, softness, gradientEnabled)
//             outlineMin = 0.5 → disabled; < 0.5 → enabled with that threshold
// Texel 5 : (r,  g,  b,  a )  — shadowColor
// Texel 6 : (shadowOffX_px, shadowOffY_px, gradientVertical, 0)
// Texel 7 : (r,  g,  b,  a )  — gradientTop
// Texel 8 : (r,  g,  b,  a )  — gradientBottom
// Texel 9 : (minX, minY, w, h) — text block bounds (local space, for gradient UV)
//
// The shaders divide shadowOffset by u_pageSize (a per-batch uniform = atlas texture width)
// to convert px → UV space.

const nodeTexels = 10;
const nodeFloats = nodeTexels * 4; // 40 floats per node

const identityGroupMat3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

// Per-vertex layout (20 bytes), mirrors WebGpuTextRenderer's vertex buffer exactly:
//   a_position : vec2  f32  (offset  0,  8 bytes)  ← LOCAL space
//   a_texcoord : vec2  f32  (offset  8,  8 bytes)
//   a_nodeIndex: float f32  (offset 16,  4 bytes)  ← row into the data texture (transform + style)
//
// The vertex shader reads the world transform live from the per-node data texture via
// texelFetch (same texture the fragment stage already reads style from), keyed by
// a_nodeIndex — no CPU-side transform baking. Gradient UV is likewise computed in the
// vertex shader from the local a_position and the bounds texel, not uploaded per vertex.
const vertexStrideBytes = 20;
const vertexStrideWords = vertexStrideBytes / 4; // 5 floats per vertex
const initialVertexCapacity = 256;
const initialIndexCapacity = 384;
const initialNodeCapacity = 32;

type ShaderType = 'sdf' | 'msdf' | 'color';

interface PendingQuad {
  readonly quads: TextPageQuads;
  readonly nodeIndex: number;
  readonly shaderType: ShaderType;
  readonly atlasTexture: Texture;
  readonly node: Text | BitmapText;
}

/**
 * Record-time payload carried from `flush()` to `_configureRetainedVao`/replay.
 * `drawables[i]` is the node owning dense row `i` of `nodeData` — the
 * own-transform-move O(1) patch looks a node up here to find its row.
 */
interface TextRetainedRendererData {
  readonly nodeData: Float32Array;
  readonly nodeCount: number;
  readonly drawables: ReadonlyArray<Text | BitmapText>;
  readonly quadCount: number;
  readonly shaderType: ShaderType;
}

/**
 * Group-owned WebGL2 replay state for one recorded Text batch: the persistent
 * per-node RGBA32F data texture (10 texels/row — transform AND style, read
 * live by both shader stages) and the drawable→row-index map the
 * own-transform-move O(1) patch uses. Grow-only across recaptures; released by
 * the bundle on destroy.
 */
class TextRetainedReplayState implements WebGl2RetainedRendererReplayState {
  public nodeDataTexture: DataTexture<'rgba32f'> | null = null;
  public nodeDataFloats: Float32Array | null = null;
  public nodeDataCapacity = 0;
  public quadCount = 0;
  public shaderType: ShaderType = 'sdf';
  public readonly nodeIndexByDrawable = new Map<Text | BitmapText, number>();

  public destroy(): void {
    this.nodeDataTexture?.destroy();
    this.nodeDataTexture = null;
    this.nodeDataFloats = null;
    this.nodeDataCapacity = 0;
    this.nodeIndexByDrawable.clear();
  }
}

interface TextRendererConnection {
  readonly gl: WebGL2RenderingContext;
  readonly buffers: Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number }>;
  readonly vertexBuffer: WebGl2RenderBuffer;
  readonly indexBuffer: WebGl2RenderBuffer;
  readonly vao: WebGl2VertexArrayObject;
  nodeDataTexture: WebGLTexture;
  nodeDataCapacity: number;
}

/**
 * WebGL2 renderer for {@link Text} and {@link BitmapText} nodes.
 *
 * Uses three specialised fragment shaders:
 * - `text-sdf`   — R8 SDF atlas (Text, standard text)
 * - `text-msdf`  — RGB MSDF atlas (BitmapText)
 * - `text-color` — RGBA atlas (emoji / colour fonts)
 *
 * All per-node data (world transform + style) is packed into a single
 * `RGBA32F` data texture uploaded once per {@link flush}.  Nodes sharing the
 * same shader type and atlas page are drawn in a single `drawElements` call.
 */
export class WebGl2TextRenderer extends AbstractWebGl2Renderer<Text | BitmapText> implements WebGl2RetainedBatchReplayer, OwnTransformRowPatcher {
  /**
   * Text packs its world transform into its own per-node data texture and never
   * reads the shared {@link TransformBuffer}, so the render-group upload boundary
   * skips writing transform records for text draws.
   * @internal
   */
  public readonly _consumesSharedTransform = false;

  /**
   * Retained-batch opt-in (Track B extension): a flush whose glyph quads all
   * share one (shaderType, atlasTexture) — the overwhelmingly common case, one
   * font/atlas per flush — records the vertex bytes into the group instance
   * buffer and replays them with `drawElements`. A flush that spans multiple
   * (shaderType, atlasTexture) batches, or a second Text flush inside the same
   * capture window, poisons the capture instead — always safe, just a missed
   * optimization.
   *
   * The world transform is read live in the vertex shader (mirrors
   * `WebGpuTextRenderer`), so an own-transform move is an O(1) GPU-side texel
   * patch via {@link _patchOwnTransformRow} — the same shape as Sprite/
   * NineSlice/Mesh's row patch, just against Text's own private node-data
   * texture instead of the shared `TransformBuffer`.
   * @internal
   */
  public readonly _supportsRetainedBatches = true;

  private readonly _sdfShader: Shader = new Shader(textVertSource, textSdfFragSource);
  private readonly _msdfShader: Shader = new Shader(textVertSource, textMsdfFragSource);
  private readonly _colorShader: Shader = new Shader(textVertSource, textColorFragSource);

  private readonly _textureUnitScratch = new Int32Array([0]);
  private readonly _nodeDataUnitScratch = new Int32Array([1]);
  private readonly _floatScratch = new Float32Array(1);
  // Own-transform-move patch scratch: 2 texels (transform cols 0-1), mirrors
  // WebGpuTextRenderer's `_patchRowScratch`.
  private readonly _patchRowScratch = new Float32Array(8);

  private _vertexCapacity = initialVertexCapacity;
  private _indexCapacity = initialIndexCapacity;
  private _vertexData: ArrayBuffer = new ArrayBuffer(initialVertexCapacity * vertexStrideBytes);
  private _float32View: Float32Array = new Float32Array(this._vertexData);
  private _uint32View: Uint32Array = new Uint32Array(this._vertexData);
  private _indexData: Uint16Array = new Uint16Array(initialIndexCapacity);

  // Retained-batch state: the renderer-owned, grow-only quad-index buffer (the
  // standard `0,1,2, 0,2,3` glyph pattern shared by every recorded batch) and
  // which capture windows have already recorded a Text batch this session
  // (S3-D6 nesting-safe — one entry per capture-open call).
  private _retainedQuadIndexBuffer: WebGl2RenderBuffer | null = null;
  private _retainedQuadCapacity = 0;
  private readonly _retainedTextureUnit0Scratch = new Int32Array([0]);
  private readonly _retainedNodeDataUnitScratch = new Int32Array([1]);
  private readonly _recordedCaptures = new WeakSet<WebGl2RetainedGroupResources>();

  private _nodeDataArray: Float32Array = new Float32Array(initialNodeCapacity * nodeFloats);
  private _nodeCapacity = initialNodeCapacity;
  private _nodeCount = 0;

  private readonly _pendingQuads: PendingQuad[] = [];
  private readonly _nodeIndexMap = new Map<Text | BitmapText, number>();
  private readonly _textureKeyMap = new Map<Texture, number>();
  private _textureKeyCounter = 0;

  private _connection: TextRendererConnection | null = null;

  // ── Public API ──────────────────────────────────────────────────────────────

  public render(node: Text | BitmapText): void {
    if (!this._connection) throw new Error('WebGl2TextRenderer is not connected to a backend.');

    if (node instanceof Text) {
      this._collectText(node);
    } else {
      this._collectBitmapText(node);
    }
  }

  public flush(): void {
    const c = this._connection;
    if (!c || this._pendingQuads.length === 0) {
      this._resetFrameState();
      return;
    }

    this._uploadNodeData(c);
    this._drawBatches(c);
    this._resetFrameState();
  }

  public destroy(): void {
    this.disconnect();
    this._sdfShader.destroy();
    this._msdfShader.destroy();
    this._colorShader.destroy();
  }

  // ── Connection lifecycle ────────────────────────────────────────────────────

  protected onConnect(backend: WebGl2Backend): void {
    const gl = backend.context;
    const buffers: TextRendererConnection['buffers'] = new Map();

    this._sdfShader.connect(createWebGl2ShaderProgram(gl));
    this._msdfShader.connect(createWebGl2ShaderProgram(gl));
    this._colorShader.connect(createWebGl2ShaderProgram(gl));
    this._sdfShader.sync();
    this._msdfShader.sync();
    this._colorShader.sync();

    const indexBuffer = new WebGl2RenderBuffer(BufferTypes.ElementArrayBuffer, this._indexData, BufferUsage.DynamicDraw).connect(
      this._createBufferRuntime(gl, buffers),
      backend.accountant,
    );
    const vertexBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this._vertexData, BufferUsage.DynamicDraw).connect(
      this._createBufferRuntime(gl, buffers),
      backend.accountant,
    );

    const vaoHandle = gl.createVertexArray();
    if (vaoHandle === null) throw new Error('WebGl2TextRenderer: could not create VAO.');

    const vao = new WebGl2VertexArrayObject()
      .addIndex(indexBuffer)
      .addAttribute(vertexBuffer, this._sdfShader.getAttribute('a_position'), gl.FLOAT, false, vertexStrideBytes, 0)
      .addAttribute(vertexBuffer, this._sdfShader.getAttribute('a_texcoord'), gl.FLOAT, false, vertexStrideBytes, 8)
      .addAttribute(vertexBuffer, this._sdfShader.getAttribute('a_nodeIndex'), gl.FLOAT, false, vertexStrideBytes, 16);

    vao.connect(this._createVaoRuntime(gl, vaoHandle));

    const nodeDataTexture = this._createNodeDataTexture(gl, initialNodeCapacity);

    this._connection = { gl, buffers, vertexBuffer, indexBuffer, vao, nodeDataTexture, nodeDataCapacity: initialNodeCapacity };
  }

  protected onDisconnect(): void {
    const c = this._connection;
    if (!c) return;

    this._sdfShader.disconnect();
    this._msdfShader.disconnect();
    this._colorShader.disconnect();
    c.indexBuffer.destroy();
    c.vertexBuffer.destroy();
    c.vao.destroy();
    c.gl.deleteTexture(c.nodeDataTexture);
    this._retainedQuadIndexBuffer?.destroy();
    this._retainedQuadIndexBuffer = null;
    this._retainedQuadCapacity = 0;

    this._connection = null;
  }

  // ── Collection (called during scene traversal) ───────────────────────────

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
      this._pendingQuads.push({ quads: batch, nodeIndex, shaderType, atlasTexture: page.texture, node });
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
      this._pendingQuads.push({ quads: batch, nodeIndex, shaderType, atlasTexture: tex, node });
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

  // ── Node data packing ────────────────────────────────────────────────────

  private _packNodeData(ni: number, node: Text | BitmapText): void {
    const arr = this._nodeDataArray;
    const base = ni * nodeFloats;
    const style = node.style;

    // Transform (texels 0-1)
    // In-bounds: `toArray(false)` returns the fixed 9-element mat3 column-major array.
    const m = node.getGlobalTransform().toArray(false); // col-major: [a,c,0, b,d,0, tx,ty,1]
    arr[base + 0] = m[0]!; // a
    arr[base + 1] = m[1]!; // c
    arr[base + 2] = m[2]!; // 0
    arr[base + 3] = m[6]!; // tx
    arr[base + 4] = m[3]!; // b
    arr[base + 5] = m[4]!; // d
    arr[base + 6] = m[5]!; // 0
    arr[base + 7] = m[7]!; // ty

    // Fill color (texel 2)
    const fc = style.fillColor;
    arr[base + 8] = fc.r / 255;
    arr[base + 9] = fc.g / 255;
    arr[base + 10] = fc.b / 255;
    arr[base + 11] = fc.a;

    // Outline color (texel 3)
    const oc = style.outlineColor;
    arr[base + 12] = oc.r / 255;
    arr[base + 13] = oc.g / 255;
    arr[base + 14] = oc.b / 255;
    arr[base + 15] = oc.a;

    // Params (texel 4): outlineMin, shadowAlpha, softness, gradientEnabled
    // outlineMin = 0.5 → disabled; 0.5 - outlineWidth when enabled
    const outlineMin = style.outlineWidth > 0 ? Math.max(0, 0.5 - style.outlineWidth) : 0.5;
    arr[base + 16] = outlineMin;
    arr[base + 17] = style.shadowAlpha;
    arr[base + 18] = Math.max(0.03, style.shadowBlur * 0.1);
    arr[base + 19] = style.gradientColors !== null ? 1 : 0;

    // Shadow color (texel 5)
    const sc = style.shadowColor;
    arr[base + 20] = sc.r / 255;
    arr[base + 21] = sc.g / 255;
    arr[base + 22] = sc.b / 255;
    arr[base + 23] = sc.a;

    // Shadow offset + gradient axis (texel 6)
    // Store raw pixel offsets; shaders divide by u_pageSize to get UV offset.
    arr[base + 24] = style.shadowOffsetX;
    arr[base + 25] = style.shadowOffsetY;
    arr[base + 26] = style.gradientAxis === 'vertical' ? 1 : 0;
    arr[base + 27] = 0;

    // Gradient top (texel 7)
    const gc = style.gradientColors;
    if (gc !== null) {
      arr[base + 28] = gc[0].r / 255;
      arr[base + 29] = gc[0].g / 255;
      arr[base + 30] = gc[0].b / 255;
      arr[base + 31] = gc[0].a;
      // Gradient bottom (texel 8)
      arr[base + 32] = gc[1].r / 255;
      arr[base + 33] = gc[1].g / 255;
      arr[base + 34] = gc[1].b / 255;
      arr[base + 35] = gc[1].a;
    } else {
      arr[base + 28] = arr[base + 29] = arr[base + 30] = arr[base + 31] = 0;
      arr[base + 32] = arr[base + 33] = arr[base + 34] = arr[base + 35] = 0;
    }

    // Text block bounds (texel 9): (minX, minY, width, height)
    // Vertex shader uses these to compute normalized gradient UV.
    const bounds = node.textBounds;
    arr[base + 36] = 0;
    arr[base + 37] = 0;
    arr[base + 38] = bounds.width;
    arr[base + 39] = bounds.height;
  }

  // ── Flush ────────────────────────────────────────────────────────────────

  private _uploadNodeData(c: TextRendererConnection): void {
    const gl = c.gl;
    const nodeCount = this._nodeCount;

    if (nodeCount > c.nodeDataCapacity) {
      // Reallocate to next power of two at least as large as nodeCount
      let cap = c.nodeDataCapacity;
      while (cap < nodeCount) cap *= 2;
      gl.deleteTexture(c.nodeDataTexture);
      c.nodeDataTexture = this._createNodeDataTexture(gl, cap);
      c.nodeDataCapacity = cap;
    }

    // Route the unit switch through the backend so its texture-unit cache stays
    // in sync. A raw gl.activeTexture here would leave the cache reading unit 0,
    // and the atlas bindTexture(_, 0) in _drawBatches would then skip its own
    // switch and bind the atlas to unit 1 — leaving the SDF sampler (unit 0)
    // empty and the text invisible whenever it is the first draw of a frame.
    this.getBackend().setActiveTextureUnit(1);
    gl.bindTexture(gl.TEXTURE_2D, c.nodeDataTexture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0, // x, y offset
      nodeTexels,
      nodeCount,
      gl.RGBA,
      gl.FLOAT,
      this._nodeDataArray.subarray(0, nodeCount * nodeFloats),
    );
  }

  private _drawBatches(c: TextRendererConnection): void {
    const backend = this.getBackend();
    const view = backend.view;

    // Assign stable sort keys to atlas textures encountered this flush
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

    // Iterate contiguous groups and draw each as one call
    const quads = this._pendingQuads;
    let i = 0;

    // Retained recording (Track B extension): a recordable Text flush is a
    // SINGLE (shaderType, atlasTexture) batch. A second batch this flush (or a
    // second flush into the same capture window) poisons the capture below.
    const capturing = backend._isRetainedCapturing;
    let batchCount = 0;
    let recWordCount = 0;
    let recQuadCount = 0;
    let recAtlas: Texture | null = null;
    let recShaderType: ShaderType = 'sdf';

    while (i < quads.length) {
      // In-bounds: `i` < `quads.length` per the loop guard.
      const first = quads[i]!;
      const firstTextureKey = this._textureKeyMap.get(first.atlasTexture);

      let j = i + 1;
      while (j < quads.length) {
        // In-bounds: `j` < `quads.length` per the loop guard.
        const pq = quads[j]!;
        if (pq.shaderType !== first.shaderType || this._textureKeyMap.get(pq.atlasTexture) !== firstTextureKey) break;
        j++;
      }

      const shader = this._shaderFor(first.shaderType);

      // Build vertex + index data for quads[i..j)
      let totalVerts = 0;
      let totalIndices = 0;
      for (let k = i; k < j; k++) {
        // In-bounds: `k` ranges over `[i, j)` ⊆ `[0, quads.length)`.
        totalVerts += quads[k]!.quads.quadCount * 4;
        totalIndices += quads[k]!.quads.indices.length;
      }

      this._ensureVertexCapacity(totalVerts);
      this._ensureIndexCapacity(totalIndices);

      let vOffset = 0; // next vertex slot in _float32View
      let iOffset = 0; // next index slot in _indexData
      let baseV = 0; // vertex base for current quad group (for index rewriting)

      const recordThisBatch = capturing && batchCount === 0;

      for (let k = i; k < j; k++) {
        // In-bounds: `k` ranges over `[i, j)` ⊆ `[0, quads.length)`.
        const { quads: batch, nodeIndex } = quads[k]!;
        const qVerts = batch.quadCount * 4;
        const { vertices, uvs, indices } = batch;

        for (let v = 0; v < qVerts; v++) {
          const w = (vOffset + v) * vertexStrideWords;
          const vp = v * 2;
          // In-bounds: `vp + 1 < qVerts * 2`; `vertices`/`uvs` carry 2 floats per quad vertex.
          this._float32View[w + 0] = vertices[vp]!;
          this._float32View[w + 1] = vertices[vp + 1]!;
          this._float32View[w + 2] = uvs[vp]!;
          this._float32View[w + 3] = uvs[vp + 1]!;
          this._float32View[w + 4] = nodeIndex;
        }

        for (let x = 0; x < indices.length; x++) {
          // In-bounds: `x` < `indices.length`.
          this._indexData[iOffset + x] = indices[x]! + baseV;
        }

        vOffset += qVerts;
        iOffset += indices.length;
        baseV += qVerts;
      }

      if (recordThisBatch) {
        recWordCount = totalVerts * vertexStrideWords;
        recQuadCount = totalIndices / 6;
        recAtlas = first.atlasTexture;
        recShaderType = first.shaderType;
      }

      batchCount++;

      c.vertexBuffer.upload(this._float32View.subarray(0, totalVerts * vertexStrideWords));
      c.indexBuffer.upload(this._indexData.subarray(0, totalIndices));

      backend.bindVertexArrayObject(c.vao);
      backend.bindTexture(first.atlasTexture, 0);

      if (shader.uniforms.has('u_projection')) {
        shader.getUniform('u_projection').setValue(view.getTransform().toArray(false));
      }
      if (shader.uniforms.has('u_group')) {
        const groupTransform = backend.renderGroupTransform;

        shader.getUniform('u_group').setValue(groupTransform !== null ? groupTransform.toArray(false) : identityGroupMat3);
      }
      if (shader.uniforms.has('u_texture')) {
        shader.getUniform('u_texture').setValue(this._textureUnitScratch);
      }
      if (shader.uniforms.has('u_nodeData')) {
        shader.getUniform('u_nodeData').setValue(this._nodeDataUnitScratch);
      }
      if (shader.uniforms.has('u_pageSize')) {
        this._floatScratch[0] = first.atlasTexture.width;
        shader.getUniform('u_pageSize').setValue(this._floatScratch);
      }

      // Stage uniforms before sync(): setValue() only marks a uniform dirty for the
      // NEXT sync() upload. Syncing first left the initial flush of each text shaderType
      // drawing with a stale zero u_projection — invisible on a genuine single-shot
      // render (screenshot / RenderTexture pre-bake / first frame), self-healing only
      // from the second frame on. Matches WebGl2SpriteRenderer, which sets its uniforms
      // first and calls sync() last.
      shader.sync();

      c.vao.draw(totalIndices, 0, RenderingPrimitives.Triangles);
      backend.stats.batches++;
      backend.stats.drawCalls++;

      i = j;
    }

    if (capturing) {
      this._tryRecordRetainedBatch(backend, batchCount, recWordCount, recQuadCount, recShaderType, recAtlas);
    }
  }

  /**
   * Record this flush's ONE glyph-quad batch for retained replay, or poison the
   * capture when it is not a clean single batch (multiple distinct
   * (shaderType, atlasTexture) combinations this flush, or a second Text flush
   * into the same capture window). Poisoning is always safe: the group falls
   * back to entry replay for that frame, never wrong pixels.
   */
  private _tryRecordRetainedBatch(
    backend: WebGl2Backend,
    batchCount: number,
    wordCount: number,
    quadCount: number,
    shaderType: ShaderType,
    atlas: Texture | null,
  ): void {
    const bundle = backend._currentRetainedCaptureBundle;

    if (bundle === null) {
      return;
    }

    if (batchCount !== 1 || atlas === null || this._recordedCaptures.has(bundle)) {
      backend._poisonRetainedCaptures();

      return;
    }

    const rendererData: TextRetainedRendererData = {
      nodeData: this._nodeDataArray.slice(0, this._nodeCount * nodeFloats),
      nodeCount: this._nodeCount,
      drawables: [...this._nodeIndexMap.keys()],
      quadCount,
      shaderType,
    };

    backend._recordRetainedBatch(this, this._uint32View.subarray(0, wordCount), this._nodeCount, BlendModes.Normal, [atlas], 1, null, rendererData);

    this._recordedCaptures.add(bundle);
  }

  private _shaderFor(type: ShaderType): Shader {
    if (type === 'sdf') return this._sdfShader;
    if (type === 'msdf') return this._msdfShader;
    return this._colorShader;
  }

  // ── Retained-batch record/replay (Track B extension) ─────────────────────
  // Text's per-vertex "node index" addresses its OWN dense, per-flush node
  // data texture (transform + style, packed by `_packNodeData`), never a row
  // in the shared `TransformBuffer` — mirrors `WebGpuTextRenderer` exactly. So,
  // unlike every other retained renderer, its instance bytes carry no index
  // the generic bundle/scan/rebase machinery can meaningfully rebase; both
  // hooks below are true no-ops, and the renderer instead carries its own node
  // data end-to-end via `rendererData`, uploaded into a group-owned
  // `DataTexture` on first configure (`_configureRetainedVao`).

  /** @internal See {@link WebGl2RetainedBatchReplayer._scanRetainedNodeIndexRange}. */
  public _scanRetainedNodeIndexRange(_payload: WebGl2RetainedBatchPayload, _range: WebGl2RetainedNodeIndexRange): void {
    // Deliberately does not touch `_range`: Text's node index addresses its own
    // group-owned style texture, not a shared-transform row, and widening the
    // range here would corrupt the shared span the backend computes across every
    // OTHER (shared-transform-consuming) batch recorded into the same bundle.
  }

  /** @internal See {@link WebGl2RetainedBatchReplayer._rebaseRetainedNodeIndices}. */
  public _rebaseRetainedNodeIndices(_payload: WebGl2RetainedBatchPayload, _base: number): void {
    // Deliberately does not touch the bytes: Text's node indices are already
    // dense and group-local (0..nodeCount-1, matching the group-owned style
    // texture rows) and have no relationship to the shared-buffer rebase base.
  }

  /**
   * Point the batch VAO's per-vertex attributes at the bundle's persistent
   * instance buffer (based at the batch byte offset) and its element buffer at
   * the renderer-owned quad-index pattern, then (re)build the group-owned
   * per-node data texture (transform + style, read live by both shader stages)
   * and the drawable→row-index map the own-transform-move patch uses.
   * @internal
   */
  public _configureRetainedVao(payload: WebGl2RetainedBatchPayload): void {
    const backend = this.getBackend();
    const gl = backend.context;
    const buffer = payload.bundle.instanceBuffer;
    const vao = payload.vao;
    const data = payload.rendererData as TextRetainedRendererData | null;

    if (buffer === null || vao === null || data === null || !(payload.bundle instanceof WebGl2RetainedGroupResources)) {
      throw new Error('WebGl2TextRenderer: retained batch VAO configuration requires an uploaded bundle and recorded data.');
    }

    const shader = this._shaderFor(data.shaderType);
    const base = payload.byteOffset;
    const indexBuffer = this._ensureRetainedQuadIndexBuffer(data.quadCount);

    vao
      .addIndex(indexBuffer)
      .addAttribute(buffer, shader.getAttribute('a_position'), gl.FLOAT, false, vertexStrideBytes, base + 0)
      .addAttribute(buffer, shader.getAttribute('a_texcoord'), gl.FLOAT, false, vertexStrideBytes, base + 8)
      .addAttribute(buffer, shader.getAttribute('a_nodeIndex'), gl.FLOAT, false, vertexStrideBytes, base + 16);

    const state = this._getTextReplayState(payload.bundle);

    state.shaderType = data.shaderType;
    state.quadCount = data.quadCount;

    if (state.nodeDataFloats === null || state.nodeDataCapacity < data.nodeCount) {
      let capacity = Math.max(state.nodeDataCapacity, initialNodeCapacity);

      while (capacity < data.nodeCount) capacity *= 2;

      state.nodeDataTexture?.destroy();
      state.nodeDataFloats = new Float32Array(capacity * nodeFloats);
      state.nodeDataTexture = new DataTexture({ width: nodeTexels, height: capacity, format: 'rgba32f', data: state.nodeDataFloats });
      state.nodeDataCapacity = capacity;
    }

    state.nodeDataFloats.set(data.nodeData, 0);
    state.nodeDataTexture!.commitRect(0, 0, nodeTexels, Math.max(1, data.nodeCount));

    state.nodeIndexByDrawable.clear();

    for (let i = 0; i < data.drawables.length; i++) {
      state.nodeIndexByDrawable.set(data.drawables[i]!, i);
    }
  }

  /**
   * Replay one recorded Text batch: all STATE is resolved live — blend, the
   * `u_projection`/`u_group` uniforms from the live view + group matrix (the
   * camera-pan / group-move win), the atlas texture — and only DATA is cached:
   * the group instance bytes (bound through the per-batch VAO), the renderer's
   * static quad-index pattern, and the group-owned per-node style texture.
   * @internal
   */
  public _replayRetainedBatch(payload: WebGl2RetainedBatchPayload): void {
    const backend = this.getBackendOrNull();
    const vao = payload.vao;
    const data = payload.rendererData as TextRetainedRendererData | null;

    if (backend === null || vao === null || data === null || !(payload.bundle instanceof WebGl2RetainedGroupResources)) {
      return;
    }

    const state = payload.bundle.rendererReplayState;

    if (!(state instanceof TextRetainedReplayState) || state.nodeDataTexture === null) {
      return;
    }

    const shader = this._shaderFor(data.shaderType);
    // Text's recording always stages exactly one atlas page texture (single
    // batch); the payload's shared type is wider only because other renderers
    // can target a RenderTexture.
    const atlas = payload.textures[0] as Texture;
    const view = backend.view;

    backend.setBlendMode(payload.blendMode);
    backend.bindTexture(atlas, 0);
    backend.bindTexture(state.nodeDataTexture, 1);

    if (shader.uniforms.has('u_projection')) {
      shader.getUniform('u_projection').setValue(view.getTransform().toArray(false));
    }
    if (shader.uniforms.has('u_group')) {
      const groupTransform = backend.renderGroupTransform;

      shader.getUniform('u_group').setValue(groupTransform !== null ? groupTransform.toArray(false) : identityGroupMat3);
    }
    if (shader.uniforms.has('u_texture')) {
      shader.getUniform('u_texture').setValue(this._retainedTextureUnit0Scratch);
    }
    if (shader.uniforms.has('u_nodeData')) {
      shader.getUniform('u_nodeData').setValue(this._retainedNodeDataUnitScratch);
    }
    if (shader.uniforms.has('u_pageSize')) {
      this._floatScratch[0] = atlas.width;
      shader.getUniform('u_pageSize').setValue(this._floatScratch);
    }

    shader.sync();
    backend.bindVertexArrayObject(vao);
    vao.draw(state.quadCount * 6, 0, RenderingPrimitives.Triangles);
  }

  /**
   * Own-transform-move O(1) patch ({@link OwnTransformRowPatcher}): recompute
   * only the moved node's transform-texel pair (2 of its 10 texels) via
   * `getGlobalTransform()` (group-local — {@link RetainedContainer} composes up
   * to the enclosing boundary only) and upload just that row's 2-texel range in
   * the persisted node-data texture — mirrors `WebGpuTextRenderer`'s buffer
   * write exactly, just against a `DataTexture` instead of a storage buffer.
   * No glyph geometry is touched. `base` (the shared-buffer direct-draw base)
   * is irrelevant to Text's own dense local indexing and is unused. Returns
   * `false` (falls back to a full re-record) when `bundle` has no live Text
   * replay state or `node` was not part of the recorded batch.
   * @internal
   */
  public _patchOwnTransformRow(node: RenderNode, bundle: RetainedGroupBundle, _base: number): boolean {
    if (!(bundle instanceof WebGl2RetainedGroupResources)) {
      return false;
    }

    const state = bundle.rendererReplayState;

    if (!(state instanceof TextRetainedReplayState) || state.nodeDataFloats === null || state.nodeDataTexture === null) {
      return false;
    }

    const drawable = node as unknown as Text | BitmapText;
    const localIndex = state.nodeIndexByDrawable.get(drawable);

    if (localIndex === undefined) {
      return false;
    }

    // Column-major mat3 [a c 0 | b d 0 | tx ty 1] — indices 0..8 always valid.
    const m = drawable.getGlobalTransform().toArray(false);
    const row = this._patchRowScratch;

    row[0] = m[0]!; // a
    row[1] = m[1]!; // c
    row[2] = m[2]!; // 0
    row[3] = m[6]!; // tx
    row[4] = m[3]!; // b
    row[5] = m[4]!; // d
    row[6] = m[5]!; // 0
    row[7] = m[7]!; // ty

    state.nodeDataFloats.set(row, localIndex * nodeFloats);
    state.nodeDataTexture.commitRect(0, localIndex, 2, 1);

    return true;
  }

  private _getTextReplayState(bundle: WebGl2RetainedGroupResources): TextRetainedReplayState {
    const existing = bundle.rendererReplayState;
    const state = existing instanceof TextRetainedReplayState ? existing : new TextRetainedReplayState();

    if (existing !== state) {
      existing?.destroy();
      bundle.rendererReplayState = state;
    }

    return state;
  }

  private _ensureRetainedQuadIndexBuffer(quadCount: number): WebGl2RenderBuffer {
    const c = this._connection;

    if (c === null) {
      throw new Error('WebGl2TextRenderer: retained quad-index buffer requires a connected backend.');
    }

    if (this._retainedQuadIndexBuffer !== null && this._retainedQuadCapacity >= quadCount) {
      return this._retainedQuadIndexBuffer;
    }

    let capacity = Math.max(this._retainedQuadCapacity, 64);

    while (capacity < quadCount) capacity *= 2;

    const indices = new Uint16Array(capacity * 6);

    for (let q = 0; q < capacity; q++) {
      const baseV = q * 4;
      const o = q * 6;

      indices[o + 0] = baseV;
      indices[o + 1] = baseV + 1;
      indices[o + 2] = baseV + 2;
      indices[o + 3] = baseV;
      indices[o + 4] = baseV + 2;
      indices[o + 5] = baseV + 3;
    }

    if (this._retainedQuadIndexBuffer === null) {
      this._retainedQuadIndexBuffer = new WebGl2RenderBuffer(BufferTypes.ElementArrayBuffer, indices, BufferUsage.StaticDraw).connect(
        this._createBufferRuntime(c.gl, c.buffers),
        this.getBackend().accountant,
      );
    } else {
      this._retainedQuadIndexBuffer.upload(indices);
    }

    this._retainedQuadCapacity = capacity;

    return this._retainedQuadIndexBuffer;
  }

  private _resetFrameState(): void {
    this._pendingQuads.length = 0;
    this._nodeIndexMap.clear();
    this._textureKeyMap.clear();
    this._textureKeyCounter = 0;
    this._nodeCount = 0;
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
    this._indexData = new Uint16Array(this._indexCapacity);
  }

  private _ensureNodeCapacity(nodeCount: number): void {
    if (nodeCount <= this._nodeCapacity) return;
    while (this._nodeCapacity < nodeCount) this._nodeCapacity *= 2;
    const next = new Float32Array(this._nodeCapacity * nodeFloats);
    next.set(this._nodeDataArray);
    this._nodeDataArray = next;
  }

  // ── WebGL helpers ─────────────────────────────────────────────────────────

  private _createNodeDataTexture(gl: WebGL2RenderingContext, capacity: number): WebGLTexture {
    const tex = gl.createTexture();
    if (tex === null) throw new Error('WebGl2TextRenderer: could not create node data texture.');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, nodeTexels, capacity, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  private _createBufferRuntime(gl: WebGL2RenderingContext, buffers: TextRendererConnection['buffers']): WebGl2RenderBufferRuntime {
    const handle = gl.createBuffer();
    if (handle === null) throw new Error('WebGl2TextRenderer: could not create buffer.');

    return {
      bind: (buf): void => {
        gl.bindBuffer(buf.type, handle);
      },
      upload: (buf, offset): void => {
        const state = buffers.get(buf);
        const data = buf.data;
        gl.bindBuffer(buf.type, handle);
        if (state && state.dataByteLength >= data.byteLength) {
          gl.bufferSubData(buf.type, offset, data);
          state.dataByteLength = data.byteLength;
        } else {
          gl.bufferData(buf.type, data, buf.usage);
          buffers.set(buf, { handle, dataByteLength: data.byteLength });
        }
      },
      destroy: (buf): void => {
        gl.deleteBuffer(handle);
        buffers.delete(buf);
        buf.disconnect();
      },
    };
  }

  private _createVaoRuntime(gl: WebGL2RenderingContext, vaoHandle: WebGLVertexArrayObject): WebGl2VertexArrayObjectRuntime {
    let appliedVersion = -1;

    return {
      bind: (vao): void => {
        gl.bindVertexArray(vaoHandle);
        if (appliedVersion !== vao.version) {
          let lastBuffer: WebGl2RenderBuffer | null = null;
          for (const attribute of vao.attributes) {
            if (lastBuffer !== attribute.buffer) {
              attribute.buffer.bind();
              lastBuffer = attribute.buffer;
            }
            gl.vertexAttribPointer(attribute.location, attribute.size, attribute.type, attribute.normalized, attribute.stride, attribute.start);
            gl.enableVertexAttribArray(attribute.location);
          }
          if (vao.indexBuffer) vao.indexBuffer.bind();
          appliedVersion = vao.version;
        }
      },
      unbind: (): void => {
        gl.bindVertexArray(null);
      },
      draw: (vao, size, start, type): void => {
        if (vao.indexBuffer) {
          gl.drawElements(type, size, gl.UNSIGNED_SHORT, start);
        } else {
          gl.drawArrays(type, start, size);
        }
      },
      destroy: (vao): void => {
        gl.deleteVertexArray(vaoHandle);
        vao.disconnect();
      },
    };
  }
}
