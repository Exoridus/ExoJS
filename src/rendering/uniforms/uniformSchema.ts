/**
 * Turning a caller's uniform declaration into the layout the engine renders
 * with, and the type-level shape of the values and accessors that follow from
 * it.
 */

import { UniformBlockData } from './UniformBlockData';
import type { UniformBlockRecord, UniformFields, UniformStructInput } from './uniformDeclarations';
import { UniformBlock, validateUniformFields } from './uniformDeclarations';
import type { UniformBlockLayout, UniformSchemaLayout } from './uniformLayout';
import { computeUniformBlockLayout, explicitUniformBlockTypeName, implicitUniformBlockInstance, implicitUniformBlockTypeName } from './uniformLayout';

/**
 * A uniform declaration on a {@link Shader}.
 *
 * `uniforms` declares one engine-named block and is the common case;
 * `uniformBlocks` declares one or more named blocks explicitly. The two are
 * alternatives and cannot both be given.
 */
export interface UniformSchemaOptions<F extends UniformFields | undefined = undefined, B extends UniformBlockRecord | undefined = undefined> {
  /**
   * Fields of a single block the shader reads through the instance name
   * `uniforms`. Declaring it switches materials and filters built on this
   * source to typed accessors and generates the block's GLSL and WGSL
   * declarations.
   */
  readonly uniforms?: F;

  /**
   * Named blocks the shader reads through their record keys. Blocks take
   * bindings `0..n-1` of the consumer's user bind group in declaration order,
   * with texture bindings following after them.
   */
  readonly uniformBlocks?: B;
}

/** The live block values a schema's instance owns, keyed as declared. */
export type UniformBlockDataRecord<B extends UniformBlockRecord> = {
  readonly [K in keyof B]: B[K] extends UniformBlock<infer F> ? UniformBlockData<F> : never;
};

/** Per-block starting values accepted when an instance is constructed. */
export type UniformBlockInitialValues<B extends UniformBlockRecord> = {
  readonly [K in keyof B]?: B[K] extends UniformBlock<infer F> ? UniformStructInput<F> : never;
};

/**
 * Build the layout for a declaration, or `null` when there is none.
 * @internal
 */
export const buildUniformSchemaLayout = (uniforms: UniformFields | undefined, uniformBlocks: UniformBlockRecord | undefined): UniformSchemaLayout | null => {
  if (uniforms !== undefined && uniformBlocks !== undefined) {
    throw new Error('Shader accepts either `uniforms` or `uniformBlocks`, not both.');
  }

  if (uniforms !== undefined) {
    validateUniformFields(uniforms, '');

    return {
      implicit: true,
      blocks: [computeUniformBlockLayout(uniforms, implicitUniformBlockInstance, implicitUniformBlockInstance, implicitUniformBlockTypeName)],
    };
  }

  if (uniformBlocks === undefined) {
    return null;
  }

  const keys = Object.keys(uniformBlocks);

  if (keys.length === 0) {
    throw new Error('Shader `uniformBlocks` declares no blocks.');
  }

  const blocks: UniformBlockLayout[] = keys.map(key => {
    // In-bounds: `key` comes from `uniformBlocks`' own keys.
    const block = uniformBlocks[key]!;

    if (!(block instanceof UniformBlock)) {
      throw new Error(`Shader \`uniformBlocks.${key}\` must be a UniformBlock.`);
    }

    return computeUniformBlockLayout(block.fields, key, key, explicitUniformBlockTypeName(key));
  });

  return { implicit: false, blocks };
};

/** One fresh {@link UniformBlockData} per declared block, in declaration order. @internal */
export const createUniformBlockData = (schema: UniformSchemaLayout, onChange?: () => void): UniformBlockData[] =>
  schema.blocks.map(layout => new UniformBlockData(layout, onChange));

/** Index the blocks by their record key. @internal */
export const uniformBlockRecord = (blocks: readonly UniformBlockData[]): Record<string, UniformBlockData> => {
  const record: Record<string, UniformBlockData> = {};

  for (const block of blocks) {
    record[block.layout.key] = block;
  }

  return record;
};
