import { Color } from '#core/Color';
import { BackendTargetPass } from '#rendering/BackendTargetPass';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { Shader } from '#rendering/shader/Shader';
import { upgradeFragmentShaderToGl300 } from '#rendering/shader/upgradeFragmentShaderToGl300';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { BufferTypes, BufferUsage, RenderingPrimitives } from '#rendering/types';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGl2RenderBuffer } from '#rendering/webgl2/WebGl2RenderBuffer';
import { createWebGl2ShaderProgram } from '#rendering/webgl2/WebGl2ShaderProgram';
import { WebGl2VertexArrayObject } from '#rendering/webgl2/WebGl2VertexArrayObject';

import { Filter } from './Filter';

/**
 * A scalar number, vector tuple, typed array, or texture. Both
 * {@link WebGl2ShaderFilter} and {@link WebGpuShaderFilter} accept and
 * marshal these value types.
 */
export type ShaderFilterUniformValue =
  | number
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number]
  | Float32Array
  | Int32Array
  | Texture
  | RenderTexture;

export interface WebGl2ShaderFilterOptions {
  /**
   * GLSL fragment shader source. Required.
   *
   * The shader receives these auto-bound uniforms:
   *   uniform sampler2D uTexture;     // the filter's input
   *   uniform vec2 uResolution;        // output dimensions
   *
   * And these auto-bound varyings:
   *   in vec2 vUv;                     // 0..1 across the quad
   */
  fragmentSource?: string;

  /**
   * GLSL vertex shader source. Optional; defaults to a pass-through
   * fullscreen-quad shader.
   */
  vertexSource?: string;

  /**
   * Initial uniform values. Update them at runtime through
   * `setUniform` / `setUniforms`, which also invalidate the nodes
   * rendering the filter:
   *
   *   filter.setUniform('uTime', performance.now() / 1000);
   */
  uniforms?: Record<string, ShaderFilterUniformValue>;

  /**
   * Auto-upgrade legacy GLSL ES 1.00 fragment shader source to GLSL ES 3.00.
   * Default `true` — accepts both Shadertoy/ISF/legacy shaders and modern
   * 3.00 shaders interchangeably.
   *
   * Set to `false` if you want strict 3.00 input (will fail to compile if
   * given 1.00-style code). Useful for CI/linting setups that want to catch
   * legacy shader code as bugs.
   *
   * Note: only the fragment shader is upgraded. If you supply a 1.00-style
   * vertex shader via `vertexSource`, you will get a compile error that
   * must be fixed manually.
   */
  autoUpgrade?: boolean;
}

/**
 * Default fullscreen-quad vertex shader. Positions are already in clip
 * space (-1..1), so no projection matrix is needed.
 */
const defaultVertexSource = `#version 300 es
in vec2 aPosition;
in vec2 aUv;
out vec2 vUv;
void main() {
    vUv = aUv;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

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

interface WebGl2Connection {
  readonly gl: WebGL2RenderingContext;
  readonly vertexBuffer: WebGl2RenderBuffer;
  readonly vao: WebGl2VertexArrayObject;
}

/**
 * A high-level {@link Filter} subclass that renders the input texture
 * through a user-provided GLSL fragment shader on the **WebGL2** backend.
 *
 * For the WebGPU backend use {@link WebGpuShaderFilter}.
 *
 * ## Usage
 *
 * ```ts
 * const filter = new WebGl2ShaderFilter({
 *   fragmentSource: `
 *     #version 300 es
 *     precision mediump float;
 *     uniform sampler2D uTexture;
 *     uniform vec2 uResolution;
 *     uniform float uTime;
 *     in vec2 vUv;
 *     out vec4 fragColor;
 *     void main() {
 *       fragColor = texture(uTexture, vUv);
 *     }
 *   `,
 *   uniforms: { uTime: 0.0 },
 * });
 *
 * // Update uniforms each frame:
 * filter.setUniform('uTime', performance.now() / 1000);
 * sprite.filters = [filter];
 * ```
 *
 * ## Auto-bound uniforms
 *
 * The backend automatically sets `uTexture` (slot 0) and `uResolution`
 * before each draw. User uniforms start at texture slot 1.
 */
export class WebGl2ShaderFilter extends Filter {
  private readonly _uniforms: Record<string, ShaderFilterUniformValue>;

  private readonly _fragmentSource: string;
  private readonly _vertexSource: string;

  /** One redirect pass, re-pointed per application — see {@link BackendTargetPass.retarget}. */
  private readonly _pass: BackendTargetPass = new BackendTargetPass(backend => this._run(backend));
  /** Reused upload buffers for the auto-bound uniforms, so a frame allocates none. */
  private readonly _slotScratch = new Int32Array(1);
  private readonly _resolutionScratch = new Float32Array(2);
  /** One reused buffer per non-texture user uniform — see {@link _marshalValue}. */
  private readonly _scratch = new Map<string, Float32Array>();

  private _shader: Shader | null = null;
  private _connection: WebGl2Connection | null = null;
  /** The textures the running pass reads from and writes to, staged by {@link apply}. */
  private _passInput: RenderTexture | null = null;
  private _passOutput: RenderTexture | null = null;

  public constructor(options: WebGl2ShaderFilterOptions) {
    super();

    if (!options.fragmentSource) {
      throw new Error('WebGl2ShaderFilter requires fragmentSource for the WebGL2 backend.');
    }

    const autoUpgrade = options.autoUpgrade !== false;
    this._fragmentSource = autoUpgrade ? upgradeFragmentShaderToGl300(options.fragmentSource) : options.fragmentSource;
    this._vertexSource = options.vertexSource ?? defaultVertexSource;
    this._uniforms = { ...(options.uniforms ?? {}) };
  }

  /**
   * The current uniform values, for reading.
   *
   * Deliberately not writable: a value written straight into this record would
   * reach the GPU on the next draw but tell nobody, so a cached or retained
   * representation of the owning node would keep replaying the frame the old
   * value produced. Write through {@link setUniform} / {@link setUniforms}.
   */
  public get uniforms(): Readonly<Record<string, ShaderFilterUniformValue>> {
    return this._uniforms;
  }

  /** Set one uniform and notify every node rendering this filter. */
  public setUniform(name: string, value: ShaderFilterUniformValue): this {
    this._uniforms[name] = value;
    this.invalidate();

    return this;
  }

  /** Set several uniforms, notifying once for the batch. */
  public setUniforms(values: Readonly<Record<string, ShaderFilterUniformValue>>): this {
    for (const name of Object.keys(values)) {
      // In-bounds: `name` comes from `values`' own keys.
      this._uniforms[name] = values[name]!;
    }

    this.invalidate();

    return this;
  }

  /**
   * Execute the GLSL shader pass: compile the program on first call, bind
   * uniforms, and render the input texture into `output`. Throws if the
   * active backend is WebGPU — use {@link WebGpuShaderFilter} on WebGPU.
   */
  public apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture, _resolution = 1): void {
    if (backend.backendType === RenderBackendType.WebGpu) {
      throw new Error('WebGl2ShaderFilter requires the WebGL2 backend. Use WebGpuShaderFilter on WebGPU.');
    }

    const gl2Backend = backend as WebGl2Backend;

    this._ensureConnected(gl2Backend);

    // Staged on the instance rather than captured: the pass object and its body
    // are built once per filter, so a filtered node costs no allocation per
    // frame — which it did while both were rebuilt inside every `apply`.
    this._passInput = input;
    this._passOutput = output;

    backend.execute(this._pass.retarget(output, output.view, Color.transparentBlack));
  }

  /** The pass body — see {@link _pass}. */
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

    // Sync user uniforms — texture uniforms start at slot 1
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

    // The fullscreen quad is a real GPU draw and has to be counted as one —
    // it goes straight through the VAO rather than a renderer, so nothing else
    // sees it. The WebGPU half already counts its own.
    gl2.stats.drawCalls++;
  }

  public override destroy(): void {
    super.destroy();
    if (this._connection !== null) {
      this._connection.vertexBuffer.destroy();
      this._connection.vao.destroy();
      this._connection = null;
    }

    if (this._shader !== null) {
      this._shader.destroy();
      this._shader = null;
    }

    for (const key of Object.keys(this._uniforms)) {
      delete this._uniforms[key];
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

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
      throw new Error('WebGl2ShaderFilter: could not create vertex array object.');
    }

    const vertexBuffer = this._createVertexBuffer(gl);
    const vao = this._createVao(gl, vaoHandle, shader, vertexBuffer);

    this._shader = shader;
    this._connection = { gl, vertexBuffer, vao };
  }

  private _createVertexBuffer(gl: WebGL2RenderingContext): WebGl2RenderBuffer {
    const handle = gl.createBuffer();

    if (handle === null) {
      throw new Error('WebGl2ShaderFilter: could not create vertex buffer.');
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
