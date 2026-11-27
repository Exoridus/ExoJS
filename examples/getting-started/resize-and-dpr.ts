import { Application, Color, FixedResolutionCanvasSizing, Scene, Sprite, Text } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';

class ResizeScene extends Scene {
  private sprite!: Sprite;
  private info!: Text;

  override init(): void {
    this.sprite = new Sprite(assets.ship.source);
    this.sprite.setAnchor(0.5);

    this.info = new Text('', { fillColor: Color.white, fontSize: 16 });
    this.info.setAnchor(0.5, 0);
    this.root.addChild(this.sprite, this.info);

    this.layout();
  }

  override update(): void {
    this.layout();
  }

  // #region guide:layout
  private layout(): void {
    const app = this.app;
    const { width, height, canvas, pixelRatio } = app;

    this.sprite.setPosition(width / 2, height / 2);
    this.info.setPosition(width / 2, 12);
    this.info.text = `${width}x${height} logical, ${canvas.width}x${canvas.height} backing @ pixelRatio ${pixelRatio.toFixed(2)}`;
  }
  // #endregion guide:layout
}

// #region guide:app-setup
const app = new Application({
  scenes: { ResizeScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});
// #endregion guide:app-setup

document.body.style.margin = '0';

// #region guide:resize
// This example demonstrates manual resize handling: the canvas is resized to
// fill the window on every `resize` event. (For a hands-off alternative, pass a
// `ResponsiveCanvasSizing` as the `canvas.sizing` option and let it track the
// parent element instead.)
window.addEventListener('resize', () => {
  app.resize(window.innerWidth, window.innerHeight);
});

app.resize(window.innerWidth, window.innerHeight);
// #endregion guide:resize

await app.start(ResizeScene);
