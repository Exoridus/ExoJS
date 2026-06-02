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

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Sound, { sfx: 'audio/impact-light.ogg' });
        }
        init(loader) {
            this._sound = loader.get(Sound, 'sfx');
            this._reverb = new ReverbFilter({ wet: 0.4 });
            this._delay = new DelayFilter({ wet: 0.35, delaySeconds: 0.25, feedback: 0.45 });
            app.audio.sound.addFilter(this._reverb);
            app.audio.sound.addFilter(this._delay);
            this._gfx = new Graphics();
            this._labels = sliders.map(() => new Text('', { fillColor: Color.white, fontSize: 16 }));
            this._drag = -1;
            this.app.input.onPointerDown.add(p => {
                this._drag = this._pick(p.y);
                this._set(p.x);
            });
            this.app.input.onPointerMove.add(p => {
                this._set(p.x);
            });
            this.app.input.onPointerUp.add(() => {
                this._drag = -1;
            });
            this.app.input.onPointerTap.add(p => {
                if (p.y > 470) this._sound.play({ replace: true });
            });
        }
        _pick(y) {
            for (let i = 0; i < sliders.length; i++) if (Math.abs(y - sliders[i].y) <= 14) return i;
            return -1;
        }
        _set(x) {
            if (this._drag < 0) return;
            const t = Math.max(0, Math.min(1, (x - 260) / 420));
            if (this._drag === 0) this._reverb.wet = t;
            if (this._drag === 1) this._delay.wet = t;
            if (this._drag === 2) this._delay.delaySeconds = 0.02 + t * 0.8;
        }
        draw(context) {
            context.backend.clear();
            this._gfx.clear();
            const values = [this._reverb.wet, this._delay.wet, this._delay.delaySeconds / 0.82];
            const names = [
                `reverb wet: ${this._reverb.wet.toFixed(2)}`,
                `delay wet: ${this._delay.wet.toFixed(2)}`,
                `delay time: ${this._delay.delaySeconds.toFixed(2)}s`,
            ];
            for (let i = 0; i < sliders.length; i++) {
                this._gfx.fillColor = new Color(70, 70, 70);
                this._gfx.drawRectangle(260, sliders[i].y - 6, 420, 12);
                this._gfx.fillColor = new Color(255, 190, 120);
                this._gfx.drawRectangle(260, sliders[i].y - 6, 420 * values[i], 12);
                this._labels[i].text = names[i];
                this._labels[i].setPosition(110, sliders[i].y - 12);
                context.render(this._labels[i]);
            }
            this._gfx.fillColor = new Color(200, 200, 200);
            this._gfx.drawRectangle(280, 495, 300, 40);
            context.render(this._gfx);
        }
    })()
);
