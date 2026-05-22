import { BitmapText } from '@/rendering/text/BitmapText';
import { DynamicText, SDF_RADIUS } from '@/rendering/text/DynamicText';
import type { TextPageQuads } from '@/rendering/text/DynamicText';
import { BufferTypes, BufferUsage, RenderingPrimitives } from '@/rendering/types';

import { Shader } from '../shader/Shader';
import type { Texture } from '../texture/Texture';
import { AbstractWebGl2Renderer } from './AbstractWebGl2Renderer';
import meshVertSource from './glsl/mesh.vert';
import textColorFragSource from './glsl/text-color.frag';
import textMsdfFragSource from './glsl/text-msdf.frag';
import textSdfFragSource from './glsl/text-sdf.frag';
import type { WebGl2Backend } from './WebGl2Backend';
import { WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import { createWebGl2ShaderProgram } from './WebGl2ShaderProgram';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';

// Per-vertex layout (20 bytes) — matches the Mesh renderer layout:
//   position: vec2 f32 (offset  0,  8 bytes)
//   texcoord: vec2 f32 (offset  8,  8 bytes)
//   color:    u8x4 norm (offset 16, 4 bytes) — unused for text but required by the shared vert
const vertexStrideBytes = 20;
const vertexStrideWords = vertexStrideBytes / 4;
const initialVertexCapacity = 256;
const initialIndexCapacity = 384;
const defaultVertexColor = 0xffffffff;

interface TextRendererConnection {
  readonly gl: WebGL2RenderingContext;
  readonly buffers: Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number }>;
  readonly vertexBuffer: WebGl2RenderBuffer;
  readonly indexBuffer: WebGl2RenderBuffer;
  readonly vao: WebGl2VertexArrayObject;
}

/**
 * WebGL2 renderer for {@link DynamicText} and {@link BitmapText} nodes.
 *
 * Uses three specialized fragment shaders:
 * - `text-sdf`   — R8 SDF atlas (DynamicText, standard text)
 * - `text-msdf`  — RGB MSDF atlas (BitmapText)
 * - `text-color` — RGBA atlas (emoji / colour fonts)
 *
 * Per-node draw calls are issued immediately (no instanced batching yet).
 * The geometry (vertices + UVs) is copied into a shared dynamic buffer
 * to avoid per-glyph GPU allocation.
 */
export class WebGl2TextRenderer extends AbstractWebGl2Renderer<DynamicText | BitmapText> {
  private readonly _sdfShader: Shader = new Shader(meshVertSource, textSdfFragSource);
  private readonly _msdfShader: Shader = new Shader(meshVertSource, textMsdfFragSource);
  private readonly _colorShader: Shader = new Shader(meshVertSource, textColorFragSource);

  private readonly _tintScratch = new Float32Array(4);
  private readonly _vec4Scratch = new Float32Array(4);
  private readonly _vec2Scratch = new Float32Array(2);
  private readonly _floatScratch = new Float32Array(1);
  private readonly _textureUnitScratch = new Int32Array([0]);

  private _vertexCapacity = initialVertexCapacity;
  private _indexCapacity = initialIndexCapacity;
  private _vertexData: ArrayBuffer = new ArrayBuffer(initialVertexCapacity * vertexStrideBytes);
  private _float32View: Float32Array = new Float32Array(this._vertexData);
  private _uint32View: Uint32Array = new Uint32Array(this._vertexData);
  private _indexData: Uint16Array = new Uint16Array(initialIndexCapacity);

  private _connection: TextRendererConnection | null = null;

  public render(node: DynamicText | BitmapText): void {
    const connection = this._connection;
    if (!connection) throw new Error('WebGl2TextRenderer is not connected to a backend.');

    if (node instanceof DynamicText) {
      this._renderDynamicText(node, connection);
    } else {
      this._renderBitmapText(node, connection);
    }
  }

  public flush(): void {
    // Text draws are immediate per-node; nothing to batch.
  }

  public destroy(): void {
    this.disconnect();
    this._sdfShader.destroy();
    this._msdfShader.destroy();
    this._colorShader.destroy();
  }

  protected onConnect(backend: WebGl2Backend): void {
    const gl = backend.context;
    const vaoHandle = gl.createVertexArray();
    if (vaoHandle === null) throw new Error('WebGl2TextRenderer: could not create VAO.');

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

    const vao = new WebGl2VertexArrayObject()
      .addIndex(indexBuffer)
      .addAttribute(vertexBuffer, this._sdfShader.getAttribute('a_position'), gl.FLOAT, false, vertexStrideBytes, 0)
      .addAttribute(vertexBuffer, this._sdfShader.getAttribute('a_texcoord'), gl.FLOAT, false, vertexStrideBytes, 8)
      .addAttribute(vertexBuffer, this._sdfShader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, vertexStrideBytes, 16)
      .connect(this._createVaoRuntime(gl, vaoHandle));

    this._connection = { gl, buffers, vertexBuffer, indexBuffer, vao };
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

    this._connection = null;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _renderDynamicText(node: DynamicText, c: TextRendererConnection): void {
    const { pageQuads, atlas, style } = node;
    if (pageQuads.length === 0 || atlas === null) return;

    const backend = this.getBackend();
    const view = backend.view;
    const shader = node.colorGlyphs ? this._colorShader : this._sdfShader;
    const pages = atlas.pages;

    for (const batch of pageQuads) {
      const page = pages[batch.pageIndex];
      if (page === undefined) continue;

      this._uploadQuads(batch, c);

      shader.sync();
      backend.bindVertexArrayObject(c.vao);
      backend.bindTexture(page.texture, 0);

      if (shader.uniforms.has('u_projection')) {
        shader.getUniform('u_projection').setValue(view.getTransform().toArray(false));
      }
      if (shader.uniforms.has('u_translation')) {
        shader.getUniform('u_translation').setValue(node.getGlobalTransform().toArray(false));
      }
      if (shader.uniforms.has('u_texture')) {
        shader.getUniform('u_texture').setValue(this._textureUnitScratch);
      }

      if (!node.colorGlyphs) {
        this._bindSdfUniforms(shader, node);
      } else {
        this._bindTintUniform(shader, style);
      }

      c.vao.draw(batch.indices.length, 0, RenderingPrimitives.Triangles);
      backend.stats.batches++;
      backend.stats.drawCalls++;
    }
  }

  private _renderBitmapText(node: BitmapText, c: TextRendererConnection): void {
    const { pageQuads, textures, msdf } = node;
    if (pageQuads.length === 0) return;

    const backend = this.getBackend();
    const view = backend.view;
    const shader = msdf ? this._msdfShader : this._colorShader;

    for (const batch of pageQuads) {
      const tex = textures[batch.pageIndex];
      if (tex === undefined) continue;

      this._uploadQuads(batch, c);

      shader.sync();
      backend.bindVertexArrayObject(c.vao);
      backend.bindTexture(tex, 0);

      if (shader.uniforms.has('u_projection')) {
        shader.getUniform('u_projection').setValue(view.getTransform().toArray(false));
      }
      if (shader.uniforms.has('u_translation')) {
        shader.getUniform('u_translation').setValue(node.getGlobalTransform().toArray(false));
      }
      if (shader.uniforms.has('u_texture')) {
        shader.getUniform('u_texture').setValue(this._textureUnitScratch);
      }

      if (msdf) {
        this._bindMsdfUniforms(shader, node);
      } else {
        this._bindTintUniform(shader, node.style);
      }

      c.vao.draw(batch.indices.length, 0, RenderingPrimitives.Triangles);
      backend.stats.batches++;
      backend.stats.drawCalls++;
    }
  }

  private _uploadQuads(batch: TextPageQuads, c: TextRendererConnection): void {
    const vertexCount = batch.quadCount * 4;
    const indexCount = batch.indices.length;

    this._ensureVertexCapacity(vertexCount);
    this._ensureIndexCapacity(indexCount);

    const { vertices, uvs } = batch;

    for (let i = 0; i < vertexCount; i++) {
      const w = i * vertexStrideWords;
      const p = i * 2;
      this._float32View[w + 0] = vertices[p];
      this._float32View[w + 1] = vertices[p + 1];
      this._float32View[w + 2] = uvs[p];
      this._float32View[w + 3] = uvs[p + 1];
      this._uint32View[w + 4] = defaultVertexColor;
    }

    this._indexData.set(batch.indices, 0);

    c.vertexBuffer.upload(this._float32View.subarray(0, vertexCount * vertexStrideWords));
    c.indexBuffer.upload(this._indexData.subarray(0, indexCount));
  }

  private _bindSdfUniforms(shader: Shader, node: DynamicText): void {
    const style = node.style;
    const atlas = node.atlas;
    const pageSize = atlas?.pages[0]?.texture.width ?? 1024;

    // Fill color
    if (shader.uniforms.has('u_tint')) {
      const c = style.fillColor;
      this._tintScratch[0] = c.r / 255;
      this._tintScratch[1] = c.g / 255;
      this._tintScratch[2] = c.b / 255;
      this._tintScratch[3] = c.a;
      shader.getUniform('u_tint').setValue(this._tintScratch);
    }

    // Outline
    if (shader.uniforms.has('u_outlineColor')) {
      const oc = style.outlineColor;
      this._vec4Scratch[0] = oc.r / 255;
      this._vec4Scratch[1] = oc.g / 255;
      this._vec4Scratch[2] = oc.b / 255;
      this._vec4Scratch[3] = oc.a;
      shader.getUniform('u_outlineColor').setValue(this._vec4Scratch);
    }
    if (shader.uniforms.has('u_outlineWidth')) {
      this._floatScratch[0] = style.outlineWidth;
      shader.getUniform('u_outlineWidth').setValue(this._floatScratch);
    }

    // Shadow
    if (shader.uniforms.has('u_shadowColor')) {
      const sc = style.shadowColor;
      this._vec4Scratch[0] = sc.r / 255;
      this._vec4Scratch[1] = sc.g / 255;
      this._vec4Scratch[2] = sc.b / 255;
      this._vec4Scratch[3] = sc.a;
      shader.getUniform('u_shadowColor').setValue(this._vec4Scratch);
    }
    if (shader.uniforms.has('u_shadowOffset')) {
      this._vec2Scratch[0] = style.shadowOffsetX / pageSize;
      this._vec2Scratch[1] = style.shadowOffsetY / pageSize;
      shader.getUniform('u_shadowOffset').setValue(this._vec2Scratch);
    }
    if (shader.uniforms.has('u_shadowAlpha')) {
      this._floatScratch[0] = style.shadowAlpha;
      shader.getUniform('u_shadowAlpha').setValue(this._floatScratch);
    }

    // Softness — derived from shadow blur, minimum 0.03 for smooth edges
    if (shader.uniforms.has('u_softness')) {
      this._floatScratch[0] = Math.max(0.03, style.shadowBlur * 0.1);
      shader.getUniform('u_softness').setValue(this._floatScratch);
    }

    // Gradient
    if (shader.uniforms.has('u_gradientEnabled')) {
      const gc = style.gradientColors;
      this._floatScratch[0] = gc !== null ? 1.0 : 0.0;
      shader.getUniform('u_gradientEnabled').setValue(this._floatScratch);

      if (gc !== null) {
        if (shader.uniforms.has('u_gradientTop')) {
          const top = gc[0];
          this._vec4Scratch[0] = top.r / 255;
          this._vec4Scratch[1] = top.g / 255;
          this._vec4Scratch[2] = top.b / 255;
          this._vec4Scratch[3] = top.a;
          shader.getUniform('u_gradientTop').setValue(this._vec4Scratch);
        }
        if (shader.uniforms.has('u_gradientBottom')) {
          const bot = gc[1];
          this._vec4Scratch[0] = bot.r / 255;
          this._vec4Scratch[1] = bot.g / 255;
          this._vec4Scratch[2] = bot.b / 255;
          this._vec4Scratch[3] = bot.a;
          shader.getUniform('u_gradientBottom').setValue(this._vec4Scratch);
        }
        if (shader.uniforms.has('u_gradientVertical')) {
          this._floatScratch[0] = style.gradientAxis === 'vertical' ? 1.0 : 0.0;
          shader.getUniform('u_gradientVertical').setValue(this._floatScratch);
        }
      }
    }
  }

  private _bindMsdfUniforms(shader: Shader, node: BitmapText): void {
    const style = node.style;

    this._bindTintUniform(shader, style);

    if (shader.uniforms.has('u_outlineColor')) {
      const oc = style.outlineColor;
      this._vec4Scratch[0] = oc.r / 255;
      this._vec4Scratch[1] = oc.g / 255;
      this._vec4Scratch[2] = oc.b / 255;
      this._vec4Scratch[3] = oc.a;
      shader.getUniform('u_outlineColor').setValue(this._vec4Scratch);
    }
    if (shader.uniforms.has('u_outlineMin')) {
      // outlineMin < 0.5 enables outline; 0.5 = disabled
      this._floatScratch[0] = style.outlineWidth > 0 ? Math.max(0, 0.5 - style.outlineWidth) : 0.5;
      shader.getUniform('u_outlineMin').setValue(this._floatScratch);
    }

    // Shadow
    if (shader.uniforms.has('u_shadowColor')) {
      const sc = style.shadowColor;
      this._vec4Scratch[0] = sc.r / 255;
      this._vec4Scratch[1] = sc.g / 255;
      this._vec4Scratch[2] = sc.b / 255;
      this._vec4Scratch[3] = sc.a;
      shader.getUniform('u_shadowColor').setValue(this._vec4Scratch);
    }
    if (shader.uniforms.has('u_shadowOffset')) {
      // MSDF atlases have no fixed page size — use a 512px heuristic that
      // matches typical offline-generated atlas sizes. Use u_shadowOffset
      // in world-space pixel units divided by atlas size to get UV offset.
      const atlasSize = 512;
      this._vec2Scratch[0] = style.shadowOffsetX / atlasSize;
      this._vec2Scratch[1] = style.shadowOffsetY / atlasSize;
      shader.getUniform('u_shadowOffset').setValue(this._vec2Scratch);
    }
    if (shader.uniforms.has('u_shadowAlpha')) {
      this._floatScratch[0] = style.shadowAlpha;
      shader.getUniform('u_shadowAlpha').setValue(this._floatScratch);
    }

    if (shader.uniforms.has('u_softness')) {
      this._floatScratch[0] = Math.max(0.03, style.shadowBlur * 0.1);
      shader.getUniform('u_softness').setValue(this._floatScratch);
    }
  }

  private _bindTintUniform(shader: Shader, style: { fillColor: { r: number; g: number; b: number; a: number } }): void {
    if (shader.uniforms.has('u_tint')) {
      const c = style.fillColor;
      this._tintScratch[0] = c.r / 255;
      this._tintScratch[1] = c.g / 255;
      this._tintScratch[2] = c.b / 255;
      this._tintScratch[3] = c.a;
      shader.getUniform('u_tint').setValue(this._tintScratch);
    }
  }

  // ── Buffer helpers ────────────────────────────────────────────────────────

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

  private _createBufferRuntime(
    gl: WebGL2RenderingContext,
    buffers: TextRendererConnection['buffers'],
  ): WebGl2RenderBufferRuntime {
    const handle = gl.createBuffer();
    if (handle === null) throw new Error('WebGl2TextRenderer: could not create buffer.');

    return {
      bind: (buf): void => { gl.bindBuffer(buf.type, handle); },
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
      unbind: (): void => { gl.bindVertexArray(null); },
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
