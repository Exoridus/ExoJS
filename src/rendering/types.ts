/**
 * Compositing blend modes applied when drawing a {@link Drawable} over the current render target.
 * Values map to backend-specific blend-equation presets.
 */
export enum BlendModes {
  Normal = 0,
  Additive = 1,
  Subtract = 2,
  Multiply = 3,
  Screen = 4,
  /**
   * `min(src, dst)` per channel.
   *
   * KNOWN LIMITATION: implemented with the fixed-function `MIN` blend equation,
   * which ignores the blend factors and therefore cannot account for source
   * coverage. With premultiplied-alpha drawables, transparent texels (rgb = 0)
   * resolve to `min(0, dst) = 0`, so transparent regions of a sprite turn black
   * instead of showing the background. Reliable only for fully opaque sources;
   * a coverage-correct version needs a shader-side blend. Tracked for a future
   * render pass. {@link Lighten} is unaffected (`max(0, dst) = dst`).
   */
  Darken = 5,
  Lighten = 6,
}

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
