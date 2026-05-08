import { Application, Color, Graphics, Music, Scene, Sound, Text } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

const rows = [
    { name: 'Master', y: 200, color: new Color(255, 180, 120), bus: () => app.audio.master },
    { name: 'Music', y: 290, color: new Color(120, 200, 255), bus: () => app.audio.music },
    { name: 'SFX', y: 380, color: new Color(130, 255, 170), bus: () => app.audio.sound },
];

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Music, { music: 'audio/example.ogg' });
            await loader.load(Sound, { sfx: 'audio/example.ogg' });
        }
        init(loader) {
            this._music = loader.get(Music, 'music').setLoop(true).setVolume(0.6).play();
            this._sfx = loader.get(Sound, 'sfx');
            this._graphics = new Graphics();
            this._labels = rows.map(row => new Text('', { fill: 'white', fontSize: 18 }).setPosition(150, row.y - 34));
            this._drag = -1;

            this.app.input.onPointerDown.add(p => {
                this._drag = this._rowFromY(p.y);
                this._updateSlider(p.x);
            });
            this.app.input.onPointerMove.add(p => {
                this._updateSlider(p.x);
            });
            this.app.input.onPointerUp.add(() => {
                this._drag = -1;
            });
            this.app.input.onPointerTap.add(p => {
                if (p.y > 460) this._sfx.play();
            });
        }
        _rowFromY(y) {
            for (let i = 0; i < rows.length; i++) {
                if (Math.abs(y - rows[i].y) <= 24) return i;
            }
            return -1;
        }
        _updateSlider(x) {
            if (this._drag < 0) return;
            const t = Math.max(0, Math.min(1, (x - 200) / 420));
            rows[this._drag].bus().volume = t;
        }
        draw(backend) {
            backend.clear();
            this._graphics.clear();
            rows.forEach((row, index) => {
                const value = row.bus().volume;
                const db = 20 * Math.log10(Math.max(0.0001, value));
                this._labels[index].setText(`${row.name}: ${db.toFixed(1)} dB`);
                this._graphics.fillColor = new Color(55, 55, 55);
                this._graphics.drawRectangle(200, row.y - 8, 420, 16);
                this._graphics.fillColor = row.color;
                this._graphics.drawRectangle(200, row.y - 8, 420 * value, 16);
            });
            this._graphics.fillColor = new Color(200, 200, 200);
            this._graphics.drawRectangle(250, 485, 300, 36);
            this._graphics.render(backend);
            for (const label of this._labels) label.render(backend);
        }
    })()
);
