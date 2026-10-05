import { Application, Asset, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene, Text } from '@codexo/exojs';

class TextStylesScene extends Scene {
  private readonly labels: Text[] = [];

  override async load(): Promise<void> {
    await this.loader.load(Asset.type('font', 'font/Kenney Future.ttf', { family: 'Kenney Future' }));
  }

  override init(): void {
    const { width } = this.app;
    const title = new Text('EXOJS', {
      fontFamily: 'Kenney Future',
      fontSize: 102,
      gradient: {
        stops: [
          { offset: 0, color: new Color(255, 246, 172) },
          { offset: 0.55, color: new Color(255, 165, 94) },
          { offset: 1, color: new Color(255, 88, 122) },
        ],
        angle: 90,
      },
      outlineColor: new Color(45, 62, 105),
      outlineWidth: 0.25,
      shadowColor: Color.black,
      shadowAlpha: 0.65,
      shadowOffsetX: 7,
      shadowOffsetY: 8,
      shadowBlur: 0.5,
    });
    title.setAnchor(0.5).setPosition(width / 2, 175);
    this.labels.push(title);

    const defaultFont = new Text('Default font', { fillColor: Color.white, fontSize: 43 });
    defaultFont.setAnchor(0.5).setPosition(width / 2, 350);
    this.labels.push(defaultFont);

    const loadedFont = new Text('Kenney Future font', { fillColor: new Color(124, 218, 255), fontFamily: 'Kenney Future', fontSize: 43 });
    loadedFont.setAnchor(0.5).setPosition(width / 2, 435);
    this.labels.push(loadedFont);

    const decoration = new Text('Underline and shadow', {
      fillColor: new Color(229, 236, 250),
      fontSize: 32,
      underline: true,
      shadowColor: Color.black,
      shadowAlpha: 0.8,
      shadowOffsetX: 4,
      shadowOffsetY: 5,
    });
    decoration.setAnchor(0.5).setPosition(width / 2, 555);
    this.labels.push(decoration);
  }

  override draw(context: RenderingContext): void {
    for (const label of this.labels) {
      context.render(label);
    }
  }

  override destroy(): void {
    this.labels.forEach(label => label.destroy());
    super.destroy();
  }
}

const app = new Application({
  scenes: { TextStylesScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(18, 22, 34),
  loader: { basePath: 'assets/' },
});

await app.start(TextStylesScene);
