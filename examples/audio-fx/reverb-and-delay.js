// Auto-generated from reverb-and-delay.ts — edit the .ts source, not this file.
import { Application, Color, DelayFilter, Graphics, ReverbFilter, Scene, Sound, Text } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 860,
        height: 620,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});
document.body.append(app.canvas);
const sliders = [
    { key: 'reverbWet', y: 210 },
    { key: 'delayWet', y: 280 },
    { key: 'delayTime', y: 350 },
];
class ReverbAndDelayScene extends Scene {
    sound;
    reverb;
    delay;
    gfx;
    labels;
    drag = -1;
    async load(loader) {
        await loader.load(Sound, { sfx: 'audio/impact-light.ogg' });
    }
    init(loader) {
        this.sound = loader.get(Sound, 'sfx');
        this.reverb = new ReverbFilter({ wet: 0.4 });
        this.delay = new DelayFilter({ wet: 0.35, delaySeconds: 0.25, feedback: 0.45 });
        app.audio.sound.addFilter(this.reverb);
        app.audio.sound.addFilter(this.delay);
        this.gfx = new Graphics();
        this.labels = sliders.map(() => new Text('', { fillColor: Color.white, fontSize: 16 }));
        this.app.input.onPointerDown.add(p => {
            this.drag = this.pick(p.y);
            this.set(p.x);
        });
        this.app.input.onPointerMove.add(p => {
            this.set(p.x);
        });
        this.app.input.onPointerUp.add(() => {
            this.drag = -1;
        });
        this.app.input.onPointerTap.add(p => {
            if (p.y > 470)
                this.sound.play({ replace: true });
        });
    }
    pick(y) {
        for (let i = 0; i < sliders.length; i++)
            if (Math.abs(y - sliders[i].y) <= 14)
                return i;
        return -1;
    }
    set(x) {
        if (this.drag < 0)
            return;
        const t = Math.max(0, Math.min(1, (x - 260) / 420));
        if (this.drag === 0)
            this.reverb.wet = t;
        if (this.drag === 1)
            this.delay.wet = t;
        if (this.drag === 2)
            this.delay.delaySeconds = 0.02 + t * 0.8;
    }
    draw(context) {
        context.backend.clear();
        this.gfx.clear();
        const values = [this.reverb.wet, this.delay.wet, this.delay.delaySeconds / 0.82];
        const names = [
            `reverb wet: ${this.reverb.wet.toFixed(2)}`,
            `delay wet: ${this.delay.wet.toFixed(2)}`,
            `delay time: ${this.delay.delaySeconds.toFixed(2)}s`,
        ];
        for (let i = 0; i < sliders.length; i++) {
            this.gfx.fillColor = new Color(70, 70, 70);
            this.gfx.drawRectangle(260, sliders[i].y - 6, 420, 12);
            this.gfx.fillColor = new Color(255, 190, 120);
            this.gfx.drawRectangle(260, sliders[i].y - 6, 420 * values[i], 12);
            this.labels[i].text = names[i];
            this.labels[i].setPosition(110, sliders[i].y - 12);
            context.render(this.labels[i]);
        }
        this.gfx.fillColor = new Color(200, 200, 200);
        this.gfx.drawRectangle(280, 495, 300, 40);
        context.render(this.gfx);
    }
}
app.start(new ReverbAndDelayScene());
