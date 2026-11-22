const TAU = Math.PI * 2;

/** No occluder along a ray, in the normalized distance the shadow map stores. */
const unoccluded = 1;

// A bounded cache of immutable bin directions, independent of scene geometry.
const maxDirectionTables = 4;
const directionTables = new Map<number, Float64Array>();

/**
 * Unit directions at every bin's start, over the unwrapped bins
 * `-bins - 1 .. 2 * bins + 2` a segment can reach from the seam.
 */
const shadowDirections = (bins: number): Float64Array => {
  const existing = directionTables.get(bins);

  if (existing !== undefined) {
    return existing;
  }

  // Keep the unwrapped bins around the seam. Folding their angles into one
  // turn before sin/cos can change floating-point endpoint decisions.
  const directions = new Float64Array((3 * bins + 4) * 2);
  const binsPerRadian = bins / TAU;

  for (let bin = -bins - 1; bin <= 2 * bins + 2; bin++) {
    const angle = -Math.PI + bin / binsPerRadian;
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
 * `RGBA32F` texels per angular bin of a polar shadow row. The shader always
 * reads the first and reads the second only where the first says a bin holds
 * a silhouette or a corner, which is rare.
 * @internal
 */
export const shadowRowTexels = 2;

/** Floats per angular bin of a polar shadow row. @internal */
export const shadowRowStride = shadowRowTexels * 4;

/**
 * Steps a covered span's ends are stored in, as fractions of a bin. Both ends
 * share one float channel as `low * 4096 + high`, which stays exact in 32 bits.
 * @internal
 */
export const shadowSpanSteps = 4095;

/** Edges of a bin closer than this, as a fraction of the bin, count as covering it. */
const coverageEpsilon = 1e-6;

/** Floats per bin of {@link spans}: two partial spans. */
const spanStride = 8;

/** Per bin, while a row is built: up to two partial spans, each its ends and its distances there. */
let spans = new Float64Array(0);

/** Parts of a bin remembered per bin, for finding the corner of the surface the light reaches. */
const maxParts = 8;

/** Per bin, while a row is built: up to {@link maxParts} parts as `low, high, lowDistance, highDistance`. */
let parts = new Float64Array(0);
let partCounts = new Uint8Array(0);

/**
 * Fill one light's 1D shadow map: for every angular bin, where the occluders
 * are, as a fraction of the light's radius, and which part of the bin they
 * cover.
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
 * Each bin is {@link shadowRowStride} floats, and `row` holds `bins` of them.
 * Distances are fractions of the radius, `1` where nothing blocks:
 *
 * - `[0]` an occluder covering only part of the bin, its distance at that
 *   part's start; `[4]` the same at its end,
 * - `[1]` which part: `low * 4096 + high`, both in steps of
 *   {@link shadowSpanSteps}; `0` where no occluder covers only part, and `-1`
 *   where none does but the rest of the bin has a corner,
 * - `[2]`, `[3]` the nearest occluder over the rest of the bin, at the bin's
 *   start and at its end,
 * - `[5]` either a corner - where in the bin, below `1` - with its distance
 *   in `[6]`, or a second partial blocker's part, packed like `[1]`, with
 *   its distances at both ends in `[6]` and `[7]`.
 *
 * A silhouette rarely falls on a bin boundary. Storing a single distance per
 * bin moves it to the nearest bin centre, which leaves the edge up to half a
 * bin off and makes it jump a whole bin as the occluder or the light moves.
 * The covered part keeps the silhouette where the geometry puts it.
 *
 * A face seen at a slant moves away from the light across a bin, and seen at a
 * grazing angle by many pixels within one. Distances at both ends of every part
 * let the shader follow each face straight through the bin, and the corner
 * where two faces meet inside one stays a corner instead of being cut across -
 * where one distance per bin turns a face into a staircase a bin wide, and a
 * corner turned towards the light into a notch it shines into.
 *
 * Two occluders that each cover part of the same bin merge into one span where
 * their parts touch or overlap. Where a gap separates them, the nearer keeps
 * its part and the farther one is counted over the rest of the bin, which
 * shadows that gap beyond the farther distance but never lets light past
 * either.
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
  if (spans.length < bins * spanStride) {
    spans = new Float64Array(bins * spanStride);
    parts = new Float64Array(bins * maxParts * 4);
    partCounts = new Uint8Array(bins);
  }

  partCounts.fill(0, 0, bins);

  row.fill(0, 0, bins * shadowRowStride);

  for (let bin = 0; bin < bins; bin++) {
    const texel = bin * shadowRowStride;

    row[texel] = unoccluded;
    row[texel + 2] = unoccluded;
    row[texel + 3] = unoccluded;
    row[texel + 4] = unoccluded;
    spans[bin * spanStride] = 0;
    spans[bin * spanStride + 1] = 0;
    spans[bin * spanStride + 4] = 0;
    spans[bin * spanStride + 5] = 0;
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

    castSegment(row, bins, binsPerRadian, directions, radius, x1, y1, x2, y2);
  }

  encodeSpans(row, bins);
};

/** Record segment `(x1, y1)..(x2, y2)`, already in light space, in every bin it crosses. */
const castSegment = (
  row: Float32Array,
  bins: number,
  binsPerRadian: number,
  directions: Float64Array,
  radius: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void => {
  const first = Math.atan2(y1, x1);
  const span = wrapSigned(Math.atan2(y2, x2) - first);
  const start = span >= 0 ? first : first + span;
  const width = Math.abs(span);
  const firstBin = Math.floor((start + Math.PI) * binsPerRadian);
  const lastBin = Math.floor((start + width + Math.PI) * binsPerRadian);
  const edgeX = x2 - x1;
  const edgeY = y2 - y1;
  // Inside a bin a part ends at one of the segment's own ends, whose
  // distance needs no ray.
  const startVertex = Math.sqrt(span >= 0 ? x1 * x1 + y1 * y1 : x2 * x2 + y2 * y2) / radius;
  const endVertex = Math.sqrt(span >= 0 ? x2 * x2 + y2 * y2 : x1 * x1 + y1 * y1) / radius;

  // A bin's end is the next one's start, so the distance there is carried
  // over instead of measured twice.
  let carried = -1;

  for (let bin = firstBin; bin <= lastBin; bin++) {
    // Unwrapped, like `start`, so a segment across the seam needs no special case.
    const binStart = -Math.PI + bin / binsPerRadian;
    let low = (start - binStart) * binsPerRadian;
    let high = (start + width - binStart) * binsPerRadian;

    low = low <= coverageEpsilon ? 0 : low;
    high = high >= 1 - coverageEpsilon ? 1 : high;

    if (high <= low) {
      carried = -1;
      continue;
    }

    let lowDistance = startVertex;
    let highDistance = endVertex;

    if (low === 0) {
      lowDistance = carried >= 0 ? carried : edgeDistance(x1, y1, edgeX, edgeY, directions, bins, bin) / radius;
    }

    if (high === 1) {
      highDistance = edgeDistance(x1, y1, edgeX, edgeY, directions, bins, bin + 1) / radius;
    }

    carried = high === 1 ? highDistance : -1;

    if (Math.min(lowDistance, highDistance) >= 1) {
      continue;
    }

    const slot = ((bin % bins) + bins) % bins;

    // Most bins a segment crosses it covers whole; kept out of `coverBin`
    // so that the common case stays small enough to inline.
    if (low === 0 && high === 1) {
      const texel = slot * shadowRowStride;

      row[texel + 2] = Math.min(row[texel + 2]!, lowDistance);
      row[texel + 3] = Math.min(row[texel + 3]!, highDistance);
      continue;
    }

    coverBin(row, slot, low, high, Math.min(1, lowDistance), Math.min(1, highDistance));
  }
};

/** Distance from the light to the segment along the start of unwrapped bin `bin`. */
const edgeDistance = (
  x1: number,
  y1: number,
  edgeX: number,
  edgeY: number,
  directions: Float64Array,
  bins: number,
  bin: number,
): number => {
  const direction = (bin + bins + 1) * 2;

  return distanceAlong(x1, y1, edgeX, edgeY, directions[direction]!, directions[direction + 1]!);
};

/** Record an occluder over the part `low..high` of bin `slot`, at `lowDistance` and `highDistance` at its two ends. */
const coverBin = (row: Float32Array, slot: number, low: number, high: number, lowDistance: number, highDistance: number): void => {
  const texel = slot * shadowRowStride;
  const scratch = slot * spanStride;

  if (low === 0 && high === 1) {
    row[texel + 2] = Math.min(row[texel + 2]!, lowDistance);
    row[texel + 3] = Math.min(row[texel + 3]!, highDistance);

    return;
  }

  // Remembered whatever else happens to it: where faces meet inside the bin,
  // the corner is a vertex of one of them, and only the whole set says which
  // vertex the light actually reaches.
  if (partCounts[slot]! < maxParts) {
    const part = (slot * maxParts + partCounts[slot]!) * 4;

    parts[part] = low;
    parts[part + 1] = high;
    parts[part + 2] = lowDistance;
    parts[part + 3] = highDistance;
    partCounts[slot]!++;
  } else {
    // A dropped part may be the one that hides a farther vertex, so no
    // corner in this bin can be trusted any more.
    partCounts[slot] = maxParts + 1;
  }

  // Wholly behind what covers the rest of the bin, so it can never decide.
  if (Math.min(lowDistance, highDistance) >= Math.max(row[texel + 2]!, row[texel + 3]!)) {
    return;
  }

  const second = scratch + 4;

  if (placeInSpan(scratch, low, high, lowDistance, highDistance) || placeInSpan(second, low, high, lowDistance, highDistance)) {
    return;
  }

  // A third part that meets neither span: one more span would also cover the
  // gap between parts, or follow a line from one to another that runs behind
  // the nearer. The farther of it and the second span joins the rest of the
  // bin instead, which can only shadow more.
  const near = Math.min(lowDistance, highDistance);
  const kept = Math.min(spans[second + 2]!, spans[second + 3]!);
  const farther = Math.max(near, kept);

  if (near < kept) {
    setSpan(second, low, high, lowDistance, highDistance);
  }

  row[texel + 2] = Math.min(row[texel + 2]!, farther);
  row[texel + 3] = Math.min(row[texel + 3]!, farther);
};

/**
 * Put a part into the span at `at` where it belongs there - the span is
 * empty, the part continues it from a shared corner, or the two are a
 * solid's near and far faces sharing its silhouette - and report whether it
 * did. Two occluders whose parts overlap without meeting each keep a span of
 * their own: one straight span between them would run behind the nearer.
 */
const placeInSpan = (at: number, low: number, high: number, lowDistance: number, highDistance: number): boolean => {
  const spanLow = spans[at]!;
  const spanHigh = spans[at + 1]!;

  if (spanHigh <= spanLow) {
    setSpan(at, low, high, lowDistance, highDistance);

    return true;
  }

  // The stored ends are rounded, so two faces meeting at a corner may not
  // compare as touching exactly.
  if (Math.abs(low - spanHigh) <= coverageEpsilon || Math.abs(high - spanLow) <= coverageEpsilon) {
    joinAtCorner(at, low, high, lowDistance, highDistance);

    return true;
  }

  if (low < spanHigh && high > spanLow && sharesEnd(at, low, high, lowDistance, highDistance)) {
    overlapSpan(at, low, high, lowDistance, highDistance);

    return true;
  }

  return false;
};

/** Two faces meeting at a corner: the span grows over both. */
const joinAtCorner = (scratch: number, low: number, high: number, lowDistance: number, highDistance: number): void => {
  if (Math.abs(low - spans[scratch + 1]!) <= coverageEpsilon) {
    spans[scratch + 1] = high;
    spans[scratch + 3] = highDistance;
  } else {
    spans[scratch] = low;
    spans[scratch + 2] = lowDistance;
  }
};

/**
 * Whether a part shares an end - the same place and distance - with the span:
 * a solid's near and far faces meeting at its silhouette, which is the only
 * overlap that one straight span describes.
 */
const sharesEnd = (scratch: number, low: number, high: number, lowDistance: number, highDistance: number): boolean =>
  (Math.abs(low - spans[scratch]!) <= coverageEpsilon && Math.abs(lowDistance - spans[scratch + 2]!) <= coverageEpsilon) ||
  (Math.abs(high - spans[scratch + 1]!) <= coverageEpsilon && Math.abs(highDistance - spans[scratch + 3]!) <= coverageEpsilon);

/** Overlapping parts, as a solid's near and far faces are: each end is the nearer of the parts that reach it. */
const overlapSpan = (scratch: number, low: number, high: number, lowDistance: number, highDistance: number): void => {
  const spanLow = spans[scratch]!;
  const spanHigh = spans[scratch + 1]!;

  if (low < spanLow - coverageEpsilon || (low <= spanLow + coverageEpsilon && lowDistance < spans[scratch + 2]!)) {
    spans[scratch] = Math.min(spanLow, low);
    spans[scratch + 2] = lowDistance;
  }

  if (high > spanHigh + coverageEpsilon || (high >= spanHigh - coverageEpsilon && highDistance < spans[scratch + 3]!)) {
    spans[scratch + 1] = Math.max(spanHigh, high);
    spans[scratch + 3] = highDistance;
  }
};

const setSpan = (scratch: number, low: number, high: number, lowDistance: number, highDistance: number): void => {
  spans[scratch] = low;
  spans[scratch + 1] = high;
  spans[scratch + 2] = lowDistance;
  spans[scratch + 3] = highDistance;
};

/**
 * Write each bin's spans or corner into its texels, folding spans that grew
 * over the whole bin into the rest of it.
 */
const encodeSpans = (row: Float32Array, bins: number): void => {
  for (let bin = 0; bin < bins; bin++) {
    const texel = bin * shadowRowStride;
    const scratch = bin * spanStride;
    const priorStart = row[texel + 2]!;
    const priorEnd = row[texel + 3]!;
    const foldedFirst = foldSpan(row, texel, scratch);
    const folded = foldSpan(row, texel, scratch + 4) || foldedFirst;
    let first = scratch;
    let second = scratch + 4;

    if (spans[first + 1]! <= spans[first]!) {
      first = second;
      second = -1;
    } else if (spans[second + 1]! <= spans[second]!) {
      second = -1;
    }

    if (spans[first + 1]! > spans[first]!) {
      row[texel] = spans[first + 2]!;
      row[texel + 1] = packSpan(spans[first]!, spans[first + 1]!);
      row[texel + 4] = spans[first + 3]!;

      if (second >= 0) {
        row[texel + 5] = packSpan(spans[second]!, spans[second + 1]!);
        row[texel + 6] = spans[second + 2]!;
        row[texel + 7] = spans[second + 3]!;
      } else if (findCorner(bin, priorStart, priorEnd, spans[first]!, row[texel], spans[first + 1]!, row[texel + 4]!)) {
        // Two faces meeting inside a part that stops short of the bin's far
        // end - the end of a wall seen nearly edge-on - bend there too.
        row[texel + 5] = cornerFraction;
        row[texel + 6] = cornerDistance;
      }
    } else if (folded && findCorner(bin, priorStart, priorEnd, 0, row[texel + 2]!, 1, row[texel + 3]!)) {
      // Faces that joined up across the whole bin bend where they meet.
      row[texel + 1] = -1;
      row[texel + 5] = cornerFraction;
      row[texel + 6] = cornerDistance;
    }
  }
};

/** Fold the span at `at` into the rest of the bin where it covers all of it, and report whether it did. */
const foldSpan = (row: Float32Array, texel: number, at: number): boolean => {
  if (spans[at]! !== 0 || spans[at + 1]! !== 1) {
    return false;
  }

  row[texel + 2] = Math.min(row[texel + 2]!, spans[at + 2]!);
  row[texel + 3] = Math.min(row[texel + 3]!, spans[at + 3]!);
  spans[at + 1] = 0;

  return true;
};

/** A span's ends as one channel, `low * 4096 + high` in steps of {@link shadowSpanSteps}; never `0`. */
const packSpan = (low: number, high: number): number => Math.floor(low * shadowSpanSteps) * 4096 + Math.ceil(high * shadowSpanSteps);

let cornerFraction = 0;
let cornerDistance = 0;

/**
 * Where the surface the light reaches bends between `(x0, d0)` and `(x1, d1)`,
 * fractions of the bin and distances, into {@link cornerFraction} and
 * {@link cornerDistance}; `false` where it runs straight.
 *
 * The corner is a vertex of one of the parts that meet there - turned towards
 * the light, a straight line from end to end would cut across it and let light
 * in; turned away, the line would pass in front of it and shadow the floor in
 * the pocket. A vertex counts only where nothing in the bin stands nearer at
 * its angle, which is what leaves out a solid's far side, whose faces fall
 * in the same bin as its near ones. `priorStart` and `priorEnd` describe what
 * covered the whole bin by itself.
 */
const findCorner = (bin: number, priorStart: number, priorEnd: number, x0: number, d0: number, x1: number, d1: number): boolean => {
  const count = partCounts[bin]!;
  let found = false;
  let deviation = 1e-6;

  if (count > maxParts) {
    return false;
  }

  for (let candidate = 0; candidate < count * 2; candidate++) {
    const part = (bin * maxParts + (candidate >> 1)) * 4;
    const fraction = parts[part + (candidate & 1)]!;
    const distance = parts[part + 2 + (candidate & 1)]!;

    if (
      fraction <= x0 + coverageEpsilon ||
      fraction >= x1 - coverageEpsilon ||
      distance > surfaceAt(bin, fraction, priorStart, priorEnd) + 1e-6
    ) {
      continue;
    }

    const off = Math.abs(distance - (d0 + ((d1 - d0) * (fraction - x0)) / (x1 - x0)));

    if (off > deviation) {
      deviation = off;
      cornerFraction = fraction;
      cornerDistance = distance;
      found = true;
    }
  }

  return found;
};

/** The nearest distance anything in the bin holds at `fraction` of the way through it. */
const surfaceAt = (bin: number, fraction: number, priorStart: number, priorEnd: number): number => {
  let nearest = priorStart + (priorEnd - priorStart) * fraction;

  for (let index = 0; index < partCounts[bin]!; index++) {
    const part = (bin * maxParts + index) * 4;
    const low = parts[part]!;
    const high = parts[part + 1]!;

    if (fraction >= low && fraction <= high) {
      nearest = Math.min(nearest, parts[part + 2]! + ((parts[part + 3]! - parts[part + 2]!) * (fraction - low)) / (high - low));
    }
  }

  return nearest;
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

  const along = (x1 * dirY - y1 * dirX) / denominator;

  // Inside the segment the ray parameter is the distance itself, the ray being
  // a unit vector; only an end that rounding put just outside needs a root.
  if (along >= 0 && along <= 1) {
    return (x1 * edgeY - y1 * edgeX) / denominator;
  }

  const x = along < 0 ? x1 : x1 + edgeX;
  const y = along < 0 ? y1 : y1 + edgeY;

  return Math.sqrt(x * x + y * y);
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
