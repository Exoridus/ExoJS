import { Application, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene, type Sound, Text } from '@codexo/exojs';
import { DelayEffect, ReverbEffect } from '@codexo/exojs/audio-fx';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { choice, type ChoiceSpec, type DemoPanel, demoPanel, toggle, type ToggleSpec } from '@examples/runtime';

interface Preset {
  readonly reverbWet: number;
  readonly decay: number;
  readonly delayWet: number;
  readonly delaySeconds: number;
  readonly feedback: number;
}

const PRESETS = {
  'Small room': { reverbWet: 0.3, decay: 1.3, delayWet: 0.12, delaySeconds: 0.18, feedback: 0.2 },
  'Large hall': { reverbWet: 0.55, decay: 5, delayWet: 0.18, delaySeconds: 0.32, feedback: 0.3 },
  Echo: { reverbWet: 0.12, decay: 1.5, delayWet: 0.55, delaySeconds: 0.48, feedback: 0.55 },
} as const satisfies Record<string, Preset>;

type PresetName = keyof typeof PRESETS;

class ReverbAndDelayScene extends Scene {
  private sound!: Sound;
  private reverb!: ReverbEffect;
  private delay!: DelayEffect;
  private label!: Text;
  private prompt!: Text;
  private panel!: DemoPanel<{ preset: ChoiceSpec<PresetName>; bypass: ToggleSpec }>;

  override init(): void {
    const audio = this.app.audio;
    this.sound = this.loader.get(assets.soundImpactLight);
    this.reverb = new ReverbEffect({ wet: 0.3, decay: 1.3 });
    this.delay = new DelayEffect({ wet: 0.12, delaySeconds: 0.18, feedback: 0.2 });
    audio.sound.addEffect(this.reverb);
    audio.sound.addEffect(this.delay);

    this.label = new Text('Sound -> Reverb -> Delay -> Sound bus', { fillColor: Color.white, fontSize: 25 });
    this.label.setPosition(365, 250);
    this.prompt = new Text('Click or press any key to enable audio', { fillColor: Color.white, fontSize: 22 });
    this.prompt.setPosition(415, 330);

    this.panel = demoPanel({
      title: 'Space and echoes',
      controls: {
        preset: choice('Preset', Object.keys(PRESETS) as PresetName[]),
        bypass: toggle('Bypass', false),
      },
      actions: {
        'Play impact': () => {
          if (!audio.locked) {
            audio.play(this.sound, { bus: audio.sound, volume: 0.4 });
          }
        },
      },
      onChange: (_key, _value, values) => this.applyPreset(PRESETS[values.preset], values.bypass),
    });
  }

  private applyPreset(preset: Preset, bypass: boolean): void {
    this.reverb.decay = preset.decay;
    this.delay.delaySeconds = preset.delaySeconds;
    this.delay.feedback = preset.feedback;
    this.reverb.wet = bypass ? 0 : preset.reverbWet;
    this.delay.wet = bypass ? 0 : preset.delayWet;
    this.panel?.status(bypass ? 'Bypassed: dry impact' : `Reverb ${this.reverb.wet.toFixed(2)}, delay ${this.delay.wet.toFixed(2)}`);
  }

  override draw(context: RenderingContext): void {
    context.render(this.label);

    if (this.app.audio.locked) {
      context.render(this.prompt);
    }
  }

  override destroy(): void {
    this.app.audio.sound.removeEffect(this.delay).removeEffect(this.reverb);
    this.delay?.destroy();
    this.reverb?.destroy();
    this.panel?.dispose();
    this.label?.destroy();
    this.prompt?.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { ReverbAndDelayScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
});

await app.start(ReverbAndDelayScene);
