// Auto-generated from play-sound.ts - edit the .ts source, not this file.
import { Application, AudioBus, Color, FixedResolutionCanvasSizing, Keyboard, Scene } from '@codexo/exojs';
import { AudioAnalyser } from '@codexo/exojs/audio-fx';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, slider, startExample, toggle } from '@examples/runtime';
const PADS = [
  { name: 'Click', asset: assets.soundUiClick, key: Keyboard.One },
  { name: 'Coin', asset: assets.soundCoin, key: Keyboard.Two },
  { name: 'Jump', asset: assets.soundJump, key: Keyboard.Three },
  { name: 'Hurt', asset: assets.soundHurt, key: Keyboard.Four },
];
class PlaySoundScene extends Scene {
  sounds = [];
  voices = [];
  bus;
  analyser;
  pads;
  panel;
  alive = true;
  playbackEpoch = 0;
  last = 'No pad played';
  failure = '';
  peak = 0;
  rms = 0;
  init() {
    this.sounds = PADS.map(pad => this.loader.get(pad.asset));
    this.bus = new AudioBus('sound-pads', { parent: this.app.audio.sound, volume: 0.35 });
    this.app.audio.registerBus(this.bus);
    this.analyser = new AudioAnalyser({ source: this.bus, smoothingTimeConstant: 0 });
    this.panel = demoPanel({
      layout: 'bar',
      title: 'Play a Sound',
      hint: 'Click a pad or press 1-4. Each pad plays the labeled sound.',
      controls: { volume: slider('Sound volume', { min: 0, max: 1, step: 0.01, value: 0.35 }), mute: toggle('Mute', false) },
      actions: {
        Stop: () => this.stop(),
        Reset: () => {
          this.stop();
          this.panel.set('volume', 0.35);
          this.panel.set('mute', false);
          this.last = 'No pad played';
        },
      },
      onChange: (_key, _value, values) => {
        this.bus.volume = values.volume;
        this.bus.muted = values.mute;
      },
    });
    this.pads = document.createElement('div');
    this.pads.style.cssText =
      'position:absolute;left:50%;top:30%;display:grid;grid-template-columns:repeat(2,1fr);gap:12px;transform-origin:top center;';
    PADS.forEach((pad, index) => {
      const button = document.createElement('button');
      button.textContent = `${index + 1}  ${pad.name}`;
      button.style.cssText =
        'font:600 18px sans-serif;min-width:140px;height:56px;border:2px solid #88e97e;border-radius:10px;color:#eceff2;background:#191f24;cursor:pointer;';
      button.onclick = () => void this.play(index);
      this.pads.append(button);
      this.inputs.onTrigger(pad.key, () => void this.play(index));
    });
    document.body.append(this.pads);
  }
  async play(index) {
    const epoch = this.playbackEpoch;
    try {
      // Sounds played while locked are skipped, and the unlock this gesture starts settles asynchronously.
      await new Promise(resolve => this.app.audio.onUnlock.add(() => resolve()));
      if (!this.alive || epoch !== this.playbackEpoch) {
        return;
      }
      const sound = this.sounds[index];
      await sound.loaded;
      if (!this.alive || epoch !== this.playbackEpoch) {
        return;
      }
      if (!sound.ready) {
        this.failure = 'Sound unavailable: media has not loaded';
        return;
      }
      this.voices = this.voices.filter(voice => !voice.ended);
      this.voices.push(this.app.audio.play(sound, { bus: this.bus }));
      this.last = PADS[index].name;
      this.failure = '';
    } catch {
      this.failure = 'Sound media failed to load. Try another pad.';
    }
  }
  stop() {
    this.playbackEpoch++;
    this.voices.forEach(voice => voice.stop());
    this.voices = [];
  }
  draw(_context) {
    const { scale, contentHeight } = this.panel.fit(this.app, this.app.canvas);
    this.pads.style.top = `${Math.max(8, (contentHeight - 124) / 2) * scale}px`;
    this.pads.style.transform = `translateX(-50%) scale(${scale})`;
    let sum = 0;
    this.peak = 0;
    const samples = this.analyser.getWaveformFloat();
    for (const sample of samples) {
      sum += sample * sample;
      this.peak = Math.max(this.peak, Math.abs(sample));
    }
    this.rms = Math.sqrt(sum / samples.length);
    const ready = this.sounds.every(sound => sound.ready);
    this.panel.status(
      this.failure ||
        `${this.app.audio.locked ? 'Click to enable audio' : 'AudioContext running'} | ${ready ? '4 sounds ready' : this.sounds.some(sound => sound.state === 'failed') ? 'Media failed' : 'Media loading'} | ${this.bus.muted ? 'Muted' : this.last} | peak ${this.peak.toFixed(3)} / RMS ${this.rms.toFixed(3)}`,
      this.failure ? 'error' : 'neutral',
    );
  }
  destroy() {
    this.alive = false;
    this.stop();
    this.analyser?.destroy();
    this.app.audio.unregisterBus(this.bus);
    this.pads?.remove();
    this.panel?.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { PlaySoundScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 16, 20),
});
await startExample(app, () => app.start(PlaySoundScene));
