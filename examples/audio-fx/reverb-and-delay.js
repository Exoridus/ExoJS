// Auto-generated from reverb-and-delay.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Scene, Text } from '@codexo/exojs';
import { DelayEffect, ReverbEffect } from '@codexo/exojs-audio-fx';
import { mountControlPanel, mountControls } from '@examples/runtime';
class ReverbAndDelayScene extends Scene {
  sound;
  reverb;
  delay;
  label;
  panel;
  hud;
  preset = 'Small room';
  bypass = false;
  reverbWet = 0.3;
  delayWet = 0.12;
  init() {
    const audio = this.app.audio;
    this.sound = this.loader.get('audio/impact-light.ogg');
    this.reverb = new ReverbEffect({ wet: 0.3, decay: 1.3 });
    this.delay = new DelayEffect({ wet: 0.12, delaySeconds: 0.18, feedback: 0.2 });
    audio.sound.addEffect(this.reverb);
    audio.sound.addEffect(this.delay);
    this.label = new Text('Sound -> Reverb -> Delay -> Sound bus', { fillColor: Color.white, fontSize: 25 });
    this.label.setPosition(365, 250);
    this.hud = mountControls({
      title: 'Reverb and Delay',
      status: 'Small room: play the impact, then compare presets and bypass.',
      hint: 'The dry/wet path stays audible as the room and echo change.',
    });
    this.panel = mountControlPanel({ title: 'Space and echoes' });
    this.panel.addButton({
      label: 'Play impact',
      onClick: () => {
        if (!audio.locked) audio.play(this.sound, { bus: audio.sound });
      },
    });
    this.panel.addButton({ label: 'Small room', onClick: () => this.setPreset('Small room', 0.3, 1.3, 0.12, 0.18, 0.2) });
    this.panel.addButton({ label: 'Large hall', onClick: () => this.setPreset('Large hall', 0.55, 5, 0.18, 0.32, 0.3) });
    this.panel.addButton({ label: 'Echo', onClick: () => this.setPreset('Echo', 0.12, 1.5, 0.55, 0.48, 0.55) });
    this.panel.addToggle({
      label: 'Bypass',
      value: false,
      onChange: value => {
        this.bypass = value;
        this.applyWet();
      },
    });
  }
  setPreset(name, reverbWet, decay, delayWet, delaySeconds, feedback) {
    this.preset = name;
    this.reverb.decay = decay;
    this.delay.delaySeconds = delaySeconds;
    this.delay.feedback = feedback;
    this.reverbWet = reverbWet;
    this.delayWet = delayWet;
    this.applyWet();
  }
  applyWet() {
    this.reverb.wet = this.bypass ? 0 : this.reverbWet;
    this.delay.wet = this.bypass ? 0 : this.delayWet;
    this.hud.setStatus(`${this.preset}${this.bypass ? ' (bypassed)' : ''}: reverb ${this.reverb.wet.toFixed(2)}, delay ${this.delay.wet.toFixed(2)}.`);
  }
  draw(context) {
    context.render(this.label);
  }
  destroy() {
    this.app.audio.sound.removeEffect(this.delay).removeEffect(this.reverb);
    this.delay?.destroy();
    this.reverb?.destroy();
    this.panel?.dispose();
    this.hud?.dispose();
    this.label?.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { ReverbAndDelayScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
  loader: { basePath: 'assets/' },
});
await app.start(ReverbAndDelayScene);
