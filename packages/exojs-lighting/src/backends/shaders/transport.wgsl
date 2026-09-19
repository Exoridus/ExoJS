// Finite-segment light transport: the one operator every cascade level, every
// merge and the receiver reconstruction are built from.
//
// A trace knows a world-space stretch and the scene. It knows nothing about
// cascade levels, intervals it might belong to, or whether a source it crosses
// is "probably" some other ray's. That is what makes `compose` associative:
// splitting a stretch anywhere, including inside a source or exactly on a wall,
// gives the same result as the whole.
//
// The including shader binds the tables and declares the uniform block fields.
// Bindings are left to the host so the same text can sit in a shader that
// already holds textures of its own, whose numbering this cannot know:
//
//   uSegments  - occluder segments, `(ax, ay, bx, by)` per texel
//   uEmitters  - three texels each: `(cx, cy, radius, halfLength)`,
//                `(axisX, axisY, cosOuter, cosInner)`, `(density.rgb, directional)`
//   uCells     - per grid cell `(segmentOffset, segmentCount, emitterOffset, emitterCount)`
//   uIndices   - the primitive ids those ranges point into, in the red channel
//
// Uniform block fields: `uGridOrigin` (vec2<f32>), `uGridCells` (vec2<f32>),
// `uCellSize` (f32) and `uTableWidth` (f32).

/** What a finite stretch amounts to: the radiance found along it, and what got through. */
struct Transfer {
    radiance: vec3<f32>,
    transmittance: f32,
};

/**
 * Cells a straight stretch may cross before it must have left the grid.
 *
 * A segment crosses at most `width + height` cell boundaries plus the cell it
 * starts in, so a grid of 128 cells a side - the largest the 2048-texel field
 * produces at the default cell size - never reaches this. Running out is
 * therefore impossible for a configured grid rather than a case with a
 * fallback, and the walk reports darkness if it ever does: inventing light
 * where the scene was never read is the one answer that cannot be right.
 */
const MAX_CELL_STEPS: i32 = 512;

/** Below this, two directions are parallel and two cosines are one edge. */
const TRANSPORT_EPSILON: f32 = 1e-6;

/**
 * Near stretch first, then the far one. Not commutative: what the near stretch
 * blocked, the far one never lit.
 */
fn composeTransfer(near: Transfer, far: Transfer) -> Transfer {
    return Transfer(near.radiance + near.transmittance * far.radiance, near.transmittance * far.transmittance);
}

/**
 * Where a ray enters and leaves a disc, as `(tEnter, tExit)`, or `x > y` where
 * it misses. A tangent has zero path length and so contributes nothing.
 */
fn discInterval(origin: vec2<f32>, direction: vec2<f32>, centre: vec2<f32>, radius: f32) -> vec2<f32> {
    let offset = origin - centre;
    let along = dot(offset, direction);
    let discriminant = along * along - dot(offset, offset) + radius * radius;

    if (discriminant <= 0.0) {
        return vec2<f32>(1.0, -1.0);
    }

    let root = sqrt(discriminant);

    return vec2<f32>(-along - root, -along + root);
}

/**
 * The same for an axis-aligned box centred on the origin, in whatever frame the
 * caller expressed the ray in.
 */
fn boxInterval(origin: vec2<f32>, direction: vec2<f32>, extent: vec2<f32>) -> vec2<f32> {
    var enter = vec2<f32>(-1e30, -1e30);
    var leave = vec2<f32>(1e30, 1e30);
    // Copied into variables because the loop indexes them: a dynamic index on a
    // vector wants a reference, and the parameters are values.
    var ray = direction;
    var start = origin;
    var bound = extent;

    for (var axis = 0; axis < 2; axis = axis + 1) {
        let speed = ray[axis];
        let place = start[axis];

        if (abs(speed) < TRANSPORT_EPSILON) {
            if (place < -bound[axis] || place > bound[axis]) {
                return vec2<f32>(1.0, -1.0);
            }

            continue;
        }

        let first = (-bound[axis] - place) / speed;
        let last = (bound[axis] - place) / speed;

        enter[axis] = min(first, last);
        leave[axis] = max(first, last);
    }

    let tEnter = max(enter.x, enter.y);
    let tExit = min(leave.x, leave.y);

    if (tExit <= tEnter) {
        return vec2<f32>(1.0, -1.0);
    }

    return vec2<f32>(tEnter, tExit);
}

/**
 * How far a ray travels inside an emitter's shape between `since` and `until`.
 *
 * A disc and a capsule are both convex, so the box and the two end discs of a
 * capsule cannot leave a gap between them: the union of whichever of the three
 * the ray meets is one interval, and taking the lowest entry and the highest
 * exit is exact rather than an approximation of a union.
 */
fn sourceLength(origin: vec2<f32>, direction: vec2<f32>, since: f32, until: f32, centre: vec2<f32>, axis: vec2<f32>, radius: f32, halfLength: f32) -> f32 {
    var span = vec2<f32>(1.0, -1.0);

    if (halfLength <= 0.0) {
        span = discInterval(origin, direction, centre, radius);
    } else {
        let perpendicular = vec2<f32>(-axis.y, axis.x);
        let offset = origin - centre;
        let localOrigin = vec2<f32>(dot(offset, axis), dot(offset, perpendicular));
        let localDirection = vec2<f32>(dot(direction, axis), dot(direction, perpendicular));
        let box = boxInterval(localOrigin, localDirection, vec2<f32>(halfLength, radius));
        let head = discInterval(origin, direction, centre + axis * halfLength, radius);
        let tail = discInterval(origin, direction, centre - axis * halfLength, radius);

        if (box.x <= box.y) {
            span = box;
        }

        if (head.x <= head.y) {
            if (span.x <= span.y) {
                span = vec2<f32>(min(span.x, head.x), max(span.y, head.y));
            } else {
                span = head;
            }
        }

        if (tail.x <= tail.y) {
            if (span.x <= span.y) {
                span = vec2<f32>(min(span.x, tail.x), max(span.y, tail.y));
            } else {
                span = tail;
            }
        }
    }

    if (span.x > span.y) {
        return 0.0;
    }

    return max(0.0, min(span.y, until) - max(span.x, since));
}

/**
 * How much of a source's emission leaves along the ray.
 *
 * Light travels from the source to whatever the ray started at, which is the
 * direction the ray walked, reversed. A source with no cone gives all of it.
 */
fn coneWeight(axis: vec2<f32>, direction: vec2<f32>, cosOuter: f32, cosInner: f32, directional: f32) -> f32 {
    if (directional < 0.5) {
        return 1.0;
    }

    let alignment = dot(axis, -direction);

    if (cosInner - cosOuter < TRANSPORT_EPSILON) {
        return select(0.0, 1.0, alignment >= cosOuter);
    }

    let edge = clamp((alignment - cosOuter) / (cosInner - cosOuter), 0.0, 1.0);

    return edge * edge * (3.0 - 2.0 * edge);
}

/**
 * Where a ray first meets an occluder segment within `[0, limit)`, or `limit`
 * where it does not.
 *
 * A parallel ray only blocks where it runs along the segment itself, and an
 * endpoint contact blocks: both are conservative conventions, chosen so that
 * two segments meeting at a corner cannot leak light between them, rather than
 * an epsilon wide enough to swallow a thin wall.
 */
fn segmentHit(origin: vec2<f32>, direction: vec2<f32>, limit: f32, edgeA: vec2<f32>, edgeB: vec2<f32>) -> f32 {
    let edge = edgeB - edgeA;
    let offset = edgeA - origin;
    let denominator = direction.x * edge.y - direction.y * edge.x;
    // Both crosses carry the length of what they were taken over, so the
    // tolerances scale with it: a fixed one would call a short wall parallel
    // and a distant long one skew, and f32 has no absolute zero to compare
    // against at world scale.
    let edgeLength = length(edge);

    if (abs(denominator) < TRANSPORT_EPSILON * edgeLength) {
        if (abs(offset.x * direction.y - offset.y * direction.x) >= TRANSPORT_EPSILON * max(length(offset), edgeLength)) {
            return limit;
        }

        let first = dot(offset, direction);
        let last = dot(edgeB - origin, direction);
        let entry = max(0.0, min(first, last));

        return select(limit, entry, entry < min(limit, max(first, last)));
    }

    let travel = (offset.x * edge.y - offset.y * edge.x) / denominator;
    let across = (offset.x * direction.y - offset.y * direction.x) / denominator;
    let inside = travel >= 0.0 && travel < limit && across >= -TRANSPORT_EPSILON && across <= 1.0 + TRANSPORT_EPSILON;

    return select(limit, travel, inside);
}

fn transportTexel(table: texture_2d<f32>, index: i32) -> vec4<f32> {
    let width = i32(uniforms.uTableWidth);

    return textureLoad(table, vec2<i32>(index - (index / width) * width, index / width), 0);
}

/**
 * The transfer of the world-space stretch from `a` to `b`.
 *
 * Cells are walked in order and each is charged only for its own half-open
 * parameter interval, so a primitive listed in several of them - which the
 * conservative index guarantees - is counted exactly once. Within a cell the
 * nearest opaque hit is found first and emission integrated only up to it,
 * because light collected past a wall that a later candidate turns out to have
 * put closer cannot be taken back.
 */
fn traceSegment(a: vec2<f32>, b: vec2<f32>) -> Transfer {
    let delta = b - a;
    let span = length(delta);

    if (span <= 0.0) {
        return Transfer(vec3<f32>(0.0), 1.0);
    }

    let direction = delta / span;
    let cells = uniforms.uGridCells;
    let size = uniforms.uCellSize;
    let place = (a - uniforms.uGridOrigin) / size;
    var cell = vec2<i32>(floor(place));
    let stepping = vec2<i32>(select(-1, 1, direction.x >= 0.0), select(-1, 1, direction.y >= 0.0));
    // Distance along the ray between two boundaries of the same axis, and to
    // the first one. An axis the ray does not move along never advances.
    let spacing = vec2<f32>(
        select(size / abs(direction.x), 1e30, abs(direction.x) < TRANSPORT_EPSILON),
        select(size / abs(direction.y), 1e30, abs(direction.y) < TRANSPORT_EPSILON)
    );
    var next = vec2<f32>(
        select(
            (select(place.x - f32(cell.x), f32(cell.x + 1) - place.x, direction.x >= 0.0) * size) / abs(direction.x),
            1e30,
            abs(direction.x) < TRANSPORT_EPSILON
        ),
        select(
            (select(place.y - f32(cell.y), f32(cell.y + 1) - place.y, direction.y >= 0.0) * size) / abs(direction.y),
            1e30,
            abs(direction.y) < TRANSPORT_EPSILON
        )
    );

    var found = vec3<f32>(0.0);
    var travelled = 0.0;

    for (var taken = 0; taken < MAX_CELL_STEPS; taken = taken + 1) {
        if (travelled >= span) {
            return Transfer(found, 1.0);
        }

        let leaving = min(min(next.x, next.y), span);

        if (cell.x >= 0 && cell.y >= 0 && f32(cell.x) < cells.x && f32(cell.y) < cells.y) {
            let listing = textureLoad(uCells, cell, 0);
            let segmentOffset = i32(listing.x);
            let segmentCount = i32(listing.y);
            let emitterOffset = i32(listing.z);
            let emitterCount = i32(listing.w);
            var blocked = leaving;

            for (var index = 0; index < segmentCount; index = index + 1) {
                let id = i32(transportTexel(uIndices, segmentOffset + index).x);
                let ends = transportTexel(uSegments, id);
                let hit = segmentHit(a, direction, blocked, ends.xy, ends.zw);

                if (hit >= travelled && hit < blocked) {
                    blocked = hit;
                }
            }

            for (var index = 0; index < emitterCount; index = index + 1) {
                let id = i32(transportTexel(uIndices, emitterOffset + index).x);
                let shape = transportTexel(uEmitters, id * 3);
                let cone = transportTexel(uEmitters, id * 3 + 1);
                let emission = transportTexel(uEmitters, id * 3 + 2);
                let inside = sourceLength(a, direction, travelled, blocked, shape.xy, cone.xy, shape.z, shape.w);

                if (inside > 0.0) {
                    found = found + emission.rgb * (inside * coneWeight(cone.xy, direction, cone.z, cone.w, emission.w));
                }
            }

            if (blocked < leaving) {
                return Transfer(found, 0.0);
            }
        }

        travelled = leaving;

        if (next.x < next.y) {
            next.x = next.x + spacing.x;
            cell.x = cell.x + stepping.x;
        } else {
            next.y = next.y + spacing.y;
            cell.y = cell.y + stepping.y;
        }
    }

    return Transfer(found, 0.0);
}
