import { type BitmapText } from '@/rendering/text/BitmapText';
import type { TextPageQuads } from '@/rendering/text/Text';
import { Text } from '@/rendering/text/Text';
import type { Texture } from '@/rendering/texture/Texture';
import { BufferTypes, BufferUsage, RenderingPrimitives } from '@/rendering/types';

import { Shader } from '../shader/Shader';
import { AbstractWebGl2Renderer } from './AbstractWebGl2Renderer';
import textVertSource from './glsl/text.vert';
import textColorFragSource from './glsl/text-color.frag';
import textMsdfFragSource from './glsl/text-msdf.frag';
import textSdfFragSource from './glsl/text-sdf.frag';
import type { WebGl2Backend } from './WebGl2Backend';
import { WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
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

// Per-vertex layout (20 bytes — same stride as WebGl2MeshRenderer):
//   a_position : vec2  f32  (offset  0,  8 bytes)
//   a_texcoord : vec2  f32  (offset  8,  8 bytes)
//   a_nodeIndex: float f32  (offset 16,  4 bytes)  ← was a_color u8x4 in mesh.vert
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
export class WebGl2TextRenderer extends AbstractWebGl2Renderer<Text | BitmapText> {
  private readonly _sdfShader: Shader = new Shader(textVertSource, textSdfFragSource);
  private readonly _msdfShader: Shader = new Shader(textVertSource, textMsdfFragSource);
  private readonly _colorShader: Shader = new Shader(textVertSource, textColorFragSource);

  private readonly _textureUnitScratch = new Int32Array([0]);
  private readonly _nodeDataUnitScratch = new Int32Array([1]);
  private readonly _floatScratch = new Float32Array(1);

  private _vertexCapacity = initialVertexCapacity;
  private _indexCapacity = initialIndexCapacity;
  private _vertexData: ArrayBuffer = new ArrayBuffer(initialVertexCapacity * vertexStrideBytes);
  private _float32View: Float32Array = new Float32Array(this._vertexData);
  private _indexData: Uint16Array = new Uint16Array(initialIndexCapacity);

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
    );
    const vertexBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this._vertexData, BufferUsage.DynamicDraw).connect(
      this._createBufferRuntime(gl, buffers),
    );

    const vaoHandle = gl.createVertexArray();
    if (vaoHandle === null) throw new Error('WebGl2TextRenderer: could not create VAO.');

    const vao = new WebGl2VertexArrayObject()
      .addIndex(indexBuffer)
      .addAttribute(vertexBuffer, this._sdfShader.getAttribute('a_position'), gl.FLOAT, false, vertexStrideBytes, 0)
      .addAttribute(vertexBuffer, this._sdfShader.getAttribute('a_texcoord'), gl.FLOAT, false, vertexStrideBytes, 8)
      .addAttribute(vertexBuffer, this._sdfShader.getAttribute('a_nodeIndex'), gl.FLOAT, false, vertexStrideBytes, 16)
      .connect(this._createVaoRuntime(gl, vaoHandle));

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

  // ── Node data packing ────────────────────────────────────────────────────

  private _packNodeData(ni: number, node: Text | BitmapText): void {
    const arr = this._nodeDataArray;
    const base = ni * nodeFloats;
    const style = node.style;

    // Transform (texels 0-1)
    const m = node.getGlobalTransform().toArray(false); // col-major: [a,c,0, b,d,0, tx,ty,1]
    arr[base + 0] = m[0]; // a
    arr[base + 1] = m[1]; // c
    arr[base + 2] = m[2]; // 0
    arr[base + 3] = m[6]; // tx
    arr[base + 4] = m[3]; // b
    arr[base + 5] = m[4]; // d
    arr[base + 6] = m[5]; // 0
    arr[base + 7] = m[7]; // ty

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

    gl.activeTexture(gl.TEXTURE1);
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

    while (i < quads.length) {
      const first = quads[i];
      const firstTextureKey = this._textureKeyMap.get(first.atlasTexture);

      let j = i + 1;
      while (j < quads.length) {
        const pq = quads[j];
        if (pq.shaderType !== first.shaderType || this._textureKeyMap.get(pq.atlasTexture) !== firstTextureKey) break;
        j++;
      }

      const shader = this._shaderFor(first.shaderType);

      // Build vertex + index data for quads[i..j)
      let totalVerts = 0;
      let totalIndices = 0;
      for (let k = i; k < j; k++) {
        totalVerts += quads[k].quads.quadCount * 4;
        totalIndices += quads[k].quads.indices.length;
      }

      this._ensureVertexCapacity(totalVerts);
      this._ensureIndexCapacity(totalIndices);

      let vOffset = 0; // next vertex slot in _float32View
      let iOffset = 0; // next index slot in _indexData
      let baseV = 0; // vertex base for current quad group (for index rewriting)

      for (let k = i; k < j; k++) {
        const { quads: batch, nodeIndex } = quads[k];
        const qVerts = batch.quadCount * 4;
        const { vertices, uvs, indices } = batch;

        for (let v = 0; v < qVerts; v++) {
          const w = (vOffset + v) * vertexStrideWords;
          const vp = v * 2;
          this._float32View[w + 0] = vertices[vp];
          this._float32View[w + 1] = vertices[vp + 1];
          this._float32View[w + 2] = uvs[vp];
          this._float32View[w + 3] = uvs[vp + 1];
          this._float32View[w + 4] = nodeIndex;
        }

        for (let x = 0; x < indices.length; x++) {
          this._indexData[iOffset + x] = indices[x] + baseV;
        }

        vOffset += qVerts;
        iOffset += indices.length;
        baseV += qVerts;
      }

      c.vertexBuffer.upload(this._float32View.subarray(0, totalVerts * vertexStrideWords));
      c.indexBuffer.upload(this._indexData.subarray(0, totalIndices));

      shader.sync();
      backend.bindVertexArrayObject(c.vao);
      backend.bindTexture(first.atlasTexture, 0);

      if (shader.uniforms.has('u_projection')) {
        shader.getUniform('u_projection').setValue(view.getTransform().toArray(false));
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

      c.vao.draw(totalIndices, 0, RenderingPrimitives.Triangles);
      backend.stats.batches++;
      backend.stats.drawCalls++;

      i = j;
    }
  }

  private _shaderFor(type: ShaderType): Shader {
    if (type === 'sdf') return this._sdfShader;
    if (type === 'msdf') return this._msdfShader;
    return this._colorShader;
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
