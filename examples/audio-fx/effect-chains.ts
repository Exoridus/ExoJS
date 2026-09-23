import {
  Application,
  Asset,
  type AudioEffect,
  type AudioStream,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  HighpassFilter,
  LowpassFilter,
  type RenderingContext,
  Scene,
  type Sound,
  Text,
  type Voice,
} from '@codexo/exojs';
import { AudioAnalyser, BitCrusherEffect, ChorusEffect, DistortionEffect, PingPongDelayEffect, ReverbEffect } from '@codexo/exojs-audio-fx';
import { mountControlPanel, mountControls } from '@examples/runtime';

interface Chain {
  name: string;
  note: string;
  stages: { name: string; create(): AudioEffect }[];
}

const CHAINS: Chain[] = [
  {
    name: 'Telephone',
    note: 'Band-limit the sound before adding saturation.',
    stages: [
      { name: 'Highpass', create: () => new HighpassFilter({ frequency: 800 }) },
      { name: 'Lowpass', create: () => new LowpassFilter({ frequency: 2500 }) },
      { name: 'Distortion', create: () => new DistortionEffect({ drive: 0.35, wet: 0.8 }) },
    ],
  },
  {
    name: 'Underwater',
    note: 'Remove highs, then add a slow chorus and room tail.',
    stages: [
      { name: 'Lowpass', create: () => new LowpassFilter({ frequency: 420, resonance: 2 }) },
      { name: 'Chorus', create: () => new ChorusEffect({ delayMs: 25, depthMs: 8, rateHz: 0.6, wet: 0.6 }) },
      { name: 'Reverb', create: () => new ReverbEffect({ decay: 2, wet: 0.45 }) },
    ],
  },
  {
    name: 'Arcade',
    note: 'Quantize the samples, then warm the edges with distortion.',
    stages: [
      { name: 'BitCrusher', create: () => new BitCrusherEffect({ bits: 5, frequencyReduction: 0.35 }) },
      { name: 'Distortion', create: () => new DistortionEffect({ drive: 0.25, wet: 0.6 }) },
    ],
  },
  {
    name: 'Space Echo',
    note: 'Stereo repeats follow a short room reflection.',
    stages: [
      { name: 'Reverb', create: () => new ReverbEffect({ decay: 1.5, wet: 0.25 }) },
      { name: 'PingPongDelay', create: () => new PingPongDelayEffect({ delayTime: 0.32, feedback: 0.5, wet: 0.45 }) },
    ],
  },
];

class EffectChainsScene extends Scene {
  private music!: AudioStream;
  private impact!: Sound;
  private musicVoice!: Voice;
  private analyser!: AudioAnalyser;
  private readonly spectrum = new Uint8Array(16);
  private active: AudioEffect[] = [];
  private selected = 0;
  private bypass = false;
  private generation = 0;
  private rack = new Graphics();
  private title!: Text;
  private stageLabels: Text[] = [];
  private panel!: ReturnType<typeof mountControlPanel>;
  private hud!: ReturnType<typeof mountControls>;

  override async load(): Promise<void> {
    this.music = await this.loader.load(Asset.type('music', 'audio/demo-loop-main.ogg'));
    this.impact = this.loader.get('audio/impact-light.ogg');
  }

  override init(): void {
    const audio = this.app.audio;
    this.analyser = new AudioAnalyser({ source: audio.master, fftSize: 2048, smoothingTimeConstant: 0.75 });
    this.title = new Text('', { fillColor: Color.white, fontSize: 30, align: 'center' }).setAnchor(0.5).setPosition(640, 170);
    this.stageLabels = Array.from({ length: 3 }, () => new Text('', { fillColor: Color.white, fontSize: 22, align: 'center' }).setAnchor(0.5));
    this.hud = mountControls({
      title: 'Audio Effect Rack',
      status: 'Choose a chain and compare it with dry output.',
      hint: 'Effects run in the order shown on the rack.',
    });
    this.panel = mountControlPanel({ title: 'Effect rack' });
    CHAINS.forEach((chain, index) => this.panel.addButton({ label: chain.name, onClick: () => this.select(index) }));
    this.panel.addToggle({
      label: 'Bypass',
      value: false,
      onChange: value => {
        this.bypass = value;
        this.rebuild();
      },
    });
    this.panel.addButton({
      label: 'Play impact',
      onClick: () => {
        if (!audio.locked) {
          audio.play(this.impact);
        }
      },
    });
    this.musicVoice = audio.play(this.music, { loop: true, volume: 0.7 });
    this.rebuild();
  }

  private select(index: number): void {
    if (index === this.selected) {
      return;
    }
    this.selected = index;
    this.rebuild();
  }

  private rebuild(): void {
    const master = this.app.audio.master;
    const generation = ++this.generation;
    for (const effect of this.active) {
      master.removeEffect(effect);
      effect.destroy();
    }
    this.active = [];
    const chain = CHAINS[this.selected]!;
    this.title.text = `${chain.name}: ${chain.stages.map(stage => stage.name).join(' -> ')}`;
    const slotWidth = 820 / chain.stages.length;
    this.stageLabels.forEach((label, index) => {
      label.visible = index < chain.stages.length;
      if (label.visible) {
        label.text = chain.stages[index]!.name;
        label.setPosition(225 + (index + 0.5) * slotWidth - 6, 305);
      }
    });
    this.hud.setHint(chain.note);
    if (this.bypass) {
      this.hud.setStatus(`${chain.name} bypassed; dry signal.`);
      return;
    }
    for (const stage of chain.stages) {
      const effect = stage.create();
      master.addEffect(effect);
      this.active.push(effect);
    }
    this.hud.setStatus(`${chain.name}: preparing ${this.active.length} effects...`);
    void Promise.all(this.active.map(effect => effect.ready)).then(
      () => {
        if (generation === this.generation) {
          this.hud.setStatus(`${chain.name}: ${this.active.length} effects ready.`);
        }
      },
      error => {
        if (generation === this.generation) {
          this.hud.setStatus(`${chain.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    );
  }

  override draw(context: RenderingContext): void {
    this.analyser.getSpectrumLog(this.spectrum, { bands: this.spectrum.length, fMin: 40, fMax: 16000 });
    this.rack.clear();
    const stages = CHAINS[this.selected]!.stages;
    const width = 820 / stages.length;
    stages.forEach((_, index) => {
      this.rack.fillColor = this.bypass ? new Color(46, 49, 55) : new Color(53, 93, 121);
      this.rack.drawRoundedRectangle(225 + index * width, 260, width - 12, 90, 12);
    });
    for (let index = 0; index < this.spectrum.length; index++) {
      this.rack.fillColor = new Color(85 + index * 8, 180, 230 - index * 5);
      this.rack.drawRectangle(120 + index * 65, 600 - this.spectrum[index]! * 0.7, 48, this.spectrum[index]! * 0.7);
    }
    context.render(this.rack);
    context.render(this.title);
    for (const label of this.stageLabels) {
      if (label.visible) {
        context.render(label);
      }
    }
  }

  override destroy(): void {
    ++this.generation;
    this.musicVoice?.stop();
    for (const effect of this.active) {
      this.app.audio.master.removeEffect(effect);
      effect.destroy();
    }
    this.active = [];
    this.analyser?.destroy();
    this.panel?.dispose();
    this.hud?.dispose();
    this.rack.destroy();
    this.title?.destroy();
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
  loader: { basePath: 'assets/' },
});

await app.start(EffectChainsScene);
