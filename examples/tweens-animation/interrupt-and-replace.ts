import { Application, Color, FixedResolutionCanvasSizing, Scene, Sprite, type Tween } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';

class InterruptAndReplaceScene extends Scene {
  private sprite!: Sprite;
  private moveTween: Tween | null = null;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.sprite = new Sprite(assets.ship.source).setAnchor(0.5).setPosition(width / 2, height / 2);
    this.root.addChild(this.sprite);
    app.input.onPointerTap.add(pointer => {
      if (this.moveTween !== null) {
        this.moveTween.stop();
      }

      this.moveTween = app.tweens.create(this.sprite.position).to({ x: pointer.x, y: pointer.y }, 0.35).start();
    });
  }
}

const app = new Application({
  scenes: { InterruptAndReplaceScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});

await app.start(InterruptAndReplaceScene);
