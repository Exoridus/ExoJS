/**
 * The declaration vocabulary of a typed uniform schema: the wrappers a caller
 * writes ({@link UniformStruct}, {@link UniformArray}, {@link UniformBlock})
 * and the type-level mapping from a declaration to the values its fields
 * accept.
 *
 * A declaration is data, not state. It is shared by every material or filter
 * built on the same {@link ShaderSource}, and it never holds a value - only the
 * `default` a fresh instance starts from.
 */

import type { Color } from '#core/Color';
import type { Matrix } from '#math/Matrix';
import type { Vector } from '#math/Vector';

import { UniformType } from './UniformType';

/** A `vec2<f32>` value: components, a tuple, or any `x`/`y` carrier. */
export type UniformVec2Input = readonly [number, number] | Vector | { readonly x: number; readonly y: number };

/** A `vec3<f32>` value. */
export type UniformVec3Input = readonly [number, number, number];

/**
 * A `vec4<f32>` value. A {@link Color} maps to RGBA with the colour channels
 * normalized to 0..1; its alpha is already in that range.
 */
export type UniformVec4Input = readonly [number, number, number, number] | Color;

/** A `mat3x3<f32>` value: nine components in column-major order, or a {@link Matrix}. */
export type UniformMat3Input = ArrayLike<number> | Matrix;

/** A `mat4x4<f32>` value: sixteen components in column-major order. */
export type UniformMat4Input = ArrayLike<number>;

/** Element types allowed in a {@link UniformArray} - see its constructor. */
export type UniformArrayElement = UniformType.Vec4 | UniformType.Mat3 | UniformType.Mat4 | UniformStruct;

/** A field's type: a scalar/vector/matrix, a nested struct, or an array. */
export type UniformFieldType = UniformType | UniformStruct | UniformArray;

/** A field declared with metadata rather than as a bare type. */
export interface UniformFieldOptions<T extends UniformFieldType = UniformFieldType> {
  readonly type: T;
  /**
   * Value a fresh instance starts from. Omitted fields start at zero, matrices
   * included. The declaration keeps a copy: mutating the value afterwards does
   * not reach an instance built from it.
   */
  readonly default?: UniformInput<T>;
}

/** One entry of a {@link UniformFields} record. */
export type UniformFieldDeclaration = UniformFieldType | UniformFieldOptions;

/** The fields of a block or a nested struct, keyed by their shader-visible name. */
export type UniformFields = Readonly<Record<string, UniformFieldDeclaration>>;

/** The named blocks of an explicit multi-block schema. */
export type UniformBlockRecord = Readonly<Record<string, UniformBlock>>;

/** The field type behind a declaration entry, with any metadata stripped. */
export type UniformFieldTypeOf<D> = D extends UniformFieldType ? D : D extends UniformFieldOptions<infer T> ? T : never;

/** The values a struct's fields accept, all optional. */
export type UniformStructInput<F extends UniformFields> = {
  readonly [K in keyof F]?: UniformInput<UniformFieldTypeOf<F[K]>>;
};

/** The value a field of type `T` accepts. */
export type UniformInput<T> = T extends UniformType.Float | UniformType.Int | UniformType.Uint
  ? number
  : T extends UniformType.Vec2
    ? UniformVec2Input
    : T extends UniformType.Vec3
      ? UniformVec3Input
      : T extends UniformType.Vec4
        ? UniformVec4Input
        : T extends UniformType.Mat3
          ? UniformMat3Input
          : T extends UniformType.Mat4
            ? UniformMat4Input
            : T extends UniformStruct<infer F>
              ? UniformStructInput<F>
              : T extends UniformArray<infer E>
                ? ReadonlyArray<UniformInput<E>>
                : never;

/**
 * Element types whose size is already a multiple of 16 bytes, which is what a
 * uniform-buffer array element stride has to be in both languages.
 */
const strideAlignedArrayElements = new Set<UniformType>([UniformType.Vec4, UniformType.Mat3, UniformType.Mat4]);

/** Identifier a shader can carry: no leading digit, no `gl_` prefix, no `__`. */
const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Field names that would shadow a member of the accessor a struct or block
 * hands out, making `uniforms.thing.set(...)` mean two different things.
 */
const reservedFieldNames = new Set<string>(['set', 'setPacked', 'commit', 'at', 'length', 'uniforms', 'revision']);

/** @internal */
export const validateUniformFields = (fields: UniformFields, path: string): void => {
  for (const name of Object.keys(fields)) {
    if (!identifierPattern.test(name) || name.startsWith('gl_') || name.includes('__')) {
      throw new Error(`Uniform field \`${path}${name}\` is not a valid shader identifier (no leading digit, no \`gl_\` prefix, no \`__\`).`);
    }

    if (reservedFieldNames.has(name)) {
      throw new Error(`Uniform field \`${path}${name}\` uses a name reserved by the uniform accessor API (${[...reservedFieldNames].join(', ')}).`);
    }
  }

  if (Object.keys(fields).length === 0) {
    throw new Error(`Uniform block \`${path || 'uniforms'}\` declares no fields.`);
  }
};

/**
 * A struct nested inside a uniform block.
 *
 * A nested struct is a group of fields within the containing block, not a
 * second GPU resource: it shares the block's buffer and its revision. Declaring
 * one explicitly - rather than treating any plain object as a struct - is what
 * keeps `{ type, default }` metadata distinguishable from a group of fields.
 * @advanced
 */
export class UniformStruct<F extends UniformFields = UniformFields> {
  public readonly kind = 'struct' as const;
  public readonly fields: F;

  public constructor(fields: F) {
    validateUniformFields(fields, '');
    this.fields = fields;
  }
}

/**
 * A fixed-length array of `length` elements of one type.
 *
 * Element types are restricted to those whose stride is already a multiple of
 * 16 bytes - `vec4<f32>`, the matrices, and structs. A smaller element would
 * need a 16-byte stride the two languages cannot spell the same way: std140
 * applies it silently, while WGSL rejects the array outright in the uniform
 * address space. Declare `Vec4` and use its components instead of an array of
 * four floats.
 * @advanced
 */
export class UniformArray<E extends UniformArrayElement = UniformArrayElement> {
  public readonly kind = 'array' as const;
  public readonly element: E;
  public readonly length: number;

  public constructor(element: E, length: number) {
    if (!Number.isInteger(length) || length < 1) {
      throw new Error(`UniformArray length must be a positive integer, received ${String(length)}.`);
    }

    if (typeof element === 'string' && !strideAlignedArrayElements.has(element)) {
      throw new Error(
        `UniformArray element type \`${element}\` has a stride below 16 bytes, which a uniform buffer cannot carry portably. Use \`${UniformType.Vec4}\`, a matrix, or a UniformStruct.`,
      );
    }

    this.element = element;
    this.length = length;
  }
}

/**
 * One explicitly named uniform block.
 *
 * Use this only with `uniformBlocks`, where the record key supplies both the
 * shader-visible instance name and the runtime namespace. A shader that needs a
 * single block declares `uniforms` instead and lets the engine name it.
 * @advanced
 */
export class UniformBlock<F extends UniformFields = UniformFields> {
  public readonly kind = 'block' as const;
  public readonly fields: F;

  public constructor(fields: F) {
    validateUniformFields(fields, '');
    this.fields = fields;
  }
}

/** The declaration entry's field type, at runtime. @internal */
export const uniformFieldTypeOf = (declaration: UniformFieldDeclaration): UniformFieldType =>
  typeof declaration === 'string' || declaration instanceof UniformStruct || declaration instanceof UniformArray ? declaration : declaration.type;

/** The declaration entry's default value, or `undefined`. @internal */
export const uniformFieldDefaultOf = (declaration: UniformFieldDeclaration): unknown =>
  typeof declaration === 'string' || declaration instanceof UniformStruct || declaration instanceof UniformArray ? undefined : declaration.default;

/**
 * The declared defaults of `fields` as one nested value record, or `null` when
 * every field starts at zero.
 *
 * A field's own `default` wins over defaults declared inside its type: an array
 * whose element struct declares defaults starts with every element carrying
 * them, unless the array itself declares a value.
 * @internal
 */
export const collectUniformDefaults = (fields: UniformFields): Record<string, unknown> | null => {
  const defaults: Record<string, unknown> = {};
  let any = false;

  for (const name of Object.keys(fields)) {
    // `fields` is iterated by its own keys, so the entry is present.
    const declaration = fields[name]!;
    const declared = uniformFieldDefaultOf(declaration);

    if (declared !== undefined) {
      defaults[name] = declared;
      any = true;
      continue;
    }

    const fieldType = uniformFieldTypeOf(declaration);

    if (fieldType instanceof UniformStruct) {
      const nested = collectUniformDefaults(fieldType.fields);

      if (nested !== null) {
        defaults[name] = nested;
        any = true;
      }

      continue;
    }

    if (fieldType instanceof UniformArray && fieldType.element instanceof UniformStruct) {
      const nested = collectUniformDefaults(fieldType.element.fields);

      if (nested !== null) {
        defaults[name] = Array.from({ length: fieldType.length }, () => nested);
        any = true;
      }
    }
  }

  return any ? defaults : null;
};
