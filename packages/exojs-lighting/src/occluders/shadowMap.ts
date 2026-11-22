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
 * Floats per angular bin of a polar shadow row: the channels of the `RGBA32F`
 * texel the light shader reads for it.
 * @internal
 */
export const shadowRowStride = 4;

/** Edges of a bin closer than this, as a fraction of the bin, count as covering it. */
const coverageEpsilon = 1e-6;

/**
 * Fill one light's 1D shadow map: for every angular bin, how far the nearest
 * occluder is, as a fraction of the light's radius, and which part of the bin
 * it covers.
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
 * Each bin is {@link shadowRowStride} floats, and `row` holds `bins` of them:
 *
 * - `[0]` the distance of an occluder covering only part of the bin,
 * - `[1]`, `[2]` where that part starts and ends, as fractions of the bin, and
 *   equal when no occluder covers only part of it,
 * - `[3]` the distance of the nearest occluder over the rest of the bin, `1`
 *   where nothing blocks.
 *
 * A silhouette rarely falls on a bin boundary. Storing a single distance per
 * bin moves it to the nearest bin centre, which leaves the edge up to half a
 * bin off and makes it jump a whole bin as the occluder or the light moves.
 * The covered part keeps the silhouette where the geometry puts it.
 *
 * Two occluders that each cover part of the same bin merge into one span at
 * the nearer distance where their parts touch or overlap. Where a gap
 * separates them, the nearer keeps its part and the farther one is counted
 * over the rest of the bin, which shadows that gap beyond the farther
 * distance but never lets light past either.
 *
 * Segments outside the light's circle are skipped, so the cost of a light is
 * the occluders it can actually see.
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
  for (let bin = 0; bin < bins; bin++) {
    const texel = bin * shadowRowStride;

    row[texel] = unoccluded;
    row[texel + 1] = 0;
    row[texel + 2] = 0;
    row[texel + 3] = unoccluded;
  }

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
    const firstBin = Math.floor((start + Math.PI) * binsPerRadian);
    const lastBin = Math.floor((start + width + Math.PI) * binsPerRadian);

    const edgeX = x2 - x1;
    const edgeY = y2 - y1;

    for (let bin = firstBin; bin <= lastBin; bin++) {
      // Unwrapped, like `start`, so a segment across the seam needs no special case.
      const binStart = -Math.PI + bin / binsPerRadian;
      let low = (start - binStart) * binsPerRadian;
      let high = (start + width - binStart) * binsPerRadian;

      low = low <= coverageEpsilon ? 0 : low;
      high = high >= 1 - coverageEpsilon ? 1 : high;

      if (high <= low) {
        continue;
      }

      let distance: number;

      if (low <= 0.5 && high >= 0.5) {
        const directionOffset = (bin + bins + 1) * 2;

        distance = distanceAlong(x1, y1, edgeX, edgeY, directions[directionOffset]!, directions[directionOffset + 1]!);
      } else {
        // The part of the segment nearest the bin centre: one of its ends.
        const angle = binStart + (low > 0.5 ? low : high) / binsPerRadian;

        distance = distanceAlong(x1, y1, edgeX, edgeY, Math.cos(angle), Math.sin(angle));
      }

      if (distance <= 0 || distance >= radius) {
        continue;
      }

      coverBin(row, (((bin % bins) + bins) % bins) * shadowRowStride, distance / radius, low, high);
    }
  }

  // Spans that joined up across a whole bin - two faces meeting at a corner
  // inside it - describe a covered bin, whose distance the shader may then
  // compare against its neighbours'.
  for (let bin = 0; bin < bins; bin++) {
    const texel = bin * shadowRowStride;

    if (row[texel + 1] === 0 && row[texel + 2] === 1) {
      row[texel + 3] = Math.min(row[texel + 3]!, row[texel]!);
      row[texel + 2] = 0;
    }
  }
};

/** Record an occluder at `distance` over the part `low..high` of the bin whose texel starts at `texel`. */
const coverBin = (row: Float32Array, texel: number, distance: number, low: number, high: number): void => {
  if (low === 0 && high === 1) {
    row[texel + 3] = Math.min(row[texel + 3]!, distance);
    // The partial span is never further than what covers the whole bin, or
    // the fragments in it would see past a blocker that is there.
    row[texel] = Math.min(row[texel]!, distance);

    return;
  }

  if (distance >= row[texel + 3]!) {
    return;
  }

  const spanLow = row[texel + 1]!;
  const spanHigh = row[texel + 2]!;

  if (spanHigh <= spanLow) {
    row[texel] = distance;
    row[texel + 1] = low;
    row[texel + 2] = high;

    return;
  }

  // The stored span is rounded to 32 bits, so two faces meeting at a corner
  // may not compare as touching exactly.
  if (low <= spanHigh + coverageEpsilon && high >= spanLow - coverageEpsilon) {
    row[texel] = Math.min(row[texel]!, distance);
    row[texel + 1] = Math.min(spanLow, low);
    row[texel + 2] = Math.max(spanHigh, high);

    return;
  }

  // Apart, so one span would also cover the gap between them at the nearer
  // distance. The farther part joins the rest of the bin instead.
  if (distance < row[texel]!) {
    row[texel + 3] = row[texel]!;
    row[texel] = distance;
    row[texel + 1] = low;
    row[texel + 2] = high;
  } else {
    row[texel + 3] = distance;
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
 * Distance from the origin to where a unit ray meets a segment, clamped onto
 * the segment, or `-1` when the ray runs parallel to it.
 *
 * Clamped because the caller already knows the ray falls within the segment's
 * angular span: a ray along one of its ends must still meet it there, however
 * the rounding of the intersection lands.
 *
 * The segment runs from `(x1, y1)` along `(edgeX, edgeY)`; both are already in
 * light space, which is why the ray needs no origin of its own.
 */
const distanceAlong = (x1: number, y1: number, edgeX: number, edgeY: number, dirX: number, dirY: number): number => {
  const denominator = dirX * edgeY - dirY * edgeX;

  if (denominator === 0) {
    return -1;
  }

  const along = Math.min(1, Math.max(0, (x1 * dirY - y1 * dirX) / denominator));

  return Math.hypot(x1 + edgeX * along, y1 + edgeY * along);
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
 * strips cover, which is what lets every sun share one `R32F` atlas whatever
 * the extent of its own strips.
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
