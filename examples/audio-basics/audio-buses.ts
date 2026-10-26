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
  type Sound,
  Text,
  type Voice,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, slider, startExample, toggle } from '@examples/runtime';

const PADS = [
  { name: 'Coin', asset: assets.soundCoin, key: Keyboard.One },
  { name: 'Laser', asset: assets.soundLaser, key: Keyboard.Two },
  { name: 'Bell', asset: assets.soundImpactBellHeavy, key: Keyboard.Three },
];

class AudioBusesScene extends Scene {
  private sounds: Sound[] = [];
  private music!: AudioStream;
  private musicVoice: (Voice & Pausable) | null = null;
  private voices: Voice[] = [];
  private readonly graphics = this.track(new Graphics());
  private readonly labels = ['Master', 'Music', 'Sound'].map(name =>
    this.track(new Text(name, { fillColor: new Color(236, 239, 242), align: 'center' })).setAnchor(0.5),
  );
  private panel!: ReturnType<
    typeof demoPanel<{
      master: ReturnType<typeof slider>;
      music: ReturnType<typeof slider>;
      sound: ReturnType<typeof slider>;
      bed: ReturnType<typeof toggle>;
    }>
  >;
  private initial = { master: 1, music: 1, sound: 1 };
  private alive = true;
  private playbackEpoch = 0;
  private failure = '';
  private last = 'none';

  override async load(): Promise<void> {
    this.music = await this.loader.load(assets.musicLofiRhodes);
  }

  override init(): void {
    const audio = this.app.audio;
    this.sounds = PADS.map(pad => this.loader.get(pad.asset));
    this.initial = { master: audio.master.volume, music: audio.music.volume, sound: audio.sound.volume };
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls: {
        master: slider('Master', { min: 0, max: 1, step: 0.01, value: this.initial.master }),
        music: slider('Music', { min: 0, max: 1, step: 0.01, value: 0.7 }),
        sound: slider('Effects', { min: 0, max: 1, step: 0.01, value: 0.7 }),
        bed: toggle('Music', true),
      },
      actions: {
        '1 Coin': () => void this.play(0),
        '2 Laser': () => void this.play(1),
        '3 Bell': () => void this.play(2),
      },
      onChange: (key, _value, values) => {
        if (key !== 'bed') {
          audio.master.volume = values.master;
          audio.music.volume = values.music;
          audio.sound.volume = values.sound;
        } else if (values.bed) {
          // A stream voice defers its own start to the unlock gesture.
          this.musicVoice ??= audio.play(this.music, { bus: audio.music, loop: true, volume: 0.4 });
        } else {
          this.musicVoice?.stop();
          this.musicVoice = null;
        }
      },
    });
    PADS.forEach((pad, index) => this.inputs.onTrigger(pad.key, () => void this.play(index)));
    this.inputs.onTrigger(Keyboard.Escape, () => this.stop());
  }

  private async play(index: number): Promise<void> {
    const epoch = this.playbackEpoch;

    try {
      // Sounds played while locked are skipped, and the unlock this gesture starts settles asynchronously.
      await new Promise<void>(resolve => this.app.audio.onUnlock.add(() => resolve()));

      if (!this.alive || epoch !== this.playbackEpoch) {
        return;
      }

      const sound = this.sounds[index]!;
      await sound.loaded;

      if (!this.alive || epoch !== this.playbackEpoch) {
        return;
      }

      if (!sound.ready) {
        this.failure = 'SFX media unavailable';

        return;
      }

      this.voices = this.voices.filter(voice => !voice.ended);
      this.voices.push(this.app.audio.play(sound, { bus: this.app.audio.sound, volume: 0.35 }));
      this.last = PADS[index]!.name;
      this.failure = '';
    } catch {
      this.failure = 'SFX media failed to load';
    }
  }

  private stop(): void {
    this.playbackEpoch++;
    this.voices.forEach(voice => voice.stop());
    this.voices = [];
    this.panel?.set('bed', false);
  }

  override draw(context: RenderingContext): void {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    const g = this.graphics.clear(),
      base = contentHeight * 0.8 * scale,
      height = contentHeight * 0.42 * scale;
    const values = this.panel.values;

    for (const [index, key] of (['master', 'music', 'sound'] as const).entries()) {
      const x = ((width * (index + 1)) / 4) * scale;
      g.fillColor = new Color(25, 31, 36);
      g.drawRectangle(x - 24 * scale, base - height, 48 * scale, height);
      g.fillColor = new Color(136, 233, 126);
      g.drawRectangle(x - 24 * scale, base - height * values[key], 48 * scale, height * values[key]);
      const label = this.labels[index]!;
      label.style.fontSize = 14 * scale;
      label.text = `${key}\n${Math.round(values[key] * 100)}%\ngain`;
      label.setPosition(x, Math.max(28 * scale, base - height - 35 * scale));
      context.render(label);
    }

    context.render(g);
    this.panel.status(
      this.failure ||
        `${this.app.audio.locked ? 'Click to start audio' : this.musicVoice && !this.musicVoice.ended ? (this.musicVoice.paused ? 'Music starting' : 'Music playing') : 'Music stopped'} | ${this.voices.reduce((count, voice) => count + Number(!voice.ended), 0)} active effects | Last: ${this.last} | Music gain ${(values.master * values.music).toFixed(2)} | Effects gain ${(values.master * values.sound).toFixed(2)}`,
      this.failure ? 'error' : 'neutral',
    );
  }

  override destroy(): void {
    this.alive = false;
    this.stop();

    for (const key of ['master', 'music', 'sound'] as const) {
      this.app.audio[key].volume = this.initial[key];
    }

    this.panel?.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { AudioBusesScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 16, 20),
});
await startExample(app, () => app.start(AudioBusesScene));
