import type { RenderingContext, Seconds, Spatializable, Voice } from '@codexo/exojs';
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Scene, Sound, Text } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';

// Spatial parameters tuned to the canvas so attenuation is visible across the
// wide 1280px canvas. These mirror the Web Audio distance models (see
// DistanceModel in src/audio/Sound.ts) so the on-screen readout matches what
// you hear.
const REF_DISTANCE = 50;
const MAX_DISTANCE = 560;
const ROLLOFF = 1;
const SOURCE_RADIUS = 24;
// Measured so the pulses still leave headroom with the source on top of the
// listener, where no falloff applies.
const SOURCE_VOLUME = 0.6;
const MODELS = ['linear', 'inverse', 'exponential'] as const;
type FalloffModel = (typeof MODELS)[number];

const attenuation = (model: FalloffModel, distance: number): number => {
  if (distance <= REF_DISTANCE) {
    return 1;
  }

  if (model === 'linear') {
    return Math.max(0, 1 - (ROLLOFF * (distance - REF_DISTANCE)) / (MAX_DISTANCE - REF_DISTANCE));
  }

  if (model === 'inverse') {
    return REF_DISTANCE / (REF_DISTANCE + ROLLOFF * (distance - REF_DISTANCE));
  }

  return Math.pow(distance / REF_DISTANCE, -ROLLOFF);
};

// A one-second loop of four short noise bursts, the first one accented. Noise
// covers the whole spectrum, which is what the ear uses to place a sound; a
// mixed music track smears direction and distance across its own panning and
// dynamics. Mono, so every bit of left/right difference comes from the panner.
const createPulseLoop = (): AudioBuffer => {
  const sampleRate = 48000;
  const buffer = new AudioBuffer({ length: sampleRate, sampleRate, numberOfChannels: 1 });
  const data = buffer.getChannelData(0);
  let seed = 1;
  let previous = 0;

  for (let i = 0; i < data.length; i++) {
    const t = (i % (sampleRate / 4)) / sampleRate;
    const accent = i < sampleRate / 4 ? 1 : 0.55;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = seed / 2 ** 31 - 1;
    // First-order high-pass keeps the burst crisp instead of boomy.
    const crisp = noise - previous * 0.6;
    previous = noise;
    data[i] = crisp * accent * Math.min(1, t / 0.002) * Math.exp(-t / 0.03) * 0.8;
  }

  return buffer;
};

class ListenerAndSourceScene extends Scene {
  private sound!: Sound;
  private voice: (Voice & Spatializable) | null = null;
  private readonly source = { x: 0, y: 0 };
  private dragging = false;
  private listener!: { x: number; y: number };
  private graphics!: Graphics;
  private readout!: Text;
  private tapPrompt!: Text;
  private hud!: ReturnType<typeof mountControls>;
  private panel!: ReturnType<typeof mountControlPanel>;
  private mode: 'drag' | 'orbit' = 'drag';
  private model: FalloffModel = 'linear';
  private playing = true;
  private angle = 0;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.sound = new Sound(createPulseLoop());
    this.listener = { x: width / 2, y: height / 2 };
    app.audio.listener.target = this.listener;

    this.graphics = new Graphics();
    this.readout = new Text('', { fillColor: new Color(220, 228, 245), fontSize: 18, align: 'center' })
      .setAnchor(0.5, 0)
      .setPosition(width / 2, 18);

    // Shown while the browser still blocks audio (`app.audio.locked`); the
    // first click or keypress unlocks it and the loop starts.
    this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22, align: 'center' })
      .setAnchor(0.5, 0.5)
      .setPosition(width / 2, height - 48);

    this.hud = mountControls({
      title: 'Spatial Audio',
      controls: [{ keys: 'Drag', action: 'move the source in drag mode' }],
      status: 'Click or press any key to start…',
      hint: 'Best with headphones. Left/right follows the direction to the source; loudness follows the falloff model.',
    });
    this.panel = mountControlPanel({ title: 'Source and falloff' });
    this.panel.addCycle({
      label: 'Movement',
      options: ['Drag', 'Orbit'],
      onChange: index => {
        this.mode = index === 0 ? 'drag' : 'orbit';
        this.dragging = false;
        this.angle = Math.atan2((this.source.y - this.listener.y) / 160, (this.source.x - this.listener.x) / 220);
      },
    });
    this.panel.addCycle({
      label: 'Falloff',
      options: [...MODELS],
      onChange: index => {
        this.model = MODELS[index];

        if (this.voice) {
          this.voice.distanceModel = this.model;
        }
      },
    });
    this.panel.addToggle({
      label: 'Sound',
      value: true,
      onChange: value => {
        this.playing = value;

        if (this.voice) {
          this.voice.volume = value ? SOURCE_VOLUME : 0;
        }
      },
    });

    this.source.x = width / 2 + 220;
    this.source.y = height / 2;

    app.input.onPointerDown.add(this.onPointerDown);
    app.input.onPointerMove.add(this.onPointerMove);
    app.input.onPointerUp.add(this.onPointerUp);

    // A Sound played while audio is still locked is a no-op: a suspended
    // AudioContext's clock stands still, so nothing can be scheduled
    // honestly. Start the loop from the unlock gesture instead. Subscribing
    // is safe even if audio unlocked earlier - onUnlock replays.
    // play() returns the narrow Voice interface; Sound voices are spatializable.
    app.audio.onUnlock.add(this.start);
  }

  // Application input outlives the scene, so these handlers are removed in destroy().
  private readonly onPointerDown = (_pointer: unknown, x: number, y: number): void => {
    const dx = x - this.source.x;
    const dy = y - this.source.y;

    // Generous grab radius so the source is easy to pick up.
    if (this.mode === 'drag' && dx * dx + dy * dy < SOURCE_RADIUS * SOURCE_RADIUS * 4) {
      this.dragging = true;
    }
  };

  private readonly onPointerMove = (_pointer: unknown, x: number, y: number): void => {
    if (!this.dragging) {
      return;
    }

    this.source.x = x;
    this.source.y = y;

    if (this.voice) {
      this.voice.position = this.source;
    }
  };

  private readonly onPointerUp = (): void => {
    this.dragging = false;
  };

  private readonly start = (): void => {
    this.voice ??= this.app.audio.play(this.sound, {
      loop: true,
      volume: this.playing ? SOURCE_VOLUME : 0,
      position: this.source,
      distanceModel: this.model,
      refDistance: REF_DISTANCE,
      maxDistance: MAX_DISTANCE,
      rolloffFactor: ROLLOFF,
    }) as Voice & Spatializable;
    this.hud.setStatus(this.mode === 'drag' ? 'Drag the source around the listener' : 'The source orbits the listener');
  };

  override update(delta: Seconds): void {
    if (this.mode !== 'orbit') {
      return;
    }

    this.angle += delta * 1.1;
    this.source.x = this.listener.x + Math.cos(this.angle) * 220;
    this.source.y = this.listener.y + Math.sin(this.angle) * 160;

    if (this.voice) {
      this.voice.position = this.source;
    }
  }

  override draw(context: RenderingContext): void {
    const app = this.app;
    const { source, listener } = this;
    const dx = source.x - listener.x;
    const dy = source.y - listener.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const volume = attenuation(this.model, dist);
    // Equalpower pans by direction, not by horizontal offset: a source on the
    // listener's horizontal line is hard left/right, one straight above or below it is centred.
    const pan = dist > 0 ? Math.asin(dx / dist) / (Math.PI / 2) : 0;
    const panText = pan < -0.05 ? `left ${Math.abs(pan).toFixed(2)}` : pan > 0.05 ? `right ${pan.toFixed(2)}` : 'centre';
    this.readout.text = `${this.model} falloff  ·  distance ${dist.toFixed(0)} px  ·  gain ${(volume * 100).toFixed(0)}%  ·  pan ${panText}`;

    const g = this.graphics.clear();

    // Reference and maximum distance rings around the listener.
    g.lineWidth = 2;
    g.lineColor = new Color(70, 90, 110);
    g.fillColor = new Color(0, 0, 0, 0);
    g.drawCircle(listener.x, listener.y, MAX_DISTANCE);
    g.lineColor = new Color(110, 140, 160);
    g.drawCircle(listener.x, listener.y, REF_DISTANCE);

    // Line of sight, brighter the louder the source arrives.
    g.lineColor = new Color(255, 180, 120, 0.15 + volume * 0.6);
    g.drawLine(listener.x, listener.y, source.x, source.y);
    g.lineWidth = 0;

    // Listener: a head facing the top of the screen, with left/right ears that
    // light up with the pan.
    g.fillColor = new Color(120, 255, 160);
    g.drawCircle(listener.x, listener.y, 14);
    g.fillColor = new Color(80, 180, 255, 0.35 + Math.max(0, -pan) * 0.65);
    g.drawCircle(listener.x - 18, listener.y, 6);
    g.fillColor = new Color(80, 180, 255, 0.35 + Math.max(0, pan) * 0.65);
    g.drawCircle(listener.x + 18, listener.y, 6);
    g.fillColor = new Color(120, 255, 160);
    g.drawPolygon([listener.x - 6, listener.y - 12, listener.x, listener.y - 22, listener.x + 6, listener.y - 12]);

    // Source: halo and brightness track the attenuation, so volume reads visually too.
    g.fillColor = new Color(255, 120, 90, 0.12 + volume * 0.2);
    g.drawCircle(source.x, source.y, SOURCE_RADIUS + 10 + volume * 14);
    g.fillColor = new Color(Math.floor(110 + volume * 145), Math.floor(80 + volume * 60), Math.floor(70 + volume * 40));
    g.drawCircle(source.x, source.y, SOURCE_RADIUS);

    context.render(g);
    context.render(this.readout);

    if (app.audio.locked) {
      context.render(this.tapPrompt);
    }
  }

  override destroy(): void {
    const input = this.app.input;

    input.onPointerDown.remove(this.onPointerDown);
    input.onPointerMove.remove(this.onPointerMove);
    input.onPointerUp.remove(this.onPointerUp);
    this.app.audio.onUnlock.remove(this.start);
    this.voice?.stop();
    this.panel.dispose();
    this.hud.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { ListenerAndSourceScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(8, 10, 16),
  loader: {
    basePath: 'assets/',
  },
});

await app.start(ListenerAndSourceScene);
