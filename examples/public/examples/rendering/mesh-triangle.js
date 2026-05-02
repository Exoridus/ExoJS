import { Application, Color, Scene, Mesh } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
});

document.body.append(app.canvas);

app.start(new class extends Scene {
    init() {
        const { width, height } = this.app.canvas;

        // A simple equilateral-ish triangle with one solid color per vertex.
        // Colors are packed RGBA8: 0xAABBGGRR in little-endian terms, so
        // 0xff0000ff → red (R=255, G=0, B=0, A=255), and so on.
        this._triangle = new Mesh({
            vertices: new Float32Array([
                  0, -100,
                100,  100,
               -100,  100,
            ]),
            colors: new Uint32Array([
                0xff0000ff, // red
                0xff00ff00, // green
                0xffff0000, // blue
            ]),
        });

        this._triangle.setPosition(width / 2 | 0, height / 2 | 0);
    }

    update(delta) {
        this._triangle.rotate(delta.seconds * 60);
    }

    draw(backend) {
        backend.clear();
        this._triangle.render(backend);
    }
});
