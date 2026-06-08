import type { TypedArray } from '#core/types';

/**
 * Metadata and current value for a single GLSL uniform variable.
 *
 * Populated by the backend during {@link Shader.connect}. The `dirty` flag is
 * set to `true` on construction and on every {@link setValue} call; the backend
 * clears it via {@link markClean} after uploading the value to the GPU.
 * Array-type uniform names have their index suffix stripped (e.g. `uColors[0]`
 * becomes `uColors`).
 * @advanced
 */
export class ShaderUniform {
  /** Zero-based index of this uniform within the shader program. */
  public readonly index: number;
  /** WebGL2 GLenum type token (e.g. `gl.FLOAT_MAT4`). */
  public readonly type: number;
  /** Number of elements for array uniforms; `1` for scalar uniforms. */
  public readonly size: number;
  /** GLSL uniform name with array suffixes stripped. */
  public readonly name: string;

  private readonly _value: TypedArray;
  private _dirty = true;

  public constructor(index: number, type: number, size: number, name: string, data: TypedArray) {
    this.name = name.replace(/\[.*?]/, '');
    this.index = index;
    this.type = type;
    this.size = size;
    this._value = data;
  }

  /**
   * The leaf segment of a dot-separated uniform name.
   * For top-level uniforms this equals `name`; for struct members (e.g. `uLight.color`)
   * it returns only the field name (`color`).
   */
  public get propName(): string {
    return this.name.substring(this.name.lastIndexOf('.') + 1);
  }

  public get value(): TypedArray {
    return this._value;
  }

  /** Whether the value has changed since the last {@link markClean} call. */
  public get dirty(): boolean {
    return this._dirty;
  }

  /**
   * Copy `value` into the internal typed-array buffer and mark the uniform dirty.
   * The backend will upload the new value to the GPU on the next {@link Shader.sync} call.
   */
  public setValue(value: TypedArray): this {
    this._value.set(value);
    this._dirty = true;

    return this;
  }

  /**
   * Clear the dirty flag after the backend has successfully uploaded the uniform value.
   * @internal
   */
  public markClean(): void {
    this._dirty = false;
  }

  public destroy(): void {
    // no-op — value container only
  }
}
