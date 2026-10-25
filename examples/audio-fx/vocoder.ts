import {
  Application,
  AudioBus,
  AudioGenerator,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  type RenderingContext,
  Scene,
  type Sound,
  Text,
  type Voice,
} from '@codexo/exojs';
import { AudioAnalyser, VocoderEffect } from '@codexo/exojs/audio-fx';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { choice, type ChoiceSpec, type DemoPanel, demoPanel, toggle, type ToggleSpec } from '@examples/runtime';

// A spoken voice as modulator is what makes a vocoder recognisable as the
// classic "robot voice" effect.
const PHRASES = [
  { key: 'congrats', label: 'Congratulations', asset: assets.voiceCongratulations },
  { key: 'mission', label: 'Mission complete', asset: assets.voiceMissionComplete },
  { key: 'objective', label: 'Objective achieved', asset: assets.voiceObjectiveAchieved },
];

class VocoderScene extends Scene {
  private sidechainBus!: AudioBus;
  private modulatorBus!: AudioBus;
  private vocoder!: VocoderEffect;
  private level!: AudioAnalyser;
  private phrases = new Map<string, Sound>();
  private pulse = 0;
  private gfx!: Graphics;
  private phraseLabel!: Text;
  private tapPrompt!: Text;
  private panel!: DemoPanel<{ phrase: ChoiceSpec<string>; processed: ToggleSpec }>;
  private carrierVoice: Voice | null = null;
  private pendingPhrase = false;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    // The spoken voice is the modulator: route every phrase onto its own bus
    // so the vocoder can read its spectral envelope. The vocoder taps that
    // bus's output, so parenting it to a muted bus keeps the dry voice out of
    // the mix without starving the effect.
    this.sidechainBus = new AudioBus('vocoder-sidechain', { muted: true });
    app.audio.registerBus(this.sidechainBus);
    this.modulatorBus = new AudioBus('modulator', { parent: this.sidechainBus });
    app.audio.registerBus(this.modulatorBus);

    for (const phrase of PHRASES) {
      this.phrases.set(phrase.key, this.loader.get(phrase.asset));
    }

    this.vocoder = new VocoderEffect({ modulator: this.modulatorBus, numBands: 16, wet: 1 });
    app.audio.sound.addEffect(this.vocoder);
    // The voice samples are mastered close to full scale, dry or vocoded;
    // the sound bus leaves headroom for both.
    app.audio.sound.volume = 0.4;
    // Measured downstream of the vocoder, so the pulse tracks the robot
    // voice actually reaching the speakers, not the dry carrier.
    this.level = new AudioAnalyser({ source: app.audio.sound, smoothingTimeConstant: 0.6 });

    this.gfx = new Graphics();
    this.phraseLabel = new Text('', { fillColor: Color.white, fontSize: 28, align: 'center' })
      .setAnchor(0.5, 0.5)
      .setPosition(width / 2, height / 2 - 130);

    // Shown while the browser still blocks audio (`app.audio.locked`); the
    // first click or keypress unlocks it and the queued carrier starts.
    this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22, align: 'center' })
      .setAnchor(0.5, 0.5)
      .setPosition(width / 2, height - 48);

    this.panel = demoPanel({
      scene: this,
      title: 'Voice',
      controls: {
        phrase: choice(
          'Phrase',
          PHRASES.map(phrase => phrase.label),
        ),
        processed: toggle('Processed', true),
      },
      actions: { 'Speak phrase': () => this.speak() },
      onChange: (key, _value, values) => {
        if (key === 'processed') {
          this.vocoder.wet = values.processed ? 1 : 0;

          if (this.carrierVoice) {
            this.carrierVoice.volume = values.processed ? 0.4 : 0;
          }
        } else if (this.panel) {
          // The mount-time call arrives before the panel handle exists and must stay silent.
          this.speak();
        }
      },
    });

    this.root.addChild(this.gfx, this.phraseLabel);

    // The carrier is a sustained saw tone shaped by the voice envelope.
    // An oscillator played while audio is still locked is a no-op - it is
    // ephemeral and cannot be deferred - so start it from the unlock
    // gesture. Subscribing is safe even if audio unlocked earlier:
    // onUnlock replays.
    app.audio.onUnlock.add(this.startCarrier);
  }

  private readonly startCarrier = (): void => {
    this.carrierVoice ??= this.app.audio.play(new AudioGenerator({ frequency: 110, type: 'sawtooth' }), {
      bus: this.app.audio.sound,
      volume: this.panel.values.processed ? 0.4 : 0,
    });

    if (this.pendingPhrase) {
      this.pendingPhrase = false;
      this.speak();
    }
  };

  private speak(): void {
    const app = this.app;

    // The pointer gesture also unlocks the AudioContext; speaking while
    // still locked would be silent, so wait until audio is ready.
    if (app.audio.locked) {
      this.pendingPhrase = true;

      return;
    }

    const { phrase: label, processed } = this.panel.values;
    const phrase = PHRASES.find(candidate => candidate.label === label)!;
    const sound = this.phrases.get(phrase.key);

    if (sound) {
      app.audio.play(sound, { bus: processed ? this.modulatorBus : app.audio.sound });
    }

    this.phraseLabel.text = `"${phrase.label}"${processed ? '' : ' (dry)'}`;
  }

  override draw(context: RenderingContext): void {
    const app = this.app;
    const level = this.level.getRms();

    this.pulse += (level * 4 - this.pulse) * 0.35;

    const radius = 70 + Math.min(1, this.pulse) * 60;

    this.gfx.clear();
    this.gfx.fillColor = new Color(Math.floor(90 + this.pulse * 140), Math.floor(120 + this.pulse * 90), 255);
    this.gfx.drawCircle(app.width / 2, app.height / 2, radius);

    context.render(this.root);

    if (app.audio.locked) {
      context.render(this.tapPrompt);
    }
  }

  override destroy(): void {
    this.app.audio.onUnlock.remove(this.startCarrier);
    this.carrierVoice?.stop();
    this.app.audio.sound.removeEffect(this.vocoder);
    this.app.audio.sound.volume = 1;
    this.vocoder?.destroy();
    this.level?.destroy();
    this.app.audio.unregisterBus(this.modulatorBus);
    this.app.audio.unregisterBus(this.sidechainBus);
    this.panel?.dispose();
    this.tapPrompt?.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { VocoderScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});

await app.start(VocoderScene);
