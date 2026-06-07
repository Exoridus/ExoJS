// Auto-generated from compressor.ts — edit the .ts source, not this file.
import { Application, Color, CompressorFilter, Graphics, Music, Scene, Text } from '@codexo/exojs';
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
    { key: 'threshold', min: -60, max: 0, y: 190 },
    { key: 'ratio', min: 1, max: 16, y: 260 },
    { key: 'attack', min: 0.001, max: 0.2, y: 330 },
    { key: 'release', min: 0.02, max: 0.8, y: 400 },
];
class CompressorScene extends Scene {
    music;
    filter;
    gfx;
    labels;
    meterLabel;
    drag = -1;
    async load(loader) {
        await loader.load(Music, { music: 'audio/demo-loop-main.ogg' });
    }
    init(loader) {
        this.music = loader.get(Music, 'music').setLoop(true).setVolume(0.8).play();
        this.filter = new CompressorFilter();
        app.audio.music.addFilter(this.filter);
        this.gfx = new Graphics();
        this.labels = sliders.map(() => new Text('', { fillColor: Color.white, fontSize: 16 }));
        this.meterLabel = new Text('', { fillColor: Color.white, fontSize: 16 });
        this.meterLabel.setPosition(120, 478);
        this.app.input.onPointerDown.add(p => {
            this.drag = this.sliderAt(p.y);
            this.apply(p.x);
        });
        this.app.input.onPointerMove.add(p => {
            this.apply(p.x);
        });
        this.app.input.onPointerUp.add(() => {
            this.drag = -1;
        });
    }
    sliderAt(y) {
        for (let i = 0; i < sliders.length; i++)
            if (Math.abs(y - sliders[i].y) <= 16)
                return i;
        return -1;
    }
    apply(x) {
        if (this.drag < 0)
            return;
        const def = sliders[this.drag];
        const t = Math.max(0, Math.min(1, (x - 260) / 420));
        this.filter[def.key] = def.min + (def.max - def.min) * t;
    }
    value(def) {
        return this.filter[def.key];
    }
    draw(context) {
        context.backend.clear();
        this.gfx.clear();
        for (let i = 0; i < sliders.length; i++) {
            const def = sliders[i];
            const val = this.value(def);
            const t = (val - def.min) / (def.max - def.min);
            this.gfx.fillColor = new Color(70, 70, 70);
            this.gfx.drawRectangle(260, def.y - 6, 420, 12);
            this.gfx.fillColor = new Color(120, 200, 255);
            this.gfx.drawRectangle(260, def.y - 6, 420 * t, 12);
            this.labels[i].text = `${def.key}: ${val.toFixed(def.key === 'ratio' ? 2 : 3)}`;
            this.labels[i].setPosition(120, def.y - 12);
            context.render(this.labels[i]);
        }
        const reduction = this.filter.reduction;
        const meterT = Math.max(0, Math.min(1, -reduction / 24));
        this.gfx.fillColor = new Color(70, 70, 70);
        this.gfx.drawRectangle(260, 484, 420, 12);
        this.gfx.fillColor = new Color(255, 140, 140);
        this.gfx.drawRectangle(260, 484, 420 * meterT, 12);
        this.meterLabel.text = `gain reduction: ${reduction.toFixed(1)} dB`;
        context.render(this.meterLabel);
        context.render(this.gfx);
    }
}
app.start(new CompressorScene());
