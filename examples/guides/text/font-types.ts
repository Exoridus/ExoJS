// #region guide:font-types
import { Application, BitmapText, type BmFont, Color, Scene, Text } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';

class FontTypesScene extends Scene {
  private face!: FontFace;
  private bitmap!: BmFont;

  override async load(): Promise<void> {
    [this.face, this.bitmap] = await Promise.all([this.loader.load(assets.fontKenneyFuture), this.loader.load(assets.fontKenneyBlocksFnt)]);
  }

  override init(): void {
    const system = new Text('System font: ready immediately', {
      fontFamily: 'Arial',
      fontSize: 24,
      underline: true,
    }).setPosition(32, 40);
    const web = new Text('Loaded web font', {
      font: this.face,
      fontSize: 42,
      maxWidth: 720,
      gradient: {
        angle: 90,
        stops: [
          { offset: 0, color: Color.white },
          { offset: 1, color: new Color(112, 201, 255) },
        ],
      },
      outlineColor: Color.black,
      outlineWidth: 0.12,
      shadowColor: Color.black,
      shadowAlpha: 0.6,
      shadowOffsetX: 2,
      shadowOffsetY: 2,
    }).setPosition(32, 110);
    const bitmap = new BitmapText('SCORE 0042', this.bitmap, {
      scale: 1.5,
      layout: { maxWidth: 720 },
      fillColor: new Color(255, 213, 112),
    }).setPosition(32, 220);

    this.root.addChild(system, web, bitmap);
    this.ui.addChild(new Text('The supplied bitmap atlas is RGBA, so it uses no SDF outline.', { fontSize: 18 }).setPosition(32, 350));
  }
}

const app = new Application({
  scenes: { FontTypesScene },
  canvas: { width: 800, height: 450, mount: document.body, tabIndex: 0 },
  clearColor: new Color(24, 31, 42),
});

await app.start(FontTypesScene);
// #endregion guide:font-types
