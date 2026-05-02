import { Application, Color, Scene, Mesh, Texture } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(new class extends Scene {
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/bunny.png' });
    }

    init(loader) {
        const { width, height } = this.app.canvas;
        const bunny = loader.get(Texture, 'bunny');
        const w = bunny.width * 4;
        const h = bunny.height * 4;
        const halfW = w / 2;
        const halfH = h / 2;

        // Manual textured quad — same visual as `new Sprite(texture)` but
        // built up from the lower-level Mesh primitive. The four corners
        // are TL, TR, BR, BL with matching UVs and an index buffer that
        // splits the quad into two triangles.
        this._quad = new Mesh({
            vertices: new Float32Array([
                -halfW, -halfH,   // TL
                 halfW, -halfH,   // TR
                 halfW,  halfH,   // BR
                -halfW,  halfH,   // BL
            ]),
            uvs: new Float32Array([
                0, 0,
                1, 0,
                1, 1,
                0, 1,
            ]),
            indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
            texture: bunny,
        });

        this._quad.setPosition(width / 2 | 0, height / 2 | 0);
    }

    update(delta) {
        this._quad.rotate(delta.seconds * 30);
    }

    draw(backend) {
        backend.clear();
        this._quad.render(backend);
    }
});
