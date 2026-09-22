const TAU = Math.PI * 2;

/** No occluder along a ray, in the normalized distance the shadow map stores. */
const unoccluded = 1;

// A bounded cache of immutable bin directions, independent of scene geometry.
const maxDirectionTables = 4;
const directionTables = new Map<number, Float64Array>();

const shadowDirections = (bins: number): Float64Array => {
  const existing = directionTables.get(bins);

  if (existing !== undefined) {
    return existing;
  }

  // Keep the unwrapped bins around the seam. Folding their angles into one
  // turn before sin/cos can change floating-point endpoint decisions.
  const directions = new Float64Array((3 * bins + 3) * 2);
  const binsPerRadian = bins / TAU;

  for (let bin = -bins - 1; bin <= 2 * bins + 1; bin++) {
    const angle = -Math.PI + (bin + 0.5) / binsPerRadian;
    const offset = (bin + bins + 1) * 2;

    directions[offset] = Math.cos(angle);
    directions[offset + 1] = Math.sin(angle);
  }

  if (directionTables.size >= maxDirectionTables) {
    const oldest = directionTables.keys().next().value;

    if (oldest !== undefined) {
      directionTables.delete(oldest);
    }
  }

  directionTables.set(bins, directions);

  return directions;
};

/**
 * Fill one light's 1D shadow map: for every angular bin, how far the nearest
 * occluder is, as a fraction of the light's radius.
 *
 * The map is polar and centred on the light, so the whole shadow term for a
 * light is one texture row and every light still draws in the same instanced
 * batch - a pass per light would break the batch that makes the renderer worth
 * having. Bin `i` covers the angles `[-pi + i * 2pi / bins, ...)`, which is
 * what the light shader reverses from the fragment's own direction.
 *
 * Angles are measured in the light's own frame, given by the unit vector
 * `(axisCos, axisSin)`, because that is the frame the light quad is drawn in.
 * A point light passes `(1, 0)`.
 *
 * `row` is filled from index `0` to `bins` with `1` where nothing blocks.
 * Segments outside the light's circle are skipped, so the cost of a light is
 * the occluders it can actually see.
 *
 * Bins sample at their centre, so a silhouette edge is accurate to half a bin.
 * That is what the shader's kernel smooths over, and what a larger `bins`
 * buys.
 * @internal
 */
export const buildShadowRow = (
  segments: Float32Array,
  segmentCount: number,
  centerX: number,
  centerY: number,
  axisCos: number,
  axisSin: number,
  radius: number,
  row: Float32Array,
  bins: number,
): void => {
  row.fill(unoccluded, 0, bins);

  if (radius <= 0 || bins <= 0) {
    return;
  }

  const binsPerRadian = bins / TAU;
  let directions: Float64Array | undefined;

  for (let index = 0; index < segmentCount; index++) {
    const offset = index * 4;
    const firstX = segments[offset]! - centerX;
    const firstY = segments[offset + 1]! - centerY;
    const secondX = segments[offset + 2]! - centerX;
    const secondY = segments[offset + 3]! - centerY;
    const x1 = axisCos * firstX + axisSin * firstY;
    const y1 = axisCos * firstY - axisSin * firstX;
    const x2 = axisCos * secondX + axisSin * secondY;
    const y2 = axisCos * secondY - axisSin * secondX;

    if (!reaches(x1, y1, x2, y2, radius)) {
      continue;
    }

    directions ??= shadowDirections(bins);

    const first = Math.atan2(y1, x1);
    const span = wrapSigned(Math.atan2(y2, x2) - first);
    const start = span >= 0 ? first : first + span;
    const width = Math.abs(span);

    // One bin of slack on each side: a ray whose bin centre falls outside the
    // segment simply misses it, so over-testing costs an intersection and
    // under-testing would leave a lit seam where two segments meet.
    const firstBin = Math.floor((start + Math.PI) * binsPerRadian) - 1;
    const lastBin = Math.ceil((start + width + Math.PI) * binsPerRadian) + 1;

    const edgeX = x2 - x1;
    const edgeY = y2 - y1;

    for (let bin = firstBin; bin <= lastBin; bin++) {
      const directionOffset = (bin + bins + 1) * 2;
      const distance = rayHit(x1, y1, edgeX, edgeY, directions[directionOffset]!, directions[directionOffset + 1]!);

      if (distance <= 0 || distance >= radius) {
        continue;
      }

      const slot = ((bin % bins) + bins) % bins;
      const normalized = distance / radius;

      if (normalized < row[slot]!) {
        row[slot] = normalized;
      }
    }
  }
};

/** Whether a segment comes within `radius` of the light-space origin. */
const reaches = (x1: number, y1: number, x2: number, y2: number, radius: number): boolean => {
  if (Math.min(x1, x2) > radius || Math.max(x1, x2) < -radius || Math.min(y1, y2) > radius || Math.max(y1, y2) < -radius) {
    return false;
  }

  const edgeX = x2 - x1;
  const edgeY = y2 - y1;
  const lengthSquared = edgeX * edgeX + edgeY * edgeY;
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, -(x1 * edgeX + y1 * edgeY) / lengthSquared));
  const nearestX = x1 + edgeX * t;
  const nearestY = y1 + edgeY * t;

  return nearestX * nearestX + nearestY * nearestY <= radius * radius;
};

/**
 * Distance from the origin to a segment along a unit ray, or `-1` when the ray
 * misses it.
 *
 * The segment runs from `(x1, y1)` along `(edgeX, edgeY)`; both are already in
 * light space, which is why the ray needs no origin of its own.
 */
const rayHit = (x1: number, y1: number, edgeX: number, edgeY: number, dirX: number, dirY: number): number => {
  const denominator = dirX * edgeY - dirY * edgeX;

  if (denominator === 0) {
    return -1;
  }

  const along = (x1 * dirY - y1 * dirX) / denominator;

  if (along < 0 || along > 1) {
    return -1;
  }

  return (x1 * edgeY - y1 * edgeX) / denominator;
};

/** An angle difference folded into `(-pi, pi]`, so a span is always the short way round. */
const wrapSigned = (angle: number): number => {
  const wrapped = angle % TAU;

  if (wrapped > Math.PI) {
    return wrapped - TAU;
  }

  if (wrapped <= -Math.PI) {
    return wrapped + TAU;
  }

  return wrapped;
};

/**
 * Fill one directional light's 1D shadow map: for every strip across the
 * light's direction, how far along that direction the nearest occluder sits, as
 * a fraction of the strip range's own span.
 *
 * A sun has no centre to measure angles from, so the row is linear where a
 * point light's is polar. Bin `i` covers the strip
 * `[spanMin + i * span / bins, ...)` of the coordinate across the light, and
 * the value stored is the smallest `depth` any occluder reaches in it - `1`
 * where nothing blocks, so a fragment shallower than the stored depth is lit.
 *
 * `depthMin` and `depthSpan` put the depth into `0..1` over the same region the
 * strips cover, which is what lets one `R32F` atlas hold polar and linear rows
 * side by side.
 *
 * Both axes are given as unit vectors: `(alongX, alongY)` is the direction the
 * light travels, `(acrossX, acrossY)` is perpendicular to it.
 * @internal
 */
export const buildSunShadowRow = (
  segments: Float32Array,
  segmentCount: number,
  alongX: number,
  alongY: number,
  acrossX: number,
  acrossY: number,
  spanMin: number,
  spanSize: number,
  depthMin: number,
  depthSpan: number,
  row: Float32Array,
  bins: number,
): void => {
  row.fill(unoccluded, 0, bins);

  if (bins <= 0 || spanSize <= 0 || depthSpan <= 0) {
    return;
  }

  const binsPerUnit = bins / spanSize;

  for (let index = 0; index < segmentCount; index++) {
    const offset = index * 4;
    const x1 = segments[offset]!;
    const y1 = segments[offset + 1]!;
    const x2 = segments[offset + 2]!;
    const y2 = segments[offset + 3]!;
    const across1 = acrossX * x1 + acrossY * y1;
    const across2 = acrossX * x2 + acrossY * y2;
    const depth1 = (alongX * x1 + alongY * y1 - depthMin) / depthSpan;
    const depth2 = (alongX * x2 + alongY * y2 - depthMin) / depthSpan;
    const firstBin = Math.floor((Math.min(across1, across2) - spanMin) * binsPerUnit);
    const lastBin = Math.ceil((Math.max(across1, across2) - spanMin) * binsPerUnit);
    const width = across2 - across1;

    for (let bin = Math.max(0, firstBin); bin <= Math.min(bins - 1, lastBin); bin++) {
      // Sampled at the strip's centre, the way the polar row samples at a bin's
      // centre, so a silhouette edge is accurate to half a strip.
      const across = spanMin + (bin + 0.5) / binsPerUnit;
      // A segment lying exactly along the light contributes its nearer end to
      // the one strip it occupies rather than nothing at all.
      const t = width === 0 ? 0 : (across - across1) / width;

      if (t < 0 || t > 1) {
        continue;
      }

      const depth = depth1 + (depth2 - depth1) * t;

      if (depth > 0 && depth < row[bin]!) {
        row[bin] = depth;
      }
    }
  }
};
