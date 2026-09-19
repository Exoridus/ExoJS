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
// Uniform block fields: `uGridOrigin` (vec2), `uGridCells` (vec2),
// `uCellSize` (float) and `uTableWidth` (float).

/** What a finite stretch amounts to: the radiance found along it, and what got through. */
struct Transfer {
    vec3 radiance;
    float transmittance;
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
const int MAX_CELL_STEPS = 512;

/** Below this, two directions are parallel and two cosines are one edge. */
const float TRANSPORT_EPSILON = 1e-6;

vec4 transportTexel(sampler2D table, int index) {
    int width = int(uniforms.uTableWidth);

    return texelFetch(table, ivec2(index - (index / width) * width, index / width), 0);
}

/**
 * Near stretch first, then the far one. Not commutative: what the near stretch
 * blocked, the far one never lit.
 */
Transfer composeTransfer(Transfer near, Transfer far) {
    return Transfer(near.radiance + near.transmittance * far.radiance, near.transmittance * far.transmittance);
}

/**
 * Where a ray enters and leaves a disc, as `(tEnter, tExit)`, or `x > y` where
 * it misses. A tangent has zero path length and so contributes nothing.
 */
vec2 discInterval(vec2 origin, vec2 direction, vec2 centre, float radius) {
    vec2 offset = origin - centre;
    float along = dot(offset, direction);
    float discriminant = along * along - dot(offset, offset) + radius * radius;

    if (discriminant <= 0.0) {
        return vec2(1.0, -1.0);
    }

    float root = sqrt(discriminant);

    return vec2(-along - root, -along + root);
}

/**
 * The same for an axis-aligned box centred on the origin, in whatever frame the
 * caller expressed the ray in.
 */
vec2 boxInterval(vec2 origin, vec2 direction, vec2 extent) {
    vec2 enter = vec2(-1e30);
    vec2 leave = vec2(1e30);

    for (int axis = 0; axis < 2; axis++) {
        float speed = direction[axis];
        float place = origin[axis];

        if (abs(speed) < TRANSPORT_EPSILON) {
            if (place < -extent[axis] || place > extent[axis]) {
                return vec2(1.0, -1.0);
            }

            continue;
        }

        float first = (-extent[axis] - place) / speed;
        float last = (extent[axis] - place) / speed;

        enter[axis] = min(first, last);
        leave[axis] = max(first, last);
    }

    float tEnter = max(enter.x, enter.y);
    float tExit = min(leave.x, leave.y);

    return tExit <= tEnter ? vec2(1.0, -1.0) : vec2(tEnter, tExit);
}

/**
 * How far a ray travels inside an emitter's shape between `since` and `until`.
 *
 * A disc and a capsule are both convex, so the box and the two end discs of a
 * capsule cannot leave a gap between them: the union of whichever of the three
 * the ray meets is one interval, and taking the lowest entry and the highest
 * exit is exact rather than an approximation of a union.
 */
float sourceLength(vec2 origin, vec2 direction, float since, float until, vec2 centre, vec2 axis, float radius, float halfLength) {
    vec2 span = vec2(1.0, -1.0);

    if (halfLength <= 0.0) {
        span = discInterval(origin, direction, centre, radius);
    } else {
        vec2 perpendicular = vec2(-axis.y, axis.x);
        vec2 offset = origin - centre;
        vec2 localOrigin = vec2(dot(offset, axis), dot(offset, perpendicular));
        vec2 localDirection = vec2(dot(direction, axis), dot(direction, perpendicular));
        vec2 box = boxInterval(localOrigin, localDirection, vec2(halfLength, radius));
        vec2 head = discInterval(origin, direction, centre + axis * halfLength, radius);
        vec2 tail = discInterval(origin, direction, centre - axis * halfLength, radius);

        if (box.x <= box.y) {
            span = box;
        }

        if (head.x <= head.y) {
            span = span.x <= span.y ? vec2(min(span.x, head.x), max(span.y, head.y)) : head;
        }

        if (tail.x <= tail.y) {
            span = span.x <= span.y ? vec2(min(span.x, tail.x), max(span.y, tail.y)) : tail;
        }
    }

    return span.x > span.y ? 0.0 : max(0.0, min(span.y, until) - max(span.x, since));
}

/**
 * How much of a source's emission leaves along the ray.
 *
 * Light travels from the source to whatever the ray started at, which is the
 * direction the ray walked, reversed. A source with no cone gives all of it.
 */
float coneWeight(vec2 axis, vec2 direction, float cosOuter, float cosInner, float directional) {
    if (directional < 0.5) {
        return 1.0;
    }

    float alignment = dot(axis, -direction);

    if (cosInner - cosOuter < TRANSPORT_EPSILON) {
        return alignment >= cosOuter ? 1.0 : 0.0;
    }

    float edge = clamp((alignment - cosOuter) / (cosInner - cosOuter), 0.0, 1.0);

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
float segmentHit(vec2 origin, vec2 direction, float limit, vec2 edgeA, vec2 edgeB) {
    vec2 edge = edgeB - edgeA;
    vec2 offset = edgeA - origin;
    float denominator = direction.x * edge.y - direction.y * edge.x;
    // Both crosses carry the length of what they were taken over, so the
    // tolerances scale with it: a fixed one would call a short wall parallel
    // and a distant long one skew, and float32 has no absolute zero to compare
    // against at world scale.
    float edgeLength = length(edge);

    if (abs(denominator) < TRANSPORT_EPSILON * edgeLength) {
        if (abs(offset.x * direction.y - offset.y * direction.x) >= TRANSPORT_EPSILON * max(length(offset), edgeLength)) {
            return limit;
        }

        float first = dot(offset, direction);
        float last = dot(edgeB - origin, direction);
        float entry = max(0.0, min(first, last));

        return entry < min(limit, max(first, last)) ? entry : limit;
    }

    float travel = (offset.x * edge.y - offset.y * edge.x) / denominator;
    float across = (offset.x * direction.y - offset.y * direction.x) / denominator;

    return travel >= 0.0 && travel < limit && across >= -TRANSPORT_EPSILON && across <= 1.0 + TRANSPORT_EPSILON ? travel : limit;
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
Transfer traceSegment(vec2 a, vec2 b) {
    vec2 delta = b - a;
    float span = length(delta);

    if (span <= 0.0) {
        return Transfer(vec3(0.0), 1.0);
    }

    vec2 direction = delta / span;
    vec2 cells = uniforms.uGridCells;
    float size = uniforms.uCellSize;
    vec2 place = (a - uniforms.uGridOrigin) / size;
    ivec2 cell = ivec2(floor(place));
    ivec2 stepping = ivec2(direction.x >= 0.0 ? 1 : -1, direction.y >= 0.0 ? 1 : -1);
    // Distance along the ray between two boundaries of the same axis, and to
    // the first one. An axis the ray does not move along never advances.
    vec2 spacing = vec2(abs(direction.x) < TRANSPORT_EPSILON ? 1e30 : size / abs(direction.x), abs(direction.y) < TRANSPORT_EPSILON ? 1e30 : size / abs(direction.y));
    vec2 next = vec2(
        abs(direction.x) < TRANSPORT_EPSILON ? 1e30 : ((direction.x >= 0.0 ? float(cell.x + 1) - place.x : place.x - float(cell.x)) * size) / abs(direction.x),
        abs(direction.y) < TRANSPORT_EPSILON ? 1e30 : ((direction.y >= 0.0 ? float(cell.y + 1) - place.y : place.y - float(cell.y)) * size) / abs(direction.y)
    );

    vec3 found = vec3(0.0);
    float travelled = 0.0;
    int width = int(cells.x);

    for (int taken = 0; taken < MAX_CELL_STEPS; taken++) {
        if (travelled >= span) {
            return Transfer(found, 1.0);
        }

        float leaving = min(min(next.x, next.y), span);

        if (cell.x >= 0 && cell.y >= 0 && float(cell.x) < cells.x && float(cell.y) < cells.y) {
            vec4 listing = texelFetch(uCells, ivec2(cell.x, cell.y), 0);
            int segmentOffset = int(listing.x);
            int segmentCount = int(listing.y);
            int emitterOffset = int(listing.z);
            int emitterCount = int(listing.w);
            float blocked = leaving;

            for (int index = 0; index < segmentCount; index++) {
                int id = int(transportTexel(uIndices, segmentOffset + index).x);
                vec4 ends = transportTexel(uSegments, id);
                float hit = segmentHit(a, direction, blocked, ends.xy, ends.zw);

                if (hit >= travelled && hit < blocked) {
                    blocked = hit;
                }
            }

            for (int index = 0; index < emitterCount; index++) {
                int id = int(transportTexel(uIndices, emitterOffset + index).x);
                vec4 shape = transportTexel(uEmitters, id * 3);
                vec4 cone = transportTexel(uEmitters, id * 3 + 1);
                vec4 emission = transportTexel(uEmitters, id * 3 + 2);
                float inside = sourceLength(a, direction, travelled, blocked, shape.xy, cone.xy, shape.z, shape.w);

                if (inside > 0.0) {
                    found += emission.rgb * (inside * coneWeight(cone.xy, direction, cone.z, cone.w, emission.w));
                }
            }

            if (blocked < leaving) {
                return Transfer(found, 0.0);
            }
        }

        travelled = leaving;

        if (next.x < next.y) {
            next.x += spacing.x;
            cell.x += stepping.x;
        } else {
            next.y += spacing.y;
            cell.y += stepping.y;
        }
    }

    return Transfer(found, 0.0);
}
