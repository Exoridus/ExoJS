import {
  ActionMap,
  Application,
  Color,
  FixedResolutionCanvasSizing,
  GamepadAxis,
  getAudioContext,
  Graphics,
  Keyboard,
  type RenderingContext,
  Scene,
  type Seconds,
  Sound,
  type Spatializable,
  Text,
  VectorAction,
  type Voice,
} from '@codexo/exojs';
import { choice, demoPanel, startExample, toggle } from '@examples/runtime';

const REF_DISTANCE = 50,
  MAX_DISTANCE = 560,
  SOURCE_VOLUME = 0.3;
const ROLLOFF = 1.3;
const MODELS = ['linear', 'inverse', 'exponential'] as const;
type FalloffModel = (typeof MODELS)[number];

// Web Audio PannerNode distance gain: only 'linear' clamps to maxDistance, and it clamps the rolloff to [0, 1].
const attenuation = (model: FalloffModel, distance: number): number => {
  const d = Math.max(REF_DISTANCE, distance);

  if (model === 'linear') {
    return 1 - (Math.min(1, ROLLOFF) * (Math.min(d, MAX_DISTANCE) - REF_DISTANCE)) / (MAX_DISTANCE - REF_DISTANCE);
  }

  if (model === 'inverse') {
    return REF_DISTANCE / (REF_DISTANCE + ROLLOFF * (d - REF_DISTANCE));
  }

  return Math.pow(d / REF_DISTANCE, -ROLLOFF);
};

const createPulseLoop = (): AudioBuffer => {
  const sampleRate = 48000;
  const buffer = new AudioBuffer({ length: sampleRate, sampleRate, numberOfChannels: 1 });
  const data = buffer.getChannelData(0);
  let seed = 1,
    previous = 0;

  for (let i = 0; i < data.length; i++) {
    const t = (i % (sampleRate / 4)) / sampleRate;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = seed / 2 ** 31 - 1,
      crisp = noise - previous * 0.6;
    previous = noise;
    data[i] = crisp * (i < sampleRate / 4 ? 1 : 0.55) * Math.min(1, t / 0.002) * Math.exp(-t / 0.03) * 0.8;
  }

  return buffer;
};

class ListenerAndSourceScene extends Scene {
  private sound!: Sound;
  private voice: (Voice & Spatializable) | null = null;
  private readonly source = { x: 860, y: 280 };
  private readonly listener = { x: 640, y: 280 };
  private previousTarget!: typeof this.app.audio.listener.target;
  private previousPosition = { x: 0, y: 0 };
  private readonly graphics = this.track(new Graphics());
  private readonly labels = this.track(new Text('', { fillColor: new Color(236, 239, 242), align: 'center' })).setAnchor(0.5);
  private readonly ears = this.track(new Text('L     R', { fillColor: new Color(236, 239, 242), align: 'center' })).setAnchor(0.5);
  private readonly actions = new ActionMap({
    move: new VectorAction([
      {
        up: [Keyboard.W, Keyboard.Up],
        down: [Keyboard.S, Keyboard.Down],
        left: [Keyboard.A, Keyboard.Left],
        right: [Keyboard.D, Keyboard.Right],
      },
      { x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY },
    ]),
  });
  private panel!: ReturnType<
    typeof demoPanel<{
      orbit: ReturnType<typeof toggle>;
      falloff: ReturnType<typeof choice<FalloffModel>>;
      sound: ReturnType<typeof toggle>;
    }>
  >;
  private angle = 0;
  private dragging = false;
  private audioLocked = true;
  private alive = true;
  private failure = '';
  private pulse = 0;
  private startedAt = 0;

  override init(): void {
    const audio = this.app.audio;
    this.audioLocked = audio.locked;
    this.sound = new Sound(createPulseLoop());
    this.previousTarget = audio.listener.target;
    this.previousPosition = { x: audio.listener.position.x, y: audio.listener.position.y };
    audio.listener.target = this.listener;
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls: { orbit: toggle('Orbit', true), falloff: choice('Falloff', MODELS), sound: toggle('Sound', true) },
      onChange: (key, _value, values) => {
        if (key === 'orbit') {
          this.dragging = false;
          this.angle = Math.atan2(this.source.y - this.listener.y, this.source.x - this.listener.x);
        }

        if (key === 'sound') {
          if (values.sound) {
            void this.start();
          } else {
            this.stop();
          }
        }

        if (this.voice) {
          this.voice.distanceModel = values.falloff;
        }
      },
    });
    this.inputs.attach(this.actions);
    this.app.input.onPointerDown.add(this.onDown);
    this.app.input.onPointerMove.add(this.onMove);
    this.app.input.onPointerUp.add(this.onUp);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('blur', this.onUp);
  }

  private readonly onDown = (_pointer: unknown, x: number, y: number): void => {
    const { scale, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);

    if (this.audioLocked || y >= contentHeight * scale || this.app.interaction.nodeAt(x, y)) {
      return;
    }

    this.panel.set('orbit', false);
    this.source.x = x;
    this.source.y = y;
    this.clamp();
    this.dragging = true;
  };
  private readonly onMove = (_pointer: unknown, x: number, y: number): void => {
    if (this.dragging) {
      this.source.x = x;
      this.source.y = y;
      this.clamp();
    }
  };
  private readonly onUp = (): void => {
    this.dragging = false;
  };

  private async start(): Promise<void> {
    try {
      // Sounds played while locked are skipped, and the unlock this gesture starts settles asynchronously.
      await new Promise<void>(resolve => this.app.audio.onUnlock.add(() => resolve()));

      if (!this.alive || !this.panel.values.sound) {
        return;
      }

      this.startedAt = getAudioContext().currentTime;
      this.voice ??= this.app.audio.play(this.sound, {
        loop: true,
        volume: SOURCE_VOLUME,
        position: this.source,
        distanceModel: this.panel.values.falloff,
        refDistance: REF_DISTANCE,
        maxDistance: MAX_DISTANCE,
        rolloffFactor: ROLLOFF,
      }) as Voice & Spatializable;
      this.failure = '';
    } catch {
      this.failure = 'Spatial voice could not start. Toggle Sound to retry.';
    }
  }

  private stop(): void {
    this.voice?.stop();
    this.voice = null;
    this.pulse = 0;
  }

  private clamp(): void {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.source.x = Math.max(24 * scale, Math.min((width - 24) * scale, this.source.x));
    this.source.y = Math.max(48 * scale, Math.min((contentHeight - 24) * scale, this.source.y));
  }

  override update(delta: Seconds): void {
    // Pointer presses arrive before update, after their unlock gesture may already have resumed audio.
    this.audioLocked = this.app.audio.locked;
    const move = this.actions.move.value;

    if (this.panel.values.orbit) {
      this.angle += delta * 1.1;
      this.source.x = this.listener.x + Math.cos(this.angle) * 220;
      this.source.y = this.listener.y + Math.sin(this.angle) * 140;
    } else {
      this.source.x += move.x * 260 * delta;
      this.source.y += move.y * 260 * delta;
    }

    this.clamp();

    if (this.voice) {
      this.voice.position = this.source;
    }

    this.pulse = this.voice && !this.app.audio.locked ? Math.exp(-(((getAudioContext().currentTime - this.startedAt) % 0.25) / 0.045)) : 0;
  }

  override draw(context: RenderingContext): void {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    const listenerX = (width * scale) / 2,
      listenerY = (contentHeight * scale) / 2;
    this.source.x += listenerX - this.listener.x;
    this.source.y += listenerY - this.listener.y;
    this.listener.x = listenerX;
    this.listener.y = listenerY;
    const dx = this.source.x - this.listener.x,
      dy = this.source.y - this.listener.y,
      distance = Math.hypot(dx, dy);
    const gain = attenuation(this.panel.values.falloff, distance),
      pan = distance ? Math.asin(dx / distance) / (Math.PI / 2) : 0;
    const g = this.graphics.clear();
    g.lineWidth = 2 * scale;
    g.fillColor = Color.transparent;
    g.lineColor = new Color(70, 90, 110);
    g.drawCircle(this.listener.x, this.listener.y, MAX_DISTANCE);
    g.lineColor = new Color(101, 210, 210);
    g.drawCircle(this.listener.x, this.listener.y, REF_DISTANCE);
    g.lineColor = new Color(136, 233, 126);
    g.drawLine(this.listener.x, this.listener.y, this.source.x, this.source.y);
    g.lineWidth = 0;
    g.fillColor = new Color(136, 233, 126);
    g.drawCircle(this.listener.x, this.listener.y, 14 * scale);
    g.fillColor = new Color(101, 210, 210, 0.2 + this.pulse * 0.7);
    g.drawCircle(this.source.x, this.source.y, (22 + this.pulse * 10) * scale);
    g.fillColor = new Color(101, 210, 210);
    g.drawCircle(this.source.x, this.source.y, 12 * scale);
    this.labels.style.fontSize = 14 * scale;
    this.labels.text = `Fixed listener | distance ${distance.toFixed(0)} px | gain ${gain.toFixed(2)} (model) | pan ${pan.toFixed(2)} (model)`;
    this.labels.layout = { maxWidth: (width - 24) * scale, maxHeight: 40 * scale, overflow: 'ellipsis' };
    this.labels.setPosition((width * scale) / 2, 26 * scale);
    this.ears.style.fontSize = 14 * scale;
    this.ears.setPosition(this.listener.x, this.listener.y + 28 * scale);
    context.render(g);
    context.render(this.labels);
    context.render(this.ears);
    this.panel.status(
      this.failure ||
        `${this.app.audio.locked ? 'Click to enable audio' : 'AudioContext running'} | coded mono pulse ${this.voice ? 'playing' : 'stopped'} | ref ${REF_DISTANCE} / max ${MAX_DISTANCE} px | Click to place the source; drag or use arrow keys | Headphones reveal left / right`,
      this.failure ? 'error' : 'neutral',
    );
  }

  override destroy(): void {
    this.alive = false;
    this.stop();
    this.sound?.destroy();
    this.app.input.onPointerDown.remove(this.onDown);
    this.app.input.onPointerMove.remove(this.onMove);
    this.app.input.onPointerUp.remove(this.onUp);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('blur', this.onUp);
    this.app.audio.listener.target = this.previousTarget;
    this.app.audio.listener.position.set(this.previousPosition.x, this.previousPosition.y);
    this.panel?.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { ListenerAndSourceScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 16, 20),
});
await startExample(app, () => app.start(ListenerAndSourceScene));
