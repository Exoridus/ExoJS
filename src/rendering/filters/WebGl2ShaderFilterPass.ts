import { Color } from '#core/Color';
import { BackendTargetPass } from '#rendering/BackendTargetPass';
import type { RenderBackend } from '#rendering/RenderBackend';
import { Shader } from '#rendering/shader/Shader';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { BufferTypes, BufferUsage, RenderingPrimitives } from '#rendering/types';
import { createWebGl2ShaderProgram } from '#rendering/webgl2/shaderProgram';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGl2RenderBuffer } from '#rendering/webgl2/WebGl2RenderBuffer';
import { WebGl2VertexArrayObject } from '#rendering/webgl2/WebGl2VertexArrayObject';

import type { ShaderFilterUniformValue } from './ShaderFilter';

/**
 * Interleaved position+UV data for a fullscreen TRIANGLE_STRIP quad.
 * Layout per vertex: [posX, posY, uvX, uvY]
 *
 * Vertices (clip-space positions, 0..1 UVs):
 *   0: bottom-left  (-1, -1, 0, 0)
 *   1: bottom-right ( 1, -1, 1, 0)
 *   2: top-left     (-1,  1, 0, 1)
 *   3: top-right    ( 1,  1, 1, 1)
 */
const quadVertices = new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]);

/** Bytes per vertex: 2 floats position + 2 floats UV = 16 bytes */
const vertexStride = 16;

/**
 * The `uOrientation` this backend binds. A WebGL2 render texture stores the
 * effect domain bottom-up, so `v` grows AGAINST the domain's y axis.
 *
 * Constant for the backend and shared by every pass: it is only ever read.
 */
const orientationValue = new Float32Array([-1]);

interface WebGl2Connection {
  readonly gl: WebGL2RenderingContext;
  readonly vertexBuffer: WebGl2RenderBuffer;
  readonly vao: WebGl2VertexArrayObject;
}

/**
 * The WebGL2 half of a {@link ShaderFilter}: compiles the GLSL pair, binds the
 * auto-bound and user uniforms, and draws the fullscreen quad.
 *
 * Not a {@link Filter} itself and not public - the filter owns it, decides when
 * it is built, and hands it the uniform record it keeps writing to, so a
 * `setUniform` call reaches this pass without copying anything.
 * @internal
 */
export class WebGl2ShaderFilterPass {
  /** One redirect pass, re-pointed per application - see {@link BackendTargetPass.retarget}. */
  private readonly _pass: BackendTargetPass = new BackendTargetPass(backend => this._run(backend));
  /** Reused upload buffers for the auto-bound uniforms, so a frame allocates none. */
  private readonly _slotScratch = new Int32Array(1);
  private readonly _resolutionScratch = new Float32Array(2);
  /** One reused buffer per non-texture user uniform - see {@link _marshalValue}. */
  private readonly _scratch = new Map<string, Float32Array>();

  private readonly _vertexSource: string;
  private readonly _fragmentSource: string;
  /** The filter's live uniform record, read on every draw. */
  private readonly _uniforms: Readonly<Record<string, ShaderFilterUniformValue>>;

  private _shader: Shader | null = null;
  private _connection: WebGl2Connection | null = null;
  /** The textures the running pass reads from and writes to, staged by {@link apply}. */
  private _passInput: RenderTexture | null = null;
  private _passOutput: RenderTexture | null = null;

  public constructor(vertexSource: string, fragmentSource: string, uniforms: Readonly<Record<string, ShaderFilterUniformValue>>) {
    this._vertexSource = vertexSource;
    this._fragmentSource = fragmentSource;
    this._uniforms = uniforms;
  }

  /**
   * Execute the GLSL shader pass: compile the program on first call, bind
   * uniforms, and render the input texture into `output`.
   */
  public apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture, _resolution = 1): void {
    const gl2Backend = backend as WebGl2Backend;

    this._ensureConnected(gl2Backend);

    // Staged on the instance rather than captured: the pass object and its body
    // are built once per filter, so a filtered node costs no allocation per
    // frame - which it did while both were rebuilt inside every `apply`.
    this._passInput = input;
    this._passOutput = output;

    backend.execute(this._pass.retarget(output, output.view, Color.transparentBlack));
  }

  public destroy(): void {
    if (this._connection !== null) {
      this._connection.vertexBuffer.destroy();
      this._connection.vao.destroy();
      this._connection = null;
    }

    if (this._shader !== null) {
      this._shader.destroy();
      this._shader = null;
    }
  }

  /** The pass body - see {@link _pass}. */
  private _run(backend: RenderBackend): void {
    const gl2 = backend as WebGl2Backend;
    const shader = this._shader!;
    const input = this._passInput!;
    const output = this._passOutput!;

    // Bind shader (calls ShaderProgram.bind → gl.useProgram + sync dirty uniforms)
    gl2.bindShader(shader);

    // Auto-bind input texture to slot 0 (uTexture)
    gl2.bindTexture(input, 0);

    if (shader.uniforms.has('uTexture')) {
      this._slotScratch[0] = 0;
      shader.getUniform('uTexture').setValue(this._slotScratch);
    }

    // Auto-bind uResolution
    if (shader.uniforms.has('uResolution')) {
      this._resolutionScratch[0] = output.width;
      this._resolutionScratch[1] = output.height;
      shader.getUniform('uResolution').setValue(this._resolutionScratch);
    }

    // Auto-bind uOrientation
    if (shader.uniforms.has('uOrientation')) {
      shader.getUniform('uOrientation').setValue(orientationValue);
    }

    // Sync user uniforms - texture uniforms start at slot 1
    let textureSlot = 1;

    for (const name in this._uniforms) {
      if (!shader.uniforms.has(name)) {
        continue;
      }

      // In-bounds: `name` comes from `this._uniforms`' own keys.
      const value = this._uniforms[name]!;
      const uniform = shader.getUniform(name);

      if (value instanceof Texture) {
        gl2.bindTexture(value, textureSlot);
        this._slotScratch[0] = textureSlot;
        uniform.setValue(this._slotScratch);
        textureSlot++;
      } else {
        uniform.setValue(this._marshalValue(name, value));
      }
    }

    // Flush dirty uniforms to the GPU
    shader.sync();

    // Draw the fullscreen quad
    const connection = this._connection!;

    gl2.bindVertexArrayObject(connection.vao);
    connection.vao.draw(4, 0, RenderingPrimitives.TriangleStrip);

    // The fullscreen quad is a real GPU draw and has to be counted as one -
    // it goes straight through the VAO rather than a renderer, so nothing else
    // sees it. The WebGPU half already counts its own.
    gl2.stats.drawCalls++;
  }

  private _ensureConnected(backend: WebGl2Backend): void {
    if (this._shader !== null) {
      return;
    }

    const gl = backend.context;

    // Create and connect the shader
    const shader = new Shader(this._vertexSource, this._fragmentSource);

    shader.connect(createWebGl2ShaderProgram(gl));

    // Force shader finalization so attributes are populated before VAO setup.
    // sync() calls finalize() internally, which blocks until compilation is
    // done and extracts attribute/uniform reflection data.
    shader.sync();

    // Build the fullscreen-quad vertex buffer (static, per-instance)
    const vaoHandle = gl.createVertexArray();

    if (vaoHandle === null) {
      throw new Error('ShaderFilter: could not create vertex array object.');
    }

    const vertexBuffer = this._createVertexBuffer(gl);
    const vao = this._createVao(gl, vaoHandle, shader, vertexBuffer);

    this._shader = shader;
    this._connection = { gl, vertexBuffer, vao };
  }

  private _createVertexBuffer(gl: WebGL2RenderingContext): WebGl2RenderBuffer {
    const handle = gl.createBuffer();

    if (handle === null) {
      throw new Error('ShaderFilter: could not create vertex buffer.');
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

  private _createVao(gl: WebGL2RenderingContext, vaoHandle: WebGLVertexArrayObject, shader: Shader, vertexBuffer: WebGl2RenderBuffer): WebGl2VertexArrayObject {
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

  /**
   * Marshal a non-texture uniform value to a TypedArray suitable for
   * {@link ShaderUniform.setValue}.
   *
   * A typed array passes straight through. Numbers and tuples are copied into a
   * per-name buffer kept for the filter's lifetime: this runs once per uniform
   * per frame, and allocating the buffer here made every filtered node cost
   * garbage proportional to its uniform count.
   */
  private _marshalValue(name: string, value: Exclude<ShaderFilterUniformValue, Texture>): Float32Array | Int32Array {
    if (value instanceof Float32Array || value instanceof Int32Array) {
      return value;
    }

    const components = value as unknown as readonly number[];
    const length = typeof value === 'number' ? 1 : (components.length ?? 0);
    let buffer = this._scratch.get(name);

    if (buffer?.length !== length) {
      buffer = new Float32Array(length);
      this._scratch.set(name, buffer);
    }

    if (typeof value === 'number') {
      buffer[0] = value;
    } else {
      buffer.set(components);
    }

    return buffer;
  }
}
