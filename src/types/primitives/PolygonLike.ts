import type { PointLike } from 'types/primitives/PointLike';

export interface PolygonLike {
    x: number;
    y: number;
    points: Array<PointLike>;
}
