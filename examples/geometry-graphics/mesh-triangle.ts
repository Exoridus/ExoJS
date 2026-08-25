import { Application, Color, FixedResolutionCanvasSizing, Mesh, type RenderingContext, Scene, type Seconds } from '@codexo/exojs';

class MeshTriangleScene extends Scene {
  private triangle!: Mesh;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.triangle = new Mesh({
      vertices: new Float32Array([0, -100, 100, 100, -100, 100]),
      colors: new Uint32Array([0xff0000ff, 0xff00ff00, 0xffff0000]),
    });

    this.triangle.setPosition((width / 2) | 0, (height / 2) | 0);
  }

  override update(delta: Seconds): void {
    this.triangle.rotate(delta * 60);
  }

  override draw(context: RenderingContext): void {
    context.render(this.triangle);
  }
}

const app = new Application({
  scenes: { MeshTriangleScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});

app.start(MeshTriangleScene);
