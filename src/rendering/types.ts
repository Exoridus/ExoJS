/**
 * Compositing blend modes applied when drawing a {@link Drawable} over the current render target.
 *
 * Modes 0–4 are implemented as fixed-function GPU blend equations (no texture
 * capture required). Modes 5–17 use a backdrop-aware compositor: the content is
 * first rendered off-screen, then composited over the captured backdrop via a
 * W3C-compliant blend shader. Use {@link isAdvancedBlendMode} to test whether a
 * mode requires the compositor path.
 */
export enum BlendModes {
  Normal = 0,
  Additive = 1,
  Subtract = 2,
  Multiply = 3,
  Screen = 4,
  /** `min(src, dst)` per channel — coverage-correct via backdrop-aware shader. */
  Darken = 5,
  /** `max(src, dst)` per channel — coverage-correct via backdrop-aware shader. */
  Lighten = 6,
  /** Overlay: darkens or lightens depending on backdrop luminosity. */
  Overlay = 7,
  /** Color Dodge: brightens the backdrop to reflect the source. */
  ColorDodge = 8,
  /** Color Burn: darkens the backdrop to reflect the source. */
  ColorBurn = 9,
  /** Hard Light: strong Overlay with source and backdrop roles swapped. */
  HardLight = 10,
  /** Soft Light: softer Overlay effect. */
  SoftLight = 11,
  /** Difference: absolute value of channel difference. */
  Difference = 12,
  /** Exclusion: lower-contrast alternative to Difference. */
  Exclusion = 13,
  /** Hue: source hue with backdrop saturation and luminosity. */
  Hue = 14,
  /** Saturation: source saturation with backdrop hue and luminosity. */
  Saturation = 15,
  /** Color: source hue+saturation with backdrop luminosity. */
  Color = 16,
  /** Luminosity: source luminosity with backdrop hue+saturation. */
  Luminosity = 17,
}

/**
 * Returns `true` for blend modes that require the backdrop-aware compositor
 * (shader-side blend + GPU texture copy). Modes 0–4 use fixed-function blending
 * and return `false`. Modes 5–17 return `true`.
 */
export const isAdvancedBlendMode = (mode: BlendModes): boolean => mode >= BlendModes.Darken;

/**
 * Texture magnification and minification filter modes.
 * Values are WebGL2 GLenum constants and are passed directly to the GPU sampler.
 * Mipmap variants require {@link Texture.generateMipMap} to be enabled.
 */
export enum ScaleModes {
  Nearest = 0x2600,
  Linear = 0x2601,
  NearestMipmapNearest = 0x2700,
  LinearMipmapNearest = 0x2701,
  NearestMipmapLinear = 0x2702,
  LinearMipmapLinear = 0x2703,
}

/**
 * Texture coordinate wrap behaviour when UV values fall outside [0, 1].
 * Values are WebGL2 GLenum constants passed directly to the GPU sampler.
 */
export enum WrapModes {
  Repeat = 0x2901,
  ClampToEdge = 0x812f,
  MirroredRepeat = 0x8370,
}

/**
 * Every pixel format the engine names, across both the textures it renders
 * into and the textures it uploads raw data to.
 *
 * Unlike the GLenum-valued enums above, these carry no GPU constant: each
 * backend maps them to its own vocabulary (`Rgba8` becomes `rgba8unorm` on
 * WebGPU, an internal-format/format/type triple on WebGL2). The values stay
 * readable strings so the mapping tables and any serialized format stay
 * legible.
 *
 * Not every format is valid everywhere — {@link ColorTextureFormat} and
 * `DataTextureFormat` carve out the subset each use accepts.
 *
 * | Format | Channels | Bytes/px | Buffer |
 * |---|---:|---:|---|
 * | `R8` | 1 | 1 | `Uint8Array` |
 * | `R32F` | 1 | 4 | `Float32Array` |
 * | `Rgba8` | 4 | 4 | `Uint8Array` |
 * | `Rgba16F` | 4 | 8 | — (render targets only) |
 * | `Rgba32F` | 4 | 16 | `Float32Array` |
 * @stable
 */
export enum TextureFormat {
  /** Single-channel 8-bit unsigned. */
  R8 = 'r8',
  /** Single-channel 32-bit float. */
  R32F = 'r32f',
  /** 4-channel 8-bit unsigned — the universally supported default. */
  Rgba8 = 'rgba8',
  /** 4-channel half-float. Stores values outside `[0, 1]` at reduced precision; usually enough for feedback/state buffers. */
  Rgba16F = 'rgba16f',
  /** 4-channel full-float. Highest precision, 16 bytes per pixel. */
  Rgba32F = 'rgba32f',
}

/**
 * Color attachment format for an offscreen {@link RenderTexture} — the
 * {@link TextureFormat} subset that can be rendered into.
 *
 * The float formats require `EXT_color_buffer_float` to be *rendered into*
 * (WebGL2). Allocating one on a context without the extension throws at
 * render-target preparation. Float render targets default to `nearest`
 * sampling; linear filtering additionally requires `OES_texture_float_linear`.
 */
export type ColorTextureFormat = TextureFormat.Rgba8 | TextureFormat.Rgba16F | TextureFormat.Rgba32F;

/**
 * Resolution an internal render target is rasterized at, in device pixels per
 * logical unit.
 *
 * `'inherit'` — the default everywhere — takes the resolution of the target the
 * result is composited into, so a filtered or cached subtree is as sharp as the
 * surface around it. A number overrides that: `0.5` on a heavy blur halves its
 * linear resolution (a quarter of the fragments) at the cost of detail, `1`
 * pins a target to logical size regardless of the display.
 *
 * Applies to {@link Filter.resolution} and {@link RenderNode.cacheResolution}.
 * @stable
 */
export type TargetResolution = number | 'inherit';

/**
 * GPU primitive topology used when issuing draw calls.
 * Values are WebGL2 GLenum constants (e.g. `gl.TRIANGLES`).
 */
export enum RenderingPrimitives {
  Points = 0x0000,
  Lines = 0x0001,
  LineLoop = 0x0002,
  LineStrip = 0x0003,
  Triangles = 0x0004,
  TriangleStrip = 0x0005,
  TriangleFan = 0x0006,
}

/**
 * GPU buffer binding targets.
 * Values are WebGL2 GLenum constants used when calling `gl.bindBuffer`.
 */
export enum BufferTypes {
  ArrayBuffer = 0x8892,
  ElementArrayBuffer = 0x8893,
  CopyReadBuffer = 0x8f36,
  CopyWriteBuffer = 0x8f37,
  TransformFeedbackBuffer = 0x8c8e,
  UniformBuffer = 0x8a11,
  PixelPackBuffer = 0x88eb,
  PixelUnpackBuffer = 0x88ec,
}

/**
 * Hints describing expected buffer access pattern, allowing the driver to optimise allocation.
 * Values are WebGL2 GLenum constants used when calling `gl.bufferData`.
 */
export enum BufferUsage {
  StaticDraw = 0x88e4,
  StaticRead = 0x88e5,
  StaticCopy = 0x88e6,
  DynamicDraw = 0x88e8,
  DynamicRead = 0x88e9,
  DynamicCopy = 0x88ea,
  StreamDraw = 0x88e0,
  StreamRead = 0x88e1,
  StreamCopy = 0x88e2,
}

/**
 * Element data type of an index buffer, used when calling `gl.drawElements` /
 * `gl.drawElementsInstanced`. Values are WebGL2 GLenum constants; both are
 * core WebGL2 (no `OES_element_index_uint` extension check needed, unlike WebGL1).
 */
export enum IndexElementTypes {
  UnsignedShort = 0x1403,
  UnsignedInt = 0x1405,
}

/**
 * GLSL primitive type tokens used to describe {@link ShaderAttribute} and {@link ShaderUniform} data types.
 * Values are WebGL2 GLenum constants returned by `gl.getActiveAttrib` / `gl.getActiveUniform`.
 */
// @eslint-ignore
export enum ShaderPrimitives {
  Int = 0x1404,
  IntVec2 = 0x8b53,
  IntVec3 = 0x8b54,
  IntVec4 = 0x8b55,

  UnsignedInt = 0x1405,
  UnsignedIntVec2 = 0x8dc6,
  UnsignedIntVec3 = 0x8dc7,
  UnsignedIntVec4 = 0x8dc8,

  Float = 0x1406,
  FloatVec2 = 0x8b50,
  FloatVec3 = 0x8b51,
  FloatVec4 = 0x8b52,

  Bool = 0x8b56,
  BoolVec2 = 0x8b57,
  BoolVec3 = 0x8b58,
  BoolVec4 = 0x8b59,

  FloatMat2 = 0x8b5a,
  FloatMat3 = 0x8b5b,
  FloatMat4 = 0x8b5c,

  Sampler2D = 0x8b5e,
}
