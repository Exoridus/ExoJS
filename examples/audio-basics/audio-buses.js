// Auto-generated from audio-buses.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Scene, Text } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, slider, startExample, toggle } from '@examples/runtime';
class AudioBusesScene extends Scene {
  sfx;
  music;
  musicVoice = null;
  voices = [];
  graphics = this.track(new Graphics());
  labels = ['Master', 'Music', 'Sound'].map(name =>
    this.track(new Text(name, { fillColor: new Color(236, 239, 242), align: 'center' })).setAnchor(0.5),
  );
  panel;
  initial = { master: 1, music: 1, sound: 1 };
  alive = true;
  playbackEpoch = 0;
  failure = '';
  async load() {
    this.music = await this.loader.load(assets.musicLoopMain);
  }
  init() {
    const audio = this.app.audio;
    this.sfx = this.loader.get(assets.soundUiClick);
    this.initial = { master: audio.master.volume, music: audio.music.volume, sound: audio.sound.volume };
    this.panel = demoPanel({
      layout: 'bar',
      title: 'Mix Music and Effects',
      hint: 'Master scales both child buses. Start the music bed, then fire effects over it.',
      controls: {
        master: slider('Master', { min: 0, max: 1, step: 0.01, value: this.initial.master }),
        music: slider('Music', { min: 0, max: 1, step: 0.01, value: this.initial.music }),
        sound: slider('Sound', { min: 0, max: 1, step: 0.01, value: this.initial.sound }),
        bed: toggle('Music bed', false),
      },
      actions: {
        'Play SFX': () => void this.play(),
        Stop: () => this.stop(),
        Reset: () => {
          this.stop();
          for (const key of ['master', 'music', 'sound']) {
            this.panel.set(key, this.initial[key]);
          }
        },
      },
      onChange: (key, _value, values) => {
        if (key !== 'bed') {
          audio.master.volume = values.master;
          audio.music.volume = values.music;
          audio.sound.volume = values.sound;
        } else if (values.bed) {
          // A stream voice defers its own start to the unlock gesture.
          this.musicVoice ??= audio.play(this.music, { bus: audio.music, loop: true, volume: 0.5 });
        } else {
          this.musicVoice?.stop();
          this.musicVoice = null;
        }
      },
    });
  }
  async play() {
    const epoch = this.playbackEpoch;
    try {
      // Sounds played while locked are skipped, and the unlock this gesture starts settles asynchronously.
      await new Promise(resolve => this.app.audio.onUnlock.add(() => resolve()));
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
      this.failure = 'SFX media failed to load';
    }
  }
  stop() {
    this.playbackEpoch++;
    this.voices.forEach(voice => voice.stop());
    this.voices = [];
    this.panel?.set('bed', false);
  }
  draw(context) {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas);
    const g = this.graphics.clear(),
      base = contentHeight * 0.8 * scale,
      height = contentHeight * 0.42 * scale;
    const values = this.panel.values;
    for (const [index, key] of ['master', 'music', 'sound'].entries()) {
      const x = ((width * (index + 1)) / 4) * scale;
      g.fillColor = new Color(25, 31, 36);
      g.drawRectangle(x - 24 * scale, base - height, 48 * scale, height);
      g.fillColor = new Color(136, 233, 126);
      g.drawRectangle(x - 24 * scale, base - height * values[key], 48 * scale, height * values[key]);
      const label = this.labels[index];
      label.style.fontSize = 14 * scale;
      label.text = `${key}\n${Math.round(values[key] * 100)}%\ngain`;
      label.setPosition(x, Math.max(28 * scale, base - height - 35 * scale));
      context.render(label);
    }
    context.render(g);
    this.panel.status(
      this.failure ||
        `${this.app.audio.locked ? 'Click to enable audio' : 'AudioContext running'} | ${this.sfx.ready ? 'SFX ready' : this.sfx.state === 'failed' ? 'SFX media failed' : 'SFX loading'} | music bed ${this.musicVoice ? 'playing' : 'stopped'} | music path gain ${(values.master * values.music).toFixed(2)} | sound path gain ${(values.master * values.sound).toFixed(2)}`,
      this.failure ? 'error' : 'neutral',
    );
  }
  destroy() {
    this.alive = false;
    this.stop();
    for (const key of ['master', 'music', 'sound']) {
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
