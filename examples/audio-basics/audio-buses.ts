import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  getAudioContext,
  Graphics,
  type RenderingContext,
  Scene,
  type Sound,
  Text,
  type Voice,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, slider } from '@examples/runtime';

class AudioBusesScene extends Scene {
  private sfx!: Sound;
  private voices: Voice[] = [];
  private readonly graphics = this.track(new Graphics());
  private readonly labels = ['Master', 'Music', 'Sound'].map(name =>
    this.track(new Text(name, { fillColor: new Color(236, 239, 242), align: 'center' })).setAnchor(0.5),
  );
  private panel!: ReturnType<
    typeof demoPanel<{ master: ReturnType<typeof slider>; music: ReturnType<typeof slider>; sound: ReturnType<typeof slider> }>
  >;
  private initial = { master: 1, music: 1, sound: 1 };
  private alive = true;
  private playbackEpoch = 0;
  private failure = '';

  override init(): void {
    const audio = this.app.audio;
    this.sfx = this.loader.get(assets.soundUiClick);
    this.initial = { master: audio.master.volume, music: audio.music.volume, sound: audio.sound.volume };
    this.panel = demoPanel({
      layout: 'bar',
      title: 'Mix Music and Effects',
      hint: 'Master scales both child buses. Sound plays an available effect; M1 music is missing.',
      controls: {
        master: slider('Master', { min: 0, max: 1, step: 0.01, value: this.initial.master }),
        music: slider('Music', { min: 0, max: 1, step: 0.01, value: this.initial.music }),
        sound: slider('Sound', { min: 0, max: 1, step: 0.01, value: this.initial.sound }),
      },
      actions: {
        'Play SFX': () => void this.play(),
        Stop: () => this.stop(),
        Reset: () => {
          this.stop();

          for (const key of ['master', 'music', 'sound'] as const) {
            this.panel.set(key, this.initial[key]);
          }
        },
      },
      onChange: (key, value) => {
        audio[key].volume = value;
      },
    });
  }

  private async play(): Promise<void> {
    const epoch = this.playbackEpoch;

    try {
      await getAudioContext().resume();

      if (!this.alive || epoch !== this.playbackEpoch) {
        return;
      }

      await this.sfx.loaded;

      if (!this.alive || epoch !== this.playbackEpoch) {
        return;
      }

      if (!this.sfx.ready) {
        this.failure = 'SFX media unavailable';

        return;
      }

      this.voices = this.voices.filter(voice => !voice.ended);
      this.voices.push(this.app.audio.play(this.sfx, { bus: this.app.audio.sound, volume: 0.35 }));
      this.failure = '';
    } catch {
      this.failure = this.sfx.state === 'failed' ? 'SFX media failed to load' : 'AudioContext could not start. Try Play SFX again.';
    }
  }

  private stop(): void {
    this.playbackEpoch++;
    this.voices.forEach(voice => voice.stop());
    this.voices = [];
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
      g.fillColor = key === 'music' ? new Color(168, 175, 181) : new Color(136, 233, 126);
      g.drawRectangle(x - 24 * scale, base - height * values[key], 48 * scale, height * values[key]);
      const label = this.labels[index]!;
      label.style.fontSize = 14 * scale;
      label.text = `${key}\n${Math.round(values[key] * 100)}%${key === 'music' ? '\nM1 missing' : '\ngain'}`;
      label.setPosition(x, Math.max(28 * scale, base - height - 35 * scale));
      context.render(label);
    }

    context.render(g);
    this.panel.status(
      this.failure ||
        `BLOCKED: M1 music missing | ${this.app.audio.locked ? 'Click to enable audio' : 'AudioContext running'} | ${this.sfx.ready ? 'SFX ready' : this.sfx.state === 'failed' ? 'SFX media failed' : 'SFX loading'} | sound path gain ${(values.master * values.sound).toFixed(2)}`,
      this.failure ? 'error' : 'warning',
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
await app.start(AudioBusesScene);
