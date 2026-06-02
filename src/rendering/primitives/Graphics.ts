import { Color } from '@/core/Color';
import type { MeshGeometryData } from '@/math/geometry';
import { buildCircle, buildEllipse, buildLine, buildPath, buildPolygon, buildRectangle, buildStar } from '@/math/geometry';
import { bezierCurveTo, clamp, quadraticCurveTo, tau } from '@/math/utils';
import { Vector } from '@/math/Vector';
import { Container } from '@/rendering/Container';
import type { Gradient } from '@/rendering/gradient/Gradient';
import { Mesh } from '@/rendering/mesh/Mesh';
import type { RenderNode } from '@/rendering/RenderNode';
import type { DataTexture } from '@/rendering/texture/DataTexture';
import { ScaleModes } from '@/rendering/types';

/**
 * Edge length of the square gradient texture rasterized for gradient paints.
 * The full 2D UV field is baked so both linear and radial gradients map across
 * the filled shape's bounding box without per-axis special-casing.
 */
const gradientTextureSize = 256;

/**
 * Immediate-mode 2D shape API backed by {@link Mesh} children.
 *
 * Each draw call (e.g. `drawCircle`, `drawRectangle`, `drawLine`) appends a
 * new {@link Mesh} child painted with the current fill or line paint. A paint
 * is either a solid {@link Color} ({@link fillColor} / {@link lineColor}) or a
 * {@link Gradient} ({@link fillGradient} / {@link lineGradient}); the most
 * recently assigned of the pair wins. The active `lineWidth` controls stroke
 * thickness for path and outline draws. Path commands (`moveTo`, `lineTo`,
 * `quadraticCurveTo`, etc.) track a cursor point and flush a Mesh on each
 * segment.
 *
 * Gradient paints are rasterized once to a {@link DataTexture} via
 * {@link Gradient.toTexture} and sampled across each shape's local bounding
 * box, so {@link LinearGradient} and {@link RadialGradient} render through the
 * same texture path as a textured Mesh. The textures are owned by the Graphics
 * and released on {@link clear} / {@link destroy}.
 *
 * Call {@link clear} to remove all child meshes and reset pen state. Because
 * each shape is a separate Mesh, `Graphics` inherits full filter, blend,
 * tint, and mask support from {@link Container}.
 */
export class Graphics extends Container {
  private _lineWidth = 0;
  private _lineColor: Color = new Color();
  private _fillColor: Color = new Color();
  private _fillGradient: Gradient | null = null;
  private _lineGradient: Gradient | null = null;
  private _fillGradientTexture: DataTexture<'rgba8'> | null = null;
  private _lineGradientTexture: DataTexture<'rgba8'> | null = null;
  private readonly _ownedTextures = new Set<DataTexture>();
  private _currentPoint: Vector = new Vector(0, 0);

  public get lineWidth(): number {
    return this._lineWidth;
  }

  public set lineWidth(lineWidth: number) {
    this._lineWidth = lineWidth;
  }

  public get lineColor(): Color {
    return this._lineColor;
  }

  /**
   * Set the solid line paint. Switches stroke draws back to the solid-color
   * path, clearing any active {@link lineGradient}.
   */
  public set lineColor(lineColor: Color) {
    this._lineColor.copy(lineColor);
    this._setLineGradient(null);
  }

  public get fillColor(): Color {
    return this._fillColor;
  }

  /**
   * Set the solid fill paint. Switches fill draws back to the solid-color
   * path, clearing any active {@link fillGradient}.
   */
  public set fillColor(fillColor: Color) {
    this._fillColor.copy(fillColor);
    this._setFillGradient(null);
  }

  /** Active fill gradient, or `null` when fills use the solid {@link fillColor}. */
  public get fillGradient(): Gradient | null {
    return this._fillGradient;
  }

  /**
   * Paint subsequent fills with a {@link Gradient} instead of a solid color.
   * The gradient is cloned on assignment and rasterized lazily on first use;
   * pass `null` to revert to the solid {@link fillColor}.
   */
  public set fillGradient(gradient: Gradient | null) {
    this._setFillGradient(gradient);
  }

  /** Active line gradient, or `null` when strokes use the solid {@link lineColor}. */
  public get lineGradient(): Gradient | null {
    return this._lineGradient;
  }

  /**
   * Paint subsequent strokes with a {@link Gradient} instead of a solid color.
   * The gradient is cloned on assignment and rasterized lazily on first use;
   * pass `null` to revert to the solid {@link lineColor}.
   */
  public set lineGradient(gradient: Gradient | null) {
    this._setLineGradient(gradient);
  }

  public get currentPoint(): Vector {
    return this._currentPoint;
  }

  public override getChildAt(index: number): Mesh {
    return super.getChildAt(index) as Mesh;
  }

  public override addChild(child: RenderNode): this {
    if (!(child instanceof Mesh)) {
      throw new Error('Graphics can only contain Mesh children.');
    }

    return super.addChild(child);
  }

  public override addChildAt(child: RenderNode, index: number): this {
    if (!(child instanceof Mesh)) {
      throw new Error('Graphics can only contain Mesh children.');
    }

    return super.addChildAt(child, index);
  }

  /** Move the current pen position to (`x`, `y`) without drawing anything. */
  public moveTo(x: number, y: number): this {
    this._currentPoint.set(x, y);

    return this;
  }

  /** Draw a stroked line segment from the current point to (`toX`, `toY`) and advance the pen. */
  public lineTo(toX: number, toY: number): this {
    const { x: fromX, y: fromY } = this._currentPoint;

    this.drawPath([fromX, fromY, toX, toY]);
    this.moveTo(toX, toY);

    return this;
  }

  /** Draw a quadratic Bézier curve from the current point to (`toX`, `toY`) via control point (`cpX`, `cpY`). */
  public quadraticCurveTo(cpX: number, cpY: number, toX: number, toY: number): this {
    const { x: fromX, y: fromY } = this._currentPoint;

    this.drawPath(quadraticCurveTo(fromX, fromY, cpX, cpY, toX, toY));
    this.moveTo(toX, toY);

    return this;
  }

  /** Draw a cubic Bézier curve from the current point to (`toX`, `toY`) via two control points. */
  public bezierCurveTo(cpX1: number, cpY1: number, cpX2: number, cpY2: number, toX: number, toY: number): this {
    const { x: fromX, y: fromY } = this._currentPoint;

    this.drawPath(bezierCurveTo(fromX, fromY, cpX1, cpY1, cpX2, cpY2, toX, toY));
    this.moveTo(toX, toY);

    return this;
  }

  /**
   * Draw a circular arc tangent to the two lines defined by the current point→(x1,y1)
   * and (x1,y1)→(x2,y2), with the given `radius`. Falls back to `lineTo(x1,y1)`
   * when the geometry is degenerate.
   */
  public arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): this {
    const { x: fromX, y: fromY } = this._currentPoint;
    const r = Math.abs(radius);

    if (r === 0 || (fromX === x1 && fromY === y1) || (x1 === x2 && y1 === y2)) {
      return this.lineTo(x1, y1);
    }

    const inX = x1 - fromX;
    const inY = y1 - fromY;
    const outX = x2 - x1;
    const outY = y2 - y1;
    const inLen = Math.hypot(inX, inY);
    const outLen = Math.hypot(outX, outY);

    if (inLen === 0 || outLen === 0) {
      return this.lineTo(x1, y1);
    }

    const inDirX = inX / inLen;
    const inDirY = inY / inLen;
    const outDirX = outX / outLen;
    const outDirY = outY / outLen;
    const dot = clamp(inDirX * outDirX + inDirY * outDirY, -1, 1);
    const angle = Math.acos(dot);

    if (angle === 0 || angle === Math.PI) {
      return this.lineTo(x1, y1);
    }

    const distanceToTangent = r / Math.tan(angle / 2);

    if (!Number.isFinite(distanceToTangent) || distanceToTangent > inLen || distanceToTangent > outLen) {
      return this.lineTo(x1, y1);
    }

    const startX = x1 - inDirX * distanceToTangent;
    const startY = y1 - inDirY * distanceToTangent;
    const endX = x1 + outDirX * distanceToTangent;
    const endY = y1 + outDirY * distanceToTangent;
    const cross = inDirX * outDirY - inDirY * outDirX;
    const leftTurn = cross > 0;
    const normalX = leftTurn ? -inDirY : inDirY;
    const normalY = leftTurn ? inDirX : -inDirX;
    const centerX = startX + normalX * r;
    const centerY = startY + normalY * r;
    const startAngle = Math.atan2(startY - centerY, startX - centerX);
    const endAngle = Math.atan2(endY - centerY, endX - centerX);

    this.lineTo(startX, startY);

    return this.drawArc(centerX, centerY, r, startAngle, endAngle, leftTurn);
  }

  /** Draw a stroked arc centered at (`x`, `y`) with the given `radius` from `startAngle` to `endAngle` (radians). */
  public drawArc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise = false): this {
    const r = Math.abs(radius);

    if (r === 0) {
      return this;
    }

    let sweep = endAngle - startAngle;

    if (!anticlockwise && sweep < 0) {
      sweep += tau;
    } else if (anticlockwise && sweep > 0) {
      sweep -= tau;
    }

    if (sweep === 0) {
      return this;
    }

    const segments = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 16)));
    const path: number[] = [];

    for (let i = 0; i <= segments; i++) {
      const ratio = i / segments;
      const angle = startAngle + sweep * ratio;

      path.push(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
    }

    this.drawPath(path);
    this.moveTo(path[path.length - 2], path[path.length - 1]);

    return this;
  }

  /** Draw a stroked line between two explicit points, independent of the current pen position. */
  public drawLine(startX: number, startY: number, endX: number, endY: number): this {
    const data = buildLine(startX, startY, endX, endY, this._lineWidth);

    this.addChild(this._createStrokeMesh(data));

    return this;
  }

  /** Draw a stroked polyline from a flat `[x0,y0, x1,y1, ...]` coordinate array. */
  public drawPath(path: number[]): this {
    const data = buildPath(path, this._lineWidth);

    this.addChild(this._createStrokeMesh(data));

    return this;
  }

  /** Fill a closed polygon defined by `[x0,y0, x1,y1, ...]` and optionally stroke its outline. */
  public drawPolygon(path: number[]): this {
    const data = buildPolygon(path);

    this.addChild(this._createFillMesh(data));

    if (this._lineWidth > 0) {
      this.drawPath(data.points);
    }

    return this;
  }

  /** Fill a circle and optionally stroke its outline if `lineWidth > 0`. */
  public drawCircle(centerX: number, centerY: number, radius: number): this {
    const data = buildCircle(centerX, centerY, radius);

    this.addChild(this._createFillMesh(data));

    if (this._lineWidth > 0) {
      this.drawPath(data.points);
    }

    return this;
  }

  /** Fill an ellipse and optionally stroke its outline if `lineWidth > 0`. */
  public drawEllipse(centerX: number, centerY: number, radiusX: number, radiusY: number): this {
    const data = buildEllipse(centerX, centerY, radiusX, radiusY);

    this.addChild(this._createFillMesh(data));

    if (this._lineWidth > 0) {
      this.drawPath(data.points);
    }

    return this;
  }

  /** Fill a rectangle and optionally stroke its outline if `lineWidth > 0`. */
  public drawRectangle(x: number, y: number, width: number, height: number): this {
    const data = buildRectangle(x, y, width, height);

    this.addChild(this._createFillMesh(data));

    if (this._lineWidth > 0) {
      this.drawPath(data.points);
    }

    return this;
  }

  /**
   * Fill a regular star polygon and optionally stroke its outline.
   * `innerRadius` defaults to half of `radius`.
   */
  public drawStar(centerX: number, centerY: number, points: number, radius: number, innerRadius: number = radius / 2, rotation = 0): this {
    const data = buildStar(centerX, centerY, points, radius, innerRadius, rotation);

    this.addChild(this._createFillMesh(data));

    if (this._lineWidth > 0) {
      this.drawPath(data.points);
    }

    return this;
  }

  /** Remove all child meshes and reset pen state (position, colors/gradients, line width). */
  public clear(): this {
    this.removeChildren();

    this._lineWidth = 0;
    this._lineColor.copy(Color.black);
    this._fillColor.copy(Color.black);
    this._fillGradient = null;
    this._lineGradient = null;
    this._fillGradientTexture = null;
    this._lineGradientTexture = null;
    this._destroyOwnedTextures();
    this._currentPoint.set(0, 0);

    return this;
  }

  public override destroy(): void {
    super.destroy();

    this.clear();

    this._lineColor.destroy();
    this._fillColor.destroy();
    this._currentPoint.destroy();
  }

  private _setFillGradient(gradient: Gradient | null): void {
    this._fillGradient = gradient === null ? null : gradient.clone();
    this._fillGradientTexture = null;
  }

  private _setLineGradient(gradient: Gradient | null): void {
    this._lineGradient = gradient === null ? null : gradient.clone();
    this._lineGradientTexture = null;
  }

  private _createFillMesh(data: MeshGeometryData): Mesh {
    if (this._fillGradient === null) {
      return this._createSolidMesh(data, this._fillColor);
    }

    this._fillGradientTexture ??= this._rasterizeGradient(this._fillGradient);

    return this._createGradientMesh(data, this._fillGradientTexture);
  }

  private _createStrokeMesh(data: MeshGeometryData): Mesh {
    if (this._lineGradient === null) {
      return this._createSolidMesh(data, this._lineColor);
    }

    this._lineGradientTexture ??= this._rasterizeGradient(this._lineGradient);

    return this._createGradientMesh(data, this._lineGradientTexture);
  }

  private _createSolidMesh(data: MeshGeometryData, color: Color): Mesh {
    const mesh = new Mesh({
      vertices: data.vertices,
      indices: data.indices,
    });

    mesh.tint = color;

    return mesh;
  }

  /**
   * Build a textured mesh whose UVs span the shape's local bounding box, so the
   * gradient texture samples across the filled/stroked geometry. The default
   * white tint and vertex color leave the sampled gradient color unmodulated.
   */
  private _createGradientMesh(data: MeshGeometryData, texture: DataTexture<'rgba8'>): Mesh {
    return new Mesh({
      vertices: data.vertices,
      indices: data.indices,
      uvs: computeBoundsUvs(data.vertices),
      texture,
    });
  }

  private _rasterizeGradient(gradient: Gradient): DataTexture<'rgba8'> {
    const texture = gradient.toTexture(gradientTextureSize, gradientTextureSize, {
      samplerOptions: { scaleMode: ScaleModes.Linear },
    });

    this._ownedTextures.add(texture);

    return texture;
  }

  private _destroyOwnedTextures(): void {
    for (const texture of this._ownedTextures) {
      texture.destroy();
    }

    this._ownedTextures.clear();
  }
}

/**
 * Normalize each `(x, y)` vertex into `0..1` UV space relative to the flat
 * vertex array's axis-aligned bounding box. Degenerate (zero-width/height)
 * spans collapse to `0` to avoid division by zero.
 */
const computeBoundsUvs = (vertices: Float32Array): Float32Array => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < vertices.length; i += 2) {
    const x = vertices[i];
    const y = vertices[i + 1];

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const invX = spanX > 0 ? 1 / spanX : 0;
  const invY = spanY > 0 ? 1 / spanY : 0;
  const uvs = new Float32Array(vertices.length);

  for (let i = 0; i < vertices.length; i += 2) {
    uvs[i] = (vertices[i] - minX) * invX;
    uvs[i + 1] = (vertices[i + 1] - minY) * invY;
  }

  return uvs;
};
