/**
 * Buffer reuse hint used by geometry-aware render paths.
 *
 * - `static` - not expected to be mutated after creation; the only usage a
 *   retained recording may reference, and the one eligible for shared batched
 *   buffers.
 * - `dynamic` - occasionally mutated; re-uploaded after
 *   {@link Geometry.invalidate}.
 * - `stream` - mutated every frame; resolved like `dynamic` today, kept as a
 *   statement of intent for a backend that specialises on it.
 */
export type GeometryUsage = 'static' | 'dynamic' | 'stream';

/** Scalar component type used by a geometry vertex attribute. */
export type AttributeType = 'f32' | 'u8' | 'u16' | 'u32' | 'i32';

/** Primitive topology used when drawing this geometry. */
export type Topology = 'triangle-list' | 'triangle-strip';

/**
 * Descriptor for one attribute in an interleaved vertex layout.
 * Offsets and stride are expressed in bytes.
 */
export interface GeometryAttribute {
  readonly name: string;
  readonly size: number;
  readonly type: AttributeType;
  readonly normalized: boolean;
  readonly offset: number;
}

/** Construction options for {@link Geometry}. */
export interface GeometryOptions {
  readonly attributes: readonly GeometryAttribute[];
  readonly vertexData: Float32Array | ArrayBuffer;
  readonly stride: number;
  readonly indices?: Uint16Array | Uint32Array | null;
  readonly topology?: Topology;
  readonly usage?: GeometryUsage;
}
