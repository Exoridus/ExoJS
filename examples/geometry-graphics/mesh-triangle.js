// Auto-generated from mesh-triangle.ts — edit the .ts source, not this file.
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
    triangle;
    init() {
        const { width, height } = this.app.canvas;
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
    update(delta) {
        this.triangle.rotate(delta.seconds * 60);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.triangle);
    }
}
app.start(new MeshTriangleScene());
