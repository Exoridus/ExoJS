import { technical } from '@assets';
import { Application, Color, Mesh, Scene, Texture } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

const UV_GRID = technical.filtering.uvGrid256;
const HALF = 240;

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { uvGrid: UV_GRID });
        }

        init(loader) {
            const { width, height } = this.app.canvas;

            // Manual textured quad — same visual as `new Sprite(texture)` but
            // built up from the lower-level Mesh primitive. The four corners
            // are TL, TR, BR, BL with matching UVs and an index buffer that
            // splits the quad into two triangles.
            this._quad = new Mesh({
                vertices: new Float32Array([
                    -HALF,
                    -HALF, // TL
                    HALF,
                    -HALF, // TR
                    HALF,
                    HALF, // BR
                    -HALF,
                    HALF, // BL
                ]),
                uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
                indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
                texture: loader.get(Texture, 'uvGrid'),
            });

            this._quad.setPosition((width / 2) | 0, (height / 2) | 0);
        }

        update(delta) {
            this._quad.rotate(delta.seconds * 30);
        }

        draw(context) {
            context.backend.clear();
            context.render(this._quad);
        }
    })()
);
