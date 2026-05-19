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

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Music, { music: 'audio/example.ogg' });
        }
        init(loader) {
            this._music = loader.get(Music, 'music').setLoop(true).setVolume(0.8).play();
            this._filter = new CompressorFilter();
            app.audio.music.addFilter(this._filter);
            this._gfx = new Graphics();
            this._labels = sliders.map(() => new Text('', { fill: 'white', fontSize: 16 }));
            this._meterLabel = new Text('', { fill: 'white', fontSize: 16 });
            this._meterLabel.setPosition(120, 478);
            this._drag = -1;
            this.app.input.onPointerDown.add(p => {
                this._drag = this._sliderAt(p.y);
                this._apply(p.x);
            });
            this.app.input.onPointerMove.add(p => {
                this._apply(p.x);
            });
            this.app.input.onPointerUp.add(() => {
                this._drag = -1;
            });
        }
        _sliderAt(y) {
            for (let i = 0; i < sliders.length; i++) if (Math.abs(y - sliders[i].y) <= 16) return i;
            return -1;
        }
        _apply(x) {
            if (this._drag < 0) return;
            const def = sliders[this._drag];
            const t = Math.max(0, Math.min(1, (x - 260) / 420));
            this._filter[def.key] = def.min + (def.max - def.min) * t;
        }
        _value(def) {
            return this._filter[def.key];
        }
        draw(backend) {
            backend.clear();
            this._gfx.clear();
            for (let i = 0; i < sliders.length; i++) {
                const def = sliders[i];
                const val = this._value(def);
                const t = (val - def.min) / (def.max - def.min);
                this._gfx.fillColor = new Color(70, 70, 70);
                this._gfx.drawRectangle(260, def.y - 6, 420, 12);
                this._gfx.fillColor = new Color(120, 200, 255);
                this._gfx.drawRectangle(260, def.y - 6, 420 * t, 12);
                this._labels[i].setText(`${def.key}: ${val.toFixed(def.key === 'ratio' ? 2 : 3)}`);
                this._labels[i].setPosition(120, def.y - 12);
                this._labels[i].render(backend);
            }

            // Live gain-reduction meter (bottom). reduction is in dB, always <= 0.
            const reduction = this._filter.reduction;
            const meterT = Math.max(0, Math.min(1, -reduction / 24));
            this._gfx.fillColor = new Color(70, 70, 70);
            this._gfx.drawRectangle(260, 484, 420, 12);
            this._gfx.fillColor = new Color(255, 140, 140);
            this._gfx.drawRectangle(260, 484, 420 * meterT, 12);
            this._meterLabel.setText(`gain reduction: ${reduction.toFixed(1)} dB`);
            this._meterLabel.render(backend);

            this._gfx.render(backend);
        }
    })()
);
