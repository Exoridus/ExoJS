import { webGl2PrimitiveByteSizeMapping } from '#rendering/webgl2/WebGl2ShaderMappings';

/**
 * Metadata for a single vertex attribute declared in a GLSL vertex shader.
 *
 * Populated by the backend during {@link Shader.connect} using the values
 * returned by `gl.getActiveAttrib`. The `size` field is derived from `type`
 * via the backend's primitive-byte-size mapping and is used to stride vertex
 * buffer layouts.
 */
export class ShaderAttribute {
  /** Zero-based index of this attribute within the shader program. */
  public readonly index: number;
  /** GLSL attribute name as declared in the vertex shader source. */
  public readonly name: string;
  /** WebGL2 GLenum type token (e.g. `gl.FLOAT_VEC2`). */
  public readonly type: number;
  /** Byte size of one element of this attribute's type. */
  public readonly size: number;
  /** WebGL attribute location assigned by the driver. `-1` until the backend sets it. */
  public location = -1;

  public constructor(index: number, name: string, type: number) {
    this.index = index;
    this.name = name;
    this.type = type;
    this.size = webGl2PrimitiveByteSizeMapping[type];
  }

  public destroy(): void {
    // no-op — metadata only
  }
}
