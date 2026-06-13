import { Application, AudioBus, Color, OscillatorSound, Scene, Sound, Text, VocoderFilter } from '@codexo/exojs';
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
const PHRASES: Array<{ key: string; label: string; asset: string }> = [
    { key: 'congrats', label: 'Congratulations', asset: assets.demo.voice.congratulations },
    { key: 'mission', label: 'Mission complete', asset: assets.demo.voice.missionComplete },
    { key: 'objective', label: 'Objective achieved', asset: assets.demo.voice.objectiveAchieved },
];

class VocoderScene extends Scene {
    private modulatorBus!: AudioBus;
    private carrier!: OscillatorSound;
    private vocoder!: VocoderFilter;
    private voices = new Map<string, Sound>();
    private phraseIndex = 0;
    private phraseLabel!: Text;
    private tapPrompt!: Text;
    private hud!: ReturnType<typeof mountControls>;

    override async load(loader): Promise<void> {
        await loader.load(
            Sound,
            Object.fromEntries(PHRASES.map(phrase => [phrase.key, phrase.asset])),
        );
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        // The spoken voice is the modulator: route every phrase onto its own bus
        // so the vocoder can read its spectral envelope.
        this.modulatorBus = new AudioBus('modulator', { parent: app.audio.master });
        app.audio.registerBus(this.modulatorBus);

        for (const phrase of PHRASES) {
            const voice = loader.get(Sound, phrase.key);

            voice.bus = this.modulatorBus;
            this.voices.set(phrase.key, voice);
        }

        // The carrier is a sustained synth tone shaped by the voice envelope.
        this.carrier = new OscillatorSound({ frequency: 110, type: 'sawtooth', volume: 0.45 });
        this.vocoder = new VocoderFilter({ modulator: this.modulatorBus, numBands: 16, wet: 1 });
        app.audio.sound.addFilter(this.vocoder);

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

        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts the sustained carrier automatically.
        this.carrier.play();
        this.hud.setStatus('Ready — pick a phrase and speak.');
    }

    private speak(): void {
        // The pointer gesture also unlocks the AudioContext; speaking while
        // still locked would be silent, so wait until audio is ready.
        if (this.app.audio.locked) {
            return;
        }

        const phrase = PHRASES[this.phraseIndex];

        this.voices.get(phrase.key)?.play({ replace: true });
        this.hud.setStatus(`Speaking: "${phrase.label}"`);
        this.phraseLabel.text = `"${phrase.label}"`;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.phraseLabel);

        if (this.app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}

app.start(new VocoderScene());
