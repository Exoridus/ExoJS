/**
 * GLSL and WGSL declarations generated from a {@link UniformSchemaLayout}.
 *
 * Both languages describe the byte layout computed in `uniformLayout`, rather
 * than each language's own defaults. GLSL needs no help - `std140` already
 * produces those offsets - while WGSL carries explicit `@align`/`@size`
 * attributes wherever its natural rules would place an aggregate differently:
 * a nested struct is aligned to 16 and padded to a multiple of it, which is
 * what makes an array of structs stride correctly and what a uniform buffer
 * requires in the first place.
 */

import type { UniformBlockLayout, UniformMemberLayout, UniformNodeLayout, UniformSchemaLayout, UniformStructLayout } from './uniformLayout';
import { uniformTypeGlsl } from './UniformType';

/**
 * GLSL ES 3.00 gives float types no default precision in the fragment stage, so
 * an unqualified block member fails to compile there. Qualifying the members
 * rather than relying on a `precision` statement also frees the generated block
 * from having to be emitted after one.
 */
const glslPrecision = 'highp';

/** Uniform buffers align every aggregate to 16 bytes in both languages. */
const aggregateAlignment = 16;

const glslMemberDeclaration = (member: UniformMemberLayout, indent: string): string => {
  const { name, node } = member;

  if (node.kind === 'leaf') {
    return `${indent}${glslPrecision} ${uniformTypeGlsl[node.type]} ${name};`;
  }

  if (node.kind === 'struct') {
    return `${indent}${node.typeName} ${name};`;
  }

  const element = node.element;
  const elementType = element.kind === 'leaf' ? `${glslPrecision} ${uniformTypeGlsl[element.type]}` : (element as UniformStructLayout).typeName;

  return `${indent}${elementType} ${name}[${node.length}];`;
};

const glslStructDeclaration = (struct: UniformStructLayout): string => {
  const body = struct.members.map(member => glslMemberDeclaration(member, '    ')).join('\n');

  return `struct ${struct.typeName} {\n${body}\n};`;
};

const glslBlockDeclaration = (block: UniformBlockLayout): string => {
  const body = block.members.map(member => glslMemberDeclaration(member, '    ')).join('\n');

  // GLSL ES 3.00 has no `binding` layout qualifier for interface blocks, so the
  // WebGL2 backend resolves the block by name and assigns its binding point
  // through `uniformBlockBinding` instead.
  return `layout(std140) uniform ${block.typeName} {\n${body}\n} ${block.instance};`;
};

/**
 * The GLSL ES 3.00 declarations for `schema`, ready to be prepended to a user
 * stage.
 * @internal
 */
export const generateGlslUniformDeclarations = (schema: UniformSchemaLayout): string => {
  const parts: string[] = [];

  for (const block of schema.blocks) {
    for (const struct of block.structs) {
      parts.push(glslStructDeclaration(struct));
    }

    parts.push(glslBlockDeclaration(block));
  }

  return parts.join('\n');
};

const wgslTypeName = (node: UniformNodeLayout): string => {
  if (node.kind === 'leaf') {
    return node.type;
  }

  if (node.kind === 'struct') {
    return node.typeName;
  }

  return `array<${wgslTypeName(node.element)}, ${node.length}>`;
};

/**
 * Members whose type is an aggregate carry `@align(16)`: WGSL would otherwise
 * take a struct's alignment from its widest member, placing a struct of floats
 * four bytes after its predecessor where the canonical layout puts it sixteen.
 */
const wgslMemberAttributes = (node: UniformNodeLayout, paddedSize: number): string => {
  const attributes: string[] = [];

  if (node.kind !== 'leaf') {
    attributes.push(`@align(${aggregateAlignment})`);
  }

  if (paddedSize !== node.size) {
    attributes.push(`@size(${paddedSize})`);
  }

  return attributes.length > 0 ? `${attributes.join(' ')} ` : '';
};

/**
 * `members` as WGSL struct members, with the last one padded so the struct's
 * own size is `size`. A struct of a single `f32` is 4 bytes to WGSL and 16 to
 * the canonical layout; without the padding an array of it would stride 4.
 */
const wgslMembers = (members: readonly UniformMemberLayout[], baseOffset: number, size: number): string =>
  members
    .map((member, index) => {
      const last = index === members.length - 1;
      const paddedSize = last ? baseOffset + size - member.node.offset : member.node.size;

      return `    ${wgslMemberAttributes(member.node, paddedSize)}${member.name}: ${wgslTypeName(member.node)},`;
    })
    .join('\n');

const wgslStructDeclaration = (struct: UniformStructLayout): string =>
  `struct ${struct.typeName} {\n${wgslMembers(struct.members, struct.offset, struct.size)}\n};`;

/**
 * The WGSL declarations for `schema` in bind group `group`, ready to be
 * prepended to a user module. Blocks take bindings `0..n-1` in declaration
 * order; texture bindings follow after them.
 * @internal
 */
export const generateWgslUniformDeclarations = (schema: UniformSchemaLayout, group: number): string => {
  const parts: string[] = [];

  for (const [index, block] of schema.blocks.entries()) {
    for (const struct of block.structs) {
      parts.push(wgslStructDeclaration(struct));
    }

    parts.push(`struct ${block.typeName} {\n${wgslMembers(block.members, 0, block.byteLength)}\n};`);
    parts.push(`@group(${group}) @binding(${index}) var<uniform> ${block.instance}: ${block.typeName};`);
  }

  return parts.join('\n');
};

/** A line that may precede a generated declaration without moving it out of place. */
const isGlslPreambleDirective = (line: string): boolean => line.startsWith('#version') || line.startsWith('#extension');

const isWgslPreambleDirective = (line: string): boolean => line.startsWith('enable') || line.startsWith('requires') || line.startsWith('diagnostic');

/**
 * Insert `declarations` after the source's leading directive run.
 *
 * `#version` must be the first token of a GLSL source and `#extension` must
 * precede any declaration, so the generated block cannot simply go on top; the
 * same holds for a WGSL `enable`.
 */
const insertAfterPreamble = (source: string, declarations: string, isDirective: (line: string) => boolean): string => {
  const lines = source.split('\n');
  let insertAt = 0;

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith('//')) {
      continue;
    }

    if (isDirective(trimmed)) {
      insertAt = index + 1;
      continue;
    }

    break;
  }

  lines.splice(insertAt, 0, declarations);

  return lines.join('\n');
};

/** @internal */
export const withGlslUniformDeclarations = (source: string, declarations: string): string => insertAfterPreamble(source, declarations, isGlslPreambleDirective);

/** @internal */
export const withWgslUniformDeclarations = (source: string, declarations: string): string => insertAfterPreamble(source, declarations, isWgslPreambleDirective);
