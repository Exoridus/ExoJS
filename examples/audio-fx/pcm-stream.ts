import { Application, Color, FixedResolutionCanvasSizing, getAudioContext, type RenderingContext, Scene, Text } from '@codexo/exojs';
import { PcmStreamSource } from '@codexo/exojs-audio-fx';
import { mountControlPanel, mountControls } from '@examples/runtime';

class PcmStreamScene extends Scene {
  private stream: PcmStreamSource | null = null;
  private readonly left = new Float32Array(512);
  private readonly right = new Float32Array(512);
  private readonly channels = [this.left, this.right];
  private cursor = 0;
  private producing = true;
  private label!: Text;
  private panel!: ReturnType<typeof mountControlPanel>;
  private hud!: ReturnType<typeof mountControls>;

  override init(): void {
    this.label = new Text('', { fillColor: Color.white, fontSize: 26 }).setPosition(170, 190);
    this.hud = mountControls({
      title: 'Streaming stereo PCM',
      status: 'Loading audio. Press Start when ready.',
      hint: 'Pause the producer to hear starvation. Clear empties the queue; Drain finishes it.',
    });
    this.panel = mountControlPanel({ title: 'PCM producer' });
    this.panel.addButton({
      label: 'Start',
      onClick: () => {
        const stream = this.stream;
        if (!stream || stream.state !== 'ready') return;
        void getAudioContext()
          .resume()
          .then(() => {
            if (this.stream !== stream || stream.state !== 'ready') return;
            this.fillQueue();
            stream.start(getAudioContext().currentTime + 0.02);
            this.hud.setStatus('Playing 220 Hz left / 330 Hz right through the music bus.');
          })
          .catch(error => this.hud.setStatus(String(error)));
      },
    });
    this.panel.addToggle({
      label: 'Produce PCM',
      value: true,
      onChange: value => {
        this.producing = value;
      },
    });
    this.panel.addButton({ label: 'Clear queue', onClick: () => this.stream?.clear() });
    this.panel.addButton({ label: 'Drain', onClick: () => this.stream?.close() });
    this.panel.addButton({ label: 'New stream', onClick: () => this.createStream() });
    this.createStream();
  }

  private createStream(): void {
    this.stream?.destroy();
    this.cursor = 0;
    const stream = new PcmStreamSource({ channels: 2, capacityFrames: 8192, bus: this.app.audio.music });
    this.stream = stream;
    stream.onEnd.add(() => this.hud.setStatus('Drained. Create a new stream to play again.'));
    stream.onError.add(error => this.hud.setStatus(error.message));
    void stream.ready
      .then(() => {
        if (this.stream === stream) this.hud.setStatus('Ready. Press Start to unlock audio and begin.');
      })
      .catch(error => {
        if (this.stream === stream && stream.state !== 'destroyed') this.hud.setStatus(String(error));
      });
  }

  private fillQueue(): void {
    const stream = this.stream;
    if (!stream || !this.producing || stream.clearing || (stream.state !== 'ready' && stream.state !== 'running')) return;
    const targetFrames = Math.ceil(stream.sampleRate * 0.06);
    while (stream.bufferedFrames < targetFrames) {
      for (let frame = 0; frame < this.left.length; frame++) {
        const time = (this.cursor + frame) / stream.sampleRate;
        this.left[frame] = Math.sin(2 * Math.PI * 220 * time) * 0.12;
        this.right[frame] = Math.sin(2 * Math.PI * 330 * time) * 0.12;
      }
      if (!stream.enqueuePlanar(this.channels)) break;
      this.cursor += this.left.length;
    }
  }

  override update(): void {
    if (this.stream?.state === 'running') this.fillQueue();
    const stream = this.stream;
    if (!stream) return;
    this.label.text = [
      `State: ${stream.state}  |  ${stream.sampleRate} Hz stereo`,
      `Queued: ${stream.bufferedFrames} / ${stream.capacityFrames} frames (${(stream.bufferedSeconds * 1000).toFixed(1)} ms)`,
      `Played: ${stream.playedFrames} frames`,
      `Accepted: ${stream.enqueuedFrames} frames  |  Queue peak: ${stream.highWaterFrames} frames`,
      `Starvation: ${stream.underruns} episodes / ${stream.underrunFrames} silent frames`,
      `Overflow: ${stream.overflowCount} blocks / ${stream.droppedFrames} frames`,
    ].join('\n');
  }

  override draw(context: RenderingContext): void {
    context.render(this.label);
  }

  override destroy(): void {
    this.stream?.destroy();
    this.stream = null;
    this.panel?.dispose();
    this.hud?.dispose();
    this.label?.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { PcmStreamScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
});

await app.start(PcmStreamScene);
