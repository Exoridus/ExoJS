// Auto-generated from vocoder.ts - edit the .ts source, not this file.
import { Application, Asset, AudioBus, AudioGenerator, Color, FixedResolutionCanvasSizing, Graphics, Scene, Text } from '@codexo/exojs';
import { AudioAnalyser, VocoderEffect } from '@codexo/exojs-audio-fx';
import { mountControls } from '@examples/runtime';
// Spoken phrases (Kenney Voiceover Pack, CC0) - a voice modulator is what makes
// a vocoder recognisable as the classic "robot voice" effect.
const PHRASES = [
  { key: 'congrats', label: 'Congratulations', asset: assets.demo.voice.congratulations },
  { key: 'mission', label: 'Mission complete', asset: assets.demo.voice.missionComplete },
  { key: 'objective', label: 'Objective achieved', asset: assets.demo.voice.objectiveAchieved },
];
class VocoderScene extends Scene {
  modulatorBus;
  vocoder;
  level;
  phrases = new Map();
  phraseIndex = 0;
  pulse = 0;
  gfx;
  phraseLabel;
  hintLabel;
  tapPrompt;
  hud;
  init() {
    const app = this.app;
    const { width, height } = app;
    // The spoken voice is the modulator: route every phrase onto its own bus
    // so the vocoder can read its spectral envelope.
    this.modulatorBus = new AudioBus('modulator', { parent: app.audio.master });
    app.audio.registerBus(this.modulatorBus);
    for (const phrase of PHRASES) {
      // phrase.asset is a widened `string` (not a path literal), so the
      // path-only get() overload can't infer Sound from the extension -
      // use the explicit Sound token form.
      this.phrases.set(phrase.key, this.loader.get(Asset.type('sound', phrase.asset)));
    }
    this.vocoder = new VocoderEffect({ modulator: this.modulatorBus, numBands: 16, wet: 1 });
    app.audio.sound.addEffect(this.vocoder);
    // Measured downstream of the vocoder, so the pulse tracks the robot
    // voice actually reaching the speakers, not the dry carrier.
    this.level = new AudioAnalyser({ source: app.audio.sound, smoothingTimeConstant: 0.6 });
    this.gfx = new Graphics();
    this.phraseLabel = new Text('', { fillColor: Color.white, fontSize: 28, align: 'center' }).setAnchor(0.5, 0.5).setPosition(width / 2, height / 2 - 130);
    this.hintLabel = new Text('', { fillColor: new Color(150, 162, 186), fontSize: 18 }).setAnchor(0.5, 0.5).setPosition(width / 2, height / 2 + 130);
    // Shown while the browser still blocks audio (`app.audio.locked`); the
    // first click or keypress unlocks it and the queued carrier starts.
    this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22, align: 'center' })
      .setAnchor(0.5, 0.5)
      .setPosition(width / 2, height - 48);
    this.hud = mountControls({
      title: 'Vocoder',
      controls: [
        { keys: 'Click', action: 'speak the phrase' },
        { keys: 'Right-click', action: 'next phrase' },
      ],
      hint: 'A spoken voice modulates a sustained saw carrier — the classic robot-voice effect.',
    });
    this.root.addChild(this.gfx, this.phraseLabel, this.hintLabel, this.tapPrompt);
    app.input.onPointerTap.add(() => this.speak());
    app.input.onContextMenu.add(() => this.selectPhrase(this.phraseIndex + 1));
    // The carrier is a sustained saw tone shaped by the voice envelope.
    // An oscillator played while audio is still locked is a no-op - it is
    // ephemeral and cannot be deferred - so start it from the unlock
    // gesture. Subscribing is safe even if audio unlocked earlier:
    // onUnlock replays.
    app.audio.onUnlock.add(() => {
      app.audio.play(new AudioGenerator({ frequency: 110, type: 'sawtooth' }), { volume: 0.45 });
    });
    this.hud.setStatus('Ready — click to speak, right-click to change phrase.');
    this.selectPhrase(0);
  }
  selectPhrase(next) {
    this.phraseIndex = (next + PHRASES.length) % PHRASES.length;
    this.hintLabel.text = `${this.phraseIndex + 1} / ${PHRASES.length} — "${PHRASES[this.phraseIndex].label}"`;
  }
  speak() {
    const app = this.app;
    // The pointer gesture also unlocks the AudioContext; speaking while
    // still locked would be silent, so wait until audio is ready.
    if (app.audio.locked) {
      return;
    }
    const phrase = PHRASES[this.phraseIndex];
    const sound = this.phrases.get(phrase.key);
    if (sound) app.audio.play(sound, { bus: this.modulatorBus });
    this.hud.setStatus(`Speaking: "${phrase.label}"`);
    this.phraseLabel.text = `"${phrase.label}"`;
  }
  draw(context) {
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
