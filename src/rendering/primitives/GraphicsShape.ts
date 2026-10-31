import type { Color } from '#core/Color';
import type { Rectangle } from '#math/Rectangle';
import type { Mesh } from '#rendering/mesh/Mesh';

/** Appearance fields supported by retained rectangle drawings. Paint values are copied. */
export interface GraphicsAppearancePatch {
  readonly fill?: Color | null;
}

/**
 * A retained drawing of a borrowed rectangle. Geometry edits are live; local
 * fill overrides are independent of other drawings of the same rectangle.
 * Clearing or destroying its Graphics invalidates the handle, not the source.
 */
export class GraphicsShape {
  private _fill: Color | null | undefined;
  private _unsubscribe: (() => void) | null;

  /** @internal */
  public constructor(
    source: Rectangle,
    private readonly _mesh: Mesh,
    private readonly _defaultFill: () => Color | null,
    options: GraphicsAppearancePatch,
  ) {
    this._fill = options.fill?.clone() ?? options.fill;
    this._unsubscribe = source._subscribeGeometry(() => {
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
    });
    this._applyAppearance();
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

  /** @internal */
  public _applyAppearance(): void {
    const fill = this._fill === undefined ? this._defaultFill() : this._fill;

    this._mesh.visible = fill !== null && fill.a !== 0;

    if (fill !== null) {
      this._mesh.tint = fill;
    }
  }

  /** @internal */
  public _dispose(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._mesh.destroy();
  }
}
