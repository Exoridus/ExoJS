// Auto-generated from effect-chains.ts - edit the .ts source, not this file.
import { Application, Asset, Color, FixedResolutionCanvasSizing, Graphics, HighpassFilter, Keyboard, LowpassFilter, Scene, Text } from '@codexo/exojs';
import {
  AudioAnalyser,
  AutoWahEffect,
  BitCrusherEffect,
  ChorusEffect,
  CompressorEffect,
  ConvolutionEffect,
  DistortionEffect,
  EqualizerEffect,
  FlangerEffect,
  GranularEffect,
  LimiterEffect,
  PhaserEffect,
  PingPongDelayEffect,
  PitchShiftEffect,
  ReverbEffect,
  RingModulatorEffect,
  TremoloEffect,
} from '@codexo/exojs-audio-fx';
import { mountControls } from '@examples/runtime';
// Ten fixed chains. Order matters inside each one: the chain is wired
// front-to-back, so a filter placed before a distortion shapes what the
// distortion has to work with, not what it produced.
const CHAINS = [
  {
    name: 'Telephone',
    note: 'Band-limit first, then saturate what is left',
    stages: [
      { name: 'Highpass', detail: '800 Hz', create: () => new HighpassFilter({ frequency: 800 }) },
      { name: 'Lowpass', detail: '2.5 kHz', create: () => new LowpassFilter({ frequency: 2500 }) },
      { name: 'Distortion', detail: 'drive 0.35', create: () => new DistortionEffect({ drive: 0.35, tone: 0.5, wet: 0.8 }) },
    ],
  },
  {
    name: 'Underwater',
    note: 'Everything above 400 Hz is gone before the chorus detunes it',
    stages: [
      { name: 'Lowpass', detail: '420 Hz, Q 2', create: () => new LowpassFilter({ frequency: 420, resonance: 2 }) },
      { name: 'Chorus', detail: '0.6 Hz, 8 ms', create: () => new ChorusEffect({ delayMs: 25, depthMs: 8, rateHz: 0.6, wet: 0.6 }) },
      { name: 'Reverb', detail: '3 s tail', create: () => new ReverbEffect({ durationSeconds: 3, decay: 2, wet: 0.45 }) },
    ],
  },
  {
    name: 'Arcade Cabinet',
    note: 'Quantise to 5 bits, then push the mids to imitate a small speaker',
    stages: [
      { name: 'BitCrusher', detail: '5 bits', create: () => new BitCrusherEffect({ bits: 5, frequencyReduction: 0.35 }) },
      { name: 'Distortion', detail: 'drive 0.25', create: () => new DistortionEffect({ drive: 0.25, tone: 0.7, wet: 0.6 }) },
      { name: 'Equalizer', detail: '+6 dB @ 1.2 kHz', create: () => new EqualizerEffect({ low: -6, mid: 6, high: -3, midFrequency: 1200 }) },
    ],
  },
  {
    name: 'Jet Flyby',
    note: 'High feedback turns the flanger into a resonant comb sweep',
    stages: [
      {
        name: 'Flanger',
        detail: '0.15 Hz, fb 0.85',
        create: () => new FlangerEffect({ delayMs: 3, depthMs: 4, rateHz: 0.15, feedback: 0.85, wet: 0.6 }),
      },
      { name: 'Limiter', detail: '-6 dBFS', create: () => new LimiterEffect({ threshold: -6 }) },
    ],
  },
  {
    name: 'Space Wash',
    note: 'Eight allpass stages sweeping into cross-channel echoes',
    stages: [
      {
        name: 'Phaser',
        detail: '8 stages, 0.3 Hz',
        create: () => new PhaserEffect({ stages: 8, rateHz: 0.3, baseFrequency: 400, depth: 0.8, feedback: 0.6, wet: 0.6 }),
      },
      { name: 'PingPongDelay', detail: '320 ms, fb 0.5', create: () => new PingPongDelayEffect({ delayTime: 0.32, feedback: 0.5, wet: 0.4 }) },
    ],
  },
  {
    name: 'Pulse Gate',
    note: 'The tremolo chops the signal; the wah follows each chop',
    stages: [
      { name: 'Tremolo', detail: '6 Hz, auto-pan', create: () => new TremoloEffect({ rateHz: 6, depth: 0.5, autoPan: true }) },
      {
        name: 'AutoWah',
        detail: '180 Hz, Q 6',
        create: () => new AutoWahEffect({ baseFrequency: 180, sensitivity: 3500, q: 6, responseMs: 20, wet: 0.8 }),
      },
    ],
  },
  {
    name: 'Alien Voice',
    note: 'Ring modulation adds inharmonic sidebands, then everything drops a fifth',
    stages: [
      { name: 'RingModulator', detail: '110 Hz sine', create: () => new RingModulatorEffect({ frequency: 110, wet: 0.7 }) },
      { name: 'PitchShift', detail: '0.7x', create: () => new PitchShiftEffect({ pitch: 0.7 }) },
    ],
  },
  {
    name: 'Ghost',
    note: 'Grains scattered across a 2 s window, smeared into a long tail',
    stages: [
      {
        name: 'Granular',
        detail: '80 ms, 30/s',
        create: () => new GranularEffect({ grainSize: 0.08, density: 30, spread: 0.7, pitchMin: 0.98, pitchMax: 1.02, wet: 0.9, normalizeGain: true }),
      },
      { name: 'Reverb', detail: '4 s tail', create: () => new ReverbEffect({ durationSeconds: 4, decay: 2.5, wet: 0.5 }) },
    ],
  },
  {
    name: 'Cathedral',
    note: 'A recorded 593 ms room, with the rumble filtered back out',
    stages: [
      { name: 'Convolution', detail: 'AK-SROOMS_016', create: ({ impulse }) => new ConvolutionEffect({ impulse, wet: 0.9 }) },
      { name: 'Highpass', detail: '180 Hz', create: () => new HighpassFilter({ frequency: 180 }) },
    ],
  },
  {
    name: 'Radio Squash',
    note: 'Dynamics flattened until the quiet parts are as loud as the peaks',
    stages: [
      {
        name: 'Compressor',
        detail: '-28 dB, 12:1',
        create: () => new CompressorEffect({ threshold: -28, ratio: 12, attack: 0.003, release: 0.15, knee: 6 }),
      },
      { name: 'Limiter', detail: '-2 dBFS', create: () => new LimiterEffect({ threshold: -2 }) },
      { name: 'Equalizer', detail: '+5 dB mid', create: () => new EqualizerEffect({ low: -4, mid: 5, high: 2 }) },
    ],
  },
];
const BANDS = 32;
const SLOT_WIDTH = 360;
const SLOT_HEIGHT = 110;
const SLOT_GAP = 24;
// The controls overlay occupies the top-left corner, so the chain row starts
// below it rather than beside it.
const SLOT_TOP = 250;
const GRAPH_INSET = 80;
const GRAPH_FLOOR = 640;
const GRAPH_HEIGHT = 220;
const NAME_COLOR = Color.white;
const NAME_COLOR_DIM = new Color(84, 90, 104);
const DETAIL_COLOR = new Color(140, 152, 176);
const DETAIL_COLOR_DIM = new Color(64, 70, 82);
const SLOT_COLOR_DIM = new Color(26, 28, 34);
const BAR_COLOR_DIM = new Color(58, 62, 72);
// One colour per band, blue at the bottom to warm at the top. Precomputed so
// the draw loop never allocates.
const BAR_COLORS = Array.from({ length: BANDS }, (_, i) => {
  const tilt = i / (BANDS - 1);
  return new Color(Math.floor(70 + tilt * 185), Math.floor(190 - tilt * 70), Math.floor(255 - tilt * 75));
});
class EffectChainsScene extends Scene {
  music;
  impact;
  impulse;
  analyser;
  spectrum = new Uint8Array(BANDS);
  /** The effects currently inserted on the master bus, in chain order. */
  active = [];
  index = 0;
  bypassed = false;
  preparing = false;
  flash = 0;
  gfx;
  title;
  subtitle;
  slotNames = [];
  slotDetails = [];
  arrows = [];
  tapPrompt;
  hud;
  async load() {
    const app = this.app;
    const { width, height } = app;
    // AudioStream has no seamless adapter - await it explicitly. The
    // impulse response is awaited too, so the Cathedral chain can hand a
    // decoded buffer to the convolver the moment it is selected.
    this.music = await this.loader.load(Asset.type('music', 'audio/demo-loop-main.ogg'));
    this.impulse = await this.loader.load(Asset.type('sound', 'audio/ir/AK-SROOMS_016.wav'));
    this.impact = this.loader.get('audio/impact-light.ogg');
    // Chains live on the master bus, not on `audio.music` - that way the
    // looping track and the one-shot impact both run through the same
    // effects instead of only whichever bus owns them.
    this.analyser = new AudioAnalyser({ source: app.audio.master, fftSize: 2048, smoothingTimeConstant: 0.75 });
    this.gfx = new Graphics();
    this.title = new Text('', { fillColor: Color.white, fontSize: 38 }).setAnchor(0.5, 0.5).setPosition(width / 2, 72);
    this.subtitle = new Text('', { fillColor: new Color(150, 162, 186), fontSize: 19 }).setAnchor(0.5, 0.5).setPosition(width / 2, 120);
    this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 24 })
      .setAnchor(0.5, 0.5)
      .setPosition(width / 2, height - 44);
    // Three slots is the longest chain; shorter ones hide the extra nodes.
    for (let i = 0; i < 3; i++) {
      this.slotNames.push(new Text('', { fillColor: Color.white, fontSize: 26 }).setAnchor(0.5, 0.5));
      this.slotDetails.push(new Text('', { fillColor: DETAIL_COLOR, fontSize: 18 }).setAnchor(0.5, 0.5));
    }
    for (let i = 0; i < 2; i++) {
      this.arrows.push(new Text('>', { fillColor: new Color(90, 100, 120), fontSize: 26 }).setAnchor(0.5, 0.5));
    }
    this.hud = mountControls({
      title: 'Effect chains',
      controls: [
        { keys: '< / >', action: 'previous / next chain' },
        { keys: 'Space', action: 'bypass the chain (A/B against dry)' },
        { keys: 'Click', action: 'fire an impact through the chain' },
      ],
      status: 'Click or press any key to start…',
    });
    this.inputs.onTrigger(Keyboard.Right, () => this.select(this.index + 1));
    this.inputs.onTrigger(Keyboard.Left, () => this.select(this.index - 1));
    this.inputs.onTrigger(Keyboard.Space, () => this.toggleBypass());
    app.input.onPointerTap.add(() => this.strike());
    this.root.addChild(this.gfx, this.title, this.subtitle, ...this.slotNames, ...this.slotDetails, ...this.arrows, this.tapPrompt);
    // Core defers playback until the AudioContext unlocks on the first
    // gesture, then starts automatically.
    app.audio.play(this.music, { loop: true, volume: 0.7 });
    this.select(0);
  }
  select(next) {
    this.index = (next + CHAINS.length) % CHAINS.length;
    this.rebuild();
  }
  toggleBypass() {
    this.bypassed = !this.bypassed;
    this.rebuild();
  }
  /**
   * Tear the current chain down and - unless bypassed - build the selected
   * one. Bypass is not a separate code path: it is simply the teardown
   * without the rebuild, so there is only one way effects reach the bus.
   */
  rebuild() {
    const master = this.app.audio.master;
    for (const effect of this.active) {
      master.removeEffect(effect);
      effect.destroy();
    }
    this.active = [];
    const chain = CHAINS[this.index];
    if (!this.bypassed) {
      for (const stage of chain.stages) {
        const effect = stage.create({ impulse: this.impulse });
        master.addEffect(effect);
        this.active.push(effect);
      }
    }
    // Worklet-backed effects (BitCrusher, PitchShift, Granular) pass audio
    // through untouched until their processor module has loaded, so a
    // freshly selected chain can be inaudible for a frame or two.
    const built = this.active;
    this.preparing = built.length > 0;
    void Promise.all(built.map(effect => effect.ready)).then(() => {
      if (this.active === built) {
        this.preparing = false;
      }
    });
    const width = this.app.width;
    this.title.text = chain.name;
    this.subtitle.text = `chain ${this.index + 1} of ${CHAINS.length}`;
    // The per-chain note goes in the overlay: on the canvas it would run
    // under the controls panel.
    this.hud.setHint(chain.note);
    const count = chain.stages.length;
    const totalWidth = count * SLOT_WIDTH + (count - 1) * SLOT_GAP;
    const left = (width - totalWidth) / 2;
    for (let i = 0; i < this.slotNames.length; i++) {
      const stage = chain.stages[i];
      const slotCentre = left + i * (SLOT_WIDTH + SLOT_GAP) + SLOT_WIDTH / 2;
      this.slotNames[i].visible = stage !== undefined;
      this.slotDetails[i].visible = stage !== undefined;
      if (stage) {
        this.slotNames[i].text = stage.name;
        this.slotNames[i].setPosition(slotCentre, SLOT_TOP + SLOT_HEIGHT / 2 - 16);
        this.slotDetails[i].text = stage.detail;
        this.slotDetails[i].setPosition(slotCentre, SLOT_TOP + SLOT_HEIGHT / 2 + 22);
      }
    }
    for (let i = 0; i < this.arrows.length; i++) {
      const visible = i < count - 1;
      this.arrows[i].visible = visible;
      if (visible) {
        this.arrows[i].setPosition(left + (i + 1) * SLOT_WIDTH + i * SLOT_GAP + SLOT_GAP / 2, SLOT_TOP + SLOT_HEIGHT / 2);
      }
    }
    for (const text of this.slotNames) {
      text.style.fillColor = this.bypassed ? NAME_COLOR_DIM : NAME_COLOR;
    }
    for (const text of this.slotDetails) {
      text.style.fillColor = this.bypassed ? DETAIL_COLOR_DIM : DETAIL_COLOR;
    }
  }
  strike() {
    if (this.app.audio.locked) {
      return;
    }
    this.app.audio.play(this.impact);
    this.flash = 1;
  }
  update(time) {
    this.flash = Math.max(0, this.flash - time * 2.5);
    this.tapPrompt.visible = this.app.audio.locked;
    const chain = CHAINS[this.index];
    if (this.app.audio.locked) {
      this.hud.setStatus('Click or press any key to start…');
    } else if (this.bypassed) {
      this.hud.setStatus('Bypassed — this is the dry signal');
    } else if (this.preparing) {
      this.hud.setStatus(`${chain.name} — loading worklets…`);
    } else {
      this.hud.setStatus(`${chain.name} — ${this.active.length} effects on master`);
    }
    this.analyser.getSpectrumLog(this.spectrum, { bands: BANDS, fMin: 40, fMax: 16000 });
    const width = this.app.width;
    const count = chain.stages.length;
    const totalWidth = count * SLOT_WIDTH + (count - 1) * SLOT_GAP;
    const left = (width - totalWidth) / 2;
    const dim = this.bypassed;
    this.gfx.clear();
    // Chain nodes. A bypassed chain keeps its boxes in place and greys them
    // out, so the row never jumps while comparing against the dry signal.
    const lift = Math.floor(this.flash * 40);
    const slotColor = dim ? SLOT_COLOR_DIM : new Color(38 + lift, 52 + lift, 74 + lift);
    for (let i = 0; i < count; i++) {
      this.gfx.fillColor = slotColor;
      this.gfx.drawRectangle(left + i * (SLOT_WIDTH + SLOT_GAP), SLOT_TOP, SLOT_WIDTH, SLOT_HEIGHT);
    }
    // Spectrum, measured on the master output - that is downstream of the
    // chain, so the bars show what actually reaches the speakers.
    const barWidth = (width - GRAPH_INSET * 2) / BANDS;
    for (let i = 0; i < BANDS; i++) {
      const barHeight = Math.max(2, (this.spectrum[i] / 255) * GRAPH_HEIGHT);
      this.gfx.fillColor = dim ? BAR_COLOR_DIM : BAR_COLORS[i];
      this.gfx.drawRectangle(GRAPH_INSET + i * barWidth, GRAPH_FLOOR - barHeight, barWidth - 4, barHeight);
    }
  }
  draw(context) {
    context.render(this.root);
  }
}
const application = new Application({
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: {
    basePath: 'assets/',
  },
});
void application.start(EffectChainsScene);
