import earcut from 'earcut';
import { Vector } from '@/math/Vector';
import { tau } from '@/math/utils';

export interface MeshGeometryData {
    readonly vertices: Float32Array;
    readonly indices: Uint16Array;
    readonly points: Array<number>;
}

export const buildLine = (startX: number, startY: number, endX: number, endY: number, width: number): MeshGeometryData => {
    const points = [startX, startY, endX, endY];
    const distance = width / 2;
    const perpA = new Vector(startX - endX, startY - endY).perp().normalize().multiply(distance);
    const perpB = new Vector(endX - startX, endY - startY).perp().normalize().multiply(distance);

    const vertices = new Float32Array([
        startX - perpA.x, startY - perpA.y, // 0: start-left
        startX + perpA.x, startY + perpA.y, // 1: start-right
        endX - perpB.x, endY - perpB.y,     // 2: end-left
        endX + perpB.x, endY + perpB.y,     // 3: end-right
    ]);

    perpA.destroy();
    perpB.destroy();

    const indices = new Uint16Array([0, 1, 3, 0, 3, 2]);

    return { vertices, indices, points };
};

export const buildPath = (points: Array<number>, width: number): MeshGeometryData => {
    if (points.length < 4) {
        throw new Error('At least two X/Y pairs are required to build a line.');
    }

    const lineWidth = width / 2;
    const firstPoint = new Vector(points[0], points[1]);
    const lastPoint = new Vector(points[points.length - 2], points[points.length - 1]);
    const outlinePoints = points;

    if (firstPoint.x === lastPoint.x && firstPoint.y === lastPoint.y) {
        points = points.slice();

        points.pop();
        points.pop();

        lastPoint.set(points[points.length - 2], points[points.length - 1]);

        const midPointX = lastPoint.x + ((firstPoint.x - lastPoint.x) * 0.5);
        const midPointY = lastPoint.y + ((firstPoint.y - lastPoint.y) * 0.5);

        points.unshift(midPointX, midPointY);
        points.push(midPointX, midPointY);
    }

    firstPoint.destroy();
    lastPoint.destroy();

    const length = points.length / 2;
    const stripVertices: Array<number> = [];

    let p1x = points[0];
    let p1y = points[1];
    let p2x = points[2];
    let p2y = points[3];
    let p3x = 0;
    let p3y = 0;

    let perpx = -(p1y - p2y);
    let perpy = p1x - p2x;
    let perp2x = 0;
    let perp2y = 0;
    let perp3x = 0;
    let perp3y = 0;

    let dist = Math.sqrt((perpx * perpx) + (perpy * perpy));

    perpx /= dist;
    perpy /= dist;
    perpx *= lineWidth;
    perpy *= lineWidth;

    stripVertices.push(p1x - perpx, p1y - perpy);
    stripVertices.push(p1x + perpx, p1y + perpy);

    for (let i = 1; i < length - 1; i++) {
        p1x = points[(i - 1) * 2];
        p1y = points[((i - 1) * 2) + 1];

        p2x = points[i * 2];
        p2y = points[(i * 2) + 1];

        p3x = points[(i + 1) * 2];
        p3y = points[((i + 1) * 2) + 1];

        perpx = -(p1y - p2y);
        perpy = p1x - p2x;

        dist = Math.sqrt((perpx * perpx) + (perpy * perpy));

        perpx /= dist;
        perpy /= dist;
        perpx *= lineWidth;
        perpy *= lineWidth;

        perp2x = -(p2y - p3y);
        perp2y = p2x - p3x;

        dist = Math.sqrt((perp2x * perp2x) + (perp2y * perp2y));

        perp2x /= dist;
        perp2y /= dist;
        perp2x *= lineWidth;
        perp2y *= lineWidth;

        const a1 = (-perpy + p1y) - (-perpy + p2y);
        const b1 = (-perpx + p2x) - (-perpx + p1x);
        const c1 = ((-perpx + p1x) * (-perpy + p2y)) - ((-perpx + p2x) * (-perpy + p1y));
        const a2 = (-perp2y + p3y) - (-perp2y + p2y);
        const b2 = (-perp2x + p2x) - (-perp2x + p3x);
        const c2 = ((-perp2x + p3x) * (-perp2y + p2y)) - ((-perp2x + p2x) * (-perp2y + p3y));

        let denom = (a1 * b2) - (a2 * b1);

        if (Math.abs(denom) < 0.1) {
            denom += 10.1;

            stripVertices.push(p2x - perpx, p2y - perpy);
            stripVertices.push(p2x + perpx, p2y + perpy);

            continue;
        }

        const px = ((b1 * c2) - (b2 * c1)) / denom;
        const py = ((a2 * c1) - (a1 * c2)) / denom;
        const pdist = ((px - p2x) * (px - p2x)) + ((py - p2y) * (py - p2y));

        if (pdist > (196 * lineWidth * lineWidth)) {
            perp3x = perpx - perp2x;
            perp3y = perpy - perp2y;

            dist = Math.sqrt((perp3x * perp3x) + (perp3y * perp3y));

            perp3x /= dist;
            perp3y /= dist;
            perp3x *= lineWidth;
            perp3y *= lineWidth;

            stripVertices.push(p2x - perp3x, p2y - perp3y);
            stripVertices.push(p2x + perp3x, p2y + perp3y);
            stripVertices.push(p2x - perp3x, p2y - perp3y);
        } else {
            stripVertices.push(px, py);
            stripVertices.push(p2x - (px - p2x), p2y - (py - p2y));
        }
    }

    p1x = points[(length - 2) * 2];
    p1y = points[((length - 2) * 2) + 1];

    p2x = points[(length - 1) * 2];
    p2y = points[((length - 1) * 2) + 1];

    perpx = -(p1y - p2y);
    perpy = p1x - p2x;

    dist = Math.sqrt((perpx * perpx) + (perpy * perpy));

    perpx /= dist;
    perpy /= dist;
    perpx *= lineWidth;
    perpy *= lineWidth;

    stripVertices.push(p2x - perpx, p2y - perpy);
    stripVertices.push(p2x + perpx, p2y + perpy);

    // Convert strip-style vertex sequence to triangle-list indices.
    // For N strip vertices (N = stripVertices.length / 2), each i in [0, N-3]
    // produces a triangle. Even i: (i, i+1, i+2). Odd i: (i+1, i, i+2).
    // This preserves the same winding the original triangle-strip pipeline saw.
    const stripVertexCount = stripVertices.length / 2;
    const vertices = new Float32Array(stripVertices);
    const triangleCount = stripVertexCount >= 3 ? stripVertexCount - 2 : 0;
    const indices = new Uint16Array(triangleCount * 3);

    for (let i = 0; i < triangleCount; i++) {
        const base = i * 3;

        if ((i & 1) === 0) {
            indices[base] = i;
            indices[base + 1] = i + 1;
            indices[base + 2] = i + 2;
        } else {
            indices[base] = i + 1;
            indices[base + 1] = i;
            indices[base + 2] = i + 2;
        }
    }

    return { vertices, indices, points: outlinePoints };
};

export const buildCircle = (centerX: number, centerY: number, radius: number): MeshGeometryData => {
    const length = Math.floor(15 * Math.sqrt(radius + radius));
    const segment = (Math.PI * 2) / length;
    const points: Array<number> = [];

    // 1 center vertex + N perimeter vertices.
    const vertices = new Float32Array((length + 1) * 2);

    vertices[0] = centerX;
    vertices[1] = centerY;

    for (let i = 0; i < length; i++) {
        const segmentX = centerX + (Math.sin(segment * i) * radius);
        const segmentY = centerY + (Math.cos(segment * i) * radius);

        points.push(segmentX, segmentY);

        const offset = (i + 1) * 2;

        vertices[offset] = segmentX;
        vertices[offset + 1] = segmentY;
    }

    const indices = new Uint16Array(length * 3);

    for (let i = 0; i < length; i++) {
        const base = i * 3;

        indices[base] = 0;
        indices[base + 1] = i + 1;
        indices[base + 2] = i + 2 > length ? 1 : i + 2;
    }

    return { vertices, indices, points };
};

export const buildEllipse = (centerX: number, centerY: number, radiusX: number, radiusY: number): MeshGeometryData => {
    const length = Math.floor(15 * Math.sqrt(radiusX + radiusY));
    const segment = (Math.PI * 2) / length;
    const points: Array<number> = [];

    const vertices = new Float32Array((length + 1) * 2);

    vertices[0] = centerX;
    vertices[1] = centerY;

    for (let i = 0; i < length; i++) {
        const segmentX = centerX + (Math.sin(segment * i) * radiusX);
        const segmentY = centerY + (Math.cos(segment * i) * radiusY);

        points.push(segmentX, segmentY);

        const offset = (i + 1) * 2;

        vertices[offset] = segmentX;
        vertices[offset + 1] = segmentY;
    }

    const indices = new Uint16Array(length * 3);

    for (let i = 0; i < length; i++) {
        const base = i * 3;

        indices[base] = 0;
        indices[base + 1] = i + 1;
        indices[base + 2] = i + 2 > length ? 1 : i + 2;
    }

    return { vertices, indices, points };
};

export const buildPolygon = (points: Array<number>): MeshGeometryData => {
    if (points.length < 6) {
        throw new Error('At least three X/Y pairs are required to build a polygon.');
    }

    const length = points.length / 2;
    const triangles = earcut(points, [], 2);
    const vertices = new Float32Array(points.length);

    for (let i = 0; i < length; i++) {
        vertices[i * 2] = points[i * 2];
        vertices[(i * 2) + 1] = points[(i * 2) + 1];
    }

    const indices = triangles ? new Uint16Array(triangles) : new Uint16Array(0);

    return { vertices, indices, points };
};

export const buildRectangle = (x: number, y: number, width: number, height: number): MeshGeometryData => {
    // 4 vertices: TL, TR, BL, BR. Triangles [0, 1, 2,  1, 3, 2] (clockwise).
    const vertices = new Float32Array([
        x, y,                   // 0 TL
        x + width, y,           // 1 TR
        x, y + height,          // 2 BL
        x + width, y + height,  // 3 BR
    ]);
    const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
    // Outline points walk the perimeter (TL -> TR -> BR -> BL).
    const points = [x, y, x + width, y, x + width, y + height, x, y + height];

    return { vertices, indices, points };
};

export const buildStar = (centerX: number, centerY: number, points: number, radius: number, innerRadius: number = radius / 2, rotation = 0): MeshGeometryData => {
    const startAngle = (Math.PI / -2) + rotation;
    const length = points * 2;
    const delta = tau / length;
    const path: Array<number> = [];

    for (let i = 0; i < length; i++) {
        const angle = startAngle + (i * delta);
        const rad = i % 2 ? innerRadius : radius;

        path.push(
            centerX + (rad * Math.cos(angle)),
            centerY + (rad * Math.sin(angle))
        );
    }

    return buildPolygon(path);
};
