import { Application, Color, Mesh, Scene, Texture } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});

const UV_GRID = assets.technical.filtering.uvGrid256;
const HALF = 300;

class MeshTexturedQuadScene extends Scene {
    private quad!: Mesh;

    override init(): void {
        const { width, height } = this.app.canvas;

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
            texture: this.loader.get(Texture, UV_GRID),
        });

        this.quad.setPosition((width / 2) | 0, (height / 2) | 0);
    }

    override update(delta): void {
        this.quad.rotate(delta.seconds * 30);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.quad);
    }
}

app.start(new MeshTexturedQuadScene());
