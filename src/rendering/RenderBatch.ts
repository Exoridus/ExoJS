import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { MeshMaterial } from '#rendering/material/MeshMaterial';

/**
 * Explicit instanced draw submission: **one** {@link Geometry} + {@link MeshMaterial}
 * drawn **once** with **N** per-instance `(transform, tint)` pairs — the general
 * form of the engine's mesh-instancing model, surfaced for data-driven rendering
 * (thousands of tiles, bullets, grass blades, procedural items as a single draw).
 *
 * Build it up with {@link add}, hand it to {@link RenderingContext.drawBatch},
 * and {@link clear} it to reuse the same instance across frames without
 * reallocating — the per-instance transform/tint storage grows on demand and is
 * retained across `clear()`, so a steady-state batch allocates nothing.
 *
 * Each {@link add} **copies** the transform and tint into internal storage, so
 * the caller may mutate or reuse the passed `Matrix`/`Color` immediately
 * afterwards without affecting the batch.
 *
 * This is the explicit instanced submission path — distinct from the internal
 * automatic sprite batcher: every instance shares the one geometry and material,
 * and the whole batch is a single instanced draw call.
 * @stable
 */
export class RenderBatch {
  /** The geometry every instance in this batch draws. */
  public readonly geometry: Geometry;

  /** The shared mesh material, or `null` for the default mesh material. */
  public readonly material: MeshMaterial | null;

  // Per-instance storage grows with `add` and is reused after `clear` — only the
  // logical `_count` resets, the pooled Matrix/Color instances are kept.
  private readonly _transforms: Matrix[] = [];
  private readonly _tints: Color[] = [];
  private _count = 0;

  public constructor(geometry: Geometry, material: MeshMaterial | null = null) {
    // The batch uploads its geometry to the GPU once and caches it by identity,
    // so the geometry must be static (the default). dynamic/stream geometry has
    // no persistent GPU buffer and is rejected.
    if (geometry.usage !== 'static') {
      throw new Error(`RenderBatch requires geometry with usage='static' (got '${geometry.usage}').`);
    }

    // v1 renders batches with the default mesh material; a custom material is not
    // yet supported on the instanced path. The parameter is accepted (and stored)
    // for the forthcoming custom-material batch support.
    if (material !== null && (material.target as string) !== 'mesh') {
      throw new Error(`RenderBatch material must target 'mesh' (got '${String(material.target)}').`);
    }

    this.geometry = geometry;
    this.material = material;
  }

  /** Number of instances currently in the batch. */
  public get count(): number {
    return this._count;
  }

  /**
   * Append one instance. `transform` is the instance's world matrix (taken as
   * the raw `a,b,c,d,tx,ty`), `tint` modulates the geometry's vertex colors
   * (defaults to white). Both are copied into the batch.
   */
  public add(transform: Matrix, tint: Color | null = null): this {
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

    this._count++;

    return this;
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
    this._count = 0;
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
