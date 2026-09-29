import { Color } from '#core/Color';
import { BackendTargetPass } from '#rendering/BackendTargetPass';
import { colorShaderSourcesGlsl, spliceGlslPrologue } from '#rendering/colorShaderSources';
import { defaultGlslVertexSource } from '#rendering/filters/ShaderFilter';
import type { ResolvedOutputTransformOptions } from '#rendering/OutputTransform';
import type { RenderBackend } from '#rendering/RenderBackend';
import outputFragmentModule from '#rendering/shaders/output.frag';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { BlendModes, BufferTypes, BufferUsage, RenderingPrimitives } from '#rendering/types';

import { createWebGl2ShaderProgram } from './shaderProgram';
import type { WebGl2Backend } from './WebGl2Backend';
import { WebGl2RenderBuffer } from './WebGl2RenderBuffer';
import { WebGl2Shader } from './WebGl2Shader';
import { WebGl2VertexArrayObject } from './WebGl2VertexArrayObject';

/** Interleaved position+UV fullscreen TRIANGLE_STRIP quad - see `WebGl2ShaderFilterPass`. */
const quadVertices = new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]);
const vertexStride = 16;

const fragmentSource = spliceGlslPrologue(outputFragmentModule, colorShaderSourcesGlsl);

interface WebGl2Connection {
  readonly vertexBuffer: WebGl2RenderBuffer;
  readonly vao: WebGl2VertexArrayObject;
}

/**
 * The WebGL2 half of the engine's {@link OutputTransform}: compiles `output.frag`
 * once, then samples the linear-PMA working target and writes the sRGB-encoded
 * result straight to the canvas (or an explicit `target`, for
 * `RenderingContext.readImageData`), clearing to transparent first so every
 * texel is overwritten rather than composited against whatever it held. The
 * shader does its own sRGB encode into plain UNORM bytes, so it needs no
 * per-format pipeline the way the WebGPU counterpart does.
 * @internal
 */
export class WebGl2OutputPass {
  private readonly _pass: BackendTargetPass = new BackendTargetPass(backend => this._run(backend));
  private readonly _slotScratch = new Int32Array(1);
  private readonly _scalarScratch = new Float32Array(1);
  private readonly _matteScratch = new Float32Array(4);

  private _shader: WebGl2Shader | null = null;
  private _connection: WebGl2Connection | null = null;

  private _source: RenderTexture | null = null;
  private _exposureScale = 1;
  private _toneMapping = 0;
  private _transparentCanvas = 0;

  /**
   * Sample `source` through the output transform and write the result to
   * `target`, or the canvas when omitted (the ordinary per-frame path).
   */
  public present(
    backend: RenderBackend,
    source: RenderTexture,
    options: ResolvedOutputTransformOptions,
    transparent: boolean,
    matte: Color,
    target?: RenderTexture,
    straightAlpha = false,
  ): void {
    this._ensureConnected(backend as WebGl2Backend);

    this._source = source;
    this._exposureScale = 2 ** options.exposure;
    this._toneMapping = options.toneMapping === 'reinhard' ? 1 : 0;
    this._transparentCanvas = 0;

    if (transparent) {
      this._transparentCanvas = straightAlpha ? 2 : 1;
    }

    matte.writeLinear(this._matteScratch);

    backend.execute(this._pass.retarget(target ?? null, target !== undefined ? target.view : null, Color.transparentBlack));
  }

  public destroy(): void {
    if (this._connection !== null) {
      this._connection.vertexBuffer.destroy();
      this._connection.vao.destroy();
      this._connection = null;
    }

    this._shader?.destroy();
    this._shader = null;
  }

  private _run(backend: RenderBackend): void {
    const gl2 = backend as WebGl2Backend;
    const shader = this._shader!;

    gl2.bindShader(shader);
    gl2.bindTexture(this._source, 0);

    this._slotScratch[0] = 0;
    shader.getUniform('uSource').setValue(this._slotScratch);

    this._scalarScratch[0] = this._exposureScale;
    shader.getUniform('uExposureScale').setValue(this._scalarScratch);

    this._scalarScratch[0] = this._toneMapping;
    shader.getUniform('uToneMapping').setValue(this._scalarScratch);

    this._scalarScratch[0] = this._transparentCanvas;
    shader.getUniform('uTransparentCanvas').setValue(this._scalarScratch);

    shader.getUniform('uMatteColor').setValue(this._matteScratch.subarray(0, 3));

    shader.sync();

    // This backend keeps blending permanently enabled (`null` falls back to
    // the ordinary source-over factors, not disabled blending) - the pass
    // clears the target to transparent black instead, so source-over onto it
    // reduces to an exact overwrite of the fullscreen quad below.
    gl2.setBlendMode(BlendModes.Normal);

    const connection = this._connection!;

    gl2.bindVertexArrayObject(connection.vao);
    connection.vao.draw(4, 0, RenderingPrimitives.TriangleStrip);
    gl2.stats.drawCalls++;
  }

  private _ensureConnected(backend: WebGl2Backend): void {
    if (this._shader !== null) {
      return;
    }

    const gl = backend.context;
    const shader = new WebGl2Shader(defaultGlslVertexSource, fragmentSource);

    shader.connect(createWebGl2ShaderProgram(gl));
    shader.sync();

    const vaoHandle = gl.createVertexArray();

    if (vaoHandle === null) {
      throw new Error('WebGl2OutputPass: could not create vertex array object.');
    }

    const vertexBuffer = this._createVertexBuffer(gl);
    const vao = this._createVao(gl, vaoHandle, shader, vertexBuffer);

    this._shader = shader;
    this._connection = { vertexBuffer, vao };
  }

  private _createVertexBuffer(gl: WebGL2RenderingContext): WebGl2RenderBuffer {
    const handle = gl.createBuffer();

    if (handle === null) {
      throw new Error('WebGl2OutputPass: could not create vertex buffer.');
    }

    const buffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, quadVertices, BufferUsage.StaticDraw);

    buffer.connect({
      bind: (): void => {
        gl.bindBuffer(gl.ARRAY_BUFFER, handle);
      },
      upload: (buf, _offset): void => {
        gl.bindBuffer(gl.ARRAY_BUFFER, handle);
        gl.bufferData(gl.ARRAY_BUFFER, buf.data, buf.usage);
      },
      destroy: (buf): void => {
        gl.deleteBuffer(handle);
        buf.disconnect();
      },
    });

    return buffer;
  }

  private _createVao(
    gl: WebGL2RenderingContext,
    vaoHandle: WebGLVertexArrayObject,
    shader: WebGl2Shader,
    vertexBuffer: WebGl2RenderBuffer,
  ): WebGl2VertexArrayObject {
    let appliedVersion = -1;

    const vao = new WebGl2VertexArrayObject(RenderingPrimitives.TriangleStrip);

    if (shader.attributes.has('aPosition')) {
      vao.addAttribute(vertexBuffer, shader.getAttribute('aPosition'), gl.FLOAT, false, vertexStride, 0);
    }

    if (shader.attributes.has('aUv')) {
      vao.addAttribute(vertexBuffer, shader.getAttribute('aUv'), gl.FLOAT, false, vertexStride, 8);
    }

    vao.connect({
      bind: (v): void => {
        gl.bindVertexArray(vaoHandle);

        if (appliedVersion !== v.version) {
          let lastBuffer: WebGl2RenderBuffer | null = null;

          for (const attribute of v.attributes) {
            const buf = attribute.buffer;

            if (lastBuffer !== buf) {
              buf.bind();
              lastBuffer = buf;
            }

            gl.vertexAttribPointer(attribute.location, attribute.size, attribute.type, attribute.normalized, attribute.stride, attribute.start);
            gl.enableVertexAttribArray(attribute.location);
          }

          appliedVersion = v.version;
        }
      },
      unbind: (): void => {
        gl.bindVertexArray(null);
      },
      draw: (_v, size, start, type): void => {
        gl.drawArrays(type, start, size);
      },
      destroy: (v): void => {
        gl.deleteVertexArray(vaoHandle);
        v.disconnect();
      },
    });

    return vao;
  }
}
