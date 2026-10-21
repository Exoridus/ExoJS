// Auto-generated from frame-animation.ts - edit the .ts source, not this file.
import { AnimatedSprite, Application, Color, FixedResolutionCanvasSizing, Keyboard, Scene, Spritesheet, Text } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
const CHARACTERS = ['beige', 'green', 'pink', 'purple', 'yellow'];
const WALK_FPS = 8;
class FrameAnimationScene extends Scene {
  sprites = [];
  playing = true;
  async load() {
    const texture = this.loader.get(assets.platformerCharactersImage);
    const data = await this.loader.load(assets.platformerCharactersAtlas);
    const sheet = new Spritesheet(texture, data);
    const clips = Object.fromEntries(
      CHARACTERS.map(character => [
        character,
        {
          frames: ['a', 'b'].map(frame => sheet.getFrame(`character_${character}_walk_${frame}`)),
          fps: WALK_FPS,
        },
      ]),
    );
    CHARACTERS.forEach((character, index) => {
      const x = (this.app.width * (index + 0.5)) / CHARACTERS.length;
      const sprite = new AnimatedSprite(texture, clips)
        .setAnchor(0.5)
        .setScale(3)
        .setPosition(x, this.app.height / 2);
      const label = new Text(character, { fillColor: Color.white, fontSize: 22, align: 'center' })
        .setAnchor(0.5, 0)
        .setPosition(x, this.app.height / 2 + 90);
      this.addChild(sprite);
      this.addChild(label);
      sprite.play(character);
      this.sprites.push(sprite);
    });
    this.inputs.onTrigger(Keyboard.Space, () => {
      this.playing = !this.playing;
      for (const sprite of this.sprites) {
        if (this.playing) {
          sprite.resume();
        } else {
          sprite.pause();
        }
      }
    });
  }
}
const app = new Application({
  scenes: { FrameAnimationScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});
await app.start(FrameAnimationScene);
