// Auto-generated from frame-animation.ts - edit the .ts source, not this file.
import { AnimatedSprite, Application, Asset, Color, FixedResolutionCanvasSizing, Keyboard, Scene, Spritesheet } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
const CHARACTERS = ['beige', 'green', 'pink', 'purple', 'yellow'];
const WALK_FPS = 8;
class FrameAnimationScene extends Scene {
  sprite;
  hud;
  characterIndex = 0;
  playing = true;
  async load() {
    const texture = this.loader.get('image/platformer-characters.png');
    const data = await this.loader.load(Asset.type('json', 'json/platformer-characters.json'));
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
    this.sprite = new AnimatedSprite(texture, clips)
      .setAnchor(0.5)
      .setScale(3)
      .setPosition(this.app.width / 2, this.app.height / 2);
    this.addChild(this.sprite);
    this.sprite.onFrame.add((_clip, frame) => this.updateHud(frame));
    this.hud = mountControls({
      title: 'Sprite Animation',
      controls: [
        { keys: 'Right', action: 'change character' },
        { keys: 'Space', action: 'pause / resume' },
      ],
      hint: 'AnimatedSprite plays named clips from a spritesheet. The scene tree advances it automatically.',
    });
    this.inputs.onTrigger(Keyboard.Space, () => {
      this.playing = !this.playing;
      if (this.playing) {
        this.sprite.resume();
      } else {
        this.sprite.pause();
      }
      this.updateHud(this.sprite.currentFrame);
    });
    this.inputs.onTrigger(Keyboard.Right, () => this.selectCharacter());
    this.sprite.play(CHARACTERS[0]);
  }
  selectCharacter() {
    this.characterIndex = (this.characterIndex + 1) % CHARACTERS.length;
    this.sprite.play(CHARACTERS[this.characterIndex]);
    if (!this.playing) {
      this.sprite.pause();
    }
  }
  updateHud(frame) {
    this.hud.setStatus(`${CHARACTERS[this.characterIndex]} · frame ${frame + 1}/2 · ${this.playing ? 'playing' : 'paused'}`);
  }
  draw(context) {
    context.render(this.root);
  }
  destroy() {
    this.hud.dispose();
    super.destroy();
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
  loader: { basePath: 'assets/' },
});
await app.start(FrameAnimationScene);
