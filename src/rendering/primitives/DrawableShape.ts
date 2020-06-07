import { RenderingPrimitives } from 'types/rendering';
import type { Geometry } from 'rendering/primitives/Geometry';
import type { Color } from 'core/Color';
import { Container } from 'rendering/Container';
import type { RenderManager } from 'rendering/RenderManager';
import type { PrimitiveRenderer } from 'rendering/primitives/PrimitiveRenderer';
import { RendererType } from 'rendering/IRenderer';

export class DrawableShape extends Container {

    public readonly geometry: Geometry;
    public readonly drawMode: RenderingPrimitives;
    public readonly color: Color;

    public constructor(geometry: Geometry, color: Color, drawMode: RenderingPrimitives = RenderingPrimitives.TRIANGLES) {
        super();

        this.geometry = geometry;
        this.color = color.clone();
        this.drawMode = drawMode;
    }

    public render(renderManager: RenderManager): this {
        if (this.visible && this.inView(renderManager.view)) {
            const renderer = renderManager.getRenderer(RendererType.primitive) as PrimitiveRenderer;

            renderManager.setRenderer(renderer);
            renderer.render(this);
        }

        return this;
    }

    public destroy(): void {
        super.destroy();

        this.color.destroy();
    }
}
