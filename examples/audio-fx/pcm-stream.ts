import { Application, Color, FixedResolutionCanvasSizing, getAudioContext, type RenderingContext, Scene, Text } from '@codexo/exojs';
import { PcmStreamSource } from '@codexo/exojs/audio-fx';
import { type DemoPanel, demoPanel, toggle, type ToggleSpec } from '@examples/runtime';

class PcmStreamScene extends Scene {
  private stream: PcmStreamSource | null = null;
  private readonly left = new Float32Array(512);
  private readonly right = new Float32Array(512);
  private readonly channels = [this.left, this.right];
  private cursor = 0;
  private label!: Text;
  private prompt!: Text;
  private panel!: DemoPanel<{ producing: ToggleSpec }>;

  override init(): void {
    this.label = new Text('', { fillColor: Color.white, fontSize: 26 }).setPosition(170, 190);
    this.prompt = new Text('Click or press any key to start the stream', { fillColor: Color.white, fontSize: 22, align: 'center' })
      .setAnchor(0.5)
      .setPosition(this.app.width / 2, this.app.height - 48);
    this.panel = demoPanel({
      scene: this,
      title: 'PCM producer',
      controls: { producing: toggle('Produce PCM', true) },
      actions: {
        'Clear queue': () => this.stream?.clear(),
        Drain: () => this.stream?.close(),
        'New stream': () => this.createStream(),
      },
    });
    // onUnlock replays when audio is already unlocked, so a warm context starts immediately.
    this.app.audio.onUnlock.add(this.start);
    this.createStream();
  }

  private readonly start = (): void => {
    const stream = this.stream;

    if (!stream || stream.state !== 'ready' || this.app.audio.locked) {
      return;
    }

    this.fillQueue();
    stream.start(getAudioContext().currentTime + 0.02);
  };

  private createStream(): void {
    this.panel.status('');
    this.stream?.destroy();
    this.cursor = 0;
    const stream = new PcmStreamSource({ channels: 2, capacityFrames: 8192, bus: this.app.audio.music });
    this.stream = stream;
    stream.onEnd.add(() => this.panel.status('Drained. Create a new stream to play again.'));
    stream.onError.add(error => this.panel.status(error.message));
    void stream.ready
      .then(() => {
        if (this.stream === stream) {
          this.start();
        }
      })
      .catch(error => {
        if (this.stream === stream && stream.state !== 'destroyed') {
          this.panel.status(String(error));
        }
      });
  }

  private fillQueue(): void {
    const stream = this.stream;

    if (!stream || !this.panel.values.producing || stream.clearing || (stream.state !== 'ready' && stream.state !== 'running')) {
      return;
    }

    const targetFrames = Math.ceil(stream.sampleRate * 0.06);

    while (stream.bufferedFrames < targetFrames) {
      for (let frame = 0; frame < this.left.length; frame++) {
        const time = (this.cursor + frame) / stream.sampleRate;
        this.left[frame] = Math.sin(2 * Math.PI * 220 * time) * 0.12;
        this.right[frame] = Math.sin(2 * Math.PI * 330 * time) * 0.12;
      }

      if (!stream.enqueuePlanar(this.channels)) {
        break;
      }

      this.cursor += this.left.length;
    }
  }

  override update(): void {
    if (this.stream?.state === 'running') {
      this.fillQueue();
    }

    const stream = this.stream;

    if (!stream) {
      return;
    }

    this.label.text = [
      `State: ${stream.state}  |  220 Hz left / 330 Hz right  |  ${stream.sampleRate} Hz stereo`,
      `Queued: ${stream.bufferedFrames} / ${stream.capacityFrames} frames (${(stream.bufferedSeconds * 1000).toFixed(1)} ms)`,
      `Played: ${stream.playedFrames} frames`,
      `Accepted: ${stream.enqueuedFrames} frames  |  Queue peak: ${stream.highWaterFrames} frames`,
      `Starvation: ${stream.underruns} episodes / ${stream.underrunFrames} silent frames`,
      `Overflow: ${stream.overflowCount} blocks / ${stream.droppedFrames} frames`,
    ].join('\n');
  }

  override draw(context: RenderingContext): void {
    context.render(this.label);

    if (this.app.audio.locked) {
      context.render(this.prompt);
    }
  }

  override destroy(): void {
    this.stream?.destroy();
    this.stream = null;
    this.app.audio.onUnlock.remove(this.start);
    this.panel?.dispose();
    this.label?.destroy();
    this.prompt?.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { PcmStreamScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
});

await app.start(PcmStreamScene);
