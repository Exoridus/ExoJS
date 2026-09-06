/**
 * The canonical byte layout of a typed uniform schema.
 *
 * One layout serves both languages. GLSL `std140` and the WGSL uniform address
 * space agree on every construct the schema can express: 4-byte scalars, 8-byte
 * `vec2`, 16-byte-aligned `vec3`/`vec4`, matrices as arrays of 16-byte-aligned
 * columns, arrays whose element stride is rounded up to 16, and nested structs
 * aligned to 16 and padded to their own alignment. Computing the offsets once
 * here - instead of reading them back per backend - is what lets the two
 * generated declarations describe the same bytes by construction.
 */

import type { UniformFields, UniformFieldType } from './uniformDeclarations';
import { collectUniformDefaults, uniformFieldTypeOf } from './uniformDeclarations';
import type { UniformType } from './UniformType';
import { isUniformType, uniformTypeInfo } from './UniformType';

/** A scalar, vector or matrix field. */
export interface UniformLeafLayout {
  readonly kind: 'leaf';
  readonly type: UniformType;
  /** Byte offset from the start of the owning block. */
  readonly offset: number;
  readonly size: number;
}

/** One named entry of a block or nested struct, in declaration order. */
export interface UniformMemberLayout {
  readonly name: string;
  readonly node: UniformNodeLayout;
}

/** A nested struct field. `offset` is that of its first element. */
export interface UniformStructLayout {
  readonly kind: 'struct';
  /** WebGl2Shader-visible type name of the generated struct declaration. */
  readonly typeName: string;
  readonly offset: number;
  readonly size: number;
  readonly align: number;
  readonly members: readonly UniformMemberLayout[];
}

/** An array field. `element` is laid out at element index 0. */
export interface UniformArrayLayout {
  readonly kind: 'array';
  readonly offset: number;
  readonly size: number;
  readonly align: number;
  /** Bytes between consecutive elements; always a multiple of 16. */
  readonly stride: number;
  readonly length: number;
  readonly element: UniformNodeLayout;
}

export type UniformNodeLayout = UniformLeafLayout | UniformStructLayout | UniformArrayLayout;

/** One uniform block: its shader-visible names, its size, and its fields. */
export interface UniformBlockLayout {
  /** Interface-block / struct type name shared by both generated declarations. */
  readonly typeName: string;
  /** WebGl2Shader-visible instance name the shader body reads through. */
  readonly instance: string;
  /** Record key this block is addressed by at runtime; `uniforms` for the implicit block. */
  readonly key: string;
  /** Total size in bytes, padded to a multiple of 16. */
  readonly byteLength: number;
  readonly members: readonly UniformMemberLayout[];
  /** Nested struct declarations this block needs, innermost first. */
  readonly structs: readonly UniformStructLayout[];
  /** Declared starting values as one nested record, or `null` when all are zero. */
  readonly defaults: Record<string, unknown> | null;
}

/**
 * A shader source's whole uniform declaration.
 *
 * `implicit` distinguishes the single engine-named block declared through
 * `uniforms` from explicitly named `uniformBlocks`, which decides whether an
 * instance exposes `uniforms` directly or a `uniformBlocks` namespace.
 */
export interface UniformSchemaLayout {
  readonly implicit: boolean;
  readonly blocks: readonly UniformBlockLayout[];
}

/** Type-name prefix of every generated block and nested struct. @internal */
export const generatedUniformBlockPrefix = 'ExoUniforms';

const roundUp = (value: number, alignment: number): number => Math.ceil(value / alignment) * alignment;

/** Uniform buffers align every aggregate to 16 bytes, in std140 and in WGSL alike. */
const aggregateAlignment = 16;

const alignOfNode = (node: UniformNodeLayout): number => (node.kind === 'leaf' ? uniformTypeInfo[node.type].align : node.align);

const layoutLeaf = (type: UniformType, offset: number): UniformLeafLayout => ({ kind: 'leaf', type, offset, size: uniformTypeInfo[type].size });

const layoutNode = (fieldType: UniformFieldType, offset: number, typeName: string, structs: UniformStructLayout[]): UniformNodeLayout => {
  if (isUniformType(fieldType)) {
    return layoutLeaf(fieldType, offset);
  }

  if (fieldType.kind === 'array') {
    const array = fieldType;
    const element = layoutNode(array.element, offset, typeName, structs);
    const stride = roundUp(element.size, aggregateAlignment);

    return {
      kind: 'array',
      offset,
      size: stride * array.length,
      align: Math.max(aggregateAlignment, alignOfNode(element)),
      stride,
      length: array.length,
      element,
    };
  }

  const struct = fieldType;
  const members = layoutMembers(struct.fields, offset, typeName, structs);
  const layout: UniformStructLayout = {
    kind: 'struct',
    typeName,
    offset,
    size: roundUp(members.size, aggregateAlignment),
    align: aggregateAlignment,
    members: members.members,
  };

  structs.push(layout);

  return layout;
};

const layoutMembers = (
  fields: UniformFields,
  baseOffset: number,
  typeNamePrefix: string,
  structs: UniformStructLayout[],
): { members: UniformMemberLayout[]; size: number } => {
  const members: UniformMemberLayout[] = [];
  let cursor = baseOffset;

  for (const name of Object.keys(fields)) {
    // `fields` is iterated by its own keys, so the entry is present.
    const fieldType = uniformFieldTypeOf(fields[name]!);
    const probe = layoutNode(fieldType, 0, `${typeNamePrefix}_${name}`, []);
    const offset = roundUp(cursor, alignOfNode(probe));
    const node = layoutNode(fieldType, offset, `${typeNamePrefix}_${name}`, structs);

    members.push({ name, node });
    cursor = offset + node.size;
  }

  return { members, size: cursor - baseOffset };
};

/** Lay one block out from its field declarations. @internal */
export const computeUniformBlockLayout = (fields: UniformFields, key: string, instance: string, typeName: string): UniformBlockLayout => {
  const structs: UniformStructLayout[] = [];
  const { members, size } = layoutMembers(fields, 0, typeName, structs);

  return {
    typeName,
    instance,
    key,
    byteLength: Math.max(roundUp(size, aggregateAlignment), aggregateAlignment),
    members,
    structs,
    defaults: collectUniformDefaults(fields),
  };
};

/** The generated type name of the implicit block. @internal */
export const implicitUniformBlockTypeName = generatedUniformBlockPrefix;

/** The generated type name of an explicitly named block. @internal */
export const explicitUniformBlockTypeName = (key: string): string => `${generatedUniformBlockPrefix}_${key}`;

/** The instance name the implicit block is read through in both languages. @internal */
export const implicitUniformBlockInstance = 'uniforms';

/** WGSL bind group carrying a material's user uniforms and textures. @internal */
export const materialUniformGroup = 2;

/** WGSL bind group carrying a shader filter's user uniforms and textures. @internal */
export const filterUniformGroup = 1;
