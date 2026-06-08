// Auto-generated from low-band-camera-shake.ts — edit the .ts source, not this file.
import { Application, AudioAnalyser, Color, Music, Scene, Sprite, Texture, View } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});
document.body.append(app.canvas);
class LowBandCameraShakeScene extends Scene {
    music;
    analyser;
    view;
    sprite;
    async load(loader) {
        await loader.load(Music, { track: assets.demo.audio.musicLoop });
        await loader.load(Texture, { ship: assets.demo.textures.shipA });
    }
    init(loader) {
        this.music = loader.get(Music, 'track').setLoop(true).setVolume(0.8).play();
        this.analyser = new AudioAnalyser({ fftSize: 1024 });
        this.analyser.source = this.music;
        this.view = new View(400, 300, 800, 600);
        this.sprite = new Sprite(loader.get(Texture, 'ship')).setAnchor(0.5).setScale(2).setPosition(400, 300);
    }
    update() {
        const low = this.analyser.getBandEnergy(20, 180);
        this.view.shake(2 + low * 26, 90, { decay: true, frequency: 22 });
    }
    draw(context) {
        context.backend.clear(new Color(22, 24, 34));
        context.backend.setView(this.view);
        context.render(this.sprite);
        context.backend.setView(null);
    }
}
app.start(new LowBandCameraShakeScene());
