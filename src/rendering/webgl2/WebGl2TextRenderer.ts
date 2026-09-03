import type { RetainedGroupBundle } from '#rendering/plan/RetainedInstructionSet';
import type { OwnTransformRowPatcher } from '#rendering/plan/retainedTransformRowPatch';
import type { RenderNode } from '#rendering/RenderNode';
import { Shader } from '#rendering/shader/Shader';
import { composeTextAtlasFragmentGlsl, packTextNodeAtlasSlot, textAtlasTextureSlots, textNodeIndexMask } from '#rendering/text/atlasTextureSlots';
import { type BitmapText } from '#rendering/text/BitmapText';
import { packTextNodeData, packTextNodeTransform, textNodeDataFloats, textNodeDataTexels } from '#rendering/text/nodeDataPacker';
import type { TextPageQuads } from '#rendering/text/Text';
import { Text } from '#rendering/text/Text';
import { DataTexture } from '#rendering/texture/DataTexture';
import type { Texture } from '#rendering/texture/Texture';
import { BlendModes, BufferTypes, BufferUsage, IndexElementTypes, RenderingPrimitives, TextureFormat } from '#rendering/types';

import { AbstractWebGl2Renderer } from './AbstractWebGl2Renderer';
import { createWebGl2ShaderProgram } from './shaderProgram';
import textVertSource from './shaders/text.vert';
import textColorFragSource from './shaders/text-color.frag';
import textMsdfFragSource from './shaders/text-msdf.frag';
import textSdfFragSource from './shaders/text-sdf.frag';
import type { WebGl2Backend } from './WebGl2Backend';
import { uploadBufferRange, uploadBufferStore, WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import {
  type WebGl2RetainedBatchPayload,
  type WebGl2RetainedBatchReplayer,
  WebGl2RetainedGroupResources,
  type WebGl2RetainedNodeIndexRange,
  type WebGl2RetainedRendererReplayState,
} from './WebGl2RetainedGroupResources';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';

// ── Node data texture layout ─────────────────────────────────────────────────
//
// RGBA32F texture: width = nodeTexels, height = number of nodes this flush.
//
// Row index = nodeIndex (one row per node rendered this frame).
//
// Texel 0 : (a,  c,  0,  tx)  - mat3 column-major: col0 + translate.x
// Texel 1 : (b,  d,  0,  ty)  - mat3 column-major: col1 + translate.y
// Texel 2 : (r,  g,  b,  a )  - fillColor (linear 0-1)
// Texel 3 : (r,  g,  b,  a )  - outlineColor
// Texel 4 : (outlineMin, shadowAlpha, shadowBlur, gradientEnabled)
//             outlineMin = 0.5 → disabled; < 0.5 → enabled with that threshold
// Texel 5 : (r,  g,  b,  a )  - shadowColor
// Texel 6 : (shadowOffX_px, shadowOffY_px, gradientVertical, sdfRadius_logical)
// Texel 7 : (r,  g,  b,  a )  - gradientTop
// Texel 8 : (r,  g,  b,  a )  - gradientBottom
// Texel 9 : (minX, minY, w, h) - text block bounds (local space, for gradient UV)
//
// The shaders divide shadowOffset by u_pageSize (a per-batch uniform shared by
// compatible atlas textures) to convert px → UV space.

const nodeTexels = textNodeDataTexels;
const nodeFloats = textNodeDataFloats;

const identityGroupMat3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

// Per-vertex layout (20 bytes), mirrors WebGpuTextRenderer's vertex buffer exactly:
//   a_position : vec2  f32  (offset  0,  8 bytes)  ← LOCAL space
//   a_texcoord : vec2  f32  (offset  8,  8 bytes)
//   a_packedNodeSlot: uint u32 (offset 16, 4 bytes) ← 24-bit node row + 8-bit atlas slot
//
// The vertex shader reads the world transform live from the per-node data texture via
// texelFetch (same texture the fragment stage already reads style from), keyed by
// a_nodeIndex - no CPU-side transform baking. Gradient UV is likewise computed in the
// vertex shader from the local a_position and the bounds texel, not uploaded per vertex.
const vertexStrideBytes = 20;
const vertexStrideWords = vertexStrideBytes / 4; // 5 floats per vertex
const initialVertexCapacity = 256;
const initialIndexCapacity = 384;
const initialNodeCapacity = 32;
// One short line of text is already ~64 quads, so that floor made almost
// every real retained draw pay several doubling steps (a fresh GL buffer plus
// a CPU index fill each). 1024 quads is 24 KiB (uint32 indices) and covers
// normal text scenes in one allocation.
const initialRetainedQuadCapacity = 1024;

type ShaderType = 'sdf' | 'msdf' | 'color';

interface PendingQuad {
  readonly quads: TextPageQuads;
  readonly nodeIndex: number;
  readonly shaderType: ShaderType;
  readonly atlasTexture: Texture;
  readonly blendMode: BlendModes;
  readonly node: Text | BitmapText;
}

const sharesAtlasBatchClass = (a: PendingQuad, b: PendingQuad): boolean =>
  a.shaderType === b.shaderType &&
  a.blendMode === b.blendMode &&
  a.atlasTexture.width === b.atlasTexture.width &&
  a.atlasTexture.height === b.atlasTexture.height;

/**
 * Record-time payload carried from `flush()` to `_configureRetainedVao`/replay.
 * `drawables[i]` is the node owning dense row `i` of `nodeData` - the
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
 * per-node RGBA32F data texture (10 texels/row - transform AND style, read
 * live by both shader stages) and the drawable→row-index map the
 * own-transform-move O(1) patch uses. Grow-only across recaptures; released by
 * the bundle on destroy.
 */
class TextRetainedReplayState implements WebGl2RetainedRendererReplayState {
  public nodeDataTexture: DataTexture<TextureFormat.Rgba32F> | null = null;
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
 * - `text-sdf`   - R8 SDF atlas (Text, standard text)
 * - `text-msdf`  - RGB MSDF atlas (BitmapText)
 * - `text-color` - RGBA atlas (emoji / colour fonts)
 *
 * All per-node data (world transform + style) is packed into a single
 * `RGBA32F` data texture uploaded once per {@link flush}. Compatible atlas
 * textures rotate through an eight-slot table, so one `drawElements` call can
 * cover several fonts/pages.
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
   * Retained-batch opt-in: one compatible shader/page class containing at most
   * eight atlas textures records the vertex bytes into the group instance
   * buffer and replays them with `drawElements`. A flush that needs several
   * batches, or a second Text flush inside the same capture window, poisons the
   * capture instead - always safe, just a missed optimization.
   *
   * The world transform is read live in the vertex shader (mirrors
   * `WebGpuTextRenderer`), so an own-transform move is an O(1) GPU-side texel
   * patch via {@link _patchOwnTransformRow} - the same shape as Sprite/
   * NineSlice/Mesh's row patch, just against Text's own private node-data
   * texture instead of the shared `TransformBuffer`.
   * @internal
   */
  public readonly _supportsRetainedBatches = true;

  private readonly _sdfShader: Shader = new Shader(textVertSource, composeTextAtlasFragmentGlsl(textSdfFragSource));
  private readonly _msdfShader: Shader = new Shader(textVertSource, composeTextAtlasFragmentGlsl(textMsdfFragSource));
  private readonly _colorShader: Shader = new Shader(textVertSource, composeTextAtlasFragmentGlsl(textColorFragSource));

  private readonly _nodeDataUnitScratch = new Int32Array([textAtlasTextureSlots]);
  private readonly _floatScratch = new Float32Array(1);
  // Own-transform-move patch scratch: 2 texels (transform cols 0-1), mirrors
  // WebGpuTextRenderer's `_patchRowScratch`.
  private readonly _patchRowScratch = new Float32Array(8);

  private _vertexCapacity = initialVertexCapacity;
  private _indexCapacity = initialIndexCapacity;
  private _vertexData: ArrayBuffer = new ArrayBuffer(initialVertexCapacity * vertexStrideBytes);
  private _float32View: Float32Array = new Float32Array(this._vertexData);
  private _uint32View: Uint32Array = new Uint32Array(this._vertexData);
  private _indexData: Uint32Array = new Uint32Array(initialIndexCapacity);

  // Retained-batch state: the renderer-owned, grow-only quad-index buffer (the
  // standard `0,1,2, 0,2,3` glyph pattern shared by every recorded batch) and
  // which capture windows have already recorded a Text batch
  // (nesting-safe - one entry per capture-open call).
  private _retainedQuadIndexBuffer: WebGl2RenderBuffer | null = null;
  private _retainedQuadCapacity = 0;
  private readonly _retainedNodeDataUnitScratch = new Int32Array([textAtlasTextureSlots]);
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
    this._pinAtlasSamplerUnits();

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
      .addIndex(indexBuffer, IndexElementTypes.UnsignedInt)
      .addAttribute(vertexBuffer, this._sdfShader.getAttribute('a_position'), gl.FLOAT, false, vertexStrideBytes, 0)
      .addAttribute(vertexBuffer, this._sdfShader.getAttribute('a_texcoord'), gl.FLOAT, false, vertexStrideBytes, 8)
      .addAttribute(vertexBuffer, this._sdfShader.getAttribute('a_packedNodeSlot'), gl.UNSIGNED_INT, false, vertexStrideBytes, 16, true);

    vao.connect(this._createVaoRuntime(gl, vaoHandle));

    const nodeDataTexture = this._createNodeDataTexture(backend, initialNodeCapacity);

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
    // Before the layout pass, not after: this is what a node with no explicit
    // `pixelRatio` inherits, and the pass it drives is the one that resolves
    // which atlas the node rasterizes into.
    node._setSurfacePixelRatio(this.getBackend().surfacePixelRatio);
    node.syncDirty();
    const { pageQuads, atlas } = node;
    if (pageQuads.length === 0 || atlas === null) return;

    const nodeIndex = this._assignNodeIndex(node);
    const shaderType: ShaderType = node.colorGlyphs ? 'color' : 'sdf';
    const pages = atlas.pages;
    const blendMode = node.blendMode;

    for (const batch of pageQuads) {
      const page = pages[batch.pageIndex];
      if (page === undefined) continue;
      this._pendingQuads.push({ quads: batch, nodeIndex, shaderType, atlasTexture: page.texture, blendMode, node });
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
      this._pendingQuads.push({ quads: batch, nodeIndex, shaderType, atlasTexture: tex, blendMode, node });
    }
  }

  private _assignNodeIndex(node: Text | BitmapText): number {
    const existing = this._nodeIndexMap.get(node);
    if (existing !== undefined) return existing;

    const idx = this._nodeCount++;

    if (idx > textNodeIndexMask) {
      throw new Error(`WebGl2TextRenderer: node index ${idx} exceeds the 24-bit packed vertex limit.`);
    }
    this._nodeIndexMap.set(node, idx);
    this._ensureNodeCapacity(idx + 1);
    this._packNodeData(idx, node);
    return idx;
  }

  // ── Node data packing ────────────────────────────────────────────────────
  // The 10-texel/40-float layout is packed by the shared, backend-free
  // `packTextNodeData` (mirrors `WebGpuTextRenderer`, byte for byte) - see
  // `textNodeDataPacker.ts` for the texel-by-texel layout comment.

  private _packNodeData(ni: number, node: Text | BitmapText): void {
    packTextNodeData(this._nodeDataArray, ni * nodeFloats, node);
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
      c.nodeDataTexture = this._createNodeDataTexture(this.getBackend(), cap);
      c.nodeDataCapacity = cap;
    }

    // Route both the unit switch and the bind through the backend so its
    // texture-unit and per-unit bind caches stay in sync. A raw gl.activeTexture
    // here would leave the unit cache reading unit 0, and the atlas
    // bindTexture(_, 0) in _drawBatches would then skip its own switch and bind
    // the atlas to unit 1 - leaving the SDF sampler (unit 0) empty and the text
    // invisible whenever it is the first draw of a frame. A raw gl.bindTexture
    // would likewise leave the bind cache claiming unit 1 still holds whatever
    // managed texture was there last.
    this.getBackend().setActiveTextureUnit(textAtlasTextureSlots).bindRawTexture(c.nodeDataTexture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0, // x, y offset
      nodeTexels,
      nodeCount,
      gl.RGBA,
      gl.FLOAT,
      // `(srcData, srcOffset)`: the rectangle above already fixes how much is
      // read (`nodeTexels * nodeCount` texels from element 0), so narrowing the
      // array with a `subarray()` view per flush would only allocate.
      this._nodeDataArray,
      0,
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

    // Sort by blend mode, then compatible atlas class, then texture identity.
    // Up to eight textures of one class share a draw through the shader slot
    // table; a differing blend mode breaks the batch because one draw call
    // carries one blend state.
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

    // Iterate contiguous groups and draw each as one call
    const quads = this._pendingQuads;
    let i = 0;

    // Retained recording: a recordable Text flush is a
    // SINGLE compatible multi-atlas batch. A second batch this flush (or a
    // second flush into the same capture window) poisons the capture below.
    const capturing = backend._isRetainedCapturing;
    let batchCount = 0;
    let recWordCount = 0;
    let recQuadCount = 0;
    let recAtlases: readonly Texture[] = [];
    let recShaderType: ShaderType = 'sdf';
    let recBlendMode: BlendModes = BlendModes.Normal;

    while (i < quads.length) {
      // In-bounds: `i` < `quads.length` per the loop guard.
      const first = quads[i]!;
      const atlasSlots = new Map<Texture, number>();
      const atlasTextures: Texture[] = [];
      let j = i;

      while (j < quads.length) {
        // In-bounds: `j` < `quads.length` per the loop guard.
        const pq = quads[j]!;
        if (!sharesAtlasBatchClass(first, pq)) break;

        if (!atlasSlots.has(pq.atlasTexture)) {
          if (atlasTextures.length === textAtlasTextureSlots) break;
          atlasSlots.set(pq.atlasTexture, atlasTextures.length);
          atlasTextures.push(pq.atlasTexture);
        }

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
        const { quads: batch, nodeIndex, atlasTexture } = quads[k]!;
        const atlasSlot = atlasSlots.get(atlasTexture)!;
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
          this._uint32View[w + 4] = packTextNodeAtlasSlot(nodeIndex, atlasSlot);
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
        recAtlases = atlasTextures;
        recShaderType = first.shaderType;
        recBlendMode = first.blendMode;
      }

      batchCount++;

      c.vertexBuffer.upload(this._float32View, 0, totalVerts * vertexStrideWords);
      c.indexBuffer.upload(this._indexData, 0, totalIndices);

      backend.bindVertexArrayObject(c.vao);
      for (let slot = 0; slot < atlasTextures.length; slot++) {
        backend.bindTexture(atlasTextures[slot]!, slot);
      }

      if (shader.uniforms.has('u_projection')) {
        shader.getUniform('u_projection').setValue(view.getTransform().toArray(false));
      }
      if (shader.uniforms.has('u_group')) {
        const groupTransform = backend.renderGroupTransform;

        shader.getUniform('u_group').setValue(groupTransform !== null ? groupTransform.toArray(false) : identityGroupMat3);
      }
      backend._stageViewportUniform(shader);
      if (shader.uniforms.has('u_nodeData')) {
        shader.getUniform('u_nodeData').setValue(this._nodeDataUnitScratch);
      }
      if (shader.uniforms.has('u_pageSize')) {
        this._floatScratch[0] = first.atlasTexture.width;
        shader.getUniform('u_pageSize').setValue(this._floatScratch);
      }

      // Stage uniforms before sync(): setValue() only marks a uniform dirty for the
      // NEXT sync() upload. Syncing first left the initial flush of each text shaderType
      // drawing with a stale zero u_projection - invisible on a genuine single-shot
      // render (screenshot / RenderTexture pre-bake / first frame), self-healing only
      // from the second frame on. Matches WebGl2SpriteRenderer, which sets its uniforms
      // first and calls sync() last.
      shader.sync();

      // The GL blend state is global and shared with every other renderer, so
      // this batch establishes its own at the draw.
      backend.setBlendMode(first.blendMode);
      c.vao.draw(totalIndices, 0, RenderingPrimitives.Triangles);
      backend.stats.batches++;
      backend.stats.drawCalls++;

      i = j;
    }

    if (capturing) {
      this._tryRecordRetainedBatch(backend, batchCount, recWordCount, recQuadCount, recShaderType, recBlendMode, recAtlases);
    }
  }

  /**
   * Record this flush's ONE glyph-quad batch for retained replay, or poison the
   * capture when it is not a clean single batch (multiple distinct
   * incompatible shader/page classes or more than eight atlas textures this
   * flush, or a second Text flush into the same capture window). Poisoning is
   * always safe: the group falls
   * back to entry replay for that frame, never wrong pixels.
   */
  private _tryRecordRetainedBatch(
    backend: WebGl2Backend,
    batchCount: number,
    wordCount: number,
    quadCount: number,
    shaderType: ShaderType,
    blendMode: BlendModes,
    atlases: readonly Texture[],
  ): void {
    const bundle = backend._currentRetainedCaptureBundle;

    if (bundle === null) {
      return;
    }

    if (batchCount !== 1 || atlases.length === 0 || this._recordedCaptures.has(bundle)) {
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

    // The batch's instances are its glyph quads; its NODES are the text runs the
    // quads came from - a single run contributes one to `submittedNodes` however
    // many glyphs it draws, on this tier as on the live one.
    backend._recordRetainedBatch(
      this,
      this._uint32View.subarray(0, wordCount),
      quadCount,
      blendMode,
      atlases,
      atlases.length,
      null,
      rendererData,
      this._nodeCount,
    );

    this._recordedCaptures.add(bundle);
  }

  private _shaderFor(type: ShaderType): Shader {
    if (type === 'sdf') return this._sdfShader;
    if (type === 'msdf') return this._msdfShader;
    return this._colorShader;
  }

  private _pinAtlasSamplerUnits(): void {
    const samplerUnit = new Int32Array(1);

    for (const shader of [this._sdfShader, this._msdfShader, this._colorShader]) {
      for (let slot = 0; slot < textAtlasTextureSlots; slot++) {
        samplerUnit[0] = slot;
        shader.getUniform(`u_texture${slot}`).setValue(samplerUnit);
      }

      shader.sync();
    }
  }

  // ── Retained-batch record/replay ──────────────────────────────────────────
  // Text's per-vertex "node index" addresses its OWN dense, per-flush node
  // data texture (transform + style, packed by `_packNodeData`), never a row
  // in the shared `TransformBuffer` - mirrors `WebGpuTextRenderer` exactly. So,
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
      .addIndex(indexBuffer, IndexElementTypes.UnsignedInt)
      .addAttribute(buffer, shader.getAttribute('a_position'), gl.FLOAT, false, vertexStrideBytes, base + 0)
      .addAttribute(buffer, shader.getAttribute('a_texcoord'), gl.FLOAT, false, vertexStrideBytes, base + 8)
      .addAttribute(buffer, shader.getAttribute('a_packedNodeSlot'), gl.UNSIGNED_INT, false, vertexStrideBytes, base + 16, true);

    const state = this._getTextReplayState(payload.bundle);

    state.shaderType = data.shaderType;
    state.quadCount = data.quadCount;

    if (state.nodeDataFloats === null || state.nodeDataCapacity < data.nodeCount) {
      let capacity = Math.max(state.nodeDataCapacity, initialNodeCapacity);

      while (capacity < data.nodeCount) capacity *= 2;

      state.nodeDataTexture?.destroy();
      state.nodeDataFloats = new Float32Array(capacity * nodeFloats);
      state.nodeDataTexture = new DataTexture({ width: nodeTexels, height: capacity, format: TextureFormat.Rgba32F, data: state.nodeDataFloats });
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
   * Replay one recorded Text batch: all STATE is resolved live - blend, the
   * `u_projection`/`u_group` uniforms from the live view + group matrix (the
   * camera-pan / group-move win), the atlas texture - and only DATA is cached:
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
    // Text's recording stages one or more atlas page textures in packed-slot
    // order. All belong to the same shader/page-size class.
    const atlas = payload.textures[0] as Texture;
    const view = backend.view;

    backend.setBlendMode(payload.blendMode);
    for (let slot = 0; slot < payload.textures.length; slot++) {
      backend.bindTexture(payload.textures[slot]!, slot);
    }
    backend.bindTexture(state.nodeDataTexture, textAtlasTextureSlots);

    if (shader.uniforms.has('u_projection')) {
      shader.getUniform('u_projection').setValue(view.getTransform().toArray(false));
    }
    if (shader.uniforms.has('u_group')) {
      const groupTransform = backend.renderGroupTransform;

      shader.getUniform('u_group').setValue(groupTransform !== null ? groupTransform.toArray(false) : identityGroupMat3);
    }
    backend._stageViewportUniform(shader);
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
   * `getGlobalTransform()` (group-local - {@link RetainedContainer} composes up
   * to the enclosing boundary only) and upload just that row's 2-texel range in
   * the persisted node-data texture - mirrors `WebGpuTextRenderer`'s buffer
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

    const row = this._patchRowScratch;

    packTextNodeTransform(row, 0, drawable);

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

    let capacity = Math.max(this._retainedQuadCapacity, initialRetainedQuadCapacity);

    while (capacity < quadCount) capacity *= 2;

    const indices = new Uint32Array(capacity * 6);

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
    this._indexData = new Uint32Array(this._indexCapacity);
  }

  private _ensureNodeCapacity(nodeCount: number): void {
    if (nodeCount <= this._nodeCapacity) return;
    while (this._nodeCapacity < nodeCount) this._nodeCapacity *= 2;
    const next = new Float32Array(this._nodeCapacity * nodeFloats);
    next.set(this._nodeDataArray);
    this._nodeDataArray = next;
  }

  // ── WebGL helpers ─────────────────────────────────────────────────────────

  /**
   * Allocate the renderer-private node-data texture. Both binds go through the
   * backend so its per-unit bind cache keeps mirroring GL - the allocation
   * happens on whatever unit is active, and leaving that unit's cached handle
   * stale would let a later managed bind on the same unit be skipped.
   */
  private _createNodeDataTexture(backend: WebGl2Backend, capacity: number): WebGLTexture {
    const gl = backend.context;
    const tex = gl.createTexture();
    if (tex === null) throw new Error('WebGl2TextRenderer: could not create node data texture.');
    backend.bindRawTexture(tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, nodeTexels, capacity, 0, gl.RGBA, gl.FLOAT, null);
    backend.bindRawTexture(null);
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
        gl.bindBuffer(buf.type, handle);
        if (state && state.dataByteLength >= buf.uploadByteLength) {
          uploadBufferRange(gl, buf, offset);
          state.dataByteLength = buf.uploadByteLength;
        } else {
          uploadBufferStore(gl, buf);
          buffers.set(buf, { handle, dataByteLength: buf.uploadByteLength });
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
            if (attribute.integer) {
              gl.vertexAttribIPointer(attribute.location, attribute.size, attribute.type, attribute.stride, attribute.start);
            } else {
              gl.vertexAttribPointer(attribute.location, attribute.size, attribute.type, attribute.normalized, attribute.stride, attribute.start);
            }
            gl.enableVertexAttribArray(attribute.location);
            gl.vertexAttribDivisor(attribute.location, attribute.divisor);
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
          gl.drawElements(type, size, vao.indexType, start);
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
