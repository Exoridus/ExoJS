/**
 * Triangulate a simple 2D polygon by ear-clipping.
 *
 * Input: `vertices` is a flat sequence of (x, y) pairs (length must be even,
 * minimum 6 = 3 vertices). Polygon may be CW or CCW; the algorithm normalises
 * to CCW internally.
 *
 * Output: a `Uint32Array` of indices in groups of 3 (per triangle), referencing
 * vertex positions (the i-th vertex spans `vertices[2*i], vertices[2*i + 1]`).
 *
 * Polygons that are degenerate (all collinear), zero-area, or self-intersecting
 * may produce incomplete output but must not throw or hang.
 *
 * @param vertices flat (x, y) pairs
 * @returns triangle index list (length is multiple of 3)
 */
export function triangulate(vertices: ArrayLike<number>): Uint32Array {
    const n = vertices.length >> 1;

    if (n < 3) {
        return new Uint32Array(0);
    }

    if (n === 3) {
        // Return in CCW order; swap if input triangle is CW.
        const ax = vertices[0], ay = vertices[1];
        const bx = vertices[2], by = vertices[3];
        const cx = vertices[4], cy = vertices[5];

        return isCcwTriangle(ax, ay, bx, by, cx, cy)
            ? new Uint32Array([0, 1, 2])
            : new Uint32Array([2, 1, 0]);
    }

    // Build doubly-linked list of vertex indices.
    const prev = new Uint32Array(n);
    const next = new Uint32Array(n);

    for (let i = 0; i < n; i++) {
        prev[i] = (i + n - 1) % n;
        next[i] = (i + 1) % n;
    }

    // Normalise to CCW: compute signed area; if negative (CW), reverse the list.
    if (signedArea(vertices) < 0) {
        for (let i = 0; i < n; i++) {
            const tmp = prev[i];

            prev[i] = next[i];
            next[i] = tmp;
        }
    }

    const maxTriangles = n - 2;
    const out = new Uint32Array(maxTriangles * 3);
    let outIdx = 0;

    let remaining = n;
    let current = 0;

    // Ear-clipping: at most O(n^2) iterations; bail after one full pass finds no ear.
    while (remaining > 3) {
        // Try each remaining vertex as a potential ear, one full pass at a time.
        let earFound = false;
        const passStart = current;

        do {
            const p = prev[current];
            const nx = next[current];
            const v = current;

            const ax = vertices[p * 2],    ay = vertices[p * 2 + 1];
            const bx = vertices[v * 2],    by = vertices[v * 2 + 1];
            const cx = vertices[nx * 2],   cy = vertices[nx * 2 + 1];

            if (isCcwTriangle(ax, ay, bx, by, cx, cy) && isEar(vertices, prev, next, p, v, nx)) {
                // Emit triangle (prev, v, next).
                out[outIdx++] = p;
                out[outIdx++] = v;
                out[outIdx++] = nx;

                // Remove v from the list.
                next[p] = nx;
                prev[nx] = p;
                remaining--;

                earFound = true;
                current = nx;
                break;
            }

            current = next[current];
        } while (current !== passStart);

        if (!earFound) {
            // Degenerate polygon: no ear found in a full pass; bail out.
            break;
        }
    }

    // Emit the final triangle if exactly 3 vertices remain.
    // Emit in CCW order (the linked-list direction may be CW after prior clips on concave polygons).
    if (remaining === 3) {
        const pa = prev[current];
        const nc = next[current];
        const ax = vertices[pa * 2],      ay = vertices[pa * 2 + 1];
        const bx = vertices[current * 2], by = vertices[current * 2 + 1];
        const cx = vertices[nc * 2],      cy = vertices[nc * 2 + 1];

        if (isCcwTriangle(ax, ay, bx, by, cx, cy)) {
            out[outIdx++] = pa;
            out[outIdx++] = current;
            out[outIdx++] = nc;
        } else {
            out[outIdx++] = nc;
            out[outIdx++] = current;
            out[outIdx++] = pa;
        }
    }

    return out.subarray(0, outIdx);
}

/** Shoelace signed area. Positive = CCW (mathematical orientation), negative = CW. */
function signedArea(vertices: ArrayLike<number>): number {
    const n = vertices.length >> 1;
    let area = 0;

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const x0 = vertices[i * 2];
        const y0 = vertices[i * 2 + 1];
        const x1 = vertices[j * 2];
        const y1 = vertices[j * 2 + 1];

        area += (x0 * y1) - (x1 * y0);
    }

    return area; // Positive = CCW, negative = CW.
}

/**
 * Returns true if the triangle (a, b, c) has a counter-clockwise (CCW) winding.
 * Uses the cross product of (b-a) × (c-a); positive = CCW.
 */
function isCcwTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
    return ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) > 0;
}

/**
 * Returns true if point (px, py) lies strictly inside triangle (a, b, c).
 * Uses sign-of-cross-products. Boundary points (including corners) return false.
 */
function pointInTriangle(
    px: number, py: number,
    ax: number, ay: number,
    bx: number, by: number,
    cx: number, cy: number,
): boolean {
    const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);

    const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);

    // Strictly inside: all same sign and none are exactly zero (exclude boundary).
    return !(hasNeg && hasPos) && (d1 !== 0) && (d2 !== 0) && (d3 !== 0);
}

/**
 * Returns true if vertex v is an ear: the triangle (prevIdx, v, nextIdx) contains
 * no other polygon vertex strictly inside it.
 */
function isEar(
    vertices: ArrayLike<number>,
    prev: Uint32Array,
    next: Uint32Array,
    prevIdx: number,
    v: number,
    nextIdx: number,
): boolean {
    const ax = vertices[prevIdx * 2],  ay = vertices[prevIdx * 2 + 1];
    const bx = vertices[v * 2],        by = vertices[v * 2 + 1];
    const cx = vertices[nextIdx * 2],  cy = vertices[nextIdx * 2 + 1];

    // Walk all remaining vertices and check if any lie strictly inside the ear triangle.
    // Skip the three ear vertices themselves — they can never be "inside" by strict test,
    // but we exclude them explicitly for clarity and to avoid floating-point edge cases.
    let node = next[nextIdx];

    while (node !== prevIdx) {
        if (node !== v) {
            const px = vertices[node * 2];
            const py = vertices[node * 2 + 1];

            if (pointInTriangle(px, py, ax, ay, bx, by, cx, cy)) {
                return false;
            }
        }
        node = next[node];
    }

    return true;
}
