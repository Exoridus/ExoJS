// Auto-generated from mesh-deformed-grid.ts — edit the .ts source, not this file.
import { Application, Color, Mesh, Scene } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});
const COLS = 16;
const ROWS = 16;
const SIZE = 460;
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
const UV_GRID = assets.technical.filtering.uvGrid256;
class MeshDeformedGridScene extends Scene {
    restVertices;
    mesh;
    time = 0;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        const grid = buildGrid();
        this.restVertices = grid.vertices.slice();
        this.mesh = new Mesh({
            vertices: grid.vertices,
            uvs: grid.uvs,
            indices: grid.indices,
            texture: this.loader.get(UV_GRID),
        });
        this.mesh.setPosition((width / 2) | 0, (height / 2) | 0);
    }
    update(delta) {
        this.time += delta.seconds;
        const verts = this.mesh.vertices;
        const rest = this.restVertices;
        const t = this.time;
        for (let i = 0; i < verts.length; i += 2) {
            const rx = rest[i];
            const ry = rest[i + 1];
            verts[i] = rx + Math.sin(t * 2 + ry * 0.04) * 14;
            verts[i + 1] = ry + Math.cos(t * 1.6 + rx * 0.03) * 10;
        }
        this.mesh.recomputeLocalBounds();
    }
    draw(context) {
        context.backend.clear();
        context.render(this.mesh);
    }
}
app.start(new MeshDeformedGridScene());
