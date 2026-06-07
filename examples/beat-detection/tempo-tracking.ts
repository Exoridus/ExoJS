import { Application, BeatDetector, Color, Graphics, Music, Scene, Text } from '@codexo/exojs';

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

class TempoTrackingScene extends Scene {
    private music!: Music;
    private detector!: BeatDetector;
    private text!: Text;
    private bar!: Graphics;

    override async load(loader): Promise<void> {
        await loader.load(Music, { track: 'audio/demo-loop-main.ogg' });
    }

    override init(loader): void {
        this.music = loader.get(Music, 'track').setLoop(true).setVolume(0.8).play();
        this.detector = new BeatDetector();
        this.detector.source = this.music;
        this.text = new Text('', { fillColor: Color.white, fontSize: 28 });
        this.text.setPosition(280, 220);
        this.bar = new Graphics();
    }

    override draw(context): void {
        const bpm = this.detector.tempo;
        const confidence = this.detector.confidence;
        this.text.text = `BPM ${bpm.toFixed(1)}\nconfidence ${confidence.toFixed(2)}`;
        context.backend.clear();
        this.bar.clear();
        this.bar.fillColor = new Color(70, 70, 70);
        this.bar.drawRectangle(220, 360, 360, 22);
        this.bar.fillColor = new Color(120, 220, 150);
        this.bar.drawRectangle(220, 360, 360 * confidence, 22);
        context.render(this.bar);
        context.render(this.text);
    }
}

app.start(new TempoTrackingScene());
