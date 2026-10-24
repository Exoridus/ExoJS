// Auto-generated from ducking.ts - edit the .ts source, not this file.
import { Application, AudioBus, Color, FixedResolutionCanvasSizing, getAudioContext, Graphics, Scene, Text } from '@codexo/exojs';
import { AudioAnalyser, DuckingEffect } from '@codexo/exojs/audio-fx';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, toggle } from '@examples/runtime';
const VOICE_VOLUME = 0.4;
const THRESHOLD = -30 + 20 * Math.log10(VOICE_VOLUME);
class DuckingScene extends Scene {
  speech;
  speechVoice = null;
  voiceBus;
  musicBus;
  ducking;
  musicLevel;
  voiceLevel;
  graphics = this.track(new Graphics());
  label = this.track(new Text('', { fillColor: new Color(236, 239, 242), align: 'center' })).setAnchor(0.5);
  panel;
  alive = true;
  playbackEpoch = 0;
  failure = '';
  musicRms = 0;
  voiceRms = 0;
  init() {
    const audio = this.app.audio;
    this.speech = this.loader.get(assets.voiceMissionComplete);
    this.voiceBus = new AudioBus('speech-sidechain', { parent: audio.master });
    this.musicBus = new AudioBus('ducked-music', { parent: audio.music });
    audio.registerBus(this.voiceBus).registerBus(this.musicBus);
    this.ducking = new DuckingEffect({ sidechain: this.voiceBus, threshold: THRESHOLD, ratio: 6, attackMs: 25, releaseMs: 260 });
    this.musicBus.addEffect(this.ducking);
    this.musicLevel = new AudioAnalyser({ source: this.musicBus, smoothingTimeConstant: 0 });
    this.voiceLevel = new AudioAnalyser({ source: this.voiceBus, smoothingTimeConstant: 0 });
    this.panel = demoPanel({
      layout: 'bar',
      title: 'Duck Music under Speech',
      hint: 'Speech drives a real sidechain. Music comparison is blocked until M1 is available.',
      controls: { enabled: toggle('Ducking', true) },
      actions: {
        Speak: () => void this.speak(),
        Stop: () => this.stop(),
        Reset: () => {
          this.stop();
          this.panel.set('enabled', true);
        },
      },
      onChange: (_key, enabled) => {
        this.ducking.ratio = enabled ? 6 : 1;
      },
    });
  }
  async speak() {
    const epoch = this.playbackEpoch;
    try {
      await getAudioContext().resume();
      await this.ducking.ready;
      if (!this.alive || epoch !== this.playbackEpoch) {
        return;
      }
      await this.speech.loaded;
      if (!this.alive || epoch !== this.playbackEpoch) {
        return;
      }
      if (!this.speech.ready) {
        this.failure = 'Speech media unavailable';
        return;
      }
      this.stop();
      this.speechVoice = this.app.audio.play(this.speech, { bus: this.voiceBus, volume: VOICE_VOLUME });
      this.failure = '';
    } catch {
      if (this.alive) {
        this.failure = this.speech.state === 'failed' ? 'Speech media failed to load' : 'AudioContext or sidechain worklet unavailable';
      }
    }
  }
  stop() {
    this.playbackEpoch++;
    this.speechVoice?.stop();
    this.speechVoice = null;
  }
  rms(analyser) {
    const samples = analyser.getWaveformFloat();
    let sum = 0;
    for (const sample of samples) {
      sum += sample * sample;
    }
    return Math.sqrt(sum / samples.length);
  }
  draw(context) {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas);
    this.musicRms = this.rms(this.musicLevel);
    this.voiceRms = this.rms(this.voiceLevel);
    const g = this.graphics.clear(),
      x = width * 0.1 * scale,
      w = width * 0.8 * scale,
      y = contentHeight * 0.6 * scale;
    for (const [index, level] of [this.musicRms, this.voiceRms].entries()) {
      g.fillColor = new Color(25, 31, 36);
      g.drawRectangle(x, y + index * 30 * scale, w, 18 * scale);
      g.fillColor = new Color(101, 210, 210);
      g.drawRectangle(x, y + index * 30 * scale, w * Math.min(1, level * 4), 18 * scale);
    }
    this.label.style.fontSize = 15 * scale;
    this.label.text = `Music RMS (relative): ${this.musicRms.toFixed(3)} - M1 missing\nSpeech RMS (relative): ${this.voiceRms.toFixed(3)}\nSidechain threshold ${THRESHOLD.toFixed(1)} dBFS | ${this.panel.values.enabled ? 'Ducking enabled' : 'Bypass (ratio 1)'}`;
    this.label.setPosition((width * scale) / 2, y - 46 * scale);
    context.render(g);
    context.render(this.label);
    this.panel.status(
      this.failure ||
        `BLOCKED: M1 music missing | ${this.app.audio.locked ? 'Click to enable audio' : 'AudioContext running'} | ${this.speech.ready ? 'Speech ready' : this.speech.state === 'failed' ? 'Speech media failed' : 'Speech loading'} | Music ducking A/B not accepted`,
      this.failure ? 'error' : 'warning',
    );
  }
  destroy() {
    this.alive = false;
    this.stop();
    this.musicLevel?.destroy();
    this.voiceLevel?.destroy();
    this.musicBus?.removeEffect(this.ducking);
    this.ducking?.destroy();
    this.app.audio.unregisterBus(this.musicBus).unregisterBus(this.voiceBus);
    this.panel?.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { DuckingScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 16, 20),
});
await app.start(DuckingScene);
