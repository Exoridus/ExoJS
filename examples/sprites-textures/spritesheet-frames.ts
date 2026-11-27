import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  type RenderingContext,
  Scene,
  type Seconds,
  Spritesheet,
  type SpritesheetData,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, mountControls, slider, toggle } from '@examples/runtime';

const CHARACTERS = ['beige', 'green', 'pink', 'purple', 'yellow'];

class SpritesheetFramesScene extends Scene {
  private spritesheet!: Spritesheet;
  private character = CHARACTERS[0];
  private frameIndex = 0;
  private fps = 8;
  private elapsed = 0;
  private playing = true;
  private hud!: ReturnType<typeof mountControls>;

  override async load(): Promise<void> {
    const app = this.app;
    const { width, height } = app;
    const texture = this.loader.get(assets.platformerCharactersImage);
    const data = (await this.loader.load(assets.platformerCharactersAtlas)) as SpritesheetData;

    this.spritesheet = new Spritesheet(texture, data);

    // The spritesheet caches one Sprite per named frame; configure them all
    // once so any frame we draw is centred and scaled up for visibility.
    for (const sprite of this.spritesheet.sprites.values()) {
      sprite.setAnchor(0.5);
      sprite.setPosition(width / 2, height / 2);
      sprite.setScale(3);
    }

    this.hud = mountControls({
      title: 'Spritesheet Frames',
      controls: [{ keys: 'Right-click', action: 'next character' }],
      hint: 'A two-frame walk cycle stepped on a timer from named spritesheet frames.',
    });

    demoPanel({
      scene: this,
      title: 'Animation',
      controls: {
        fps: slider('Speed (fps)', { min: 1, max: 16, step: 1, value: this.fps }),
        playing: toggle('Playing', true),
      },
      onChange: (_key, _value, values) => {
        this.fps = values.fps;
        this.playing = values.playing;
      },
    });

    app.input.onContextMenu.add(() => {
      const index = (CHARACTERS.indexOf(this.character) + 1) % CHARACTERS.length;

      this.character = CHARACTERS[index]!;
      this.frameIndex = 0;
      this.updateHud();
    });

    this.updateHud();
  }

  private walkFrames(): string[] {
    return [`character_${this.character}_walk_a`, `character_${this.character}_walk_b`];
  }

  private updateHud(): void {
    const frames = this.walkFrames();

    this.hud.setStatus(`Frame: ${frames[this.frameIndex]}  (${this.frameIndex + 1}/${frames.length})`);
  }

  override update(delta: Seconds): void {
    if (!this.playing) {
      return;
    }

    this.elapsed += delta;

    const frameDuration = 1 / this.fps;

    while (this.elapsed >= frameDuration) {
      this.elapsed -= frameDuration;
      this.frameIndex = (this.frameIndex + 1) % this.walkFrames().length;
      this.updateHud();
    }
  }

  override draw(context: RenderingContext): void {
    context.render(this.spritesheet.getFrameSprite(this.walkFrames()[this.frameIndex]));
  }
}

const app = new Application({
  scenes: { SpritesheetFramesScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(24, 28, 38),
});

await app.start(SpritesheetFramesScene);
