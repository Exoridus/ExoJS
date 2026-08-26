import { Asset, AudioStream, Color, Graphics, type RenderingContext, Scene, Sprite, Text, Texture, View, type Voice } from '@codexo/exojs';

// #region guide:cinematic-scene
const TITLE = 'VOID EMPEROR';

class CinematicScene extends Scene {
  private bossTexture!: Texture;
  private trackStream!: AudioStream;
  private view!: View;
  private boss!: Sprite;
  private musicVoice!: Voice;
  private barSize!: { v: number };
  private bars!: Graphics;
  private titleState!: { count: number };
  private titleText!: Text;

  override async load(): Promise<void> {
    // AudioStream has no bare-path form, so use `Asset.type(...)` - and since
    // `get(Asset.type('music', ...))` isn't supported, keep the loaded
    // instances as direct references instead of looking them up later.
    [this.bossTexture, this.trackStream] = await Promise.all([this.loader.load('image/boss.png'), this.loader.load(Asset.type('music', 'audio/track.ogg'))]);
  }

  override init(): void {
    // Background - the engine clears to this before every `draw`.
    this.app.clearColor.set(16, 16, 24);

    // Camera - pans from title position to boss reveal
    this.view = new View(220, 300, 800, 600);

    // Boss - starts small, scales up during the pan
    this.boss = new Sprite(this.bossTexture)
      .setAnchor(0.5)
      .setScale(0.4)
      .setPosition(560, 320)
      .setTint(new Color(255, 130, 130));

    // Music - start quiet, fade in over the sequence. Keep the Voice to tween.
    this.musicVoice = this.app.audio.play(this.trackStream, { loop: true, volume: 0.2 });

    // Shutter bars - open at the very start
    this.barSize = { v: 0 };
    this.bars = new Graphics();
    this.app.tweens.create(this.barSize).to({ v: 70 }, 0.6).start();

    // Camera pan - 2 seconds, starts immediately
    this.app.tweens.create(this.view.center).to({ x: 520, y: 300 }, 2.0).start();

    // Boss scale-in - 1.8 seconds, starts after 1.1s delay
    this.app.tweens.create(this.boss.scale).to({ x: 2.1, y: 2.1 }, 1.8).delay(1.1).start();

    // Title reveal - 1 second, starts after 1.6s delay
    this.titleState = { count: 0 };
    this.titleText = new Text('', { fillColor: Color.white, fontSize: 56 });
    this.titleText.setPosition(150, 120);

    this.app.tweens
      .create(this.titleState)
      .to({ count: TITLE.length }, 1.0)
      .delay(1.6)
      .onUpdate(() => {
        this.titleText.text = TITLE.slice(0, this.titleState.count | 0);
      })
      .start();

    // Music fade - the Voice's volume is a plain get/set, so tween it directly.
    this.app.tweens.create(this.musicVoice).to({ volume: 0.85 }, 2.0).start();
  }

  override draw(context: RenderingContext): void {
    context.render(this.boss, { view: this.view });

    context.render(this.titleText);

    // Screen-space shutter bars
    this.bars.clear();
    this.bars.fillColor = Color.black;
    this.bars.drawRectangle(0, 0, 800, this.barSize.v);
    this.bars.drawRectangle(0, 600 - this.barSize.v, 800, this.barSize.v);
    context.render(this.bars);
  }
}
// #endregion guide:cinematic-scene

export { CinematicScene };
