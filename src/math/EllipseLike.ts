/** Structural type for any object that describes an axis-aligned ellipse via a centre point and half-radii. */
export interface EllipseLike {
    x: number;
    y: number;
    /** Horizontal half-radius. */
    rx: number;
    /** Vertical half-radius. */
    ry: number;
}
