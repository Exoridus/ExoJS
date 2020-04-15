import { RenderingPrimitives } from 'const/rendering';
import { Geometry } from "rendering/primitives/Geometry";
import { Color } from "core/Color";
import { Container } from "rendering/Container";
import { RenderManager } from "rendering/RenderManager";
import { PrimitiveRenderer } from "rendering/primitives/PrimitiveRenderer";
import { RendererType } from "rendering/IRenderer";

export class DrawableShape extends Container {

    public readonly geometry: Geometry;
    public readonly drawMode: RenderingPrimitives;
    public readonly color: Color;

    constructor(geometry: Geometry, color: Color, drawMode: RenderingPrimitives = RenderingPrimitives.TRIANGLES) {
        super();

        this.geometry = geometry;
        this.color = color.clone();
        this.drawMode = drawMode;
    }

    render(renderManager: RenderManager) {
        if (this.visible && this.inView(renderManager.view)) {
            const renderer = renderManager.getRenderer(RendererType.Primitive) as PrimitiveRenderer;

            renderManager.setRenderer(renderer);
            renderer.render(this);
        }

        return this;
    }

    destroy() {
        super.destroy();

        this.color.destroy();
    }
}
