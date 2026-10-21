import {
  Application,
  type AudioStream,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  type Pausable,
  type RenderingContext,
  Scene,
  type Seekable,
  Sprite,
  Text,
  Time,
  View,
  type Voice,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';

const titleText = 'VOID EMPEROR';

class BossIntroCinematicScene extends Scene {
  private view!: View;
  private bg!: Graphics;
  private bars!: Graphics;
  private barSize!: { v: number };
  private title!: Text;
  private titleState!: { count: number };
  private boss!: Sprite;
  private music!: AudioStream;
  private musicVoice!: Voice & Seekable & Pausable;
  private finished = false;
  private tapPrompt!: Text;
  private width = 0;
  private height = 0;
  private readonly sequenceTweens: Array<{ stop(): void }> = [];

  override async load(): Promise<void> {
    const app = this.app;
    const { width, height } = app;
    this.width = width;
    this.height = height;

    // Start the camera left of the boss so the push-in sweeps across to it.
    this.view = new View(width * 0.42, height / 2, width, height);
    this.bg = new Graphics();
    this.bars = new Graphics();
    this.barSize = { v: 0 };
    this.title = new Text('', { fillColor: Color.white, fontSize: 56, fontWeight: 'bold' });
    this.title.setPosition(width * 0.12, height * 0.2);
    this.titleState = { count: 0 };
    this.boss = new Sprite(this.loader.get(assets.ship))
      .setAnchor(0.5)
      .setScale(0.4)
      .setPosition(width * 0.62, height / 2)
      .setTint(new Color(255, 130, 130));
    // Music has no placeholder handle, so it is awaited with `load()`.
    this.music = await this.loader.load(assets.musicLoopMain);

    // Shown while the browser still blocks audio (`app.audio.locked`); the
    // first click or keypress unlocks it and the sting + cinematic start.
    this.tapPrompt = new Text('Click or press any key to start the cinematic', { fillColor: Color.white, fontSize: 22, align: 'center' })
      .setAnchor(0.5, 0.5)
      .setPosition(width / 2, height - 64);

    // Core defers playback until the AudioContext unlocks on the first
    // gesture; start the cinematic in lockstep with the sting on unlock.
    this.musicVoice = app.audio.play(this.music, { loop: true, volume: 0.2 }) as Voice & Seekable & Pausable;
    app.audio.onUnlock.add(this.playSequence);

    this.inputs.onTrigger(Keyboard.R, () => this.replay());
    app.input.onPointerDown.add(this.replay);
  }

  private readonly replay = (): void => {
    const app = this.app;

    if (app.audio.locked) {
      return;
    }

    // Restart the sting from the top so the reveal beat lines up again.
    this.musicVoice.seek(0);
    this.musicVoice.volume = 0.2;

    if (this.musicVoice.paused) {
      this.musicVoice.resume();
    }

    this.playSequence();
  };

  private readonly playSequence = (): void => {
    const { width, height } = this;

    for (const tween of this.sequenceTweens) {
      tween.stop();
    }

    this.sequenceTweens.length = 0;
    this.view.reset(width * 0.42, height / 2, width, height);
    this.view.clearShake();
    this.barSize.v = 0;
    this.titleState.count = 0;
    this.title.text = '';
    this.finished = false;
    this.boss.setScale(0.4);

    // Letterbox bars slam in.
    this.sequenceTweens.push(this.tweens.create(this.barSize).to({ v: 84 }, 0.6).start());
    // Slow camera push-in toward the boss.
    this.sequenceTweens.push(
      this.tweens
        .create(this.view.center)
        .to({ x: width * 0.55, y: height / 2 }, 2)
        .start(),
    );
    // The boss looms larger as the camera arrives.
    this.sequenceTweens.push(this.tweens.create(this.boss.scale).to({ x: 2.1, y: 2.1 }, 1.8).delay(1.1).start());
    // Typewriter title reveal - its onStart IS the reveal beat: punch a shake.
    this.sequenceTweens.push(
      this.tweens
        .create(this.titleState)
        .to({ count: titleText.length }, 1)
        .delay(1.6)
        .onStart(() => {
          this.view.shake(18, Time.seconds(0.52), { frequency: 24, decay: true });
        })
        .onUpdate(() => {
          this.title.text = titleText.slice(0, this.titleState.count | 0);
        })
        .onComplete(() => {
          this.finished = true;
        })
        .start(),
    );
    // Music swells up under the reveal.
    this.sequenceTweens.push(this.tweens.create(this.musicVoice).to({ volume: 0.6 }, 2).start());
  };

  override draw(context: RenderingContext): void {
    const app = this.app;
    const { width, height } = this;

    this.bg.clear();
    this.bg.fillColor = new Color(36, 42, 70);
    // Span well past the view edges so the push-in never reveals a seam.
    this.bg.drawRectangle(-width * 0.25, 0, width * 1.5, height);
    context.render(this.bg, { view: this.view });
    context.render(this.boss, { view: this.view });
    context.render(this.title, { view: context.screenView });
    this.bars.clear();
    this.bars.fillColor = Color.black;
    this.bars.drawRectangle(0, 0, width, this.barSize.v);
    this.bars.drawRectangle(0, height - this.barSize.v, width, this.barSize.v);
    context.render(this.bars, { view: context.screenView });

    // The replay hint appears only once the sequence has played out, so it
    // never competes with the cinematic itself.
    if (app.audio.locked || this.finished) {
      this.tapPrompt.text = app.audio.locked ? 'Click or press any key to start the cinematic' : 'Press R or click to replay';
      context.render(this.tapPrompt, { view: context.screenView });
    }
  }

  override destroy(): void {
    for (const tween of this.sequenceTweens) {
      tween.stop();
    }

    this.app.audio.onUnlock.remove(this.playSequence);
    this.app.input.onPointerDown.remove(this.replay);
    this.musicVoice?.stop();
    super.destroy();
  }
}

const app = new Application({
  scenes: { BossIntroCinematicScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(16, 16, 24),
});

await app.start(BossIntroCinematicScene);
