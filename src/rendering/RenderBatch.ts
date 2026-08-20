import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { MeshMaterial } from '#rendering/material/MeshMaterial';

/** Component count of each per-instance attribute format. @internal */
const instanceFormatComponents = {
  float32: 1,
  float32x2: 2,
  float32x3: 3,
  float32x4: 4,
} as const;

/** Vertex format of a per-instance attribute. @stable */
export type InstanceAttributeFormat = keyof typeof instanceFormatComponents;

/**
 * First vertex-attribute location available to free per-instance attributes.
 * Locations 0..2 carry the geometry (position, texcoord, color) and 6 carries
 * `a_nodeIndex`.
 * @stable
 */
export const FIRST_INSTANCE_ATTRIBUTE_LOCATION = 7;

/**
 * One free per-instance attribute of a {@link RenderBatch}.
 *
 * WebGL2 binds it by `name` through shader reflection. WebGPU has no
 * name-based vertex binding, so the **declaration order** fixes the location:
 * the Nth declared attribute is
 * `@location(FIRST_INSTANCE_ATTRIBUTE_LOCATION + N)` and a WGSL shader must
 * declare it there. Keeping one ordered list rather than a per-backend location
 * field means the same declaration drives both.
 * @stable
 */
export interface InstanceAttribute {
  /** Attribute name as declared in the material's GLSL shader. */
  readonly name: string;
  /** Component count and type of the value written per instance. */
  readonly format: InstanceAttributeFormat;
}

/** Per-instance value accepted by {@link RenderBatch.add}. @stable */
export type InstanceAttributeValue = number | readonly number[];

/** Options for {@link RenderBatch}. @stable */
export interface RenderBatchOptions {
  /**
   * Free per-instance attributes, interleaved into one instance buffer in the
   * order given. Only meaningful together with a custom material whose shader
   * declares matching inputs - the default mesh shader has none.
   */
  readonly instanceAttributes?: readonly InstanceAttribute[];
}

/** Resolved layout of one declared instance attribute. @internal */
export interface InstanceAttributeBinding {
  readonly name: string;
  readonly componentCount: number;
  readonly offsetFloats: number;
  /** Fixed vertex-attribute location, for backends without name-based binding. */
  readonly location: number;
}

/** The packed per-instance attribute stream handed to a backend. @internal */
export interface InstanceDataView {
  /** Interleaved storage; only the first `count * strideFloats` entries are valid. */
  readonly data: Float32Array;
  readonly strideFloats: number;
  readonly attributes: readonly InstanceAttributeBinding[];
  /** Stable identity of the layout, for keying per-layout GPU state. */
  readonly layoutKey: string;
}

/**
 * Explicit instanced draw submission: **one** {@link Geometry} + {@link MeshMaterial}
 * drawn **once** with **N** per-instance `(transform, tint)` pairs - the general
 * form of the engine's mesh-instancing model, surfaced for data-driven rendering
 * (thousands of tiles, bullets, grass blades, procedural items as a single draw).
 *
 * Build it up with {@link add}, hand it to {@link RenderingContext.drawBatch},
 * and {@link clear} it to reuse the same instance across frames without
 * reallocating - the per-instance transform/tint storage grows on demand and is
 * retained across `clear()`, so a steady-state batch allocates nothing.
 *
 * Each {@link add} **copies** the transform and tint into internal storage, so
 * the caller may mutate or reuse the passed `Matrix`/`Color` immediately
 * afterwards without affecting the batch.
 *
 * This is the explicit instanced submission path - distinct from the internal
 * automatic sprite batcher: every instance shares the one geometry and material,
 * and the whole batch is a single instanced draw call.
 * @stable
 */
export class RenderBatch {
  /** The geometry every instance in this batch draws. */
  public readonly geometry: Geometry;

  /** The shared mesh material, or `null` for the default mesh material. */
  public readonly material: MeshMaterial | null;

  // Per-instance storage grows with `add` and is reused after `clear` - only the
  // logical `_count` resets, the pooled Matrix/Color instances are kept.
  private readonly _transforms: Matrix[] = [];
  private readonly _tints: Color[] = [];
  private _count = 0;

  // Interleaved free-attribute storage; null when none were declared. Grows with
  // `add` and survives `clear`, like the transform/tint pools above.
  private readonly _instanceBindings: readonly InstanceAttributeBinding[];
  private readonly _instanceStrideFloats: number;
  private _instanceData: Float32Array;
  // Mutable mirror of _instanceData handed to the backend; `data` is re-pointed
  // when the storage grows so the getter never allocates.
  private readonly _instanceViewCache: {
    data: Float32Array;
    readonly strideFloats: number;
    readonly attributes: readonly InstanceAttributeBinding[];
    readonly layoutKey: string;
  } | null;

  public constructor(geometry: Geometry, material: MeshMaterial | null = null, options: RenderBatchOptions = {}) {
    // Defensive guard for JS callers; MeshMaterial's `target` is the literal
    // 'mesh' for TypeScript callers. Whether the material's shader satisfies the
    // instancing contract can only be decided from the LINKED program, so that
    // check lives at the first draw, not here.
    if (material !== null && (material.target as string) !== 'mesh') {
      throw new Error(`RenderBatch material must target 'mesh' (got '${String(material.target)}').`);
    }

    const declared = options.instanceAttributes ?? [];
    const bindings: InstanceAttributeBinding[] = [];
    const seen = new Set<string>();
    let offsetFloats = 0;

    for (const attribute of declared) {
      const componentCount = instanceFormatComponents[attribute.format];

      if (componentCount === undefined) {
        throw new Error(`RenderBatch instance attribute '${attribute.name}' has unknown format '${String(attribute.format)}'.`);
      }

      if (seen.has(attribute.name)) {
        throw new Error(`RenderBatch instance attribute '${attribute.name}' is declared more than once.`);
      }

      seen.add(attribute.name);
      bindings.push({
        name: attribute.name,
        componentCount,
        offsetFloats,
        location: FIRST_INSTANCE_ATTRIBUTE_LOCATION + bindings.length,
      });
      offsetFloats += componentCount;
    }

    this.geometry = geometry;
    this.material = material;
    this._instanceBindings = bindings;
    this._instanceStrideFloats = offsetFloats;
    this._instanceData = new Float32Array(0);
    this._instanceViewCache =
      offsetFloats === 0
        ? null
        : {
            data: this._instanceData,
            strideFloats: offsetFloats,
            attributes: bindings,
            layoutKey: bindings.map(binding => `${binding.name}:${binding.componentCount}`).join(','),
          };
  }

  /** Number of instances currently in the batch. */
  public get count(): number {
    return this._count;
  }

  /**
   * Append one instance. `transform` is the instance's world matrix (taken as
   * the raw `a,b,c,d,tx,ty`), `tint` modulates the geometry's vertex colors
   * (defaults to white).
   *
   * `data` supplies the free attributes declared via
   * {@link RenderBatchOptions.instanceAttributes}, keyed by attribute name. Every
   * declared attribute must be present.
   *
   * All three arguments are **copied** into the batch, so the caller may mutate
   * and reuse them immediately - hoist one scratch object out of the loop rather
   * than allocating a literal per instance, or a steady-state batch stops being
   * allocation-free:
   *
   * ```ts
   * const data = { a_offset: [0, 0] };
   *
   * for (const item of items) {
   *   data.a_offset[0] = item.x;
   *   data.a_offset[1] = item.y;
   *   batch.add(item.transform, item.tint, data);
   * }
   * ```
   */
  public add(transform: Matrix, tint: Color | null = null, data: Readonly<Record<string, InstanceAttributeValue>> | null = null): this {
    let matrix = this._transforms[this._count];

    if (matrix === undefined) {
      matrix = new Matrix();
      this._transforms[this._count] = matrix;
    }

    matrix.copy(transform);

    let color = this._tints[this._count];

    if (color === undefined) {
      color = new Color();
      this._tints[this._count] = color;
    }

    color.copy(tint ?? Color.white);

    if (this._instanceStrideFloats > 0) {
      this._writeInstanceData(data);
    }

    this._count++;

    return this;
  }

  private _writeInstanceData(data: Readonly<Record<string, InstanceAttributeValue>> | null): void {
    if (data === null) {
      throw new Error('RenderBatch.add requires instance data: this batch declares instance attributes.');
    }

    const stride = this._instanceStrideFloats;
    const required = (this._count + 1) * stride;

    if (required > this._instanceData.length) {
      // Double so repeated adds stay amortised O(1), like the Matrix/Color pools.
      const grown = new Float32Array(Math.max(required, this._instanceData.length * 2));

      grown.set(this._instanceData);
      this._instanceData = grown;
      this._instanceViewCache!.data = grown;
    }

    const base = this._count * stride;

    for (const binding of this._instanceBindings) {
      const value = data[binding.name];

      if (value === undefined) {
        throw new Error(`RenderBatch.add is missing instance attribute '${binding.name}'.`);
      }

      const target = base + binding.offsetFloats;

      if (typeof value === 'number') {
        if (binding.componentCount !== 1) {
          throw new Error(`RenderBatch instance attribute '${binding.name}' expects ${binding.componentCount} components (got a single number).`);
        }

        this._instanceData[target] = value;
        continue;
      }

      if (value.length !== binding.componentCount) {
        throw new Error(`RenderBatch instance attribute '${binding.name}' expects ${binding.componentCount} components (got ${value.length}).`);
      }

      for (let i = 0; i < binding.componentCount; i++) {
        this._instanceData[target + i] = value[i]!;
      }
    }
  }

  /** Reset to zero instances for reuse, retaining the pooled storage. */
  public clear(): this {
    this._count = 0;

    return this;
  }

  /**
   * Release the pooled per-instance storage. After this the batch must not be
   * reused. The {@link geometry} and {@link material} are owned by the caller and
   * are not destroyed.
   */
  public destroy(): void {
    for (const matrix of this._transforms) {
      matrix.destroy();
    }

    for (const color of this._tints) {
      color.destroy();
    }

    this._transforms.length = 0;
    this._tints.length = 0;
    this._instanceData = new Float32Array(0);
    this._count = 0;

    if (this._instanceViewCache !== null) {
      this._instanceViewCache.data = this._instanceData;
    }
  }

  /**
   * The packed free-attribute stream, or `null` when none were declared. Backed
   * by a cached object whose `data` reference is refreshed on growth, so reading
   * it every frame allocates nothing.
   * @internal
   */
  public get _instanceView(): InstanceDataView | null {
    return this._instanceViewCache;
  }

  /** Pooled per-instance transforms; only the first {@link count} are valid. @internal */
  public get _instanceTransforms(): readonly Matrix[] {
    return this._transforms;
  }

  /** Pooled per-instance tints; only the first {@link count} are valid. @internal */
  public get _instanceTints(): readonly Color[] {
    return this._tints;
  }
}
