import {
  Application,
  Color,
  type ColorTextureFormat,
  createFilterShader,
  FixedResolutionCanvasSizing,
  getAudioContext,
  type PixelRead,
  type PixelReader,
  type RenderingContext,
  RenderTexture,
  Scene,
  ShaderFilter,
  Text,
  TextureFormat,
  UniformType,
} from '@codexo/exojs';
import { PcmStreamSource } from '@codexo/exojs/audio-fx';
import { choice, type ChoiceSpec, type DemoPanel, demoPanel, toggle, type ToggleSpec } from '@examples/runtime';

const blockFrames = 1024;
const readbackSlots = 2;
const capacityFrames = 8192;
const FORMATS = {
  'rgba8 (packed 16-bit)': TextureFormat.Rgba8,
  rgba32f: TextureFormat.Rgba32F,
  rgba16f: TextureFormat.Rgba16F,
} as const satisfies Record<string, ColorTextureFormat>;

type FormatName = keyof typeof FORMATS;

const soundShader = createFilterShader({
  uniforms: { sampleOffset: UniformType.Int, sampleRate: UniformType.Float, packed: UniformType.Int },
  glsl: {
    fragment: `#version 300 es
precision highp float;
precision highp int;
out vec4 fragColor;
vec2 renderSound(float timeSeconds, int sampleIndex) {
  return 0.12 * sin(6.28318530718 * vec2(220.0, 330.0) * timeSeconds);
}
void main() {
  int sampleIndex = uniforms.sampleOffset + int(gl_FragCoord.x);
  vec2 pcm = renderSound(float(sampleIndex) / uniforms.sampleRate, sampleIndex);
  if (uniforms.packed == 0) {
    fragColor = vec4(pcm, 0.0, 1.0);
  } else {
    vec2 word = floor((clamp(pcm, -1.0, 1.0) * 0.5 + 0.5) * 65535.0 + 0.5);
    fragColor = vec4(floor(word.x / 256.0), mod(word.x, 256.0), floor(word.y / 256.0), mod(word.y, 256.0)) / 255.0;
  }
}`,
  },
  wgsl: `
fn renderSound(timeSeconds: f32, sampleIndex: i32) -> vec2<f32> {
  return 0.12 * sin(6.28318530718 * vec2<f32>(220.0, 330.0) * timeSeconds);
}
@fragment fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let sampleIndex = uniforms.sampleOffset + i32(position.x);
  let pcm = renderSound(f32(sampleIndex) / uniforms.sampleRate, sampleIndex);
  if (uniforms.packed == 0) { return vec4<f32>(pcm, 0.0, 1.0); }
  let word = floor((clamp(pcm, vec2<f32>(-1.0), vec2<f32>(1.0)) * 0.5 + 0.5) * 65535.0 + 0.5);
  let high = floor(word / 256.0);
  let low = word - high * 256.0;
  return vec4<f32>(high.x, low.x, high.y, low.y) / 255.0;
}`,
});

class GpuPcmStreamScene extends Scene {
  private stream: PcmStreamSource | null = null;
  private reader: PixelReader<Uint8ClampedArray> | PixelReader<Float32Array> | null = null;
  private target: RenderTexture | null = null;
  private readonly input = new RenderTexture(1, 1);
  private filter: ShaderFilter<typeof soundShader.uniforms> | null = null;
  private readonly left = new Float32Array(blockFrames);
  private readonly right = new Float32Array(blockFrames);
  private readonly channels = [this.left, this.right];
  private readonly pending: Array<{ read: PixelRead<Uint8ClampedArray> | PixelRead<Float32Array>; submittedAt: number }> = [];
  private generatedFrames = 0;
  private readbackMs = 0;
  private starting = false;
  private active = false;
  private draining = false;
  private label!: Text;
  private prompt!: Text;
  private panel!: DemoPanel<{ format: ChoiceSpec<FormatName>; producing: ToggleSpec }>;

  private get format(): ColorTextureFormat {
    return FORMATS[this.panel.values.format];
  }

  override init(): void {
    this.label = new Text('', { fillColor: Color.white, fontSize: 23 }).setPosition(145, 190);
    this.prompt = new Text('Click or press any key to start the stream', { fillColor: Color.white, fontSize: 22, align: 'center' })
      .setAnchor(0.5)
      .setPosition(this.app.width / 2, this.app.height - 48);
    this.panel = demoPanel({
      title: 'GPU producer',
      controls: {
        format: choice('Readback format', Object.keys(FORMATS) as FormatName[]),
        producing: toggle('Produce PCM', true),
      },
      actions: {
        Drain: () => {
          if (this.active) {
            this.draining = true;
          }
        },
        'New stream': () => this.createStream(),
      },
      onChange: key => {
        // The mount-time calls arrive before the panel handle exists; init() creates the first stream once.
        if (key === 'format' && this.panel) {
          this.createStream();
        }
      },
    });
    // onUnlock replays when audio is already unlocked, so a warm context starts immediately.
    this.app.audio.onUnlock.add(this.start);
    this.createStream();
  }

  private readonly start = (): void => {
    const stream = this.stream;

    if (!stream || stream.state !== 'ready' || this.active || this.app.audio.locked) {
      return;
    }

    this.active = true;
    this.starting = true;
    this.panel.status('Prebuffering GPU samples...');
  };

  private releaseStream(): void {
    this.active = false;
    this.starting = false;
    this.draining = false;
    this.reader?.destroy();
    this.reader = null;
    this.pending.length = 0;
    this.filter?.destroy();
    this.filter = null;
    this.target?.destroy();
    this.target = null;
    this.stream?.destroy();
    this.stream = null;
  }

  private createStream(): void {
    this.releaseStream();
    this.panel.status('');
    this.generatedFrames = 0;
    this.readbackMs = 0;
    const context = this.app.rendering;

    if (!context.supportsReadbackFormat(this.format)) {
      this.panel.status(`${this.format} readback is unsupported. Choose another format.`);

      return;
    }

    try {
      this.filter = ShaderFilter.from(soundShader);
      this.target = new RenderTexture(blockFrames, 1, { format: this.format });
      this.reader =
        this.format === TextureFormat.Rgba8
          ? context.createPixelReader(this.target, { slots: readbackSlots })
          : context.createPixelReader(this.target, { slots: readbackSlots, dataType: 'float32' });
      const stream = new PcmStreamSource({ channels: 2, capacityFrames, bus: this.app.audio.music });
      this.stream = stream;
      this.filter.uniforms.sampleRate.set(stream.sampleRate);
      this.filter.uniforms.packed.set(this.format === TextureFormat.Rgba8 ? 1 : 0);
      stream.onEnd.add(() => this.panel.status('Drained. Create a new stream to play again.'));
      stream.onError.add(error => this.fail(error));
      void stream.ready
        .then(() => {
          if (this.stream === stream) {
            this.start();
          }
        })
        .catch(error => {
          if (this.stream === stream) {
            this.fail(error);
          }
        });
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    this.releaseStream();
    this.panel.status(String(error));
  }

  private pump(context: RenderingContext): void {
    const stream = this.stream;
    const reader = this.reader;
    const filter = this.filter;

    if (!this.active || !stream || !reader || !this.target || !filter) {
      return;
    }

    if (stream.state !== 'ready' && stream.state !== 'running') {
      return;
    }

    const targetFrames = Math.min(capacityFrames, Math.ceil((stream.sampleRate * 0.1) / blockFrames) * blockFrames);

    while (this.pending.length > 0) {
      const first = this.pending[0]!;

      if (first.read.failed) {
        throw new Error('GPU readback failed; create a new stream.');
      }

      if (!first.read.ready || stream.bufferedFrames + blockFrames > capacityFrames) {
        break;
      }

      const data = first.read.data!.data;

      for (let frame = 0; frame < blockFrames; frame++) {
        const offset = frame * 4;
        this.left[frame] =
          this.format === TextureFormat.Rgba8 ? ((data[offset]! * 256 + data[offset + 1]!) / 65535) * 2 - 1 : data[offset]!;
        this.right[frame] =
          this.format === TextureFormat.Rgba8 ? ((data[offset + 2]! * 256 + data[offset + 3]!) / 65535) * 2 - 1 : data[offset + 1]!;
      }

      if (!stream.enqueuePlanar(this.channels)) {
        break;
      }

      this.readbackMs = performance.now() - first.submittedAt;
      // enqueuePlanar copies synchronously, so the slot can be reused now.
      first.read.release();
      this.pending.shift();
    }

    if (this.starting && (stream.bufferedFrames >= targetFrames || this.draining)) {
      stream.start(getAudioContext().currentTime + 0.02);
      this.starting = false;
      this.panel.status('');
    }

    if (this.draining) {
      if (this.pending.length === 0) {
        stream.close();
        this.active = false;
      }

      return;
    }

    if (!this.panel.values.producing) {
      return;
    }

    // Reserve queue space for every pending read before rendering another block.
    while (reader.inFlight < readbackSlots && stream.bufferedFrames + this.pending.length * blockFrames + blockFrames <= targetFrames) {
      filter.uniforms.sampleOffset.set(this.generatedFrames);
      filter.apply(context.backend, this.input, this.target);
      const read = reader.request();

      if (!read) {
        break;
      }

      this.pending.push({ read, submittedAt: performance.now() });
      this.generatedFrames += blockFrames;
    }
  }

  override draw(context: RenderingContext): void {
    try {
      this.pump(context);
    } catch (error) {
      this.fail(error);
    }

    const stream = this.stream;
    this.label.text = [
      `Format: ${this.format} | ${stream?.state ?? 'unavailable'} | ${stream?.sampleRate ?? 0} Hz stereo`,
      `Generated: ${this.generatedFrames} | Accepted: ${stream?.enqueuedFrames ?? 0} | Played: ${stream?.playedFrames ?? 0}`,
      `PCM queue: ${stream?.bufferedFrames ?? 0} / ${capacityFrames} | Peak: ${stream?.highWaterFrames ?? 0} frames (${((stream?.bufferedSeconds ?? 0) * 1000).toFixed(1)} ms)`,
      `Readback: ${this.pending.length} / ${readbackSlots} slots | last observed wait: ${this.readbackMs.toFixed(1)} ms`,
      `Starvation: ${stream?.underruns ?? 0} episodes / ${stream?.underrunFrames ?? 0} silent frames`,
      `Overflow: ${stream?.overflowCount ?? 0} blocks | ${this.panel.values.producing ? 'Producer enabled' : 'Producer paused'}`,
    ].join('\n');
    context.render(this.label);

    if (this.app.audio.locked) {
      context.render(this.prompt);
    }
  }

  override destroy(): void {
    this.releaseStream();
    this.input.destroy();
    this.app.audio.onUnlock.remove(this.start);
    this.panel?.dispose();
    this.label?.destroy();
    this.prompt?.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { GpuPcmStreamScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
});

await app.start(GpuPcmStreamScene);
