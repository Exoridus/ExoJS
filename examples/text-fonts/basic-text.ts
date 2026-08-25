import { Application, Asset, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene, type Seconds, Text } from '@codexo/exojs';

class BasicTextScene extends Scene {
  private elapsed = 0;
  private text!: Text;

  override async load(): Promise<void> {
    const app = this.app;
    await this.loader.load(Asset.type('font', 'font/Kenney Future.ttf', { family: 'Kenney Future' }));

    const { width, height } = app;

    this.text = new Text('Hello World!', {
      align: 'left',
      fillColor: Color.white,
      outlineColor: Color.black,
      outlineWidth: 0.2,
      fontSize: 25,
      fontFamily: 'Kenney Future',
    });

    this.text.setPosition(width / 2, height / 2);
    this.text.setAnchor(0.5, 0.5);
  }

  override update(delta: Seconds): void {
    this.elapsed += delta;
    this.text.text = `Hello World! ${this.elapsed | 0}`;
    this.text.rotate(delta * 36);
  }

  override draw(context: RenderingContext): void {
    context.render(this.text);
  }
}

const app = new Application({
  scenes: { BasicTextScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: {
    basePath: 'assets/',
  },
});

app.start(BasicTextScene);
