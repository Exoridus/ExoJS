import { Rectangle } from '@/math/Rectangle';
import { getCollisionRectangleRectangle } from '@/math/collision-detection';

function rect(x: number, y: number, width: number, height: number): Rectangle {
    return new Rectangle(x, y, width, height);
}

describe('getCollisionRectangleRectangle', () => {
    // 1. Partial overlap: returns correct min-axis distance
    test('returns correct overlap for partially overlapping rectangles', () => {
        // rectA: (0,0)→(10,10), rectB: (5,5)→(15,15)
        // overlapX = min(10,15) - max(0,5) = 10 - 5 = 5
        // overlapY = min(10,15) - max(0,5) = 10 - 5 = 5
        // overlap = min(5, 5) = 5
        const response = getCollisionRectangleRectangle(rect(0, 0, 10, 10), rect(5, 5, 10, 10));

        expect(response).not.toBeNull();
        expect(response!.overlap).toBe(5);
    });

    // Asymmetric overlap: min axis chosen correctly
    test('returns minimum axis overlap for asymmetric partial overlap', () => {
        // rectA: (0,0)→(10,10), rectB: (8,2)→(18,12)
        // overlapX = min(10,18) - max(0,8) = 10 - 8 = 2
        // overlapY = min(10,12) - max(0,2) = 10 - 2 = 8
        // overlap = min(2, 8) = 2
        const response = getCollisionRectangleRectangle(rect(0, 0, 10, 10), rect(8, 2, 10, 10));

        expect(response).not.toBeNull();
        expect(response!.overlap).toBe(2);
    });

    // 2. Fully contained: overlap equals smaller dimension
    test('fully-contained rect: overlap equals smaller rect dimension', () => {
        // rectA: (0,0)→(10,10), rectB (inner): (2,2)→(6,6) (4×4)
        // overlapX = min(10,6) - max(0,2) = 6 - 2 = 4
        // overlapY = min(10,6) - max(0,2) = 6 - 2 = 4
        // overlap = min(4, 4) = 4
        const response = getCollisionRectangleRectangle(rect(0, 0, 10, 10), rect(2, 2, 4, 4));

        expect(response).not.toBeNull();
        expect(response!.overlap).toBe(4);
        expect(response!.shapeBinA).toBe(true);
        expect(response!.shapeAinB).toBe(false);
    });

    // 3. Edge-touching: overlap is 0 (not null — rects share an edge)
    test('edge-touching rectangles return overlap of 0', () => {
        // rectA: (0,0)→(10,10), rectB: (10,0)→(20,10) — share right/left edge
        // Early-out check: rectB.left(10) > rectA.right(10) is false (not strictly greater)
        // overlapX = min(10,20) - max(0,10) = 10 - 10 = 0
        // overlapY = min(10,10) - max(0,0) = 10 - 0 = 10
        // overlap = min(0, 10) = 0
        const response = getCollisionRectangleRectangle(rect(0, 0, 10, 10), rect(10, 0, 10, 10));

        expect(response).not.toBeNull();
        expect(response!.overlap).toBe(0);
    });

    // Non-overlapping: returns null
    test('non-overlapping rectangles return null', () => {
        // rectA: (0,0)→(5,5), rectB: (10,0)→(20,10) — gap between them
        const response = getCollisionRectangleRectangle(rect(0, 0, 5, 5), rect(10, 0, 10, 10));

        expect(response).toBeNull();
    });

    // Symmetric test from spec: rect(0,0,10,10) vs rect(5,5,10,10) = overlap 5
    test('spec example: rect(0,0,10,10) vs rect(5,5,10,10) returns overlap 5', () => {
        const response = getCollisionRectangleRectangle(rect(0, 0, 10, 10), rect(5, 5, 10, 10));

        expect(response).not.toBeNull();
        expect(response!.overlap).toBe(5);
    });
});
