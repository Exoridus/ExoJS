import {
  Application,
  Asset,
  type AudioStream,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  type RenderingContext,
  Scene,
  Text,
  type Voice,
} from '@codexo/exojs';
import { CompressorEffect } from '@codexo/exojs-audio-fx';
import { mountControlPanel, mountControls } from '@examples/runtime';

class CompressorScene extends Scene {
  private music!: AudioStream;
  private voice!: Voice;
  private compressor!: CompressorEffect;
  private meter = new Graphics();
  private label!: Text;
  private panel!: ReturnType<typeof mountControlPanel>;
  private hud!: ReturnType<typeof mountControls>;
  private bypass = false;

  override async load(): Promise<void> {
    this.music = await this.loader.load(Asset.type('music', 'audio/demo-loop-main.ogg'));
  }

  override init(): void {
    const audio = this.app.audio;
    this.compressor = new CompressorEffect({ threshold: -30, ratio: 6 });
    audio.music.addEffect(this.compressor);
    this.voice = audio.play(this.music, { bus: audio.music, loop: true, volume: 0.15 });
    this.label = new Text('', { fillColor: Color.white, fontSize: 24 });
    this.label.setPosition(380, 280);

    this.hud = mountControls({
      title: 'Compression',
      status: 'Quiet source. Choose Loud to push peaks over the threshold.',
      hint: 'The red meter reads CompressorEffect.reduction from the active audio node.',
    });
    this.panel = mountControlPanel({ title: 'Compression' });
    this.panel.addButton({ label: 'Quiet input', onClick: () => this.setInput(0.15) });
    this.panel.addButton({ label: 'Loud input', onClick: () => this.setInput(1) });
    this.panel.addToggle({
      label: 'Bypass',
      value: false,
      onChange: value => {
        if (value === this.bypass) {
          return;
        }
        this.bypass = value;
        if (value) {
          audio.music.removeEffect(this.compressor);
        } else {
          audio.music.addEffect(this.compressor);
        }
        this.hud.setStatus(value ? 'Compressor bypassed.' : 'Compressor active. Compare Quiet and Loud input.');
      },
    });
    this.panel.addSlider({
      label: 'Threshold (dB)',
      min: -50,
      max: -5,
      step: 1,
      value: -30,
      onChange: value => {
        this.compressor.threshold = value;
      },
    });
    this.panel.addSlider({
      label: 'Ratio',
      min: 1,
      max: 12,
      step: 0.5,
      value: 6,
      onChange: value => {
        this.compressor.ratio = value;
      },
    });
  }

  private setInput(volume: number): void {
    this.voice.volume = volume;
    this.hud.setStatus(`${volume === 1 ? 'Loud' : 'Quiet'} input; compressor ${this.bypass ? 'bypassed' : 'active'}.`);
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
    this.panel?.dispose();
    this.hud?.dispose();
    this.meter.destroy();
    this.label?.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { CompressorScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
  loader: { basePath: 'assets/' },
});

await app.start(CompressorScene);
