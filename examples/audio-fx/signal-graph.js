// Auto-generated from signal-graph.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Scene, Text } from '@codexo/exojs';
import { AudioAnalyser, CompressorEffect, EqualizerEffect, LimiterEffect, ReverbEffect } from '@codexo/exojs/audio-fx';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { mountControlPanel } from '@examples/runtime';
const NODE_W = 180;
const NODE_H = 86;
const LANE_COLORS = {
  music: new Color(110, 190, 255),
  sound: new Color(255, 170, 90),
  master: new Color(150, 240, 170),
};
/** Peak and RMS of one analyser window, in dBFS. */
const measure = samples => {
  let peak = 0;
  let sum = 0;
  for (const value of samples) {
    peak = Math.max(peak, Math.abs(value));
    sum += value * value;
  }
  const toDb = linear => (linear > 0 ? 20 * Math.log10(linear) : -Infinity);
  return { peak: toDb(peak), rms: toDb(Math.sqrt(sum / samples.length)) };
};
class SignalGraphScene extends Scene {
  music;
  impact;
  musicVoice;
  musicPlaying = true;
  musicVolume = 0.7;
  impactVolume = 0.3;
  autoImpact = true;
  impactTimer = 0;
  eq;
  compressor;
  reverb;
  limiter;
  nodes = [];
  edges = [];
  selected = 'compressor';
  analysers = new Map();
  levels = { music: -Infinity, sound: -Infinity, master: -Infinity };
  masterPeak = -Infinity;
  samples = new Float32Array(1024);
  waveform = new Float32Array(1024);
  flow = 0;
  graph = new Graphics();
  panel = null;
  hint;
  async load() {
    this.music = await this.loader.load(assets.musicLoopMain);
    this.impact = this.loader.get(assets.soundImpactLight);
  }
  init() {
    const audio = this.app.audio;
    // The real processing graph: two lanes with their own effects, both
    // feeding the master bus, which ends in a soft limiter before the output.
    this.eq = new EqualizerEffect({ low: 2, mid: 0, high: -1 });
    this.compressor = new CompressorEffect({ threshold: -24, ratio: 3, attack: 0.01, release: 0.2 });
    this.reverb = new ReverbEffect({ decay: 2.2, wet: 0.35 });
    // A safety stage, not a brickwall: fast transients can still pass it.
    this.limiter = new LimiterEffect({ threshold: -6 });
    const node = (id, title, kind, lane, x, y, extra = {}) => {
      const status = new Text('', { fillColor: new Color(170, 185, 210), fontSize: 14 }).setPosition(x + 12, y + 46);
      const label = new Text(title, { fillColor: Color.white, fontSize: 17 }).setPosition(x + 12, y + 14);
      this.root.addChild(label, status);
      return { id, title, kind, lane, x, y, enabled: true, status, ...extra };
    };
    this.nodes = [
      node('music', 'Music loop', 'source', 'music', 40, 150),
      node('impact', 'Impact SFX', 'source', 'sound', 40, 430),
      node('eq', 'Equalizer', 'effect', 'music', 270, 150, { bus: audio.music, effect: this.eq }),
      node('compressor', 'Compressor', 'effect', 'music', 500, 150, { bus: audio.music, effect: this.compressor }),
      node('reverb', 'Reverb', 'effect', 'sound', 385, 430, { bus: audio.sound, effect: this.reverb }),
      node('master', 'Master bus', 'bus', 'master', 760, 290, { bus: audio.master }),
      node('limiter', 'Limiter', 'effect', 'master', 760, 440, { bus: audio.master, effect: this.limiter }),
      node('output', 'Output', 'output', 'master', 1010, 290),
    ];
    this.edges = [
      { from: 'music', to: 'eq', lane: 'music' },
      { from: 'eq', to: 'compressor', lane: 'music' },
      { from: 'compressor', to: 'master', lane: 'music' },
      { from: 'impact', to: 'reverb', lane: 'sound' },
      { from: 'reverb', to: 'master', lane: 'sound' },
      { from: 'master', to: 'limiter', lane: 'master' },
      { from: 'limiter', to: 'output', lane: 'master' },
    ];
    for (const bus of [audio.music, audio.sound, audio.master]) {
      this.rebuildChain(bus);
    }
    // Each meter reads the bus output, after its effects and volume.
    this.analysers.set('music', new AudioAnalyser({ source: audio.music, fftSize: 1024 }));
    this.analysers.set('sound', new AudioAnalyser({ source: audio.sound, fftSize: 1024 }));
    this.analysers.set('master', new AudioAnalyser({ source: audio.master, fftSize: 1024 }));
    this.hint = new Text('', { fillColor: Color.white, fontSize: 20, align: 'center' })
      .setAnchor(0.5)
      .setPosition(this.app.width / 2, this.app.height - 48);
    this.app.input.onPointerDown.add(this.onPointerDown);
    // A stream is deferred until the unlock gesture, so it can be started now.
    this.musicVoice = audio.play(this.music, { bus: audio.music, loop: true, volume: this.musicVolume });
    this.select(this.selected);
  }
  // Application input outlives the scene, so the handler is removed in destroy().
  onPointerDown = (_pointer, x, y) => {
    const hit = this.nodes.find(n => x >= n.x && x <= n.x + NODE_W && y >= n.y && y <= n.y + NODE_H);
    if (hit) {
      this.select(hit.id);
    }
  };
  /** Re-attach a bus's enabled effects in graph order; bypassed ones are left out. */
  rebuildChain(bus) {
    const lane = this.nodes.filter(n => n.bus === bus && n.effect);
    for (const n of lane) {
      bus.removeEffect(n.effect);
    }
    for (const n of lane) {
      if (n.enabled) {
        bus.addEffect(n.effect);
      }
    }
  }
  setEnabled(n, enabled) {
    n.enabled = enabled;
    this.rebuildChain(n.bus);
  }
  fireImpact() {
    if (!this.app.audio.locked) {
      this.app.audio.play(this.impact, { bus: this.app.audio.sound, volume: this.impactVolume });
    }
  }
  select(id) {
    const n = this.nodes.find(candidate => candidate.id === id);
    const audio = this.app.audio;
    this.selected = id;
    this.panel?.dispose();
    const panel = mountControlPanel({ title: n.title });
    this.panel = panel;
    if (n.effect) {
      panel.addToggle({ label: 'Active', value: n.enabled, onChange: value => this.setEnabled(n, value) });
    }
    switch (id) {
      case 'music':
        panel.addToggle({
          label: 'Playing',
          value: this.musicPlaying,
          onChange: value => {
            this.musicPlaying = value;
            this.musicVoice.volume = value ? this.musicVolume : 0;
          },
        });
        panel.addSlider({
          label: 'Gain',
          value: this.musicVolume,
          onChange: value => {
            this.musicVolume = value;
            this.musicVoice.volume = this.musicPlaying ? value : 0;
          },
        });
        break;
      case 'impact':
        panel.addButton({ label: 'Play impact', onClick: () => this.fireImpact() });
        panel.addToggle({ label: 'Repeat', value: this.autoImpact, onChange: value => (this.autoImpact = value) });
        panel.addSlider({ label: 'Gain', value: this.impactVolume, onChange: value => (this.impactVolume = value) });
        break;
      case 'eq':
        panel.addSlider({ label: 'Low dB', min: -12, max: 12, step: 0.5, value: this.eq.low, onChange: value => (this.eq.low = value) });
        panel.addSlider({ label: 'Mid dB', min: -12, max: 12, step: 0.5, value: this.eq.mid, onChange: value => (this.eq.mid = value) });
        panel.addSlider({ label: 'High dB', min: -12, max: 12, step: 0.5, value: this.eq.high, onChange: value => (this.eq.high = value) });
        break;
      case 'compressor':
        panel.addSlider({
          label: 'Threshold',
          min: -50,
          max: 0,
          step: 1,
          value: this.compressor.threshold,
          onChange: value => (this.compressor.threshold = value),
        });
        panel.addSlider({
          label: 'Ratio',
          min: 1,
          max: 20,
          step: 0.5,
          value: this.compressor.ratio,
          onChange: value => (this.compressor.ratio = value),
        });
        break;
      case 'reverb':
        panel.addSlider({
          label: 'Duration s',
          min: 0.1,
          max: 5,
          step: 0.1,
          value: this.reverb.durationSeconds,
          onChange: value => (this.reverb.durationSeconds = value),
        });
        panel.addSlider({ label: 'Wet', value: this.reverb.wet, onChange: value => (this.reverb.wet = value) });
        break;
      case 'master':
        panel.addSlider({ label: 'Volume', value: audio.master.volume, onChange: value => (audio.master.volume = value) });
        break;
      case 'limiter':
        panel.addSlider({
          label: 'Threshold',
          min: -24,
          max: 0,
          step: 0.5,
          value: this.limiter.threshold,
          onChange: value => (this.limiter.threshold = value),
        });
        break;
      default:
        panel.addButton({ label: 'Play impact', onClick: () => this.fireImpact() });
    }
  }
  update(delta) {
    this.flow = (this.flow + delta * 0.6) % 1;
    if (this.autoImpact && !this.app.audio.locked) {
      this.impactTimer += delta;
      if (this.impactTimer >= 1.6) {
        this.impactTimer = 0;
        this.fireImpact();
      }
    }
    for (const [lane, analyser] of this.analysers) {
      const { peak, rms } = measure(analyser.getWaveformFloat(lane === 'master' ? this.waveform : this.samples));
      // Fast attack, slow release, so short hits stay readable on the meter.
      this.levels[lane] = Math.max(rms, this.levels[lane] - delta * 20);
      if (lane === 'master') {
        this.masterPeak = Math.max(peak, this.masterPeak - delta * 10);
      }
    }
    const fmt = db => (Number.isFinite(db) && db > -90 ? `${db.toFixed(1)} dBFS` : 'silent');
    for (const n of this.nodes) {
      switch (n.id) {
        case 'music':
          n.status.text = this.musicPlaying ? `gain ${this.musicVolume.toFixed(2)}` : 'stopped';
          break;
        case 'impact':
          n.status.text = this.autoImpact ? 'repeats every 1.6 s' : 'on demand';
          break;
        case 'compressor':
          n.status.text = n.enabled ? `reduction ${this.compressor.reduction.toFixed(1)} dB` : 'bypassed';
          break;
        case 'master':
          n.status.text = `rms ${fmt(this.levels.master)}`;
          break;
        case 'output':
          n.status.text = `peak ${fmt(this.masterPeak)}`;
          break;
        default:
          n.status.text = n.enabled ? 'active' : 'bypassed';
      }
    }
  }
  draw(context) {
    const g = this.graph.clear();
    const byId = id => this.nodes.find(n => n.id === id);
    // Wires: a cubic Bezier from the right edge of one node to the left edge of
    // the next, brighter and thicker the louder the bus it carries.
    for (const edge of this.edges) {
      const a = byId(edge.from);
      const b = byId(edge.to);
      const vertical = a.id === 'master' && b.id === 'limiter';
      const [x0, y0] = vertical ? [a.x + NODE_W / 2, a.y + NODE_H] : [a.x + NODE_W, a.y + NODE_H / 2];
      const [x1, y1] = vertical ? [b.x + NODE_W / 2, b.y] : [b.x, b.y + NODE_H / 2];
      const bend = vertical ? 0 : Math.max(40, (x1 - x0) * 0.5);
      const level = Math.max(0, Math.min(1, (this.levels[edge.lane] + 60) / 60));
      const color = LANE_COLORS[edge.lane];
      g.lineWidth = 2 + level * 4;
      g.lineColor = new Color(color.r, color.g, color.b, 0.25 + level * 0.75);
      g.moveTo(x0, y0);
      if (vertical) {
        g.lineTo(x1, y1);
      } else {
        g.bezierCurveTo(x0 + bend, y0, x1 - bend, y1, x1, y1);
      }
      // A dot travelling along the wire shows the direction of the signal.
      const t = this.flow;
      const u = 1 - t;
      const px = vertical ? x0 : u * u * u * x0 + 3 * u * u * t * (x0 + bend) + 3 * u * t * t * (x1 - bend) + t * t * t * x1;
      const py = vertical ? y0 + (y1 - y0) * t : u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y1 + t * t * t * y1;
      g.lineWidth = 0;
      g.fillColor = new Color(color.r, color.g, color.b, 0.3 + level * 0.7);
      g.drawCircle(px, py, 3 + level * 3);
    }
    for (const n of this.nodes) {
      const accent = LANE_COLORS[n.lane];
      const selected = n.id === this.selected;
      g.lineWidth = selected ? 3 : 1.5;
      g.lineColor = selected ? Color.white : new Color(accent.r, accent.g, accent.b, n.enabled ? 0.8 : 0.3);
      g.fillColor = n.enabled ? new Color(22, 28, 42) : new Color(22, 24, 30);
      g.drawRoundedRectangle(n.x, n.y, NODE_W, NODE_H, 12);
      g.lineWidth = 0;
      g.fillColor = new Color(accent.r, accent.g, accent.b, n.enabled ? 0.9 : 0.25);
      g.drawRoundedRectangle(n.x, n.y, 6, NODE_H, 3);
    }
    // Level meters at each bus output.
    const meter = (x, y, db, color) => {
      const level = Math.max(0, Math.min(1, (db + 60) / 60));
      g.fillColor = new Color(40, 46, 60);
      g.drawRectangle(x, y, 140, 8);
      g.fillColor = color;
      g.drawRectangle(x, y, 140 * level, 8);
    };
    meter(512, 246, this.levels.music, LANE_COLORS.music);
    meter(397, 526, this.levels.sound, LANE_COLORS.sound);
    meter(772, 386, this.levels.master, LANE_COLORS.master);
    // Output waveform: the last analyser window of the master bus.
    const output = byId('output');
    const points = [];
    for (let i = 0; i < this.waveform.length; i += 8) {
      points.push(output.x + 12 + (i / this.waveform.length) * (NODE_W - 24), output.y + NODE_H + 50 + this.waveform[i] * 40);
    }
    g.lineWidth = 1.5;
    g.lineColor = LANE_COLORS.master;
    g.drawPath(points);
    g.lineWidth = 0;
    context.render(g);
    super.draw(context);
    this.hint.text = this.app.audio.locked ? 'Click or press any key to start audio' : 'Click a node to edit its parameters';
    context.render(this.hint);
  }
  destroy() {
    const audio = this.app.audio;
    this.app.input.onPointerDown.remove(this.onPointerDown);
    this.musicVoice?.stop();
    for (const n of this.nodes) {
      if (n.bus && n.effect) {
        n.bus.removeEffect(n.effect);
      }
    }
    for (const effect of [this.eq, this.compressor, this.reverb, this.limiter]) {
      effect.destroy();
    }
    for (const analyser of this.analysers.values()) {
      analyser.destroy();
    }
    audio.master.volume = 1;
    this.panel?.dispose();
    this.hint?.destroy();
    this.graph.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { SignalGraphScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(10, 12, 20),
});
await app.start(SignalGraphScene);
