import { Color } from '#core/Color';
import type { MeshGeometryData } from '#math/geometry';
import { buildCircle, buildEllipse, buildLine, buildPath, buildPolygon, buildRectangle, buildRoundedRectangle, buildStar } from '#math/geometry';
import { bezierCurveTo, clamp, quadraticCurveTo, tau } from '#math/utils';
import { Vector } from '#math/Vector';
import { Container } from '#rendering/Container';
import type { Gradient } from '#rendering/gradient/Gradient';
import { Mesh } from '#rendering/mesh/Mesh';
import type { RenderNode } from '#rendering/RenderNode';
import type { DataTexture } from '#rendering/texture/DataTexture';
import { ScaleModes } from '#rendering/types';

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
 * new {@link Mesh} child painted with the active fill or stroke style. A style
 * is either a solid {@link Color} or a {@link Gradient}, assigned through
 * {@link fillStyle} / {@link strokeStyle}. The {@link fillColor} /
 * {@link lineColor} accessors are color-only conveniences over those styles.
 * The active `lineWidth` controls stroke thickness for path and outline draws.
 * Path commands (`moveTo`, `lineTo`, `quadraticCurveTo`, etc.) track a cursor
 * point and flush a Mesh on each segment.
 *
 * Fill and stroke are both opt-in: a shape is filled only once a fill
 * color/style is set (the fill defaults to transparent), and stroked only while
 * `lineWidth > 0`. An outline-only shape therefore needs just `lineColor` +
 * `lineWidth`, with no fill bleeding underneath.
 *
 * Gradient styles are rasterized once to a {@link DataTexture} via
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
  // Fill defaults to transparent: a shape is filled only when a fill color/style is
  // set, mirroring how the stroke is gated on `lineWidth > 0`. This keeps an
  // outline-only shape (just `lineColor` + `lineWidth`) from silently painting an
  // opaque fill over whatever sits beneath it.
  private readonly _fillColor: Color = new Color(0, 0, 0, 0);
  private readonly _lineColor: Color = new Color();
  private _fillStyle: Color | Gradient = this._fillColor;
  private _strokeStyle: Color | Gradient = this._lineColor;
  private _fillStyleTexture: DataTexture<'rgba8'> | null = null;
  private _strokeStyleTexture: DataTexture<'rgba8'> | null = null;
  private readonly _ownedTextures = new Set<DataTexture>();
  private _currentPoint: Vector = new Vector(0, 0);

  public get lineWidth(): number {
    return this._lineWidth;
  }

  public set lineWidth(lineWidth: number) {
    this._lineWidth = lineWidth;
  }

  /** Solid stroke color slot: the last solid color assigned to the stroke. */
  public get lineColor(): Color {
    return this._lineColor;
  }

  /**
   * Convenience solid-color setter for the stroke. Copies `lineColor` into the
   * color slot and makes it the active {@link strokeStyle}, replacing any
   * gradient stroke style.
   */
  public set lineColor(lineColor: Color) {
    this.strokeStyle = lineColor;
  }

  /**
   * Solid fill color slot: the last solid color assigned to the fill. Defaults to
   * transparent, so shapes are not filled until a fill color/style is set.
   */
  public get fillColor(): Color {
    return this._fillColor;
  }

  /**
   * Convenience solid-color setter for the fill. Copies `fillColor` into the
   * color slot and makes it the active {@link fillStyle}, replacing any
   * gradient fill style.
   */
  public set fillColor(fillColor: Color) {
    this.fillStyle = fillColor;
  }

  /** Active fill style: a solid {@link Color} or a {@link Gradient}. */
  public get fillStyle(): Color | Gradient {
    return this._fillStyle;
  }

  /**
   * Set the fill style. Accepts a solid {@link Color}, a {@link Gradient}
   * (cloned on assignment and rasterized lazily on first fill), or `null` to
   * revert to the solid color held by {@link fillColor}. A {@link Color} value
   * is copied into the {@link fillColor} slot; the most recently assigned style
   * wins.
   */
  public set fillStyle(style: Color | Gradient | null) {
    this._fillStyle = this._resolveStyle(style, this._fillColor);
    this._fillStyleTexture = null;
  }

  /** Active stroke style: a solid {@link Color} or a {@link Gradient}. */
  public get strokeStyle(): Color | Gradient {
    return this._strokeStyle;
  }

  /**
   * Set the stroke style. Accepts a solid {@link Color}, a {@link Gradient}
   * (cloned on assignment and rasterized lazily on first stroke), or `null` to
   * revert to the solid color held by {@link lineColor}. A {@link Color} value
   * is copied into the {@link lineColor} slot; the most recently assigned style
   * wins.
   */
  public set strokeStyle(style: Color | Gradient | null) {
    this._strokeStyle = this._resolveStyle(style, this._lineColor);
    this._strokeStyleTexture = null;
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
    // path has (segments + 1) * 2 >= 6 entries, so the last pair is present.
    this.moveTo(path[path.length - 2]!, path[path.length - 1]!);

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

  /**
   * Stroke a shape's perimeter. Shape builders return their outline OPEN
   * (first point not repeated), but `buildPath` only closes a path whose
   * first and last points coincide — so the closing segment (e.g. a
   * rectangle's left edge) went missing. Repeat the first point here.
   */
  private _strokeClosedOutline(points: number[]): void {
    if (points.length >= 4) {
      this.drawPath([...points, points[0]!, points[1]!]);
    } else {
      this.drawPath(points);
    }
  }

  /** Fill a closed polygon defined by `[x0,y0, x1,y1, ...]` and optionally stroke its outline. */
  public drawPolygon(path: number[]): this {
    const data = buildPolygon(path);

    this._appendFill(data);

    if (this._lineWidth > 0) {
      this._strokeClosedOutline(data.points);
    }

    return this;
  }

  /** Fill a circle and optionally stroke its outline if `lineWidth > 0`. */
  public drawCircle(centerX: number, centerY: number, radius: number): this {
    const data = buildCircle(centerX, centerY, radius);

    this._appendFill(data);

    if (this._lineWidth > 0) {
      this._strokeClosedOutline(data.points);
    }

    return this;
  }

  /** Fill an ellipse and optionally stroke its outline if `lineWidth > 0`. */
  public drawEllipse(centerX: number, centerY: number, radiusX: number, radiusY: number): this {
    const data = buildEllipse(centerX, centerY, radiusX, radiusY);

    this._appendFill(data);

    if (this._lineWidth > 0) {
      this._strokeClosedOutline(data.points);
    }

    return this;
  }

  /** Fill a rectangle and optionally stroke its outline if `lineWidth > 0`. */
  public drawRectangle(x: number, y: number, width: number, height: number): this {
    const data = buildRectangle(x, y, width, height);

    this._appendFill(data);

    if (this._lineWidth > 0) {
      this._strokeClosedOutline(data.points);
    }

    return this;
  }

  /**
   * Fill a rounded rectangle and optionally stroke its outline if
   * `lineWidth > 0`. The corner `radius` is clamped to half the smaller side; a
   * radius of `0` is equivalent to {@link drawRectangle}.
   */
  public drawRoundedRectangle(x: number, y: number, width: number, height: number, radius: number): this {
    const data = buildRoundedRectangle(x, y, width, height, radius);

    this._appendFill(data);

    if (this._lineWidth > 0) {
      this._strokeClosedOutline(data.points);
    }

    return this;
  }

  /**
   * Fill a regular star polygon and optionally stroke its outline.
   * `innerRadius` defaults to half of `radius`.
   */
  public drawStar(centerX: number, centerY: number, points: number, radius: number, innerRadius: number = radius / 2, rotation = 0): this {
    const data = buildStar(centerX, centerY, points, radius, innerRadius, rotation);

    this._appendFill(data);

    if (this._lineWidth > 0) {
      this._strokeClosedOutline(data.points);
    }

    return this;
  }

  /** Remove all child meshes and reset pen state (position, fill/stroke styles, line width). */
  public clear(): this {
    this.removeChildren();

    this._lineWidth = 0;
    this._fillColor.copy(Color.transparentBlack);
    this._lineColor.copy(Color.black);
    this._fillStyle = this._fillColor;
    this._strokeStyle = this._lineColor;
    this._fillStyleTexture = null;
    this._strokeStyleTexture = null;
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

  /**
   * Resolve an assigned style into the stored paint. A {@link Color} is copied
   * into the solid `colorSlot` (keeping the {@link fillColor} / {@link lineColor}
   * convenience getters in sync) and that slot is returned; `null` reverts to
   * the slot; a {@link Gradient} is cloned so later external mutation cannot
   * change the stored paint.
   */
  private _resolveStyle(style: Color | Gradient | null, colorSlot: Color): Color | Gradient {
    if (style === null) {
      return colorSlot;
    }

    if (style instanceof Color) {
      colorSlot.copy(style);

      return colorSlot;
    }

    return style.clone();
  }

  private _appendFill(data: MeshGeometryData): void {
    // A fully transparent solid fill paints nothing — skip the mesh so an unset
    // fill (the default) or an explicit transparent fill costs nothing and never
    // covers what is drawn underneath. Gradients always produce a fill.
    if (this._fillStyle instanceof Color && this._fillStyle.a === 0) {
      return;
    }

    this.addChild(this._createFillMesh(data));
  }

  private _createFillMesh(data: MeshGeometryData): Mesh {
    if (this._fillStyle instanceof Color) {
      return this._createSolidMesh(data, this._fillStyle);
    }

    this._fillStyleTexture ??= this._rasterizeGradient(this._fillStyle);

    return this._createGradientMesh(data, this._fillStyleTexture);
  }

  private _createStrokeMesh(data: MeshGeometryData): Mesh {
    if (this._strokeStyle instanceof Color) {
      return this._createSolidMesh(data, this._strokeStyle);
    }

    this._strokeStyleTexture ??= this._rasterizeGradient(this._strokeStyle);

    return this._createGradientMesh(data, this._strokeStyleTexture);
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
    // vertices is a flat (x, y) pair array, so i and i+1 are both in-bounds.
    const x = vertices[i]!;
    const y = vertices[i + 1]!;

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
    // vertices is a flat (x, y) pair array, so i and i+1 are both in-bounds.
    uvs[i] = (vertices[i]! - minX) * invX;
    uvs[i + 1] = (vertices[i + 1]! - minY) * invY;
  }

  return uvs;
};
