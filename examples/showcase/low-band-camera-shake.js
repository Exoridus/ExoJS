// Auto-generated from low-band-camera-shake.ts — edit the .ts source, not this file.
import { Asset } from '@codexo/exojs';
import { Application, Color, Scene, Sprite, Text, View } from '@codexo/exojs';
import { AudioAnalyser } from '@codexo/exojs-audio-fx';
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
class LowBandCameraShakeScene extends Scene {
    music;
    musicVoice;
    analyser;
    view;
    sprite;
    hud;
    tapPrompt;
    async load(loader) {
        this.music = await loader.load(Asset.kind('music', assets.demo.audio.musicLoop));
        await loader.load(assets.demo.textures.shipA);
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this.analyser = new AudioAnalyser({ fftSize: 1024, source: this.app.audio.music });
        this.view = new View(width / 2, height / 2, width, height);
        this.sprite = new Sprite(loader.get(assets.demo.textures.shipA)).setAnchor(0.5).setScale(3).setPosition(width / 2, height / 2);
        this.hud = mountControls({
            title: 'Low Band Camera Shake',
            controls: [{ keys: 'Audio', action: 'low-band energy → shake' }],
            status: 'Listening…',
            hint: 'Shake amplitude tracks bass energy only — in silence the camera is perfectly still.',
        });
        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it and the queued music starts.
        this.tapPrompt = new Text('Click or press any key to start the music', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 64);
        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts automatically — play() returns the Voice now.
        this.musicVoice = this.app.audio.play(this.music, { loop: true, volume: 0.8 });
    }
    update(delta) {
        const low = this.analyser.getBandEnergy(20, 180);
        // No constant floor: amplitude is purely low-band energy, so a quiet
        // passage produces zero shake. A small deadzone keeps faint noise still.
        const amplitude = low > 0.04 ? low * 28 : 0;
        this.view.shake(amplitude, 90, { decay: true, frequency: 22 });
        // Advance the shake oscillation (the View only animates when updated).
        this.view.update(delta.milliseconds);
        if (this.musicVoice) {
            this.hud.setStatus(`bass ${(low * 100) | 0}%`);
        }
    }
    draw(context) {
        context.backend.clear(new Color(22, 24, 34));
        context.backend.setView(this.view);
        context.render(this.sprite);
        context.backend.setView(null);
        if (this.app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}
app.start(new LowBandCameraShakeScene());
