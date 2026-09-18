import { Application, Color, FixedResolutionCanvasSizing, Graphics, type RenderingContext, Scene, type Seconds, Signal, Text } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

interface Channel {
  name: string;
  signal: Signal;
  color: Color;
  flash: number;
}

class SignalBusInspectorScene extends Scene {
  private channels!: Channel[];
  private listenerA!: () => void;
  private listenerB!: () => void;
  private spawnHasListenerB = true;
  private gfx!: Graphics;
  private labels!: Text[];
  private hud!: ReturnType<typeof mountControls>;

  override init(): void {
    this.listenerA = () => undefined;
    this.listenerB = () => undefined;

    this.channels = [
      { name: 'spawn', signal: new Signal(), color: new Color(130, 220, 255), flash: 0 },
      { name: 'damage', signal: new Signal(), color: new Color(255, 130, 130), flash: 0 },
      { name: 'score', signal: new Signal(), color: new Color(160, 255, 170), flash: 0 },
    ];

    this.channels[0]!.signal.add(this.listenerA);
    this.channels[0]!.signal.add(this.listenerB);
    this.channels[1]!.signal.add(this.listenerA);
    this.channels[2]!.signal.add(this.listenerA);

    this.gfx = new Graphics();
    this.labels = this.channels.map((channel, i) => new Text('', { fillColor: Color.white, fontSize: 20 }).setPosition(220, 220 + i * 70).setAnchor(0, 0.5));

    this.hud = mountControls({
      title: 'Signal Bus Inspector',
      controls: [
        { keys: 'Click', action: 'dispatch every signal' },
        { keys: 'Right-click', action: "toggle a second listener on 'spawn'" },
      ],
      hint: 'Each bar lights up on dispatch; the count is its live listener total.',
    });

    this.root.addChild(this.gfx, ...this.labels);

    this.app.input.onPointerTap.add(() => {
      for (const channel of this.channels) {
        channel.signal.dispatch();
        channel.flash = 1;
      }
    });
    this.app.input.onContextMenu.add(() => {
      const spawn = this.channels[0]!.signal;

      this.spawnHasListenerB = !this.spawnHasListenerB;
      if (this.spawnHasListenerB) spawn.add(this.listenerB);
      else spawn.remove(this.listenerB);
    });
  }

  override update(delta: Seconds): void {
    for (const channel of this.channels) {
      channel.flash = Math.max(0, channel.flash - delta * 2.5);
    }
  }

  override draw(context: RenderingContext): void {
    this.gfx.clear();

    for (let i = 0; i < this.channels.length; i++) {
      const channel = this.channels[i]!;
      const y = 220 + i * 70;
      const lit = 0.35 + channel.flash * 0.65;

      this.gfx.fillColor = new Color(Math.floor(channel.color.r * lit), Math.floor(channel.color.g * lit), Math.floor(channel.color.b * lit));
      this.gfx.drawRoundedRectangle(40, y - 24, 150, 48, 10);
      this.labels[i]!.text = `${channel.name}: ${channel.signal.count} listener${channel.signal.count === 1 ? '' : 's'}`;
    }

    context.render(this.root);
  }
}

const app = new Application({
  scenes: { SignalBusInspectorScene },
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

await app.start(SignalBusInspectorScene);
