import { Application, Color, Mesh, type RenderingContext, Scene, type Time } from '@codexo/exojs';



class MeshTriangleScene extends Scene {
    private triangle!: Mesh;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.triangle = new Mesh({
            vertices: new Float32Array([0, -100, 100, 100, -100, 100]),
            colors: new Uint32Array([
                0xff0000ff,
                0xff00ff00,
                0xffff0000,
            ]),
        });

        this.triangle.setPosition((width / 2) | 0, (height / 2) | 0);
    }

    override update(delta: Time): void {
        this.triangle.rotate(delta.seconds * 60);
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.triangle);
    }
}

const app = new Application({
    scenes: { MeshTriangleScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});

app.start(MeshTriangleScene);
