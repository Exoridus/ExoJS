import type { IPoint } from 'types/primitives/IPoint';

export interface IPolygon {
    x: number;
    y: number;
    points: Array<IPoint>;
}
