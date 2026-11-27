import type { Color } from '#core/Color';
import type { Circle } from '#math/Circle';
import type { Ellipse } from '#math/Ellipse';
import { buildRectangle, type MeshGeometryData } from '#math/geometry';
import type { Polygon } from '#math/Polygon';
import { Rectangle } from '#math/Rectangle';
import { Mesh } from '#rendering/mesh/Mesh';

import { buildGraphicsCutFill, buildGraphicsFill } from './graphicsGeometry';
import { GraphicsPath } from './GraphicsPath';

/** Live geometric sources that can be filled. */
export type GraphicsShapeSource = Rectangle | Circle | Ellipse | Polygon | GraphicsPath;

/** Appearance fields supported by retained rectangle drawings. Paint values are copied. */
export interface GraphicsAppearancePatch {
  readonly fill?: Color | null;
}

/**
 * A retained drawing of a borrowed source shape. Geometry edits are live; local
 * fill overrides are independent of other drawings of the same source.
 *
 * The handle is removed, and {@link GraphicsShape.removed} turns `true`, when its
 * Graphics is cleared or destroyed, or when the source shape itself is
 * destroyed. Removing a drawing never destroys the source.
 */
export class GraphicsShape {
  private _fill: Color | null | undefined;
  private _unsubscribe: (() => void) | null;
  private _hasGeometry: boolean;
  private readonly _mesh: ShapeMesh;
  private readonly _source: GraphicsShapeSource;
  private readonly _cuts = new Map<GraphicsShapeSource, () => void>();

  /** @internal */
  public constructor(
    source: GraphicsShapeSource,
    private readonly _defaultFill: () => Color | null,
    options: GraphicsAppearancePatch,
    onSourceDestroyed: () => void,
  ) {
    this._source = source;
    const data = buildGraphicsFill(source);
    this._hasGeometry = data !== null && data.indices.length > 0;
    this._mesh = new ShapeMesh(this._hasGeometry ? data! : buildRectangle(0, 0, 0, 0));
    this._fill = options.fill?.clone() ?? options.fill;
    this._unsubscribe = source._subscribeGeometry(() => {
      if (this._unsubscribe === null) {
        return;
      }

      if (source instanceof Rectangle && this._cuts.size === 0) {
        const { x, y, width, height } = source;
        const vertices = this._mesh.vertices;

        vertices[0] = x;
        vertices[1] = y;
        vertices[2] = x + width;
        vertices[3] = y;
        vertices[4] = x;
        vertices[5] = y + height;
        vertices[6] = x + width;
        vertices[7] = y + height;
        this._mesh.recomputeLocalBounds();
        this._mesh.invalidateContent();
      } else {
        this._rebuild();
      }
    }, onSourceDestroyed);
    this._applyAppearance();
  }

  /** @internal */
  public get _drawable(): Mesh {
    return this._mesh;
  }

  public get removed(): boolean {
    return this._unsubscribe === null;
  }

  /**
   * Subtract a borrowed closed shape from this drawing only. Several cuts remove
   * their union. Edits to the cut are live; destroying it drops the cut again.
   * The source and the cut shape themselves are never modified.
   *
   * Throws for a removed drawing, a cut that is already applied, the drawing's
   * own source, and a path with an open subpath.
   */
  public cutShape(cut: GraphicsShapeSource): this {
    if (this._unsubscribe === null) {
      throw new Error('GraphicsShape has been removed.');
    }

    if (cut === this._source) {
      throw new Error('A shape cannot cut itself.');
    }

    if (this._cuts.has(cut)) {
      throw new Error('This cut is already applied to the shape.');
    }

    if (cut instanceof GraphicsPath && cut.contours().some(contour => !contour.closed)) {
      throw new Error('Cut paths must consist of closed subpaths.');
    }

    const unsubscribe = cut._subscribeGeometry(
      () => this._rebuild(),
      () => {
        this._cuts.delete(cut);
        this._rebuild();
      },
    );

    this._cuts.set(cut, unsubscribe);
    this._rebuild();

    return this;
  }

  /** Patch only specified fields. `null` disables the fill. Throws after removal. */
  public setStyle(patch: GraphicsAppearancePatch): this {
    if (this._unsubscribe === null) {
      throw new Error('GraphicsShape has been removed.');
    }

    if (patch.fill !== undefined) {
      this._fill = patch.fill?.clone() ?? null;
      this._applyAppearance();
    }

    return this;
  }

  private _rebuild(): void {
    if (this._unsubscribe === null) {
      return;
    }

    const data = this._cuts.size === 0 ? buildGraphicsFill(this._source) : buildGraphicsCutFill(this._source, this._cuts.keys());

    this._hasGeometry = data !== null && data.indices.length > 0;

    if (this._hasGeometry) {
      this._mesh.setGeometry(data!);
    }

    this._applyAppearance();
  }

  /** @internal */
  public _applyAppearance(): void {
    const fill = this._fill === undefined ? this._defaultFill() : this._fill;

    this._mesh.visible = this._hasGeometry && fill !== null && fill.a !== 0;

    if (fill !== null) {
      this._mesh.tint = fill;
    }
  }

  /** @internal */
  public _dispose(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;

    for (const unsubscribe of this._cuts.values()) {
      unsubscribe();
    }

    this._cuts.clear();
    this._mesh.destroy();
  }
}

class ShapeMesh extends Mesh {
  public constructor(data: MeshGeometryData) {
    super({ vertices: data.vertices, indices: data.indices });
  }

  public setGeometry(data: MeshGeometryData): void {
    this._vertices = data.vertices;
    this._indices = data.indices;
    this.recomputeLocalBounds();
    this.invalidateContent();
  }
}
