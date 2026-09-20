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
//   uMask      - rasterised occluders, coverage in alpha, on a grid of its own
//   uMaskCoarse - one texel per block of the mask, holding what that block holds
//
// Uniform block fields: `uGridOrigin` (vec2), `uGridCells` (vec2),
// `uCellSize` (float), `uTableWidth` (float), `uMaskCells` (vec2),
// `uMaskBasis` (vec4), `uMaskOffset` (vec2) and `uMaskBlocks` (vec2).
//
// `uMaskBasis` and `uMaskOffset` are the view the mask was drawn through, as
// world to clip, rows of the matrix first - the same transform the distance
// field is read with. Which way the rows of a render target run is the
// backend's, so this half of the chunk applies its own order and the host
// passes the same numbers to both. `uMaskCells` of zero says nothing was
// rasterised, and `uMaskBlocks` of zero says no block level was built, which
// the walk answers the same way at more cost.

/**
 * What a finite stretch amounts to: the radiance found along it, what got
 * through, and how many grid cells the walk visited.
 *
 * The count is diagnostic. It exists so a walk that ran out of its step budget
 * can be told apart from one that finished, which no radiance value can show
 * on its own.
 */
struct Transfer {
    vec3 radiance;
    float transmittance;
    float visited;
};

/**
 * Cells one walk may visit.
 *
 * Every step advances the cell index along exactly one axis, so a stretch
 * clipped to the grid visits `1 + |di_x| + |di_y|` cells, at most
 * `width + height - 1`. The largest grid the 2048-texel field produces at the
 * default cell size is 128 a side, so 255 is the true ceiling and this is
 * twice it. The clip is what makes that hold: unclipped, a stretch beginning
 * far outside would walk empty cells to reach the grid, and no bound taken
 * from the grid's own size would cover it.
 *
 * Running out is therefore unreachable rather than a case with a fallback. The
 * walk reports darkness if it ever does - inventing light where the scene was
 * never read is the one answer that cannot be right - and `visited` reaching
 * this value is what a contract test fails on.
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
    return Transfer(near.radiance + near.transmittance * far.radiance, near.transmittance * far.transmittance, near.visited + far.visited);
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

/** What a walk over the occluder mask found. */
struct MaskHit {
    /**
     * Where along the stretch the mask first blocks, as a fraction of it, or
     * 1.0 where it does not. A stretch that starts inside a blocking texel
     * reads 0.0.
     */
    float fraction;
    /** Mask texels the walk read, on the same terms as {@link Transfer}'s count. */
    float visited;
};

/** Coverage at or above which a mask texel blocks, as the distance field reads it too. */
const float MASK_BLOCKING = 0.5;

/** Mask texels one block of the coarse level covers, on each axis. */
const int MASK_COARSE = 8;

/**
 * Texels one walk may read, over both levels together.
 *
 * The same step accounting as the cell walk, over the mask's own grid: a
 * stretch clipped to it enters `1 + |di_x| + |di_y|` texels, and a corner
 * crossing advances both indices in one step rather than two. The field is
 * capped at 2048 texels an axis, so 4095 texels is the ceiling, and the block
 * level adds one read per block the stretch enters, at most 511 of them.
 *
 * Descending into a block and leaving it again cost nothing of their own: the
 * block read that decides it is the same read either way, and the walk carries
 * no state per level to unwind. The true ceiling is therefore 4606, and both
 * loops are bounded by a budget they share rather than by one each, so a long
 * inner sweep cannot buy the outer one more steps.
 *
 * Exhaustion is therefore unreachable, and if it were reached the walk reports
 * blocking where it stopped: a wall that is too far to be read is the
 * conservative answer, since the alternative is light arriving through it.
 */
const int MAX_MASK_STEPS = 8192;

/** World position to the mask's texel space, through the view the mask was drawn with. */
vec2 maskPlace(vec2 world) {
    vec2 clip = vec2(dot(uniforms.uMaskBasis.xy, world), dot(uniforms.uMaskBasis.zw, world)) + uniforms.uMaskOffset;

    return (clip * 0.5 + 0.5) * uniforms.uMaskCells;
}

/** Whether a mask texel blocks, reading outside the grid as open. */
bool maskBlocks(ivec2 texel, vec2 cells) {
    if (texel.x < 0 || texel.y < 0 || float(texel.x) >= cells.x || float(texel.y) >= cells.y) {
        return false;
    }

    return texelFetch(uMask, texel, 0).a >= MASK_BLOCKING;
}

/**
 * Whether a block of the coarse level holds anything, reading outside it as
 * empty.
 *
 * A block is marked wherever a mask texel within one texel of it blocks. That
 * margin is what makes an unmarked block skippable outright: a stretch inside
 * one can still be stopped by a texel just beyond its edge - the two that
 * share only the corner it crosses - and a block reduced over its own texels
 * alone would let that stretch through.
 */
bool blockHolds(ivec2 block, vec2 blocks) {
    if (block.x < 0 || block.y < 0 || float(block.x) >= blocks.x || float(block.y) >= blocks.y) {
        return false;
    }

    return texelFetch(uMaskCoarse, block, 0).a >= MASK_BLOCKING;
}

/**
 * Where the rasterised occluders first block the stretch from `a` to `b`.
 *
 * A texel blocks as a whole: the walk stops where it crosses into one, which
 * is conservative to within the texel the mask quantises an outline to. Two
 * blockers sharing nothing but a corner therefore cannot leak, because a
 * stretch that passes exactly through that corner is stopped by either of
 * them - the same convention the segment path applies to an endpoint.
 *
 * A host that rasterised nothing sets the texel count to zero and the walk
 * costs one comparison.
 */
MaskHit maskHit(vec2 a, vec2 b) {
    vec2 cells = uniforms.uMaskCells;

    if (cells.x < 1.0 || cells.y < 1.0) {
        return MaskHit(1.0, 0.0);
    }

    vec2 origin = maskPlace(a);
    vec2 delta = maskPlace(b) - origin;
    float entry = 0.0;
    float leave = 1.0;

    // Clipped to the mask, in fractions of the stretch, for the reason the
    // cell walk is: the step bound is taken from the grid's size and only
    // holds for a stretch that does not approach it from outside.
    for (int axis = 0; axis < 2; axis++) {
        if (abs(delta[axis]) < TRANSPORT_EPSILON) {
            if (origin[axis] < 0.0 || origin[axis] > cells[axis]) {
                return MaskHit(1.0, 0.0);
            }

            continue;
        }

        float first = -origin[axis] / delta[axis];
        float last = (cells[axis] - origin[axis]) / delta[axis];

        entry = max(entry, min(first, last));
        leave = min(leave, max(first, last));
    }

    if (leave <= entry) {
        return MaskHit(1.0, 0.0);
    }

    vec2 blocks = uniforms.uMaskBlocks;
    bool coarse = blocks.x >= 1.0 && blocks.y >= 1.0;
    ivec2 stepping = ivec2(delta.x >= 0.0 ? 1 : -1, delta.y >= 0.0 ? 1 : -1);
    vec2 reciprocal = vec2(abs(delta.x) < TRANSPORT_EPSILON ? 1e30 : 1.0 / abs(delta.x), abs(delta.y) < TRANSPORT_EPSILON ? 1e30 : 1.0 / abs(delta.y));
    // A crossing counts as a corner when the two boundaries fall within a
    // rounding of each other, since an exact tie is what a tile grid and a
    // diagonal ray produce and what float32 cannot be relied on to reproduce.
    float corner = TRANSPORT_EPSILON * min(reciprocal.x, reciprocal.y);
    float blockSize = float(MASK_COARSE);
    vec2 blockPlace = (origin + delta * entry) / blockSize;
    ivec2 block = clamp(ivec2(floor(blockPlace)), ivec2(0), ivec2(blocks) - 1);
    vec2 blockNext = entry + vec2(
        (delta.x >= 0.0 ? float(block.x + 1) - blockPlace.x : blockPlace.x - float(block.x)) * blockSize * reciprocal.x,
        (delta.y >= 0.0 ? float(block.y + 1) - blockPlace.y : blockPlace.y - float(block.y)) * blockSize * reciprocal.y
    );
    float travelled = entry;
    float visited = 0.0;
    int taken = 0;

    // One pass per block of the coarse level, or one pass over the whole
    // stretch where no block level is bound.
    for (int sweep = 0; sweep < MAX_MASK_STEPS; sweep++) {
        if (travelled >= leave || taken >= MAX_MASK_STEPS) {
            break;
        }

        float until = leave;

        if (coarse) {
            until = min(min(blockNext.x, blockNext.y), leave);
            taken++;
            visited += 1.0;

            if (!blockHolds(block, blocks)) {
                travelled = until;

                if (blockNext.x < blockNext.y) {
                    blockNext.x += blockSize * reciprocal.x;
                    block.x += stepping.x;
                } else {
                    blockNext.y += blockSize * reciprocal.y;
                    block.y += stepping.y;
                }

                continue;
            }
        }

        // Texel by texel over what this block covers of the stretch. Started
        // from where the stretch has got to rather than carried across blocks,
        // so a skipped block leaves nothing to unwind.
        vec2 place = origin + delta * travelled;
        ivec2 texel = clamp(ivec2(floor(place)), ivec2(0), ivec2(cells) - 1);
        vec2 next = travelled + vec2(
            (delta.x >= 0.0 ? float(texel.x + 1) - place.x : place.x - float(texel.x)) * reciprocal.x,
            (delta.y >= 0.0 ? float(texel.y + 1) - place.y : place.y - float(texel.y)) * reciprocal.y
        );

        for (int step = 0; step < MAX_MASK_STEPS; step++) {
            if (travelled >= until || taken >= MAX_MASK_STEPS) {
                break;
            }

            taken++;
            visited += 1.0;

            if (maskBlocks(texel, cells)) {
                return MaskHit(clamp(travelled, 0.0, 1.0), visited);
            }

            float crossing = min(next.x, next.y);

            if (abs(next.x - next.y) <= corner && crossing < leave) {
                // Only the corner point itself is shared with the two texels
                // the stretch does not otherwise enter. Either of them
                // blocking stops it there. Bounded by the whole stretch rather
                // than by this block, because a corner on a block's own edge
                // belongs to neither sweep otherwise.
                if (maskBlocks(texel + ivec2(stepping.x, 0), cells) || maskBlocks(texel + ivec2(0, stepping.y), cells)) {
                    return MaskHit(clamp(crossing, 0.0, 1.0), visited);
                }

                travelled = crossing;
                next += reciprocal;
                texel += stepping;

                continue;
            }

            travelled = crossing;

            if (next.x < next.y) {
                next.x += reciprocal.x;
                texel.x += stepping.x;
            } else {
                next.y += reciprocal.y;
                texel.y += stepping.y;
            }
        }

        if (coarse) {
            if (blockNext.x < blockNext.y) {
                blockNext.x += blockSize * reciprocal.x;
                block.x += stepping.x;
            } else {
                blockNext.y += blockSize * reciprocal.y;
                block.y += stepping.y;
            }
        }
    }

    if (taken >= MAX_MASK_STEPS) {
        return MaskHit(clamp(travelled, 0.0, 1.0), visited);
    }

    return MaskHit(1.0, visited);
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
 *
 * Rasterised occluders are found first, over their own grid, and the walk is
 * cut where they block. Whichever wall comes first therefore ends the stretch,
 * whether it was given as geometry or as coverage.
 */
Transfer traceSegment(vec2 a, vec2 b) {
    vec2 delta = b - a;
    float span = length(delta);

    if (span <= 0.0) {
        return Transfer(vec3(0.0), 1.0, 0.0);
    }

    MaskHit rastered = maskHit(a, b);
    float stopped = rastered.fraction * span;
    float open = rastered.fraction >= 1.0 ? 1.0 : 0.0;
    vec2 direction = delta / span;
    vec2 cells = uniforms.uGridCells;
    float size = uniforms.uCellSize;
    vec2 lower = uniforms.uGridOrigin;
    vec2 upper = lower + cells * size;
    float entry = 0.0;
    // A rasterised wall inside the stretch ends it even where it stands
    // outside the grid: the grid holds what emits, the mask what blocks.
    float leave = min(span, stopped);

    // Clipped to the grid before it is walked. Outside the grid there is
    // nothing to find, and a stretch beginning far away would otherwise spend
    // its whole step budget crossing cells that do not exist - which is also
    // what makes the bound below hold for any input rather than only for a
    // stretch that starts inside.
    for (int axis = 0; axis < 2; axis++) {
        if (abs(direction[axis]) < TRANSPORT_EPSILON) {
            if (a[axis] < lower[axis] || a[axis] > upper[axis]) {
                return Transfer(vec3(0.0), open, rastered.visited);
            }

            continue;
        }

        float first = (lower[axis] - a[axis]) / direction[axis];
        float last = (upper[axis] - a[axis]) / direction[axis];

        entry = max(entry, min(first, last));
        leave = min(leave, max(first, last));
    }

    if (leave <= entry) {
        return Transfer(vec3(0.0), open, rastered.visited);
    }

    vec2 place = (a + direction * entry - lower) / size;
    ivec2 cell = clamp(ivec2(floor(place)), ivec2(0), ivec2(cells) - 1);
    ivec2 stepping = ivec2(direction.x >= 0.0 ? 1 : -1, direction.y >= 0.0 ? 1 : -1);
    // Distance along the ray between two boundaries of the same axis, and to
    // the first one past the entry point. An axis the ray does not move along
    // never advances.
    vec2 spacing = vec2(abs(direction.x) < TRANSPORT_EPSILON ? 1e30 : size / abs(direction.x), abs(direction.y) < TRANSPORT_EPSILON ? 1e30 : size / abs(direction.y));
    vec2 next = entry + vec2(
        abs(direction.x) < TRANSPORT_EPSILON ? 1e30 : ((direction.x >= 0.0 ? float(cell.x + 1) - place.x : place.x - float(cell.x)) * size) / abs(direction.x),
        abs(direction.y) < TRANSPORT_EPSILON ? 1e30 : ((direction.y >= 0.0 ? float(cell.y + 1) - place.y : place.y - float(cell.y)) * size) / abs(direction.y)
    );

    vec3 found = vec3(0.0);
    float travelled = entry;
    float visited = rastered.visited;

    for (int taken = 0; taken < MAX_CELL_STEPS; taken++) {
        if (travelled >= leave) {
            return Transfer(found, open, visited);
        }

        visited += 1.0;

        float leaving = min(min(next.x, next.y), leave);

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
                return Transfer(found, 0.0, visited);
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

    return Transfer(found, 0.0, visited);
}
