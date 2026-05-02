import { Application, Color, Scene, Mesh, Texture } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

const COLS = 16;
const ROWS = 16;
const SIZE = 360;

function buildGrid() {
    const half = SIZE / 2;
    const stepX = SIZE / COLS;
    const stepY = SIZE / ROWS;
    const vertices = new Float32Array((COLS + 1) * (ROWS + 1) * 2);
    const uvs = new Float32Array(vertices.length);
    const indices = new Uint16Array(COLS * ROWS * 6);

    let v = 0;
    let u = 0;
    for (let r = 0; r <= ROWS; r++) {
        for (let c = 0; c <= COLS; c++) {
            vertices[v++] = -half + c * stepX;
            vertices[v++] = -half + r * stepY;
            uvs[u++] = c / COLS;
            uvs[u++] = r / ROWS;
        }
    }

    let i = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const tl = r * (COLS + 1) + c;
            const tr = tl + 1;
            const bl = tl + (COLS + 1);
            const br = bl + 1;
            indices[i++] = tl;
            indices[i++] = tr;
            indices[i++] = br;
            indices[i++] = tl;
            indices[i++] = br;
            indices[i++] = bl;
        }
    }

    return { vertices, uvs, indices };
}

app.start(new class extends Scene {
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/bunny.png' });
    }

    init(loader) {
        const { width, height } = this.app.canvas;
        const grid = buildGrid();

        // Save the rest-pose vertex positions; we'll wave around them.
        this._restVertices = grid.vertices.slice();
        this._mesh = new Mesh({
            vertices: grid.vertices,
            uvs: grid.uvs,
            indices: grid.indices,
            texture: loader.get(Texture, 'bunny'),
        });
        this._mesh.setPosition(width / 2 | 0, height / 2 | 0);
        this._time = 0;
    }

    update(delta) {
        this._time += delta.seconds;
        const verts = this._mesh.vertices;
        const rest = this._restVertices;
        const t = this._time;

        for (let i = 0; i < verts.length; i += 2) {
            const rx = rest[i];
            const ry = rest[i + 1];
            // Per-vertex sinusoidal displacement keyed off the rest position
            // so the wave looks like a flag rippling across the grid.
            verts[i]     = rx + Math.sin(t * 2 + ry * 0.04) * 14;
            verts[i + 1] = ry + Math.cos(t * 1.6 + rx * 0.03) * 10;
        }

        // Keep cull bounds in step with the deformed shape.
        this._mesh.recomputeLocalBounds();
    }

    draw(backend) {
        backend.clear();
        this._mesh.render(backend);
    }
});
