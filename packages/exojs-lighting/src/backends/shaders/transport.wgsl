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
// Uniform block fields: `uGridOrigin` (vec2<f32>), `uGridCells` (vec2<f32>),
// `uCellSize` (f32), `uTableWidth` (f32), `uMaskCells` (vec2<f32>),
// `uMaskBasis` (vec4<f32>), `uMaskOffset` (vec2<f32>) and `uMaskBlocks`
// (vec2<f32>).
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
 * through, the work the walk did, and whether it ran out of budget doing it.
 *
 * Both diagnostics, and they say different things. `visited` is a work
 * counter - grid cells and mask texels read - which a caller compares against
 * another walk's; it is not a status, and a stretch that misses everything
 * legitimately reads zero. `exhausted` is the status: it is the only thing
 * that tells a conservatively dark answer apart from a wall, which no
 * radiance value can show on its own.
 */
struct Transfer {
    radiance: vec3<f32>,
    transmittance: f32,
    visited: f32,
    exhausted: bool,
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
 * never read is the one answer that cannot be right - and says so through
 * `exhausted`, which every contract case expects to be false. The work count
 * is no substitute: it saturates at whatever a caller stores it in, and a
 * stretch that finds nothing reads zero either way.
 */
const MAX_CELL_STEPS: i32 = 512;

/** Below this, two directions are parallel and two cosines are one edge. */
const TRANSPORT_EPSILON: f32 = 1e-6;

/**
 * Near stretch first, then the far one. Not commutative: what the near stretch
 * blocked, the far one never lit.
 */
fn composeTransfer(near: Transfer, far: Transfer) -> Transfer {
    return Transfer(
        near.radiance + near.transmittance * far.radiance,
        near.transmittance * far.transmittance,
        near.visited + far.visited,
        near.exhausted || far.exhausted
    );
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

/** What a walk over the occluder mask found. */
struct MaskHit {
    /**
     * Where along the stretch the mask first blocks, as a fraction of it, or
     * 1.0 where it does not. A stretch that starts inside a blocking texel
     * reads 0.0.
     */
    fraction: f32,
    /** Mask texels the walk read, on the same terms as the transfer's own count. */
    visited: f32,
    /** Whether the walk ran out of its step budget, in which case it blocks where it stopped. */
    exhausted: bool,
};

/** Coverage at or above which a mask texel blocks, as the distance field reads it too. */
const MASK_BLOCKING: f32 = 0.5;

/** Mask texels one block of the coarse level covers, on each axis. */
const MASK_COARSE: i32 = 8;

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
 * blocking where it stopped, and sets `exhausted` on what it hands back: a
 * wall that is too far to be read is the conservative answer, since the
 * alternative is light arriving through it, but a caller must be able to tell
 * the two apart.
 */
const MAX_MASK_STEPS: i32 = 8192;

/**
 * World position to the mask's texel space, through the view the mask was drawn
 * with. Flipped on the second axis because a render target's rows run the other
 * way here than in the GLSL half.
 */
fn maskPlace(world: vec2<f32>) -> vec2<f32> {
    let clip = vec2<f32>(dot(uniforms.uMaskBasis.xy, world), dot(uniforms.uMaskBasis.zw, world)) + uniforms.uMaskOffset;

    return (vec2<f32>(clip.x, -clip.y) * 0.5 + 0.5) * uniforms.uMaskCells;
}

/** Whether a mask texel blocks, reading outside the grid as open. */
fn maskBlocks(texel: vec2<i32>, cells: vec2<f32>) -> bool {
    if (texel.x < 0 || texel.y < 0 || f32(texel.x) >= cells.x || f32(texel.y) >= cells.y) {
        return false;
    }

    return textureLoad(uMask, texel, 0).a >= MASK_BLOCKING;
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
fn blockHolds(block: vec2<i32>, blocks: vec2<f32>) -> bool {
    if (block.x < 0 || block.y < 0 || f32(block.x) >= blocks.x || f32(block.y) >= blocks.y) {
        return false;
    }

    return textureLoad(uMaskCoarse, block, 0).a >= MASK_BLOCKING;
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
fn maskHit(a: vec2<f32>, b: vec2<f32>) -> MaskHit {
    let cells = uniforms.uMaskCells;

    if (cells.x < 1.0 || cells.y < 1.0) {
        return MaskHit(1.0, 0.0, false);
    }

    let origin = maskPlace(a);
    let delta = maskPlace(b) - origin;
    var entry = 0.0;
    var leave = 1.0;
    // Copied into variables because the clip below indexes them.
    var run = delta;
    var start = origin;
    var grid = cells;

    // Clipped to the mask, in fractions of the stretch, for the reason the
    // cell walk is: the step bound is taken from the grid's size and only
    // holds for a stretch that does not approach it from outside.
    for (var axis = 0; axis < 2; axis = axis + 1) {
        if (abs(run[axis]) < TRANSPORT_EPSILON) {
            if (start[axis] < 0.0 || start[axis] > grid[axis]) {
                return MaskHit(1.0, 0.0, false);
            }

            continue;
        }

        let first = -start[axis] / run[axis];
        let last = (grid[axis] - start[axis]) / run[axis];

        entry = max(entry, min(first, last));
        leave = min(leave, max(first, last));
    }

    if (leave <= entry) {
        return MaskHit(1.0, 0.0, false);
    }

    let blocks = uniforms.uMaskBlocks;
    let coarse = blocks.x >= 1.0 && blocks.y >= 1.0;
    let stepping = vec2<i32>(select(-1, 1, delta.x >= 0.0), select(-1, 1, delta.y >= 0.0));
    let reciprocal = vec2<f32>(
        select(1.0 / abs(delta.x), 1e30, abs(delta.x) < TRANSPORT_EPSILON),
        select(1.0 / abs(delta.y), 1e30, abs(delta.y) < TRANSPORT_EPSILON)
    );
    // A crossing counts as a corner when the two boundaries fall within a
    // rounding of each other, since an exact tie is what a tile grid and a
    // diagonal ray produce and what float32 cannot be relied on to reproduce.
    let corner = TRANSPORT_EPSILON * min(reciprocal.x, reciprocal.y);
    let blockSize = f32(MASK_COARSE);
    let blockPlace = (origin + delta * entry) / blockSize;
    var block = clamp(vec2<i32>(floor(blockPlace)), vec2<i32>(0), vec2<i32>(blocks) - vec2<i32>(1));
    var blockNext = entry + vec2<f32>(
        select(blockPlace.x - f32(block.x), f32(block.x + 1) - blockPlace.x, delta.x >= 0.0) * blockSize * reciprocal.x,
        select(blockPlace.y - f32(block.y), f32(block.y + 1) - blockPlace.y, delta.y >= 0.0) * blockSize * reciprocal.y
    );
    var travelled = entry;
    var visited = 0.0;
    var taken = 0;

    // One pass per block of the coarse level, or one pass over the whole
    // stretch where no block level is bound.
    for (var sweep = 0; sweep < MAX_MASK_STEPS; sweep = sweep + 1) {
        if (travelled >= leave || taken >= MAX_MASK_STEPS) {
            break;
        }

        var until = leave;

        if (coarse) {
            until = min(min(blockNext.x, blockNext.y), leave);
            taken = taken + 1;
            visited = visited + 1.0;

            if (!blockHolds(block, blocks)) {
                travelled = until;

                if (blockNext.x < blockNext.y) {
                    blockNext.x = blockNext.x + blockSize * reciprocal.x;
                    block.x = block.x + stepping.x;
                } else {
                    blockNext.y = blockNext.y + blockSize * reciprocal.y;
                    block.y = block.y + stepping.y;
                }

                continue;
            }
        }

        // Texel by texel over what this block covers of the stretch. Started
        // from where the stretch has got to rather than carried across blocks,
        // so a skipped block leaves nothing to unwind.
        let place = origin + delta * travelled;
        var texel = clamp(vec2<i32>(floor(place)), vec2<i32>(0), vec2<i32>(cells) - vec2<i32>(1));
        var next = travelled + vec2<f32>(
            select(place.x - f32(texel.x), f32(texel.x + 1) - place.x, delta.x >= 0.0) * reciprocal.x,
            select(place.y - f32(texel.y), f32(texel.y + 1) - place.y, delta.y >= 0.0) * reciprocal.y
        );

        for (var step = 0; step < MAX_MASK_STEPS; step = step + 1) {
            if (travelled >= until || taken >= MAX_MASK_STEPS) {
                break;
            }

            taken = taken + 1;
            visited = visited + 1.0;

            if (maskBlocks(texel, cells)) {
                return MaskHit(clamp(travelled, 0.0, 1.0), visited, false);
            }

            let crossing = min(next.x, next.y);

            if (abs(next.x - next.y) <= corner && crossing < leave) {
                // Only the corner point itself is shared with the two texels
                // the stretch does not otherwise enter. Either of them
                // blocking stops it there. Bounded by the whole stretch rather
                // than by this block, because a corner on a block's own edge
                // belongs to neither sweep otherwise.
                if (maskBlocks(texel + vec2<i32>(stepping.x, 0), cells) || maskBlocks(texel + vec2<i32>(0, stepping.y), cells)) {
                    return MaskHit(clamp(crossing, 0.0, 1.0), visited, false);
                }

                travelled = crossing;
                next = next + reciprocal;
                texel = texel + stepping;

                continue;
            }

            travelled = crossing;

            if (next.x < next.y) {
                next.x = next.x + reciprocal.x;
                texel.x = texel.x + stepping.x;
            } else {
                next.y = next.y + reciprocal.y;
                texel.y = texel.y + stepping.y;
            }
        }

        if (coarse) {
            if (blockNext.x < blockNext.y) {
                blockNext.x = blockNext.x + blockSize * reciprocal.x;
                block.x = block.x + stepping.x;
            } else {
                blockNext.y = blockNext.y + blockSize * reciprocal.y;
                block.y = block.y + stepping.y;
            }
        }
    }

    if (taken >= MAX_MASK_STEPS) {
        return MaskHit(clamp(travelled, 0.0, 1.0), visited, true);
    }

    return MaskHit(1.0, visited, false);
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
fn traceSegment(a: vec2<f32>, b: vec2<f32>) -> Transfer {
    let delta = b - a;
    let span = length(delta);

    if (span <= 0.0) {
        return Transfer(vec3<f32>(0.0), 1.0, 0.0, false);
    }

    let rastered = maskHit(a, b);
    let stopped = rastered.fraction * span;
    let open = select(0.0, 1.0, rastered.fraction >= 1.0);
    let direction = delta / span;
    let cells = uniforms.uGridCells;
    let size = uniforms.uCellSize;
    let lower = uniforms.uGridOrigin;
    let upper = lower + cells * size;
    var entry = 0.0;
    // A rasterised wall inside the stretch ends it even where it stands
    // outside the grid: the grid holds what emits, the mask what blocks.
    var leave = min(span, stopped);
    // Copied into variables because the clip below indexes them.
    var ray = direction;
    var start = a;
    var low = lower;
    var high = upper;

    // Clipped to the grid before it is walked. Outside the grid there is
    // nothing to find, and a stretch beginning far away would otherwise spend
    // its whole step budget crossing cells that do not exist - which is also
    // what makes the bound on MAX_CELL_STEPS hold for any input rather than
    // only for a stretch that starts inside.
    for (var axis = 0; axis < 2; axis = axis + 1) {
        if (abs(ray[axis]) < TRANSPORT_EPSILON) {
            if (start[axis] < low[axis] || start[axis] > high[axis]) {
                return Transfer(vec3<f32>(0.0), open, rastered.visited, rastered.exhausted);
            }

            continue;
        }

        let first = (low[axis] - start[axis]) / ray[axis];
        let last = (high[axis] - start[axis]) / ray[axis];

        entry = max(entry, min(first, last));
        leave = min(leave, max(first, last));
    }

    if (leave <= entry) {
        return Transfer(vec3<f32>(0.0), open, rastered.visited, rastered.exhausted);
    }

    let place = (a + direction * entry - lower) / size;
    var cell = clamp(vec2<i32>(floor(place)), vec2<i32>(0), vec2<i32>(cells) - vec2<i32>(1));
    let stepping = vec2<i32>(select(-1, 1, direction.x >= 0.0), select(-1, 1, direction.y >= 0.0));
    // Distance along the ray between two boundaries of the same axis, and to
    // the first one past the entry point. An axis the ray does not move along
    // never advances.
    let spacing = vec2<f32>(
        select(size / abs(direction.x), 1e30, abs(direction.x) < TRANSPORT_EPSILON),
        select(size / abs(direction.y), 1e30, abs(direction.y) < TRANSPORT_EPSILON)
    );
    var next = entry + vec2<f32>(
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
    var travelled = entry;
    var visited = rastered.visited;

    for (var taken = 0; taken < MAX_CELL_STEPS; taken = taken + 1) {
        if (travelled >= leave) {
            return Transfer(found, open, visited, rastered.exhausted);
        }

        visited = visited + 1.0;

        let leaving = min(min(next.x, next.y), leave);

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
                return Transfer(found, 0.0, visited, rastered.exhausted);
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

    // Out of steps: dark and blocking, and saying so. What the walk did not
    // read cannot be reported as open.
    return Transfer(found, 0.0, visited, true);
}
