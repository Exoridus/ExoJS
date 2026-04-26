import type { PointLike } from '@/math/PointLike';

export interface PolygonLike {
    x: number;
    y: number;
    points: Array<PointLike>;
}
