import { Application, Color, Mesh, type RenderingContext, Scene, type Time } from '@codexo/exojs';



const UV_GRID = assets.technical.filtering.uvGrid256;
const HALF = 300;

class MeshTexturedQuadScene extends Scene {
    private quad!: Mesh;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.quad = new Mesh({
            vertices: new Float32Array([
                -HALF,
                -HALF,
                HALF,
                -HALF,
                HALF,
                HALF,
                -HALF,
                HALF,
            ]),
            uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
            indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
            texture: this.loader.get(UV_GRID),
        });

        this.quad.setPosition((width / 2) | 0, (height / 2) | 0);
    }

    override update(delta: Time): void {
        this.quad.rotate(delta.seconds * 30);
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.quad);
    }
}

const app = new Application({
    scenes: { MeshTexturedQuadScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});

app.start(MeshTexturedQuadScene);
