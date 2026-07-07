import { Application, AudioBus, AudioStream, Color, Graphics, Scene, Sound, Text } from '@codexo/exojs';
import { AudioAnalyser, DuckingEffect } from '@codexo/exojs-audio-fx';
import { mountControls } from '@examples/runtime';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});

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
    private hud!: ReturnType<typeof mountControls>;

    override async init(): Promise<void> {
        const { width, height } = this.app.canvas;

        // Wide meters centred on the 16:9 canvas.
        this.barX = width * 0.1;
        this.barW = width * 0.8;
        this.musicBarY = height * 0.42;
        this.voiceBarY = height * 0.55;

        // AudioStream has no seamless adapter — await it explicitly.
        const { music } = await this.loader.load(AudioStream, { music: assets.demo.audio.musicLoop });
        this.music = music;
        // Path-only get() infers Sound from the .ogg extension — sidesteps a
        // compile-time overload ambiguity between Sound and the Json token form
        // when passing the Sound token explicitly.
        this.voice = this.loader.get(assets.demo.voice.congratulations);

        // Route the voice-over onto its own bus so it can drive the sidechain.
        this.voiceBus = new AudioBus('voice-over', { parent: app.audio.master });
        app.audio.registerBus(this.voiceBus);

        // The ducker listens to the voice bus and pulls the music bus down
        // whenever the voice exceeds the threshold.
        this.ducking = new DuckingEffect({ sidechain: this.voiceBus, threshold: -30, ratio: 6, attackMs: 25, releaseMs: 260 });
        app.audio.music.addEffect(this.ducking);

        // Tap each bus with a parallel analyser so we can show the live levels.
        // The music meter visibly dips while the voice meter spikes — that gap
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
        this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 48);

        this.hud = mountControls({
            title: 'Ducking',
            controls: [{ keys: 'Click', action: 'play the voice-over' }],
            status: 'Click or press any key to start…',
            hint: 'When the voice plays, the music meter ducks down while the voice meter spikes.',
        });

        this.app.input.onPointerTap.add(() => {
            // The pointer gesture also unlocks the AudioContext; firing while
            // still locked would be silent, so wait until audio is ready.
            if (this.app.audio.locked) return;
            this.app.audio.play(this.voice, { bus: this.voiceBus });
            this.hud.setStatus('Voice playing — music ducked');
        });

        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts automatically.
        this.app.audio.play(this.music, { loop: true, volume: 0.7 });
        this.hud.setStatus('Music playing — click to duck it');
    }

    private bar(label: Text, name: string, y: number, level: number, color: Color): void {
        this.gfx.fillColor = new Color(70, 70, 70);
        this.gfx.drawRectangle(this.barX, y, this.barW, 26);
        this.gfx.fillColor = color;
        this.gfx.drawRectangle(this.barX, y, this.barW * Math.min(1, level), 26);
        label.text = `${name}: ${(level * 100).toFixed(0)}%`;
    }

    override draw(context): void {
        // RMS reads 0 in silence, so the meters are honest (flat until audio plays).
        const music = this.musicLevel.getRms();
        const voice = this.voiceLevel.getRms();
        // Slew toward the live value; a touch of attack/decay keeps the bars readable.
        this.musicMeter += (music - this.musicMeter) * 0.3;
        this.voiceMeter += (voice - this.voiceMeter) * 0.5;

        context.backend.clear();
        this.gfx.clear();
        this.bar(this.musicLabel, 'music bus', this.musicBarY, this.musicMeter * 3, new Color(120, 200, 255));
        this.bar(this.voiceLabel, 'voice bus (sidechain)', this.voiceBarY, this.voiceMeter * 3, new Color(255, 190, 120));
        context.render(this.gfx);
        context.render(this.musicLabel);
        context.render(this.voiceLabel);

        if (this.app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}

app.start(new DuckingScene());
