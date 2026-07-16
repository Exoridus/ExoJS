import { logger } from '#core/logging';
import { Interval } from '#math/Interval';
import { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';
import { Drawable } from '#rendering/Drawable';
import type { Material } from '#rendering/material/Material';
import type { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import { buildPixelSnapContext, snapBoundsInto } from '#rendering/pixelSnap';
import { RenderNode } from '#rendering/RenderNode';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import type { View } from '#rendering/View';

/**
 * Internal dirty-flag bitmask used by {@link Sprite} to lazily recompute
 * derived data (vertices, normals, texture coordinates, bounding boxes).
 * @internal
 */
export enum SpriteFlags {
  None = 0x00,
  Translation = 0x01,
  Rotation = 0x02,
  Scaling = 0x04,
  Origin = 0x08,
  Transform = 0x0f,
  TransformInverse = 0x10,
  BoundingBox = 0x20,
  TextureCoords = 0x40,
  VertexTint = 0x80,
  Vertices = 0x400,
  Normals = 0x800,
}

/**
 * The primary 2D drawable for textured quads and the foundation of the
 * rendering hierarchy.
 *
 * A Sprite wraps a {@link Texture} (or {@link RenderTexture}) and exposes
 * full transform control (position, rotation, scale, origin) inherited from
 * {@link Drawable}. The rendered quad is derived from `textureFrame`, which
 * defaults to the full texture dimensions but can be narrowed to a sub-region
 * (e.g. a frame from a {@link Spritesheet}).
 *
 * Vertex and normal data are computed lazily and cached until the transform
 * or frame changes, making repeated read access free after the first evaluation.
 * Collision helpers — `contains`, `getNormals`, `project` — are overridden to
 * operate on the exact rotated quad rather than the AABB.
 * @stable
 */
export class Sprite extends Drawable {
  private _texture: Texture | RenderTexture | null = null;
  private _textureFrame: Rectangle = new Rectangle();
  private _material: SpriteMaterial | null = null;
  private _vertices: Float32Array = new Float32Array(8);
  private _texCoords: Uint32Array = new Uint32Array(4);
  private readonly _normals: [Vector, Vector, Vector, Vector] = [new Vector(), new Vector(), new Vector(), new Vector()];
  // World-transform version the cached vertices/normals were last built at.
  // The Vertices/Normals flags cover local changes (texture frame, own
  // transform); this version compare additionally catches an ancestor moving,
  // which — after the Slice 1 lazy-cascade fix — no longer eagerly flags this
  // sprite. Mirrors SceneNode.getBounds()'s _boundsBuiltAtVersion.
  private _verticesBuiltAtVersion = -1;
  private _normalsBuiltAtVersion = -1;

  public constructor(texture: Texture | RenderTexture | null) {
    super();

    // Mark vertices and normals dirty from the start.
    this.flags.push(SpriteFlags.Vertices | SpriteFlags.Normals);

    if (texture !== null) {
      this.setTexture(texture);
    }
  }

  public get texture(): Texture | RenderTexture | null {
    return this._texture;
  }

  public set texture(texture: Texture | RenderTexture | null) {
    this.setTexture(texture);
  }

  public get textureFrame(): Rectangle {
    return this._textureFrame;
  }

  public set textureFrame(frame: Rectangle) {
    this.setTextureFrame(frame);
  }

  /**
   * Custom material giving this sprite its own fragment program, uniforms, and
   * extra texture bindings, or `null` for the default multi-texture sprite path.
   *
   * Sprites that share the same material instance and base texture still batch
   * into a single instanced draw call; the base texture stays on the sprite and
   * is bound per batch. Assigning a non-sprite material throws.
   */
  public get material(): SpriteMaterial | null {
    return this._material;
  }

  public set material(material: SpriteMaterial | null) {
    if (material !== null && (material as Material).target !== 'sprite') {
      throw new Error(`Sprite requires a SpriteMaterial (got a ${(material as Material).target} material).`);
    }

    this._material = material;
    this.invalidateCache();
  }

  public get width(): number {
    return Math.abs(this.scale.x) * this._textureFrame.width;
  }

  public set width(value: number) {
    // A not-yet-loaded texture has a 0-wide frame; dividing by it would poison
    // scale with NaN (and, being NaN, never recover). Keep the current scale
    // until real dimensions arrive — the load self-heal (#309) resets the frame.
    if (this._textureFrame.width !== 0) {
      this.scale.x = value / this._textureFrame.width;
    }
  }

  public get height(): number {
    return Math.abs(this.scale.y) * this._textureFrame.height;
  }

  public set height(value: number) {
    if (this._textureFrame.height !== 0) {
      this.scale.y = value / this._textureFrame.height;
    }
  }

  /**
   * World-space corner positions of the sprite quad, computed lazily from the
   * current transform and texture frame. Layout: [x0,y0, x1,y1, x2,y2, x3,y3]
   * (TL, TR, BR, BL). Cached until the transform is invalidated.
   */
  public get vertices(): Float32Array {
    // Settle the world transform first: its version reflects any ancestor move,
    // which the lazy cascade no longer eagerly flags on this sprite.
    const transform = this.getGlobalTransform();

    if (this.flags.has(SpriteFlags.Vertices) || this._verticesBuiltAtVersion !== this._globalTransformVersion) {
      const { left, top, right, bottom } = this.getLocalBounds();
      const { a, b, x, c, d, y } = transform;

      this._vertices[0] = left * a + top * b + x;
      this._vertices[1] = left * c + top * d + y;

      this._vertices[2] = right * a + top * b + x;
      this._vertices[3] = right * c + top * d + y;

      this._vertices[4] = right * a + bottom * b + x;
      this._vertices[5] = right * c + bottom * d + y;

      this._vertices[6] = left * a + bottom * b + x;
      this._vertices[7] = left * c + bottom * d + y;

      this.flags.remove(SpriteFlags.Vertices);
      this._verticesBuiltAtVersion = this._globalTransformVersion;
    }

    return this._vertices;
  }

  /**
   * Local-space quad bounds for the active pass, written into `out`. In
   * `'geometry'` pixel-snap mode (and only when the combined node+view transform
   * is axis-aligned) the quad edges are snapped to the render target's
   * device-pixel grid via the shared {@link snapLocalBoundary} helper — combined
   * with the device-snapped origin from the transform seam, all four corners
   * land on whole device pixels. The logical local bounds (used by collision /
   * `getBounds`) are never changed. Returns the unsnapped local bounds for
   * `'none'`/`'position'` or under a rotation/skew downgrade.
   * @internal
   */
  public getRenderBounds(view: View, targetPxWidth: number, targetPxHeight: number, out: Rectangle): Rectangle {
    const base = this.getLocalBounds();

    if (this.pixelSnapMode !== 'geometry') {
      return base;
    }

    // World transform (composed through any RetainedContainer boundary) so the
    // device scale / axis-alignment reflect the group the GPU applies as u_group.
    const ctx = buildPixelSnapContext(this.getWorldTransform(), view, targetPxWidth, targetPxHeight);

    if (!ctx.axisAligned) {
      logger.warn('pixelSnapMode "geometry" downgraded to "position" for a rotated/skewed transform; rendered geometry is not boundary-snapped this frame.', {
        source: 'Sprite',
        once: 'pixel-snap:geometry-downgrade',
      });

      return base;
    }

    return snapBoundsInto(base, ctx, out);
  }

  /**
   * Packed UV coordinates for the four quad corners, encoded as two
   * 16-bit fixed-point values per element (low 16 bits = U, high 16 bits = V,
   * each in the range 0–65535). Accounts for `Texture.flipY`. Throws if no
   * texture is assigned.
   */
  public get texCoords(): Uint32Array {
    if (this._texture === null) {
      throw new Error('texCoords can only be calculated when the sprite has a texture');
    }

    if (this.flags.pop(SpriteFlags.TextureCoords)) {
      const { width, height } = this._texture;
      const { left, top, right, bottom } = this._textureFrame;
      const minX = ((left / width) * 65535) & 65535;
      const minY = (((top / height) * 65535) & 65535) << 16;
      const maxX = ((right / width) * 65535) & 65535;
      const maxY = (((bottom / height) * 65535) & 65535) << 16;

      if (this._texture.flipY) {
        this._texCoords[0] = maxY | minX;
        this._texCoords[1] = maxY | maxX;
        this._texCoords[2] = minY | maxX;
        this._texCoords[3] = minY | minX;
      } else {
        this._texCoords[0] = minY | minX;
        this._texCoords[1] = minY | maxX;
        this._texCoords[2] = maxY | maxX;
        this._texCoords[3] = maxY | minX;
      }
    }

    return this._texCoords;
  }

  /**
   * Assign a new texture, refreshing the texture frame to the full texture dimensions.
   *
   * Does **not** bump the texture's version. That signal means "the source data
   * has been mutated"; replacing the sprite's texture reference is not that.
   * Bumping it here would force the backend to re-allocate the GPU texture on
   * the next bind — destroying any FBO content already rendered into a
   * {@link RenderTexture} (the cacheAsBitmap and filter capture pipelines).
   * Call {@link updateTexture} explicitly when you mutate the source.
   */
  public setTexture(texture: Texture | RenderTexture | null): this {
    // Binding a destroyed texture is otherwise silent (it samples freed
    // GPU state or renders nothing). Warn once in dev at the assignment site.
    if (__DEV__ && texture !== null && 'destroyed' in texture && texture.destroyed) {
      logger.warn(
        'Sprite.setTexture(): the texture has already been destroy()ed — a destroyed texture samples freed state or renders nothing. Assign a live texture instead.',
        { source: 'Sprite', once: 'sprite:set-destroyed-texture' },
      );
    }

    if (this._texture !== texture) {
      this._texture = texture;

      if (texture !== null) {
        this.resetTextureFrame();
        this._scheduleTextureLoadHeal(texture);
      }

      this.invalidateCache();
    }

    return this;
  }

  /**
   * A deferred texture handle starts 0×0 until its payload loads, so the frame
   * reset above snapped to a 0×0 frame. Re-reset once it becomes ready so the
   * sprite picks up the real dimensions (#309). Guarded against a texture swap
   * or destroy between now and the resolution, and against RenderTextures /
   * already-ready textures (no `loaded` promise to wait on).
   */
  private _scheduleTextureLoadHeal(texture: Texture | RenderTexture): void {
    if (!('ready' in texture) || texture.ready || !('loaded' in texture)) {
      return;
    }

    void this._healOnTextureLoad(texture);
  }

  private async _healOnTextureLoad(texture: Texture): Promise<void> {
    try {
      await texture.loaded;
    } catch {
      return; // failed load shows Texture.missing; nothing to heal
    }

    // Guard against a texture swap or destroy between scheduling and resolution —
    // and against an explicit frame set in the meantime (a Spritesheet slicing
    // frames out of a still-loading atlas). The schedule-time reset above left a
    // 0×0 frame, so a non-empty frame here means someone chose one deliberately;
    // only heal the untouched case.
    if (this._texture === texture && !this.destroyed && this._textureFrame.width === 0 && this._textureFrame.height === 0) {
      this.resetTextureFrame();
    }
  }

  /** Signal the GPU backend that the underlying texture source has changed and reset the frame to full dimensions. */
  public updateTexture(): this {
    if (this._texture) {
      this._texture.updateSource();
      this.resetTextureFrame();
      this.invalidateCache();
    }

    return this;
  }

  /**
   * Set a sub-region of the texture to render.
   * When `resetSize` is `true` (default) the sprite's logical size snaps to
   * the new frame dimensions; pass `false` to keep the current pixel size
   * (useful for animation playback where the frame changes but the display
   * size should stay constant).
   */
  public setTextureFrame(frame: Rectangle, resetSize = true): this {
    const width = this.width;
    const height = this.height;

    this._textureFrame.copy(frame);
    this.flags.push(SpriteFlags.TextureCoords);
    this.getLocalBounds().set(0, 0, frame.width, frame.height);
    this._invalidateBoundsCascade();

    if (resetSize) {
      this.width = frame.width;
      this.height = frame.height;
    } else {
      this.width = width;
      this.height = height;
    }

    // The local bounds changed size — re-derive the origin from the
    // fractional anchor, or an anchored sprite keeps the OLD bounds' pixel
    // origin and renders offset by the size difference (an anchored sprite
    // switching from the full atlas to its first animation frame used to
    // land hundreds of pixels off-canvas).
    if (this.anchor.x !== 0 || this.anchor.y !== 0) {
      this._updateOrigin();
    }

    this.invalidateCache();

    return this;
  }

  /** Reset the texture frame to the full dimensions of the current texture. Throws if no texture is set. */
  public resetTextureFrame(): this {
    if (!this._texture) {
      throw new Error('Cannot reset texture frame when no texture was set');
    }

    return this.setTextureFrame(Rectangle.temp.set(0, 0, this._texture.width, this._texture.height));
  }

  /**
   * Return the four outward-facing edge normals of the rotated quad, lazily
   * computed from `vertices`. Used by the SAT collision system.
   */
  public override getNormals(): Vector[] {
    // Read vertices first: the getter settles the world-transform version and
    // rebuilds the quad if an ancestor moved, so the version compare below
    // sees the up-to-date value.
    // vertices is a fixed 8-element Float32Array (4 corners).
    const v = this.vertices;

    if (this.flags.has(SpriteFlags.Normals) || this._normalsBuiltAtVersion !== this._globalTransformVersion) {
      const x1 = v[0]!;
      const y1 = v[1]!;
      const x2 = v[2]!;
      const y2 = v[3]!;
      const x3 = v[4]!;
      const y3 = v[5]!;
      const x4 = v[6]!;
      const y4 = v[7]!;

      this._normals[0]
        .set(x2 - x1, y2 - y1)
        .rperp()
        .normalize();
      this._normals[1]
        .set(x3 - x2, y3 - y2)
        .rperp()
        .normalize();
      this._normals[2]
        .set(x4 - x3, y4 - y3)
        .rperp()
        .normalize();
      this._normals[3]
        .set(x1 - x4, y1 - y4)
        .rperp()
        .normalize();

      this.flags.remove(SpriteFlags.Normals);
      this._normalsBuiltAtVersion = this._globalTransformVersion;
    }

    return this._normals;
  }

  /**
   * Project all four quad vertices onto `axis` and return the resulting
   * scalar interval. Used by the SAT collision system.
   */
  public override project(axis: Vector, result: Interval = new Interval()): Interval {
    // vertices is a fixed 8-element Float32Array (4 corners).
    const v = this.vertices;
    const x1 = v[0]!;
    const y1 = v[1]!;
    const x2 = v[2]!;
    const y2 = v[3]!;
    const x3 = v[4]!;
    const y3 = v[5]!;
    const x4 = v[6]!;
    const y4 = v[7]!;
    const proj1 = axis.dot(x1, y1);
    const proj2 = axis.dot(x2, y2);
    const proj3 = axis.dot(x3, y3);
    const proj4 = axis.dot(x4, y4);

    return result.set(Math.min(proj1, proj2, proj3, proj4), Math.max(proj1, proj2, proj3, proj4));
  }

  /**
   * Return `true` if the world-space point (`x`, `y`) lies inside the quad.
   * Uses a fast AABB check for axis-aligned quads, and a cross-product sign
   * test for rotated or skewed quads.
   */
  public override contains(x: number, y: number): boolean {
    if (this.isAlignedBox) {
      return this.getBounds().contains(x, y);
    }

    // vertices is a fixed 8-element Float32Array (4 corners).
    const v = this.vertices;
    const x1 = v[0]!;
    const y1 = v[1]!;
    const x2 = v[2]!;
    const y2 = v[3]!;
    const x3 = v[4]!;
    const y3 = v[5]!;
    const x4 = v[6]!;
    const y4 = v[7]!;

    // Cross-product sign consistency: all four edge × (P-vertex) cross
    // products must share the same sign for P to lie inside the convex quad.
    // This handles rotated rectangles and skewed parallelograms uniformly;
    // the dual `>=0 || <=0` form also handles mirrored (negative-scale) quads.
    const s1 = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
    const s2 = (x3 - x2) * (y - y2) - (y3 - y2) * (x - x2);
    const s3 = (x4 - x3) * (y - y3) - (y4 - y3) * (x - x3);
    const s4 = (x1 - x4) * (y - y4) - (y1 - y4) * (x - x4);

    return (s1 >= 0 && s2 >= 0 && s3 >= 0 && s4 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0 && s4 <= 0);
  }

  /** @internal */
  public override _invalidateSubtreeTransform(): void {
    super._invalidateSubtreeTransform();
    this.flags.push(SpriteFlags.Vertices | SpriteFlags.Normals);
  }

  /** @internal */
  public override _invalidateBoundsCascade(): void {
    super._invalidateBoundsCascade();
    this.flags.push(SpriteFlags.Vertices | SpriteFlags.Normals);
  }

  public override destroy(): void {
    super.destroy();

    for (const normal of this._normals) {
      normal.destroy();
    }

    this._textureFrame.destroy();
    this._texture = null;
    this._material = null;
  }
}

RenderNode.setInternalSpriteFactory(() => new Sprite(null));
