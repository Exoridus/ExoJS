// Auto-generated from music-loop.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Keyboard, Scene, Text } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, slider, startExample, toggle } from '@examples/runtime';
const DEFAULTS = { volume: 0.5, rate: 1, loop: true };
class MusicLoopScene extends Scene {
  music;
  voice = null;
  graphics = this.track(new Graphics());
  label = this.track(new Text('', { fillColor: new Color(236, 239, 242), align: 'center' })).setAnchor(0.5);
  panel;
  async load() {
    // Music has no placeholder handle, so it is awaited rather than claimed with `get()`.
    this.music = await this.loader.load(assets.musicAtmosphericSynth);
  }
  init() {
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      title: 'Control Music Playback',
      hint: 'Stream one music track. Space pauses and resumes; Restart seeks back to 0 s.',
      controls: {
        volume: slider('Volume', { min: 0, max: 1, step: 0.01, value: DEFAULTS.volume }),
        rate: slider('Playback rate', { min: 0.5, max: 2, step: 0.05, value: DEFAULTS.rate, format: v => `${Math.round(v * 100)}%` }),
        loop: toggle('Loop', DEFAULTS.loop),
      },
      actions: {
        'Play / Pause': () => this.togglePause(),
        Restart: () => {
          const voice = this.voice ?? this.play();
          voice.seek(0);
          voice.resume();
        },
        Reset: () => {
          this.stop();
          this.panel.set('volume', DEFAULTS.volume);
          this.panel.set('rate', DEFAULTS.rate);
          this.panel.set('loop', DEFAULTS.loop);
        },
      },
      onChange: (key, _value, values) => {
        if (!this.voice) {
          return;
        }
        this.voice.volume = values.volume;
        this.voice.playbackRate = values.rate;
        this.voice.loop = values.loop;
        // Re-enabling the loop after the track ran off its end restarts it.
        if (key === 'loop' && values.loop && this.voice.ended) {
          this.voice.seek(0);
          this.voice.resume();
        }
      },
    });
    this.inputs.onTrigger(Keyboard.Space, () => this.togglePause());
  }
  // A stream voice defers its own start to the unlock gesture, so no unlock wait is needed here.
  play() {
    const { volume, rate, loop } = this.panel.values;
    this.voice = this.app.audio.play(this.music, { bus: this.app.audio.music, volume, playbackRate: rate, loop });
    return this.voice;
  }
  togglePause() {
    if (!this.voice) {
      this.play();
    } else if (this.voice.ended) {
      this.voice.seek(0);
      this.voice.resume();
    } else if (this.voice.paused) {
      this.voice.resume();
    } else {
      this.voice.pause();
    }
  }
  stop() {
    this.voice?.stop();
    this.voice = null;
  }
  draw(context) {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas);
    const voice = this.voice,
      time = voice?.time ?? 0,
      duration = voice?.duration ?? Number.NaN;
    // The duration is NaN until the media element has loaded its metadata.
    const hasDuration = Number.isFinite(duration) && duration > 0;
    const progress = hasDuration ? Math.max(0, Math.min(1, time / duration)) : 0;
    const state = !voice ? 'Stopped' : voice.ended ? 'Ended' : voice.paused ? 'Paused' : 'Playing';
    const x = width * 0.15 * scale,
      y = contentHeight * 0.55 * scale,
      w = width * 0.7 * scale;
    const g = this.graphics.clear();
    g.fillColor = new Color(25, 31, 36);
    g.drawRectangle(x, y, w, 24 * scale);
    g.fillColor = state === 'Playing' ? new Color(101, 210, 210) : new Color(168, 175, 181);
    g.drawRectangle(x, y, w * progress, 24 * scale);
    this.label.style.fontSize = 16 * scale;
    this.label.text = `${state}   ${time.toFixed(1)}${hasDuration ? ` / ${duration.toFixed(1)}` : ''} s`;
    this.label.setPosition((width * scale) / 2, y - 30 * scale);
    context.render(g);
    context.render(this.label);
    const { rate, loop } = this.panel.values;
    this.panel.status(
      `${this.app.audio.locked ? 'Click to enable audio' : 'AudioContext running'} | ${state} | ${Math.round(rate * 100)}% rate | Loop ${loop ? 'on' : 'off'}`,
    );
  }
  destroy() {
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
