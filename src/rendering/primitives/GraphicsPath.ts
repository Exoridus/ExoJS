import { TAU } from '#math/utils';

/** One flattened subpath produced by {@link GraphicsPath.contours}. */
export interface PathContour {
  /** Vertices as a flat `[x0, y0, x1, y1, ...]` array. The closing vertex of a closed contour is not repeated. */
  readonly points: readonly number[];

  /** Whether the subpath was closed with {@link GraphicsPath.closePath} or by a shape command. */
  readonly closed: boolean;
}

enum PathOp {
  Move,
  Line,
  Quadratic,
  Cubic,
  Arc,
  Close,
}

const ARITY: Readonly<Record<PathOp, number>> = {
  [PathOp.Move]: 2,
  [PathOp.Line]: 2,
  [PathOp.Quadratic]: 4,
  [PathOp.Cubic]: 6,
  [PathOp.Arc]: 6,
  [PathOp.Close]: 0,
};

const DEFAULT_TOLERANCE = 0.25;

/**
 * Deepest recursion allowed while subdividing one curve. Reached only by a
 * curve whose control points make the flatness test converge slowly, where
 * stopping leaves a visible but bounded error rather than a stack overflow.
 */
const MAX_SUBDIVISION_DEPTH = 16;

/**
 * A reusable 2D path: a sequence of subpaths built from lines, Bézier curves
 * and arcs, kept as commands rather than as vertices.
 *
 * ```ts
 * const arrow = new GraphicsPath().moveTo(0, 0).lineTo(40, 20).lineTo(0, 40).closePath();
 *
 * graphics.fillColor = Color.white;
 * graphics.drawShape(arrow);
 * ```
 *
 * Keeping the commands is what separates this from a list of points: the same
 * path flattens to as many vertices as the size it is drawn at needs, so one
 * path can back an icon and a full-screen backdrop without either being
 * over-tessellated or visibly faceted. Pass the tolerance you need to
 * {@link contours}; the default suits drawing at roughly one path unit per
 * pixel.
 *
 * A path is a value, not a scene node. It holds no GPU resources, needs no
 * disposal, and can be shared between any number of {@link Graphics} instances
 * and drawn any number of times.
 *
 * This is not the same thing as {@link Graphics}'s own `moveTo`/`lineTo`
 * cursor, which draws each segment the moment it is called and gives every
 * segment its own mesh. A path is assembled first and drawn as one shape, so
 * it can be filled, joined across segments, and kept for later.
 */
export class GraphicsPath {
  private readonly _ops: PathOp[] = [];
  private readonly _data: number[] = [];
  private _startX = 0;
  private _startY = 0;
  private _currentX = 0;
  private _currentY = 0;

  /** Whether any command has been recorded. */
  public get isEmpty(): boolean {
    return this._ops.length === 0;
  }

  /** X of the point the next segment starts from. */
  public get currentX(): number {
    return this._currentX;
  }

  /** Y of the point the next segment starts from. */
  public get currentY(): number {
    return this._currentY;
  }

  /** Begin a new subpath at (`x`, `y`). */
  public moveTo(x: number, y: number): this {
    this._push(PathOp.Move, x, y);
    this._startX = x;
    this._startY = y;
    this._currentX = x;
    this._currentY = y;

    return this;
  }

  /** Extend the current subpath with a straight segment to (`x`, `y`). */
  public lineTo(x: number, y: number): this {
    this._ensureSubpath();
    this._push(PathOp.Line, x, y);
    this._currentX = x;
    this._currentY = y;

    return this;
  }

  /** Extend the current subpath with a quadratic Bézier curve through control point (`cpX`, `cpY`). */
  public quadraticCurveTo(cpX: number, cpY: number, x: number, y: number): this {
    this._ensureSubpath();
    this._push(PathOp.Quadratic, cpX, cpY, x, y);
    this._currentX = x;
    this._currentY = y;

    return this;
  }

  /** Extend the current subpath with a cubic Bézier curve through two control points. */
  public bezierCurveTo(cpX1: number, cpY1: number, cpX2: number, cpY2: number, x: number, y: number): this {
    this._ensureSubpath();
    this._push(PathOp.Cubic, cpX1, cpY1, cpX2, cpY2, x, y);
    this._currentX = x;
    this._currentY = y;

    return this;
  }

  /**
   * Extend the current subpath with a circular arc, preceded by a straight
   * segment from the current point to the arc's start where the two differ.
   * Angles are in radians and `anticlockwise` reverses the sweep direction.
   *
   * Starts a new subpath when the path is empty, so an arc can open one.
   */
  public arc(centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number, anticlockwise = false): this {
    const r = Math.abs(radius);
    const startX = centerX + Math.cos(startAngle) * r;
    const startY = centerY + Math.sin(startAngle) * r;

    if (this.isEmpty) {
      this.moveTo(startX, startY);
    } else if (startX !== this._currentX || startY !== this._currentY) {
      this.lineTo(startX, startY);
    }

    this._push(PathOp.Arc, centerX, centerY, r, startAngle, endAngle, anticlockwise ? 1 : 0);
    this._currentX = centerX + Math.cos(endAngle) * r;
    this._currentY = centerY + Math.sin(endAngle) * r;

    return this;
  }

  /**
   * Extend the current subpath with an arc of `radius` tangent to the lines
   * current point → (`x1`, `y1`) and (`x1`, `y1`) → (`x2`, `y2`), the corner
   * rounding used for rounded polygons.
   *
   * Degenerate input - a zero radius, repeated points, or a corner too tight
   * for the radius - falls back to a straight segment to (`x1`, `y1`).
   */
  public arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): this {
    this._ensureSubpath();

    const fromX = this._currentX;
    const fromY = this._currentY;
    const r = Math.abs(radius);

    if (r === 0 || (fromX === x1 && fromY === y1) || (x1 === x2 && y1 === y2)) {
      return this.lineTo(x1, y1);
    }

    const inLen = Math.hypot(x1 - fromX, y1 - fromY);
    const outLen = Math.hypot(x2 - x1, y2 - y1);

    if (inLen === 0 || outLen === 0) {
      return this.lineTo(x1, y1);
    }

    const inDirX = (x1 - fromX) / inLen;
    const inDirY = (y1 - fromY) / inLen;
    const outDirX = (x2 - x1) / outLen;
    const outDirY = (y2 - y1) / outLen;
    const dot = Math.min(1, Math.max(-1, inDirX * outDirX + inDirY * outDirY));
    const angle = Math.acos(dot);

    if (angle === 0 || angle === Math.PI) {
      return this.lineTo(x1, y1);
    }

    const toTangent = r / Math.tan(angle / 2);

    if (!Number.isFinite(toTangent) || toTangent > inLen || toTangent > outLen) {
      return this.lineTo(x1, y1);
    }

    const startX = x1 - inDirX * toTangent;
    const startY = y1 - inDirY * toTangent;
    const leftTurn = inDirX * outDirY - inDirY * outDirX > 0;
    const centerX = startX + (leftTurn ? -inDirY : inDirY) * r;
    const centerY = startY + (leftTurn ? inDirX : -inDirX) * r;

    return this.arc(
      centerX,
      centerY,
      r,
      Math.atan2(startY - centerY, startX - centerX),
      Math.atan2(y1 + outDirY * toTangent - centerY, x1 + outDirX * toTangent - centerX),
      leftTurn,
    );
  }

  /** Add a closed rectangular subpath. */
  public rect(x: number, y: number, width: number, height: number): this {
    return this.moveTo(x, y)
      .lineTo(x + width, y)
      .lineTo(x + width, y + height)
      .lineTo(x, y + height)
      .closePath();
  }

  /**
   * Add a closed rounded-rectangle subpath. The radius is clamped to half the
   * shorter side; a clamped radius of zero gives a plain {@link rect}.
   */
  public roundedRect(x: number, y: number, width: number, height: number, radius: number): this {
    const r = Math.min(Math.abs(radius), Math.abs(width) / 2, Math.abs(height) / 2);

    if (r === 0) {
      return this.rect(x, y, width, height);
    }

    const right = x + width;
    const bottom = y + height;

    return this.moveTo(x + r, y)
      .lineTo(right - r, y)
      .arc(right - r, y + r, r, -Math.PI / 2, 0)
      .lineTo(right, bottom - r)
      .arc(right - r, bottom - r, r, 0, Math.PI / 2)
      .lineTo(x + r, bottom)
      .arc(x + r, bottom - r, r, Math.PI / 2, Math.PI)
      .lineTo(x, y + r)
      .arc(x + r, y + r, r, Math.PI, (3 * Math.PI) / 2)
      .closePath();
  }

  /** Add a closed circular subpath. */
  public circle(centerX: number, centerY: number, radius: number): this {
    return this.moveTo(centerX + Math.abs(radius), centerY)
      .arc(centerX, centerY, radius, 0, TAU)
      .closePath();
  }

  /**
   * Add a closed axis-aligned elliptical subpath. Approximated by four cubic
   * Bézier quadrants, which stays within the flattening tolerance for every
   * radius ratio.
   */
  public ellipse(centerX: number, centerY: number, radiusX: number, radiusY: number): this {
    const rx = Math.abs(radiusX);
    const ry = Math.abs(radiusY);
    // Control-point distance that makes a cubic Bézier match a quarter ellipse
    // to within about 0.03% of the radius.
    const kx = rx * 0.5522847498307936;
    const ky = ry * 0.5522847498307936;

    return this.moveTo(centerX + rx, centerY)
      .bezierCurveTo(centerX + rx, centerY + ky, centerX + kx, centerY + ry, centerX, centerY + ry)
      .bezierCurveTo(centerX - kx, centerY + ry, centerX - rx, centerY + ky, centerX - rx, centerY)
      .bezierCurveTo(centerX - rx, centerY - ky, centerX - kx, centerY - ry, centerX, centerY - ry)
      .bezierCurveTo(centerX + kx, centerY - ry, centerX + rx, centerY - ky, centerX + rx, centerY)
      .closePath();
  }

  /** Close the current subpath and return the cursor to where that subpath began. */
  public closePath(): this {
    if (this._ops.length > 0) {
      this._push(PathOp.Close);
      this._currentX = this._startX;
      this._currentY = this._startY;
    }

    return this;
  }

  /** Discard every command, leaving the path as newly constructed. */
  public clear(): this {
    this._ops.length = 0;
    this._data.length = 0;
    this._startX = 0;
    this._startY = 0;
    this._currentX = 0;
    this._currentY = 0;

    return this;
  }

  /** An independent copy holding the same commands. */
  public clone(): GraphicsPath {
    const copy = new GraphicsPath();

    copy._ops.push(...this._ops);
    copy._data.push(...this._data);
    copy._startX = this._startX;
    copy._startY = this._startY;
    copy._currentX = this._currentX;
    copy._currentY = this._currentY;

    return copy;
  }

  /**
   * Flatten the path into polylines, one per subpath.
   *
   * `tolerance` is the largest distance, in the path's own units, that a
   * flattened edge may deviate from the true curve. Smaller values produce more
   * vertices: halving it roughly doubles the vertex count of a curve. Pass the
   * path unit size in device pixels to keep curves smooth on a scaled-up path.
   *
   * Subpaths of fewer than two points are dropped, and so is the closing vertex
   * of a closed subpath that merely repeats its first.
   */
  public contours(tolerance: number = DEFAULT_TOLERANCE): readonly PathContour[] {
    const limit = tolerance > 0 ? tolerance : DEFAULT_TOLERANCE;
    const contours: PathContour[] = [];

    let points: number[] = [];
    let closed = false;
    let cursorX = 0;
    let cursorY = 0;
    let startX = 0;
    let startY = 0;
    let read = 0;

    const flush = (): void => {
      if (points.length >= 4) {
        contours.push({ points, closed });
      }

      points = [];
      closed = false;
    };

    for (const op of this._ops) {
      const at = read;

      read += ARITY[op];

      switch (op) {
        case PathOp.Move:
          flush();
          cursorX = startX = this._data[at]!;
          cursorY = startY = this._data[at + 1]!;
          points.push(cursorX, cursorY);
          break;

        case PathOp.Line:
          cursorX = this._data[at]!;
          cursorY = this._data[at + 1]!;
          points.push(cursorX, cursorY);
          break;

        case PathOp.Quadratic: {
          const cpX = this._data[at]!;
          const cpY = this._data[at + 1]!;
          const toX = this._data[at + 2]!;
          const toY = this._data[at + 3]!;

          flattenQuadratic(points, cursorX, cursorY, cpX, cpY, toX, toY, limit, 0);
          cursorX = toX;
          cursorY = toY;
          break;
        }

        case PathOp.Cubic: {
          const cpX1 = this._data[at]!;
          const cpY1 = this._data[at + 1]!;
          const cpX2 = this._data[at + 2]!;
          const cpY2 = this._data[at + 3]!;
          const toX = this._data[at + 4]!;
          const toY = this._data[at + 5]!;

          flattenCubic(points, cursorX, cursorY, cpX1, cpY1, cpX2, cpY2, toX, toY, limit, 0);
          cursorX = toX;
          cursorY = toY;
          break;
        }

        case PathOp.Arc: {
          const centerX = this._data[at]!;
          const centerY = this._data[at + 1]!;
          const radius = this._data[at + 2]!;
          const startAngle = this._data[at + 3]!;
          const endAngle = this._data[at + 4]!;
          const anticlockwise = this._data[at + 5] === 1;

          flattenArc(points, centerX, centerY, radius, startAngle, endAngle, anticlockwise, limit);
          cursorX = centerX + Math.cos(endAngle) * radius;
          cursorY = centerY + Math.sin(endAngle) * radius;
          break;
        }

        case PathOp.Close:
          closed = true;
          dropRepeatedStart(points);
          flush();
          cursorX = startX;
          cursorY = startY;
          points.push(cursorX, cursorY);
          break;
      }
    }

    flush();

    return contours;
  }

  private _ensureSubpath(): void {
    if (this._ops.length === 0) {
      this.moveTo(this._currentX, this._currentY);
    }
  }

  private _push(op: PathOp, ...args: number[]): void {
    this._ops.push(op);
    this._data.push(...args);
  }
}

/**
 * A closed subpath whose final vertex repeats its first would give the
 * tessellator a zero-length edge; the closing edge is implied by the flag.
 */
const dropRepeatedStart = (points: number[]): void => {
  const count = points.length;

  if (count >= 4 && points[count - 2] === points[0] && points[count - 1] === points[1]) {
    points.length = count - 2;
  }
};

const flattenQuadratic = (
  out: number[],
  fromX: number,
  fromY: number,
  cpX: number,
  cpY: number,
  toX: number,
  toY: number,
  tolerance: number,
  depth: number,
): void => {
  // Deviation of the control point from the chord bounds the curve's own
  // deviation, so a flat-enough control point means a flat-enough curve.
  const dx = toX - fromX;
  const dy = toY - fromY;
  const cross = Math.abs((cpX - toX) * dy - (cpY - toY) * dx);
  const chordSq = dx * dx + dy * dy;

  if (depth >= MAX_SUBDIVISION_DEPTH || cross * cross <= tolerance * tolerance * chordSq) {
    out.push(toX, toY);

    return;
  }

  const midCpX1 = (fromX + cpX) / 2;
  const midCpY1 = (fromY + cpY) / 2;
  const midCpX2 = (cpX + toX) / 2;
  const midCpY2 = (cpY + toY) / 2;
  const midX = (midCpX1 + midCpX2) / 2;
  const midY = (midCpY1 + midCpY2) / 2;

  flattenQuadratic(out, fromX, fromY, midCpX1, midCpY1, midX, midY, tolerance, depth + 1);
  flattenQuadratic(out, midX, midY, midCpX2, midCpY2, toX, toY, tolerance, depth + 1);
};

const flattenCubic = (
  out: number[],
  fromX: number,
  fromY: number,
  cpX1: number,
  cpY1: number,
  cpX2: number,
  cpY2: number,
  toX: number,
  toY: number,
  tolerance: number,
  depth: number,
): void => {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const cross1 = Math.abs((cpX1 - toX) * dy - (cpY1 - toY) * dx);
  const cross2 = Math.abs((cpX2 - toX) * dy - (cpY2 - toY) * dx);
  const cross = cross1 + cross2;
  const chordSq = dx * dx + dy * dy;

  if (depth >= MAX_SUBDIVISION_DEPTH || cross * cross <= tolerance * tolerance * chordSq) {
    out.push(toX, toY);

    return;
  }

  const ax = (fromX + cpX1) / 2;
  const ay = (fromY + cpY1) / 2;
  const bx = (cpX1 + cpX2) / 2;
  const by = (cpY1 + cpY2) / 2;
  const cx = (cpX2 + toX) / 2;
  const cy = (cpY2 + toY) / 2;
  const dx1 = (ax + bx) / 2;
  const dy1 = (ay + by) / 2;
  const ex = (bx + cx) / 2;
  const ey = (by + cy) / 2;
  const midX = (dx1 + ex) / 2;
  const midY = (dy1 + ey) / 2;

  flattenCubic(out, fromX, fromY, ax, ay, dx1, dy1, midX, midY, tolerance, depth + 1);
  flattenCubic(out, midX, midY, ex, ey, cx, cy, toX, toY, tolerance, depth + 1);
};

const flattenArc = (
  out: number[],
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  anticlockwise: boolean,
  tolerance: number,
): void => {
  if (radius <= 0) {
    out.push(centerX, centerY);

    return;
  }

  let sweep = endAngle - startAngle;

  if (anticlockwise) {
    while (sweep > 0) sweep -= TAU;
    if (sweep < -TAU) sweep = -TAU;
  } else {
    while (sweep < 0) sweep += TAU;
    if (sweep > TAU) sweep = TAU;
  }

  // Largest turn per segment that keeps the chord's sagitta within tolerance.
  // A tolerance at or above the radius would admit any angle, so cap the step
  // at a quarter turn to keep even a coarse arc recognisable.
  const maxStep = tolerance >= radius ? Math.PI / 2 : Math.min(Math.PI / 2, 2 * Math.acos(1 - tolerance / radius));
  const segments = Math.max(1, Math.ceil(Math.abs(sweep) / maxStep));

  for (let i = 1; i <= segments; i++) {
    const angle = startAngle + (sweep * i) / segments;

    out.push(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
  }
};
