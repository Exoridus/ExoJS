import { RenderingPrimitives } from 'types/rendering';
import type { Geometry } from 'rendering/primitives/Geometry';
import type { Color } from 'core/Color';
import { Drawable } from 'rendering/Drawable';

export class DrawableShape extends Drawable {

    public readonly geometry: Geometry;
    public readonly drawMode: RenderingPrimitives;
    public readonly color: Color;

    public constructor(geometry: Geometry, color: Color, drawMode: RenderingPrimitives = RenderingPrimitives.Triangles) {
        super();

        this.geometry = geometry;
        this.color = color.clone();
        this.drawMode = drawMode;
    }

    public destroy(): void {
        super.destroy();

        this.color.destroy();
    }
}
