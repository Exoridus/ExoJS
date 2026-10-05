import { Application, Color, FixedResolutionCanvasSizing, Mesh, type RenderingContext, Scene, type Seconds, Text } from '@codexo/exojs';

const UV_GRID = assets.technical.filtering.uvGrid256;
const HALF = 160;

class MeshVerticesScene extends Scene {
  private triangle!: Mesh;
  private quad!: Mesh;
  private triangleLabel!: Text;
  private quadLabel!: Text;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.quad = new Mesh({
      vertices: new Float32Array([-HALF, -HALF, HALF, -HALF, HALF, HALF, -HALF, HALF]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      texture: this.loader.get(UV_GRID),
    });

    this.triangle = new Mesh({
      vertices: new Float32Array([0, -130, 130, 110, -130, 110]),
      colors: new Uint32Array([0xff0000ff, 0xff00ff00, 0xffff0000]),
    });
    this.triangle.setPosition(width * 0.28, height * 0.53);
    this.quad.setPosition(width * 0.72, height * 0.53);
    this.triangleLabel = new Text('Vertex colors', { fillColor: Color.white, fontSize: 22 });
    this.quadLabel = new Text('Texture UVs', { fillColor: Color.white, fontSize: 22 });
    this.triangleLabel.setPosition(width * 0.2, 95);
    this.quadLabel.setPosition(width * 0.64, 95);
  }

  override update(delta: Seconds): void {
    this.triangle.rotate(delta * 45);
    this.quad.rotate(delta * 30);
  }

  override draw(context: RenderingContext): void {
    context.render(this.triangle);
    context.render(this.quad);
    context.render(this.triangleLabel);
    context.render(this.quadLabel);
  }
}

const app = new Application({
  scenes: { MeshVerticesScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});

await app.start(MeshVerticesScene);
