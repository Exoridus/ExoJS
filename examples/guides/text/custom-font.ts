import { Asset, Color, Container, Panel, Scene, Text } from '@codexo/exojs';

class FontFamilyScene extends Scene {
  private title!: Text;

  // #region guide:font-by-family
  override async load(): Promise<void> {
    await this.loader.load(Asset.type('font', 'font/MyFont.woff2', { family: 'MyFont' }));
  }

  override init(): void {
    this.title = new Text('Custom Font', {
      fontFamily: 'MyFont',
      fontSize: 48,
      fillColor: Color.white,
    });
  }
  // #endregion guide:font-by-family
}

class FontFaceScene extends Scene {
  private title!: Text;

  // #region guide:font-by-face
  override async load(): Promise<void> {
    const face = await this.loader.load(Asset.type('font', 'font/MyFont.woff2', { family: 'MyFont' }));

    this.title = new Text('Custom Font', { font: face, fontSize: 48 });
  }
  // #endregion guide:font-by-face
}

class HudScene extends Scene {
  private hud = new Container();
  private scoreLabel!: Text;
  private label!: Text;
  private backdrop!: Panel;

  private buildHud(): void {
    // #region guide:hud-label
    this.hud = new Container();
    this.scoreLabel = new Text('Score: 0', { fillColor: Color.white, fontSize: 24 });
    this.scoreLabel.setPosition(10, 10);
    this.hud.addChild(this.scoreLabel);
    this.addChild(this.hud);
    // #endregion guide:hud-label
  }

  private buildBackdrop(): void {
    // #region guide:text-bounds
    this.label = new Text('Ready', { fontSize: 24 });

    this.backdrop = new Panel({
      width: this.label.textBounds.width + 16,
      height: this.label.textBounds.height + 8,
    });
    // #endregion guide:text-bounds
  }
}

export { FontFaceScene, FontFamilyScene, HudScene };
