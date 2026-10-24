// Auto-generated from reverb-and-delay.ts - edit the .ts source, not this file.
import { Application, AudioBus, Color, FixedResolutionCanvasSizing, getAudioContext, Graphics, Scene, Text } from '@codexo/exojs';
import { AudioAnalyser, DelayEffect, ReverbEffect } from '@codexo/exojs/audio-fx';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { choice, demoPanel, toggle } from '@examples/runtime';
const PRESETS = {
  Dry: { duration: 0.2, wet: 0, delay: 0, feedback: 0 },
  'Small room': { duration: 0.55, wet: 0.22, delay: 0, feedback: 0 },
  Hall: { duration: 2.6, wet: 0.35, delay: 0, feedback: 0 },
  Echo: { duration: 0.2, wet: 0, delay: 0.4, feedback: 0.4 },
};
class ReverbAndDelayScene extends Scene {
  sounds = [];
  voices = [];
  bus;
  reverb;
  delay;
  analyser;
  graphics = this.track(new Graphics());
  label = this.track(new Text('', { fillColor: new Color(236, 239, 242), align: 'center' })).setAnchor(0.5);
  panel;
  alive = true;
  playbackEpoch = 0;
  failure = '';
  peak = 0;
  rms = 0;
  init() {
    this.sounds = [this.loader.get(assets.soundImpactWood), this.loader.get(assets.voiceMissionComplete)];
    this.bus = new AudioBus('effect-comparison', { parent: this.app.audio.sound });
    this.app.audio.registerBus(this.bus);
    this.reverb = new ReverbEffect({ durationSeconds: 0.2, wet: 0 });
    this.delay = new DelayEffect({ wet: 0, delaySeconds: 0.36, feedback: 0 });
    this.bus.addEffect(this.reverb).addEffect(this.delay);
    this.analyser = new AudioAnalyser({ source: this.bus, smoothingTimeConstant: 0 });
    this.panel = demoPanel({
      layout: 'bar',
      title: 'Hear an Audio Effect',
      hint: 'Compare the same short sound. Bypass keeps the source level unchanged.',
      controls: {
        source: choice('Source', ['Wood impact', 'Short voice']),
        preset: choice('Space', Object.keys(PRESETS)),
        bypass: toggle('Bypass', false),
      },
      actions: {
        Play: () => void this.play(),
        Stop: () => this.stop(),
        Reset: () => {
          this.stop();
          this.panel.set('source', 'Wood impact');
          this.panel.set('preset', 'Dry');
          this.panel.set('bypass', false);
        },
      },
      onChange: (_key, _value, values) => this.applyPreset(values.preset, values.bypass),
    });
  }
  applyPreset(name, bypass) {
    this.stop();
    const preset = PRESETS[name];
    this.reverb.durationSeconds = preset.duration;
    this.reverb.wet = bypass ? 0 : preset.wet;
    this.delay.wet = bypass ? 0 : preset.delay;
    this.delay.feedback = preset.feedback;
  }
  async play() {
    const epoch = this.playbackEpoch;
    try {
      await getAudioContext().resume();
      if (!this.alive || epoch !== this.playbackEpoch) {
        return;
      }
      const sound = this.sounds[this.panel.values.source === 'Wood impact' ? 0 : 1];
      await sound.loaded;
      if (!this.alive || epoch !== this.playbackEpoch) {
        return;
      }
      if (!sound.ready) {
        this.failure = 'Source unavailable: media has not loaded';
        return;
      }
      this.voices = this.voices.filter(voice => !voice.ended);
      this.bus.muted = false;
      this.voices.push(this.app.audio.play(sound, { bus: this.bus, volume: 0.32 }));
      this.failure = '';
    } catch {
      this.failure = this.sounds.some(sound => sound.state === 'failed')
        ? 'Source media failed to load. Try another source.'
        : 'AudioContext could not start. Try Play again.';
    }
  }
  stop() {
    this.playbackEpoch++;
    this.bus.muted = true;
    this.voices.forEach(voice => voice.stop());
    this.voices = [];
  }
  draw(context) {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas);
    let sum = 0;
    this.peak = 0;
    const samples = this.analyser.getWaveformFloat();
    for (const sample of samples) {
      sum += sample * sample;
      this.peak = Math.max(this.peak, Math.abs(sample));
    }
    this.rms = Math.sqrt(sum / samples.length);
    const x = width * 0.15 * scale,
      y = contentHeight * 0.55 * scale,
      w = width * 0.7 * scale;
    this.graphics.clear();
    this.graphics.fillColor = new Color(25, 31, 36);
    this.graphics.drawRectangle(x, y, w, 20 * scale);
    this.graphics.fillColor = new Color(101, 210, 210);
    this.graphics.drawRectangle(x, y, w * Math.min(1, this.rms * 4), 20 * scale);
    this.label.text = `${this.panel.values.source} -> ${this.panel.values.bypass ? 'Bypass (dry)' : this.panel.values.preset}\nOutput RMS (relative) ${this.rms.toFixed(3)} | peak ${this.peak.toFixed(3)}`;
    this.label.style.fontSize = 16 * scale;
    this.label.setPosition((width * scale) / 2, y - 38 * scale);
    context.render(this.graphics);
    context.render(this.label);
    this.panel.status(
      this.failure ||
        `${this.app.audio.locked ? 'Click to enable audio' : 'AudioContext running'} | ${this.sounds.every(sound => sound.ready) ? 'Sources ready' : this.sounds.some(sound => sound.state === 'failed') ? 'Media failed' : 'Media loading'} | fixed source gain 0.32 | Stop mutes input and tails`,
      this.failure ? 'error' : 'neutral',
    );
  }
  destroy() {
    this.alive = false;
    this.stop();
    this.analyser?.destroy();
    this.bus?.removeEffect(this.delay).removeEffect(this.reverb);
    this.delay?.destroy();
    this.reverb?.destroy();
    this.app.audio.unregisterBus(this.bus);
    this.panel?.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { ReverbAndDelayScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 16, 20),
});
await app.start(ReverbAndDelayScene);
