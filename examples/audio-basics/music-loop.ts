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
  Text,
  Time,
  type Voice,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, slider, startExample } from '@examples/runtime';

type MusicVoice = Voice & Seekable & Pausable;
const controls = {
  mix: slider('Crossfade A / B', { min: 0, max: 1, step: 0.01, value: 0, format: value => `${Math.round(value * 100)}% B` }),
  volume: slider('Volume', { min: 0, max: 0.7, step: 0.01, value: 0.4 }),
};

class MusicLoopScene extends Scene {
  private tracks: AudioStream[] = [];
  private voices: MusicVoice[] = [];
  private playing = false;
  private readonly graphics = this.track(new Graphics());
  private readonly labels = ['A: Lo-Fi Rhodes', 'B: Arcade Chiptune'].map(name =>
    this.track(new Text(name, { fillColor: Color.white, align: 'center' })).setAnchor(0.5),
  );
  private panel!: ReturnType<typeof demoPanel<typeof controls>>;

  override async load(): Promise<void> {
    this.tracks = await Promise.all([this.loader.load(assets.musicLofiRhodes), this.loader.load(assets.musicArcadeChiptune)]);
  }

  override init(): void {
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls,
      actions: { 'Play / Pause': () => this.togglePause(), Stop: () => this.stop() },
      onChange: (_key, _value, values) => this.applyMix(values),
    });
    this.inputs.onTrigger(Keyboard.Space, () => this.togglePause());
  }

  private togglePause(): void {
    if (this.voices.length === 0) {
      const { mix, volume } = this.panel.values;
      this.voices = this.tracks.map((track, index) =>
        this.app.audio.play(track, { bus: this.app.audio.music, loop: true, volume: volume * (index === 0 ? 1 - mix : mix) }),
      );
      this.playing = true;

      return;
    }

    this.playing = !this.playing;

    for (const voice of this.voices) {
      if (this.playing) {
        voice.resume();
      } else {
        voice.pause();
      }
    }
  }

  private applyMix({ mix, volume }: { mix: number; volume: number }): void {
    this.voices.forEach((voice, index) => voice.fade(volume * (index === 0 ? 1 - mix : mix), Time.seconds(0.03)));
  }

  private stop(): void {
    this.voices.forEach(voice => voice.stop());
    this.voices = [];
    this.playing = false;
  }

  override draw(context: RenderingContext): void {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    const { mix, volume } = this.panel.values;
    const g = this.graphics.clear();
    const top = contentHeight * 0.28 * scale;
    const height = contentHeight * 0.5 * scale;

    for (let index = 0; index < 2; index++) {
      const share = index === 0 ? 1 - mix : mix;
      const x = width * (index === 0 ? 0.32 : 0.68) * scale;
      g.fillColor = new Color(35, 48, 59);
      g.drawRectangle(x - 34 * scale, top, 68 * scale, height);
      g.fillColor = index === 0 ? new Color(101, 210, 210) : new Color(240, 177, 105);
      g.drawRectangle(x - 34 * scale, top + height * (1 - share), 68 * scale, height * share);
      const label = this.labels[index]!;
      label.style.fontSize = 16 * scale;
      const voice = this.voices[index];
      label.text = `${index === 0 ? 'A: Lo-Fi Rhodes' : 'B: Arcade Chiptune'}\n${Math.round(share * 100)}% mix | gain ${(volume * share).toFixed(2)}\n${(voice?.time ?? 0).toFixed(1)} s`;
      label.setPosition(x, top - 50 * scale);
      context.render(label);
    }

    context.render(g);
    const state = !this.voices.length
      ? 'Stopped'
      : !this.playing
        ? 'Paused'
        : this.app.audio.locked
          ? 'Waiting for audio unlock'
          : this.voices.some(voice => voice.paused)
            ? 'Starting streams'
            : 'Playing';
    this.panel.actions['Play / Pause']!.label = this.playing ? 'Pause' : 'Play';
    this.panel.actions.Stop!.enabled = this.voices.length > 0;
    this.panel.status(`${state} | Drag Crossfade from A to B; both streams keep their playhead`);
  }

  override destroy(): void {
    this.stop();
    this.panel?.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { MusicLoopScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 16, 20),
});
await startExample(app, () => app.start(MusicLoopScene));
