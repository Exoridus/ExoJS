import { Application, Color, Graphics, Music, Scene, Sound, Text } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

const rows = [
    { name: 'Master', y: 200, color: new Color(255, 180, 120), bus: () => app.audio.master },
    { name: 'Music', y: 290, color: new Color(120, 200, 255), bus: () => app.audio.music },
    { name: 'SFX', y: 380, color: new Color(130, 255, 170), bus: () => app.audio.sound },
];

class AudioBusesScene extends Scene {
    private music!: Music;
    private sfx!: Sound;
    private graphics!: Graphics;
    private labels!: Text[];
    private drag = -1;

    override async load(loader): Promise<void> {
        await loader.load(Music, { music: assets.demo.audio.musicLoop });
        await loader.load(Sound, { sfx: assets.demo.audio.uiClick });
    }

    override init(loader): void {
        this.music = loader.get(Music, 'music').setLoop(true).setVolume(0.6).play();
        this.sfx = loader.get(Sound, 'sfx');
        this.graphics = new Graphics();
        this.labels = rows.map(row => new Text('', { fillColor: Color.white, fontSize: 18 }).setPosition(150, row.y - 34));

        this.app.input.onPointerDown.add(p => {
            this.drag = this.rowFromY(p.y);
            this.updateSlider(p.x);
        });
        this.app.input.onPointerMove.add(p => {
            this.updateSlider(p.x);
        });
        this.app.input.onPointerUp.add(() => {
            this.drag = -1;
        });
        this.app.input.onPointerTap.add(p => {
            if (p.y > 460) this.sfx.play();
        });
    }

    private rowFromY(y: number): number {
        for (let i = 0; i < rows.length; i++) {
            if (Math.abs(y - rows[i].y) <= 24) return i;
        }
        return -1;
    }

    private updateSlider(x: number): void {
        if (this.drag < 0) return;
        const t = Math.max(0, Math.min(1, (x - 200) / 420));
        rows[this.drag].bus().volume = t;
    }

    override draw(context): void {
        context.backend.clear();
        this.graphics.clear();
        rows.forEach((row, index) => {
            const value = row.bus().volume;
            const db = 20 * Math.log10(Math.max(0.0001, value));
            this.labels[index].text = `${row.name}: ${db.toFixed(1)} dB`;
            this.graphics.fillColor = new Color(55, 55, 55);
            this.graphics.drawRectangle(200, row.y - 8, 420, 16);
            this.graphics.fillColor = row.color;
            this.graphics.drawRectangle(200, row.y - 8, 420 * value, 16);
        });
        this.graphics.fillColor = new Color(200, 200, 200);
        this.graphics.drawRectangle(250, 485, 300, 36);
        context.render(this.graphics);
        for (const label of this.labels) context.render(label);
    }
}

app.start(new AudioBusesScene());
