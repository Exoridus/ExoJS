// #region guide:sprite-animation
import { AnimatedSprite, Application, Color, Keyboard, Rectangle, Scene, SceneAvailability, Sprite, Text, Texture } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';

class SpriteAnimationScene extends Scene {
  override init(): void {
    const still = new Sprite(assets.spaceShipBlue.source).setAnchor(0.5).setPosition(250, 220);
    const frames = [new Rectangle(258, 258, 128, 128), new Rectangle(387, 258, 128, 128)];
    const animated = new AnimatedSprite(new Texture(assets.platformerCharactersImage.source), {
      walk: { frames, fps: 8 },
    })
      .setAnchor(0.5)
      .setPosition(550, 220)
      .play('walk');

    // Clips own copies. These authored rectangles can be released now.
    for (const frame of frames) {
      frame.destroy();
    }

    this.animations.add(animated, { when: SceneAvailability.Active });
    this.root.addChild(still, animated);
    this.ui.addChild(new Text('Click the canvas, then P to pause or resume.', { fontSize: 20 }).setPosition(24, 24));
    this.inputs.onStart(
      Keyboard.P,
      () => {
        if (this.paused) {
          this.app.scenes.resume();
        } else {
          this.app.scenes.pause();
        }
      },
      { when: SceneAvailability.Always },
    );
  }
}

const app = new Application({
  scenes: { SpriteAnimationScene },
  canvas: { width: 800, height: 450, mount: document.body, tabIndex: 0 },
  clearColor: new Color(24, 31, 42),
});

await app.start(SpriteAnimationScene);
// #endregion guide:sprite-animation
