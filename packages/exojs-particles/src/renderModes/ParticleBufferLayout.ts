import type { AttributeType, Geometry, GeometryAttribute, GeometryUsage, Topology } from '@codexo/exojs';

const attributeTypeByteSizes: Record<AttributeType, number> = {
  f32: 4,
  u8: 1,
  u16: 2,
  u32: 4,
  i32: 4,
};

const validTopologies = new Set<Topology>(['triangle-list', 'triangle-strip']);
const validUsages = new Set<GeometryUsage>(['static', 'dynamic', 'stream']);

interface AttributeRange {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Check that an attribute set describes a bindable interleaved record: unique
 * names, sane sizes and offsets, and ranges that neither overlap each other nor
 * reach past the stride.
 */
const validateAttributes = (attributes: readonly GeometryAttribute[], stride: number): void => {
  const ranges: AttributeRange[] = [];
  const names = new Set<string>();

  for (const attribute of attributes) {
    if (typeof attribute.name !== 'string' || attribute.name.length === 0) {
      throw new Error('ParticleBufferLayout attribute name must be a non-empty string.');
    }

    if (names.has(attribute.name)) {
      throw new Error(`ParticleBufferLayout attribute "${attribute.name}" is declared more than once.`);
    }

    names.add(attribute.name);

    if (!Number.isInteger(attribute.size) || attribute.size < 1 || attribute.size > 4) {
      throw new Error(`ParticleBufferLayout attribute "${attribute.name}" size must be an integer in [1..4] (got ${attribute.size}).`);
    }

    if (!Number.isInteger(attribute.offset) || attribute.offset < 0) {
      throw new Error(`ParticleBufferLayout attribute "${attribute.name}" offset must be a non-negative integer (got ${attribute.offset}).`);
    }

    const end = attribute.offset + attributeTypeByteSizes[attribute.type] * attribute.size;

    if (end > stride) {
      throw new Error(`ParticleBufferLayout attribute "${attribute.name}" range [${attribute.offset}, ${end}) exceeds stride ${stride}.`);
    }

    for (const range of ranges) {
      if (attribute.offset < range.end && end > range.start) {
        throw new Error(`ParticleBufferLayout attribute "${attribute.name}" overlaps attribute "${range.name}" in the interleaved layout.`);
      }
    }

    ranges.push({ name: attribute.name, start: attribute.offset, end });
  }
};

/** Construction options for {@link ParticleBufferLayout}. */
export interface ParticleBufferLayoutOptions {
  /** Interleaved attributes, in declaration order. Shader locations follow this order. */
  readonly attributes: readonly GeometryAttribute[];

  /** Bytes one record occupies. Must be a positive integer. */
  readonly stride: number;

  /** Upload hint for the buffer this layout describes. Defaults to `stream`. */
  readonly usage?: GeometryUsage;

  /**
   * Topology of the draw, used only when the mode declares no per-vertex
   * geometry to take it from. Defaults to `triangle-list`.
   */
  readonly topology?: Topology;

  /**
   * Index list for the draw, used only when the mode declares no per-vertex
   * geometry to take it from. Defaults to none.
   */
  readonly indices?: Uint16Array | Uint32Array | null;
}

/**
 * Describes the interleaved buffer a render mode's `build()` fills each frame.
 *
 * Deliberately not a `Geometry`. A `Geometry` requires a position attribute,
 * requires that attribute to carry at least two components, and validates any
 * index list against the vertex count implied by its `vertexData` - three rules
 * that are meaningful for geometry and meaningless for a per-instance record.
 * Satisfying them used to cost the instanced modes a zero-filled placeholder
 * buffer that was never uploaded, sized purely to keep the index check quiet.
 *
 * What is checked here is the subset that protects a real GPU binding: a
 * positive stride, at least one attribute, unique names, and ranges that
 * neither overlap each other nor reach past the stride.
 *
 * A layout is a description rather than a resource: it owns no GPU handle and
 * needs no disposal.
 */
export class ParticleBufferLayout {
  public readonly attributes: readonly GeometryAttribute[];
  public readonly stride: number;
  public readonly usage: GeometryUsage;
  public readonly topology: Topology;
  public readonly indices: Uint16Array | Uint32Array | null;

  public constructor(options: ParticleBufferLayoutOptions) {
    const { attributes, stride, usage = 'stream', topology = 'triangle-list', indices = null } = options;

    if (attributes.length === 0) {
      throw new Error('ParticleBufferLayout attributes must be a non-empty array.');
    }

    if (!Number.isInteger(stride) || stride <= 0) {
      throw new Error(`ParticleBufferLayout stride must be a positive integer (got ${stride}).`);
    }

    if (!validTopologies.has(topology)) {
      throw new Error(`ParticleBufferLayout topology must be one of: triangle-list, triangle-strip (got ${String(topology)}).`);
    }

    if (!validUsages.has(usage)) {
      throw new Error(`ParticleBufferLayout usage must be one of: static, dynamic, stream (got ${String(usage)}).`);
    }

    validateAttributes(attributes, stride);

    this.attributes = attributes.map(attribute => ({ ...attribute }));
    this.stride = stride;
    this.usage = usage;
    this.topology = topology;
    this.indices = indices;
  }

  /** Elements one draw consumes from {@link indices}, or 0 when there are none. */
  public get indexCount(): number {
    return this.indices?.length ?? 0;
  }
}

/**
 * Guard the two seam combinations a mode must not declare.
 *
 * Called by a mode's own constructor, so the error names the mistake where it
 * was made, and repeated by each executor when it first realises a mode, so a
 * mode written outside this package cannot slip past. Both checks are cheap and
 * run once per mode rather than per frame.
 *
 * @param modeName Class name of the mode, used to prefix the error.
 */
export const assertVertexGeometryCompatible = (
  dataLayout: ParticleBufferLayout,
  vertexGeometry: Geometry | null,
  instanced: boolean,
  modeName: string,
): void => {
  if (vertexGeometry === null) {
    return;
  }

  if (!instanced) {
    throw new Error(
      `${modeName}: a per-vertex geometry requires an instanced mode. Without instancing both buffers would step per vertex, which no draw can express.`,
    );
  }

  const declared = new Set(dataLayout.attributes.map(attribute => attribute.name));

  for (const attribute of vertexGeometry.attributes) {
    if (declared.has(attribute.name)) {
      throw new Error(
        `${modeName}: attribute "${attribute.name}" is declared by both the per-frame buffer and the per-vertex geometry. Every attribute name must be unique across the two buffers.`,
      );
    }
  }
};
