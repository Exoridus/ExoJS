import {
  AnimatedSprite,
  Application,
  Asset,
  Color,
  FixedResolutionCanvasSizing,
  Keyboard,
  type RenderingContext,
  Scene,
  Spritesheet,
  type SpritesheetData,
} from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

const CHARACTERS = ['beige', 'green', 'pink', 'purple', 'yellow'] as const;
const WALK_FPS = 8;

class FrameAnimationScene extends Scene {
  private sprite!: AnimatedSprite;
  private hud!: ReturnType<typeof mountControls>;
  private characterIndex = 0;
  private playing = true;

  override async load(): Promise<void> {
    const texture = this.loader.get('image/platformer-characters.png');
    const data = (await this.loader.load(Asset.type('json', 'json/platformer-characters.json'))) as SpritesheetData;
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

  private selectCharacter(): void {
    this.characterIndex = (this.characterIndex + 1) % CHARACTERS.length;
    this.sprite.play(CHARACTERS[this.characterIndex]);
    if (!this.playing) {
      this.sprite.pause();
    }
  }

  private updateHud(frame: number): void {
    this.hud.setStatus(`${CHARACTERS[this.characterIndex]} · frame ${frame + 1}/2 · ${this.playing ? 'playing' : 'paused'}`);
  }

  override draw(context: RenderingContext): void {
    context.render(this.root);
  }

  override destroy(): void {
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
