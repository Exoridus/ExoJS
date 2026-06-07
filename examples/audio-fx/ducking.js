// Auto-generated from ducking.ts — edit the .ts source, not this file.
import { audio } from '@assets';
import { Application, AudioBus, Color, DuckingFilter, Music, Scene, Sound, Text } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});
document.body.append(app.canvas);
class DuckingScene extends Scene {
    music;
    voice;
    voiceBus;
    ducking;
    text;
    async load(loader) {
        await loader.load(Music, { music: audio.musicLoop });
        await loader.load(Sound, { voice: audio.uiConfirm });
    }
    init(loader) {
        this.music = loader.get(Music, 'music').setLoop(true).setVolume(0.7).play();
        this.voice = loader.get(Sound, 'voice');
        this.voiceBus = new AudioBus('voice-over', { parent: app.audio.master });
        app.audio.registerBus(this.voiceBus);
        this.voice.bus = this.voiceBus;
        this.ducking = new DuckingFilter({ sidechain: this.voiceBus, threshold: -30, ratio: 6, attackMs: 25, releaseMs: 260 });
        app.audio.music.addFilter(this.ducking);
        this.text = new Text('Click to play voice-over and duck music', { fillColor: Color.white, fontSize: 24 });
        this.text.setPosition(140, 280);
        this.app.input.onPointerTap.add(() => {
            this.voice.play({ replace: true });
        });
    }
    draw(context) {
        context.backend.clear();
        context.render(this.text);
    }
}
app.start(new DuckingScene());
