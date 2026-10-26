import {
  Application,
  type AudioStream,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  type RenderingContext,
  Scene,
  Text,
  type Voice,
} from '@codexo/exojs';
import { CompressorEffect } from '@codexo/exojs/audio-fx';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { choice, demoPanel, slider, toggle } from '@examples/runtime';

class CompressorScene extends Scene {
  private music!: AudioStream;
  private voice!: Voice;
  private compressor!: CompressorEffect;
  private meter = new Graphics();
  private label!: Text;
  private bypass = false;

  override async load(): Promise<void> {
    this.music = await this.loader.load(assets.musicLofiRhodes);
  }

  override init(): void {
    const audio = this.app.audio;
    this.compressor = new CompressorEffect({ threshold: -30, ratio: 6 });
    audio.music.addEffect(this.compressor);
    this.voice = audio.play(this.music, { bus: audio.music, loop: true, volume: 0.15 });
    this.label = new Text('', { fillColor: Color.white, fontSize: 24 });
    this.label.setPosition(380, 280);

    // The loud input is hot enough to push the peaks well over the threshold
    // without being louder than the rest of the catalog, and it ramps rather
    // than jumps so switching never spikes.
    demoPanel({
      scene: this,
      controls: {
        input: choice('Input', ['Quiet', 'Loud']),
        bypass: toggle('Bypass'),
        threshold: slider('Threshold (dB)', { min: -50, max: -5, step: 1, value: -30, format: v => v.toFixed(0) }),
        ratio: slider('Ratio', { min: 1, max: 12, step: 0.5, value: 6, format: v => `${v.toFixed(1)}:1` }),
      },
      onChange: (key, _value, values) => {
        if (key === 'input') {
          this.tweens
            .create(this.voice)
            .to({ volume: values.input === 'Loud' ? 0.6 : 0.15 }, 0.4)
            .start();
        } else if (key === 'bypass' && values.bypass !== this.bypass) {
          this.bypass = values.bypass;

          if (this.bypass) {
            audio.music.removeEffect(this.compressor);
          } else {
            audio.music.addEffect(this.compressor);
          }
        }

        this.compressor.threshold = values.threshold;
        this.compressor.ratio = values.ratio;
      },
    });
  }

  override draw(context: RenderingContext): void {
    const reduction = this.bypass ? 0 : this.compressor.reduction;
    this.meter.clear();
    this.meter.fillColor = new Color(65, 70, 84);
    this.meter.drawRectangle(380, 340, 520, 26);
    this.meter.fillColor = new Color(245, 105, 105);
    this.meter.drawRectangle(380, 340, 520 * Math.max(0, Math.min(1, -reduction / 24)), 26);
    this.label.text = `Live gain reduction: ${reduction.toFixed(1)} dB`;
    context.render(this.meter);
    context.render(this.label);
  }

  override destroy(): void {
    this.voice?.stop();

    if (!this.bypass) {
      this.app.audio.music.removeEffect(this.compressor);
    }

    this.compressor?.destroy();
    this.meter.destroy();
    this.label?.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { CompressorScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
});

await app.start(CompressorScene);
