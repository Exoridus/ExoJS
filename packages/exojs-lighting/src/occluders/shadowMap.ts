const TAU = Math.PI * 2;

/** No occluder along a ray, in the normalized distance the shadow map stores. */
const unoccluded = 1;

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
      const angle = -Math.PI + (bin + 0.5) / binsPerRadian;
      const distance = rayHit(x1, y1, edgeX, edgeY, Math.cos(angle), Math.sin(angle));

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
