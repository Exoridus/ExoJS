import { Application, Color, Mesh, Scene } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

class MeshTriangleScene extends Scene {
    private _triangle!: Mesh;

    override init(): void {
        const { width, height } = this.app.canvas;

        this._triangle = new Mesh({
            vertices: new Float32Array([0, -100, 100, 100, -100, 100]),
            colors: new Uint32Array([
                0xff0000ff,
                0xff00ff00,
                0xffff0000,
            ]),
        });

        this._triangle.setPosition((width / 2) | 0, (height / 2) | 0);
    }

    override update(delta): void {
        this._triangle.rotate(delta.seconds * 60);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._triangle);
    }
}

app.start(new MeshTriangleScene());
