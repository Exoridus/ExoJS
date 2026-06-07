// Auto-generated from frequency-bands.ts — edit the .ts source, not this file.
import { Application, AudioAnalyser, Color, Graphics, Music, Scene } from '@codexo/exojs';
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
class FrequencyBandsScene extends Scene {
    music;
    analyser;
    bars;
    levels = { low: 0, mid: 0, high: 0 };
    async load(loader) {
        await loader.load(Music, { track: 'audio/demo-loop-main.ogg' });
    }
    init(loader) {
        this.music = loader.get(Music, 'track').setLoop(true).setVolume(0.8).play();
        this.analyser = new AudioAnalyser({ fftSize: 1024 });
        this.analyser.source = this.music;
        this.bars = new Graphics();
    }
    update() {
        const v = this.analyser.getLowMidHigh();
        this.levels.low = v.low;
        this.levels.mid = v.mid;
        this.levels.high = v.high;
    }
    draw(context) {
        context.backend.clear();
        this.bars.clear();
        const values = [this.levels.low, this.levels.mid, this.levels.high];
        const colors = [new Color(255, 140, 120), new Color(130, 220, 255), new Color(150, 255, 150)];
        for (let i = 0; i < 3; i++) {
            this.bars.fillColor = new Color(60, 60, 60);
            this.bars.drawRectangle(180 + i * 170, 420, 110, -260);
            this.bars.fillColor = colors[i];
            this.bars.drawRectangle(180 + i * 170, 420, 110, -260 * values[i]);
        }
        context.render(this.bars);
    }
}
app.start(new FrequencyBandsScene());
