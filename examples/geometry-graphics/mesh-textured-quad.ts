import { Application, Color, FixedResolutionCanvasSizing, Mesh, type RenderingContext, Scene, type Seconds } from '@codexo/exojs';

const UV_GRID = assets.technical.filtering.uvGrid256;
const HALF = 300;

class MeshTexturedQuadScene extends Scene {
  private quad!: Mesh;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.quad = new Mesh({
      vertices: new Float32Array([-HALF, -HALF, HALF, -HALF, HALF, HALF, -HALF, HALF]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      texture: this.loader.get(UV_GRID),
    });

    this.quad.setPosition((width / 2) | 0, (height / 2) | 0);
  }

  override update(delta: Seconds): void {
    this.quad.rotate(delta * 30);
  }

  override draw(context: RenderingContext): void {
    context.render(this.quad);
  }
}

const app = new Application({
  scenes: { MeshTexturedQuadScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});

app.start(MeshTexturedQuadScene);
