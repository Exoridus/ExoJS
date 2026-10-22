import {
  Application,
  AudioBus,
  type AudioStream,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  type RenderingContext,
  Scene,
  type Sound,
  Text,
} from '@codexo/exojs';
import { AudioAnalyser, DuckingEffect } from '@codexo/exojs/audio-fx';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';

const VOICE_VOLUME = 0.4;

class DuckingScene extends Scene {
  private music!: AudioStream;
  private voice!: Sound;
  private voiceBus!: AudioBus;
  private ducking!: DuckingEffect;
  private musicLevel!: AudioAnalyser;
  private voiceLevel!: AudioAnalyser;
  private gfx!: Graphics;
  private musicLabel!: Text;
  private voiceLabel!: Text;
  private tapPrompt!: Text;
  // Smoothed bar levels so the meters glide instead of flickering frame-to-frame.
  private musicMeter = 0;
  private voiceMeter = 0;
  // Canvas-relative bar layout computed in init().
  private barX = 0;
  private barW = 0;
  private musicBarY = 0;
  private voiceBarY = 0;
  private clickPrompt!: Text;
  private readonly playVoice = (): void => {
    // The pointer gesture also unlocks the AudioContext; firing while
    // still locked would be silent, so wait until audio is ready.
    if (!this.app.audio.locked) {
      this.audio.play(this.voice, { bus: this.voiceBus, volume: VOICE_VOLUME });
    }
  };

  override async load(): Promise<void> {
    const app = this.app;
    const { width, height } = app;

    // Wide meters centred on the 16:9 canvas.
    this.barX = width * 0.1;
    this.barW = width * 0.8;
    this.musicBarY = height * 0.42;
    this.voiceBarY = height * 0.55;

    // AudioStream has no seamless adapter - await it explicitly.
    const music = await this.loader.load(assets.musicLoopMain);
    this.music = music;
    // Path-only get() infers Sound from the .ogg extension - sidesteps a
    // compile-time overload ambiguity between Sound and the Json token form
    // when passing the Sound token explicitly.
    this.voice = this.loader.get(assets.voiceCongratulations);

    // Route the voice-over onto its own bus so it can drive the sidechain.
    this.voiceBus = new AudioBus('voice-over', { parent: app.audio.master });
    app.audio.registerBus(this.voiceBus);

    // The ducker listens to the voice bus and pulls the music bus down
    // whenever the voice exceeds the threshold.
    this.ducking = new DuckingEffect({
      sidechain: this.voiceBus,
      // The sidechain receives the attenuated voice, so lower its threshold by the same gain.
      threshold: -30 + 20 * Math.log10(VOICE_VOLUME),
      ratio: 6,
      attackMs: 25,
      releaseMs: 260,
    });
    app.audio.music.addEffect(this.ducking);

    // Tap each bus with a parallel analyser so we can show the live levels.
    // The music meter visibly dips while the voice meter spikes - that gap
    // is the duck.
    this.musicLevel = new AudioAnalyser({ source: app.audio.music, smoothingTimeConstant: 0.85 });
    this.voiceLevel = new AudioAnalyser({ source: this.voiceBus, smoothingTimeConstant: 0.6 });

    this.gfx = new Graphics();
    this.musicLabel = new Text('', { fillColor: Color.white, fontSize: 17 });
    this.musicLabel.setPosition(this.barX, this.musicBarY - 26);
    this.voiceLabel = new Text('', { fillColor: Color.white, fontSize: 17 });
    this.voiceLabel.setPosition(this.barX, this.voiceBarY - 26);

    // Shown while the browser still blocks audio (`app.audio.locked`); the
    // first click or keypress unlocks it and the queued music starts.
    this.tapPrompt = new Text('Click or press any key to start the music', { fillColor: Color.white, fontSize: 22, align: 'center' })
      .setAnchor(0.5, 0.5)
      .setPosition(width / 2, height - 48);

    this.clickPrompt = new Text('Click to play the voice-over', { fillColor: Color.white, fontSize: 22, align: 'center' })
      .setAnchor(0.5, 0.5)
      .setPosition(width / 2, height - 48);

    app.input.onPointerTap.add(this.playVoice);

    // Core defers playback until the AudioContext unlocks on the first
    // gesture, then starts automatically.
    this.audio.play(this.music, { loop: true, volume: 0.5 });
  }

  private bar(label: Text, name: string, y: number, level: number, color: Color): void {
    this.gfx.fillColor = new Color(70, 70, 70);
    this.gfx.drawRectangle(this.barX, y, this.barW, 26);
    this.gfx.fillColor = color;
    this.gfx.drawRectangle(this.barX, y, this.barW * Math.min(1, level), 26);
    label.text = `${name}: ${(level * 100).toFixed(0)}%`;
  }

  override draw(context: RenderingContext): void {
    const app = this.app;
    // RMS reads 0 in silence, so the meters are honest (flat until audio plays).
    const music = this.musicLevel.getRms();
    const voice = this.voiceLevel.getRms();
    // Slew toward the live value; a touch of attack/decay keeps the bars readable.
    this.musicMeter += (music - this.musicMeter) * 0.3;
    this.voiceMeter += (voice - this.voiceMeter) * 0.5;

    this.gfx.clear();
    this.bar(this.musicLabel, 'music bus', this.musicBarY, this.musicMeter * 3, new Color(120, 200, 255));
    this.bar(this.voiceLabel, 'voice bus (sidechain)', this.voiceBarY, this.voiceMeter * 3, new Color(255, 190, 120));
    context.render(this.gfx);
    context.render(this.musicLabel);
    context.render(this.voiceLabel);

    context.render(app.audio.locked ? this.tapPrompt : this.clickPrompt);
  }

  override destroy(): void {
    this.app.input.onPointerTap.remove(this.playVoice);
    this.musicLevel?.destroy();
    this.voiceLevel?.destroy();

    if (this.ducking) {
      this.app.audio.music.removeEffect(this.ducking);
      this.ducking.destroy();
    }

    if (this.voiceBus) {
      this.app.audio.unregisterBus(this.voiceBus);
      this.voiceBus.destroy();
    }

    this.gfx?.destroy();
    this.musicLabel?.destroy();
    this.voiceLabel?.destroy();
    this.tapPrompt?.destroy();
    this.clickPrompt?.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { DuckingScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});

await app.start(DuckingScene);
