import type { UniformBufferViews, UniformFieldAccessors, UniformWritable } from './uniformAccessors';
import { createUniformFieldAccessors, writeUniformValues } from './uniformAccessors';
import type { UniformFields, UniformStructInput } from './uniformDeclarations';
import type { UniformBlockLayout } from './uniformLayout';

/**
 * One uniform block's values, owned by the material or filter that declared it.
 *
 * The block holds a single `ArrayBuffer` in the canonical layout, the typed
 * accessors that write into it, and a revision that advances whenever a byte
 * changes. Backends compare the revision they last uploaded against
 * {@link revision} and skip the transfer when it has not moved, so a block whose
 * values are set once and then left alone costs no GPU traffic per frame.
 *
 * Sharing a {@link Shader} across instances shares the declaration, never
 * these values: each material or filter builds its own block.
 * @advanced
 */
// Structurally a `UniformRevisionSink`, deliberately without the `implements`
// clause: that clause reaches the emitted declaration, and the interface is
// marked internal, so the declaration emit drops it and leaves this file
// importing a member a consumer cannot resolve. The type tests assert the
// conformance instead.
//
// The marker itself must not appear in this comment either - the emit reads the
// last comment before a declaration as its doc comment and would strip the
// class along with it.
export class UniformBlockData<F extends UniformFields = UniformFields> {
  /** The typed accessor for each declared field, under the field's own name. */
  public readonly uniforms: UniformFieldAccessors<F>;

  /**
   * The block's bytes as a `Float32Array`, for advanced callers that write
   * offsets they computed themselves. A direct write bypasses the accessors'
   * change detection, so it must be followed by {@link commit}.
   */
  public readonly float32: Float32Array;

  /** The block's bytes as an `Int32Array`. See {@link float32}. */
  public readonly int32: Int32Array;

  /** The block's bytes as a `Uint32Array`. See {@link float32}. */
  public readonly uint32: Uint32Array;

  /** The block's layout, including field offsets and the shader-visible names. */
  public readonly layout: UniformBlockLayout;

  private readonly _bytes: Uint8Array;
  private readonly _accessors: ReadonlyMap<string, UniformWritable>;
  private readonly _onChange: (() => void) | null;
  private _revision = 1;

  /**
   * `onChange` runs after every write that moved the revision. It exists for an
   * owner whose result is cached elsewhere - a filter feeding a retained node -
   * and must stay cheap: a per-component write calls it once.
   */
  public constructor(layout: UniformBlockLayout, onChange?: () => void) {
    const buffer = new ArrayBuffer(layout.byteLength);
    const views: UniformBufferViews = {
      f32: new Float32Array(buffer),
      i32: new Int32Array(buffer),
      u32: new Uint32Array(buffer),
    };

    this.layout = layout;
    this._onChange = onChange ?? null;
    this.float32 = views.f32;
    this.int32 = views.i32;
    this.uint32 = views.u32;
    this._bytes = new Uint8Array(buffer);
    this._accessors = createUniformFieldAccessors(layout.members, views, this, `${layout.instance}.`);
    this.uniforms = Object.fromEntries(this._accessors) as unknown as UniformFieldAccessors<F>;

    if (layout.defaults !== null) {
      writeUniformValues(this._accessors, layout.defaults, layout.instance);
    }
  }

  /** Size of the block in bytes, padded to a multiple of 16. */
  public get byteLength(): number {
    return this._bytes.byteLength;
  }

  /**
   * Advances whenever a write changed a byte. Backends use it to decide whether
   * to upload; it is monotonic and never reused.
   */
  public get revision(): number {
    return this._revision;
  }

  /** Write several fields at once, advancing {@link revision} once. */
  public set(values: UniformStructInput<F>): this {
    this._setValues(values);

    return this;
  }

  /**
   * Replace the whole block with `source`, which must be exactly
   * {@link byteLength} bytes.
   *
   * The copy is unconditional - the caller already holds the bytes, and
   * comparing a whole block costs about as much as uploading it - so the
   * revision always advances.
   */
  public setPacked(source: ArrayBufferView): this {
    if (source.byteLength !== this._bytes.byteLength) {
      throw new Error(`[ExoJS] Uniform block \`${this.layout.instance}\` holds ${this._bytes.byteLength} bytes; received ${source.byteLength}.`);
    }

    this._bytes.set(new Uint8Array(source.buffer, source.byteOffset, source.byteLength));
    this._touch();

    return this;
  }

  /**
   * Declare that the raw views were written directly. Required after any write
   * through {@link float32}, {@link int32} or {@link uint32}: those bypass the
   * accessors, and nothing else can observe them.
   */
  public commit(): this {
    this._touch();

    return this;
  }

  /** Write a value record whose shape the caller has already established. @internal */
  public _setValues(values: Record<string, unknown>): void {
    if (writeUniformValues(this._accessors, values, this.layout.instance)) {
      this._touch();
    }
  }

  /** @internal */
  public _touch(): void {
    this._revision++;
    this._onChange?.();
  }
}
