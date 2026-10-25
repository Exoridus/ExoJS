// Auto-generated from effect-chains.ts - edit the .ts source, not this file.
import {
  Application,
  Asset,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  HighpassFilter,
  LowpassFilter,
  Scene,
  Text,
} from '@codexo/exojs';
import { AudioAnalyser, BitCrusherEffect, ChorusEffect, DistortionEffect, PingPongDelayEffect, ReverbEffect } from '@codexo/exojs/audio-fx';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { choice, demoPanel, toggle } from '@examples/runtime';
const CHAINS = [
  {
    name: 'Telephone',
    note: 'Band-limit the sound before adding saturation.',
    trim: 0.14,
    stages: [
      { name: 'Highpass', create: () => new HighpassFilter({ frequency: 800 }) },
      { name: 'Lowpass', create: () => new LowpassFilter({ frequency: 2500 }) },
      { name: 'Distortion', create: () => new DistortionEffect({ drive: 0.35, wet: 0.8 }) },
    ],
  },
  {
    name: 'Underwater',
    note: 'Remove highs, then add a slow chorus and room tail.',
    trim: 2,
    stages: [
      { name: 'Lowpass', create: () => new LowpassFilter({ frequency: 420, resonance: 2 }) },
      { name: 'Chorus', create: () => new ChorusEffect({ delayMs: 25, depthMs: 8, rateHz: 0.6, wet: 0.6 }) },
      { name: 'Reverb', create: () => new ReverbEffect({ decay: 2, wet: 0.45 }) },
    ],
  },
  {
    name: 'Arcade',
    note: 'Quantize the samples, then warm the edges with distortion.',
    trim: 0.25,
    stages: [
      { name: 'BitCrusher', create: () => new BitCrusherEffect({ bits: 5, frequencyReduction: 0.35 }) },
      { name: 'Distortion', create: () => new DistortionEffect({ drive: 0.25, wet: 0.6 }) },
    ],
  },
  {
    name: 'Space Echo',
    note: 'Stereo repeats follow a short room reflection.',
    trim: 1,
    stages: [
      { name: 'Reverb', create: () => new ReverbEffect({ decay: 1.5, wet: 0.25 }) },
      { name: 'PingPongDelay', create: () => new PingPongDelayEffect({ delayTime: 0.32, feedback: 0.5, wet: 0.45 }) },
    ],
  },
];
class EffectChainsScene extends Scene {
  music;
  impact;
  musicVoice;
  analyser;
  spectrum = new Uint8Array(16);
  active = [];
  generation = 0;
  rack = new Graphics();
  title;
  note;
  prompt;
  stageLabels = [];
  panel;
  async load() {
    this.music = await this.loader.load(Asset.type('music', assets.voiceCongratulations.source));
    this.impact = this.loader.get(assets.soundImpactLight);
  }
  init() {
    const audio = this.app.audio;
    this.analyser = new AudioAnalyser({ source: audio.master, fftSize: 2048, smoothingTimeConstant: 0.75 });
    this.title = new Text('', { fillColor: Color.white, fontSize: 30, align: 'center' }).setAnchor(0.5).setPosition(640, 170);
    this.stageLabels = Array.from({ length: 3 }, () =>
      new Text('', { fillColor: Color.white, fontSize: 22, align: 'center' }).setAnchor(0.5),
    );
    this.note = new Text('', { fillColor: new Color(150, 162, 186), fontSize: 20, align: 'center' }).setAnchor(0.5).setPosition(640, 215);
    this.prompt = new Text('Click or press any key to start the speech loop', { fillColor: Color.white, fontSize: 22, align: 'center' })
      .setAnchor(0.5)
      .setPosition(640, 670);
    this.panel = demoPanel({
      scene: this,
      title: 'Effect rack',
      controls: {
        chain: choice(
          'Chain',
          CHAINS.map(chain => chain.name),
        ),
        bypass: toggle('Bypass', false),
      },
      actions: {
        'Play impact': () => {
          if (!audio.locked) {
            audio.play(this.impact, { volume: 0.4 });
          }
        },
      },
      onChange: () => {
        // The mount-time calls arrive before the panel handle exists; init() builds the first chain once.
        if (this.panel) {
          this.rebuild();
        }
      },
    });
    this.musicVoice = audio.play(this.music, { loop: true, volume: 0.5 });
    this.rebuild();
  }
  rebuild() {
    const master = this.app.audio.master;
    const generation = ++this.generation;
    for (const effect of this.active) {
      master.removeEffect(effect);
      effect.destroy();
    }
    this.active = [];
    const { chain: chainName, bypass } = this.panel.values;
    const chain = CHAINS.find(candidate => candidate.name === chainName);
    this.title.text = bypass ? `${chain.name} (bypassed)` : `${chain.name}: ${chain.stages.map(stage => stage.name).join(' -> ')}`;
    const slotWidth = 820 / chain.stages.length;
    this.stageLabels.forEach((label, index) => {
      label.visible = index < chain.stages.length;
      if (label.visible) {
        label.text = chain.stages[index].name;
        label.setPosition(225 + (index + 0.5) * slotWidth - 6, 305);
      }
    });
    this.note.text = chain.note;
    master.volume = bypass ? 0.6 : chain.trim;
    if (bypass) {
      this.panel.status('Dry signal');
      return;
    }
    for (const stage of chain.stages) {
      const effect = stage.create();
      master.addEffect(effect);
      this.active.push(effect);
    }
    this.panel.status('Preparing effects...');
    void Promise.all(this.active.map(effect => effect.ready)).then(
      () => {
        if (generation === this.generation) {
          this.panel.status(`${this.active.length} effects ready`);
        }
      },
      error => {
        if (generation === this.generation) {
          this.panel.status(error instanceof Error ? error.message : String(error));
        }
      },
    );
  }
  draw(context) {
    this.analyser.getSpectrumLog(this.spectrum, { bands: this.spectrum.length, fMin: 40, fMax: 16000 });
    this.rack.clear();
    const { chain: chainName, bypass } = this.panel.values;
    const stages = CHAINS.find(candidate => candidate.name === chainName).stages;
    const width = 820 / stages.length;
    stages.forEach((_, index) => {
      this.rack.fillColor = bypass ? new Color(46, 49, 55) : new Color(53, 93, 121);
      this.rack.drawRoundedRectangle(225 + index * width, 260, width - 12, 90, 12);
    });
    for (let index = 0; index < this.spectrum.length; index++) {
      this.rack.fillColor = new Color(85 + index * 8, 180, 230 - index * 5);
      this.rack.drawRectangle(120 + index * 65, 600 - this.spectrum[index] * 0.7, 48, this.spectrum[index] * 0.7);
    }
    context.render(this.rack);
    context.render(this.title);
    context.render(this.note);
    for (const label of this.stageLabels) {
      if (label.visible) {
        context.render(label);
      }
    }
    if (this.app.audio.locked) {
      context.render(this.prompt);
    }
  }
  destroy() {
    ++this.generation;
    this.musicVoice?.stop();
    for (const effect of this.active) {
      this.app.audio.master.removeEffect(effect);
      effect.destroy();
    }
    this.active = [];
    this.app.audio.master.volume = 1;
    this.analyser?.destroy();
    this.panel?.dispose();
    this.rack.destroy();
    this.title?.destroy();
    this.note?.destroy();
    this.prompt?.destroy();
    for (const label of this.stageLabels) {
      label.destroy();
    }
    super.destroy();
  }
}
const app = new Application({
  scenes: { EffectChainsScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
});
await app.start(EffectChainsScene);
