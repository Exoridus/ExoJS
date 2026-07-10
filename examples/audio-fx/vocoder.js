// Auto-generated from vocoder.ts — edit the .ts source, not this file.
import { Application, Asset, AudioBus, AudioGenerator, Color, Scene, Text } from '@codexo/exojs';
import { VocoderEffect } from '@codexo/exojs-audio-fx';
import { mountControlPanel, mountControls } from '@examples/runtime';
const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});
// Spoken phrases (Kenney Voiceover Pack, CC0) — a voice modulator is what makes
// a vocoder recognisable as the classic "robot voice" effect.
const PHRASES = [
    { key: 'congrats', label: 'Congratulations', asset: assets.demo.voice.congratulations },
    { key: 'mission', label: 'Mission complete', asset: assets.demo.voice.missionComplete },
    { key: 'objective', label: 'Objective achieved', asset: assets.demo.voice.objectiveAchieved },
];
class VocoderScene extends Scene {
    modulatorBus;
    vocoder;
    phrases = new Map();
    phraseIndex = 0;
    phraseLabel;
    tapPrompt;
    hud;
    init() {
        const { width, height } = this.app.canvas;
        // The spoken voice is the modulator: route every phrase onto its own bus
        // so the vocoder can read its spectral envelope.
        this.modulatorBus = new AudioBus('modulator', { parent: app.audio.master });
        app.audio.registerBus(this.modulatorBus);
        for (const phrase of PHRASES) {
            // phrase.asset is a widened `string` (not a path literal), so the
            // path-only get() overload can't infer Sound from the extension —
            // use the explicit Sound token form.
            this.phrases.set(phrase.key, this.loader.get(Asset.kind('sound', phrase.asset)));
        }
        this.vocoder = new VocoderEffect({ modulator: this.modulatorBus, numBands: 16, wet: 1 });
        app.audio.sound.addEffect(this.vocoder);
        this.phraseLabel = new Text('', { fillColor: Color.white, fontSize: 28, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height / 2);
        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it and the queued carrier starts.
        this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 48);
        this.hud = mountControls({
            title: 'Vocoder',
            controls: [{ keys: 'Click', action: 'speak the phrase' }],
            hint: 'A spoken voice modulates a sustained saw carrier — the classic robot-voice effect.',
        });
        const panel = mountControlPanel({ title: 'Vocoder' });
        panel.addCycle({
            label: 'Phrase',
            options: PHRASES.map(phrase => phrase.label),
            index: 0,
            onChange: index => (this.phraseIndex = index),
        });
        panel.addButton({ label: 'Speak', onClick: () => this.speak() });
        this.app.input.onPointerTap.add(() => this.speak());
        // The carrier is a sustained saw tone shaped by the voice envelope.
        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts the carrier automatically.
        this.app.audio.play(new AudioGenerator({ frequency: 110, type: 'sawtooth' }), { volume: 0.45 });
        this.hud.setStatus('Ready — pick a phrase and speak.');
    }
    speak() {
        // The pointer gesture also unlocks the AudioContext; speaking while
        // still locked would be silent, so wait until audio is ready.
        if (this.app.audio.locked) {
            return;
        }
        const phrase = PHRASES[this.phraseIndex];
        const sound = this.phrases.get(phrase.key);
        if (sound)
            this.app.audio.play(sound, { bus: this.modulatorBus });
        this.hud.setStatus(`Speaking: "${phrase.label}"`);
        this.phraseLabel.text = `"${phrase.label}"`;
    }
    draw(context) {
        context.backend.clear();
        context.render(this.phraseLabel);
        if (this.app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}
app.start(new VocoderScene());
