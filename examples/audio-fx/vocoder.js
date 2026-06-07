// Auto-generated from vocoder.ts — edit the .ts source, not this file.
import { Application, AudioBus, Color, Music, OscillatorSound, Scene, Text, VocoderFilter } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});
document.body.append(app.canvas);
class VocoderScene extends Scene {
    modBus;
    mod;
    carrier;
    vocoder;
    active = false;
    text;
    async load(loader) {
        await loader.load(Music, { mod: 'audio/demo-loop-main.ogg' });
    }
    init(loader) {
        this.modBus = new AudioBus('modulator', { parent: app.audio.master });
        app.audio.registerBus(this.modBus);
        this.mod = loader.get(Music, 'mod').setLoop(true).setVolume(0.9);
        this.mod.bus = this.modBus;
        this.carrier = new OscillatorSound({ frequency: 110, type: 'sawtooth', volume: 0.4 });
        this.vocoder = new VocoderFilter({ modulator: this.modBus, numBands: 14, wet: 1.0 });
        app.audio.sound.addFilter(this.vocoder);
        this.text = new Text('Click to toggle vocoder (voice mod + saw carrier)', { fillColor: Color.white, fontSize: 22 });
        this.text.setPosition(120, 280);
        this.app.input.onPointerTap.add(() => {
            this.active = !this.active;
            if (this.active) {
                this.mod.play();
                this.carrier.play({ replace: true });
            }
            else {
                this.mod.pause();
                this.carrier.pause();
            }
        });
    }
    draw(context) {
        context.backend.clear();
        context.render(this.text);
    }
}
app.start(new VocoderScene());
