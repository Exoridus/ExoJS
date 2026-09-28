import vertexSource from '#rendering/filters/shaders/default-vertex.vert';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { RenderError } from '#rendering/RenderError';
import fragmentSource from '#rendering/webgl2/shaders/texture-normalize.frag';

/**
 * Backend state a normalization pass disturbs, and the only thing that can put
 * it back.
 *
 * The backend owns this context's framebuffer, viewport, program and per-unit
 * texture bindings. A pass that reached past it would leave every one of those
 * caches describing bindings GL no longer holds, and the next draw would skip
 * the re-bind it actually needs.
 * @internal
 */
export interface WebGl2ColorNormalizationHost {
  /**
   * Release `destination` from every sampler unit and forget the bindings the
   * pass is about to invalidate.
   *
   * The unbind is not optional: a texture that is still bound for sampling while
   * it is the pass's colour attachment is a feedback loop, and GL drops the draw
   * while reporting only an `INVALID_OPERATION`.
   */
  releaseForColorNormalization(destination: WebGLTexture): void;
  /** Re-establish the backend's framebuffer, viewport, program, VAO and unit state. */
  restoreAfterColorNormalization(): void;
}

/** Where one authored mip level is written. */
export interface WebGl2ColorNormalizationTarget {
  /** Destination texture, already allocated with its final internal format. */
  readonly destination: WebGLTexture;
  /** Mip level of `destination` to write. */
  readonly level: number;
  /** Extent of this level. */
  readonly width: number;
  readonly height: number;
  /**
   * Storage format of the destination level. The staging texture takes the same
   * one, which is what puts the hardware sRGB decode on the read and the encode
   * back on the write - the pass never evaluates a transfer function itself.
   */
  readonly internalFormat: number;
}

/**
 * Clip-space quad whose UVs run bottom-up in lockstep with NDC Y, so the pass is
 * a row-for-row copy: attachment row `r` receives source row `r`, exactly as
 * `texImage2D` would have stored it. A flipped quad would silently invert every
 * normalized texture, and the mip chain above it would then disagree with it.
 */
const quadVertices = new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]);
const quadVertexStride = 16;
const quadVertexCount = 6;

/** Reused per level, so the uniform setters allocate nothing. */
const unitScratch = new Int32Array(1);
const levelScaleScratch = new Float32Array(2);

/**
 * The upload-time alpha normalization pass for managed colour textures, on
 * WebGL2.
 *
 * Managed uncompressed colour is premultiplied in linear light BEFORE any
 * filtering can observe it: the straight source goes into a staging texture of
 * the destination's own storage format, and one unblended 1:1 draw multiplies
 * RGB by alpha on the way in. An sRGB destination therefore stores
 * `E(linearRGB * alpha)` rather than `E(linearRGB) * alpha`.
 *
 * Mips are normalized level by level, so every generated level is a downsample of
 * already-premultiplied texels and no level ever averages a straight neighbour
 * with a premultiplied one.
 *
 * Not a {@link Filter} and not public: the backend owns it and decides when a
 * source needs it. A source that is already premultiplied, asks for no
 * normalization, or carries numeric data never reaches it.
 * @internal
 */
export class WebGl2TextureNormalizer {
  private readonly _gl: WebGL2RenderingContext;
  private readonly _host: WebGl2ColorNormalizationHost;

  private _program: WebGLProgram | null = null;
  private _framebuffer: WebGLFramebuffer | null = null;
  private _quadBuffer: WebGLBuffer | null = null;
  private _quadArray: WebGLVertexArrayObject | null = null;
  private _sourceLocation: WebGLUniformLocation | null = null;
  private _levelScaleLocation: WebGLUniformLocation | null = null;

  /** Straight-source scratch holding the base level; smaller levels share its corner. */
  private _staging: WebGLTexture | null = null;
  private _stagingFormat = 0;
  private _stagingWidth = 0;
  private _stagingHeight = 0;

  public constructor(gl: WebGL2RenderingContext, host: WebGl2ColorNormalizationHost) {
    this._gl = gl;
    this._host = host;
  }

  /**
   * Premultiply one authored RGBA8 level from raw bytes.
   *
   * The bytes land in the staging texture's top-left corner rather than filling
   * it, so a partial mip chain needs no per-level staging allocation: the pass
   * is told which sub-rectangle the level occupies.
   */
  public normalizePixels(target: WebGl2ColorNormalizationTarget, data: Uint8Array): void {
    this._run(target, gl => {
      this._ensureStaging(gl, target.internalFormat, target.width, target.height);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    });
  }

  /**
   * Premultiply one level from a browser image source.
   *
   * An image source is a single level by definition, so the staging texture is
   * allocated at exactly its extent rather than grown to a chain's base level.
   */
  public normalizeImageSource(target: WebGl2ColorNormalizationTarget, source: TexImageSource): void {
    this._run(target, gl => {
      this._ensureStaging(gl, target.internalFormat, target.width, target.height, true);

      // Straight, unconverted bytes: the pass multiplies alpha itself, and the
      // browser's own premultiplication would apply the same factor a second
      // time to colour that is already linear.
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, target.internalFormat, gl.RGBA, gl.UNSIGNED_BYTE, source);
    });
  }

  public destroy(): void {
    const gl = this._gl;

    if (this._quadArray !== null) {
      gl.deleteVertexArray(this._quadArray);
      this._quadArray = null;
    }

    if (this._quadBuffer !== null) {
      gl.deleteBuffer(this._quadBuffer);
      this._quadBuffer = null;
    }

    if (this._framebuffer !== null) {
      gl.deleteFramebuffer(this._framebuffer);
      this._framebuffer = null;
    }

    if (this._staging !== null) {
      gl.deleteTexture(this._staging);
      this._staging = null;
    }

    if (this._program !== null) {
      gl.deleteProgram(this._program);
      this._program = null;
    }

    this._sourceLocation = null;
    this._levelScaleLocation = null;
    this._stagingFormat = 0;
    this._stagingWidth = 0;
    this._stagingHeight = 0;
  }

  private _run(target: WebGl2ColorNormalizationTarget, upload: (gl: WebGL2RenderingContext) => void): void {
    const gl = this._gl;
    const program = this._ensureProgram();

    this._host.releaseForColorNormalization(target.destination);

    const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const previousViewport = gl.getParameter(gl.VIEWPORT) as Int32Array | null;
    const previousProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    const previousArray = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
    const previousBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null;
    const previousUnit = gl.getParameter(gl.ACTIVE_TEXTURE);
    const previousBinding = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;

    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.destination, target.level);
      gl.useProgram(program);
      gl.bindVertexArray(this._quadArray);
      // The level is written in full, so blending would mix the normalized texel
      // with whatever the level held instead of replacing it.
      gl.disable(gl.BLEND);
      gl.viewport(0, 0, target.width, target.height);
      gl.activeTexture(gl.TEXTURE0);

      upload(gl);

      unitScratch[0] = 0;
      gl.uniform1i(this._sourceLocation, unitScratch[0]);
      levelScaleScratch[0] = target.width / this._stagingWidth;
      levelScaleScratch[1] = target.height / this._stagingHeight;
      gl.uniform2f(this._levelScaleLocation, levelScaleScratch[0], levelScaleScratch[1]);

      gl.drawArrays(gl.TRIANGLES, 0, quadVertexCount);
    } finally {
      this._restore(previousFramebuffer, previousViewport, previousProgram, previousArray, previousBuffer, previousUnit, previousBinding);
    }
  }

  /**
   * Put the context back the way the pass found it, then ask the backend to
   * re-establish whatever its own caches still describe.
   *
   * The attachment is detached while the pass's OWN framebuffer is still bound -
   * it lives on that framebuffer, not on whatever was bound before - and only
   * then is the previous framebuffer restored.
   *
   * The borrowed unit's texture binding is restored too, and it is the one
   * omission that is not merely a cache inconsistency. The staging texture
   * overwrote the destination on that unit, and the upload path applies its
   * sampler parameters AFTER this pass returns: with nothing bound there,
   * `gl.texParameteri` is an `INVALID_OPERATION` that silently leaves the texture
   * on GL's default mip-aware `MIN_FILTER` with `MAX_LEVEL` still at 1000, and a
   * texture with one level is then mip-INCOMPLETE and samples as black.
   *
   * Each saved value is re-applied only when the query answered with the shape the
   * call needs, so a context that does not track the state cannot turn a restore
   * into a call with `null` where an object belongs, or a viewport write out of a
   * shorter array.
   */
  private _restore(
    framebuffer: WebGLFramebuffer | null,
    viewport: Int32Array | null,
    program: WebGLProgram | null,
    array: WebGLVertexArrayObject | null,
    buffer: WebGLBuffer | null,
    unit: unknown,
    binding: WebGLTexture | null,
  ): void {
    const gl = this._gl;

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.useProgram(program);
    gl.bindVertexArray(array);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // Unconditional in this backend: `_setupContext` enables blending once and
    // every draw mode is a blendFunc choice, so there is no disabled state to
    // restore to.
    gl.enable(gl.BLEND);

    if (viewport !== null && viewport.length === 4) {
      gl.viewport(viewport[0]!, viewport[1]!, viewport[2]!, viewport[3]!);
    }

    if (typeof unit === 'number') {
      gl.activeTexture(unit);
    }

    if (binding !== null) {
      gl.bindTexture(gl.TEXTURE_2D, binding);
    }

    this._host.restoreAfterColorNormalization();
  }

  /**
   * Keep one staging texture large enough for the level being staged, reallocating
   * only when the level does not fit. `exact` reallocates at the requested extent
   * even when it fits, which is what a single-level image source needs because
   * `texImage2D` sizes the texture to its source anyway.
   */
  private _ensureStaging(gl: WebGL2RenderingContext, internalFormat: number, width: number, height: number, exact = false): void {
    const formatChanged = this._staging !== null && this._stagingFormat !== internalFormat;
    const tooSmall = this._stagingWidth < width || this._stagingHeight < height;

    if (this._staging !== null && !formatChanged && !tooSmall && !exact) {
      return;
    }

    const nextWidth = exact || formatChanged ? width : Math.max(this._stagingWidth, width);
    const nextHeight = exact || formatChanged ? height : Math.max(this._stagingHeight, height);

    if (this._staging !== null) {
      gl.deleteTexture(this._staging);
    }

    const handle = gl.createTexture();

    if (handle === null) {
      throw new Error('WebGL2: could not create the colour-normalization staging texture.');
    }

    // A single complete level, sampled through this state rather than the
    // sampler's, so the pass cannot be handed a mip-aware filter that would
    // blur the one-to-one mapping it depends on.
    gl.bindTexture(gl.TEXTURE_2D, handle);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, nextWidth, nextHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this._staging = handle;
    this._stagingFormat = internalFormat;
    this._stagingWidth = nextWidth;
    this._stagingHeight = nextHeight;
  }

  private _ensureProgram(): WebGLProgram {
    if (this._program !== null) {
      return this._program;
    }

    const gl = this._gl;
    const vertex = this._compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = this._compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();

    if (program === null) {
      throw new Error('WebGL2: could not create the colour-normalization program.');
    }

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);

    if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
      const log = gl.getProgramInfoLog(program);

      gl.deleteProgram(program);

      throw new RenderError({
        code: 'shader-link',
        backendType: RenderBackendType.WebGl2,
        message: `Colour normalization failed to link: ${log ?? '<no info log>'}`,
      });
    }

    this._program = program;
    this._sourceLocation = gl.getUniformLocation(program, 'u_source');
    this._levelScaleLocation = gl.getUniformLocation(program, 'u_levelScale');
    this._framebuffer = gl.createFramebuffer();
    this._quadBuffer = this._createQuadBuffer(gl);
    this._quadArray = this._createQuadArray(gl, program);

    return program;
  }

  private _compile(type: number, source: string): WebGLShader {
    const gl = this._gl;
    const shader = gl.createShader(type);

    if (shader === null) {
      throw new Error('WebGL2: could not create a colour-normalization shader.');
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
      const log = gl.getShaderInfoLog(shader);

      gl.deleteShader(shader);

      throw new RenderError({
        code: 'shader-compile',
        backendType: RenderBackendType.WebGl2,
        message: `Colour normalization failed to compile: ${log ?? '<no info log>'}`,
      });
    }

    return shader;
  }

  private _createQuadBuffer(gl: WebGL2RenderingContext): WebGLBuffer {
    const handle = gl.createBuffer();

    if (handle === null) {
      throw new Error('WebGL2: could not create the colour-normalization quad buffer.');
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, handle);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    return handle;
  }

  private _createQuadArray(gl: WebGL2RenderingContext, program: WebGLProgram): WebGLVertexArrayObject {
    const handle = gl.createVertexArray();

    if (handle === null) {
      throw new Error('WebGL2: could not create the colour-normalization vertex array.');
    }

    const quadBuffer = this._quadBuffer!;
    const position = gl.getAttribLocation(program, 'aPosition');
    const uv = gl.getAttribLocation(program, 'aUv');

    gl.bindVertexArray(handle);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);

    if (position >= 0) {
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, quadVertexStride, 0);
    }

    if (uv >= 0) {
      gl.enableVertexAttribArray(uv);
      gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, quadVertexStride, 2 * Float32Array.BYTES_PER_ELEMENT);
    }

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    return handle;
  }
}
