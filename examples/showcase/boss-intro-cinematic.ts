import { assets } from '@assets';
import { Application, Color, Graphics, Music, Scene, Sprite, Text, Texture, View } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

const title = 'VOID EMPEROR';

class BossIntroCinematicScene extends Scene {
    private view!: View;
    private bg!: Graphics;
    private bars!: Graphics;
    private barSize!: { v: number };
    private title!: Text;
    private titleState!: { count: number };
    private boss!: Sprite;
    private music!: Music;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { boss: assets.demo.textures.shipA });
        await loader.load(Music, { track: assets.demo.music.loopMain });
    }

    override init(loader): void {
        this.view = new View(220, 300, 800, 600);
        this.bg = new Graphics();
        this.bars = new Graphics();
        this.barSize = { v: 0 };
        this.title = new Text('', { fillColor: Color.white, fontSize: 56, fontWeight: 'bold' });
        this.title.setPosition(150, 120);
        this.titleState = { count: 0 };
        this.boss = new Sprite(loader.get(Texture, 'boss'))
            .setAnchor(0.5)
            .setScale(0.4)
            .setPosition(560, 320)
            .setTint(new Color(255, 130, 130));
        this.music = loader.get(Music, 'track').setLoop(true).setVolume(0.2).play();

        this.app.tweens.create(this.barSize).to({ v: 70 }, 0.6).start();
        this.app.tweens.create(this.view.center).to({ x: 520, y: 300 }, 2.0).start();
        this.app.tweens.create(this.boss.scale).to({ x: 2.1, y: 2.1 }, 1.8).delay(1.1).start();
        this.app.tweens
            .create(this.titleState)
            .to({ count: title.length }, 1.0)
            .delay(1.6)
            .onUpdate(() => {
                this.title.text = title.slice(0, this.titleState.count | 0);
            })
            .start();
        this.app.tweens.create(this.music).to({ volume: 0.85 }, 2.0).start();
    }

    override draw(context): void {
        context.backend.clear(new Color(16, 16, 24));
        this.bg.clear();
        this.bg.fillColor = new Color(36, 42, 70);
        this.bg.drawRectangle(-200, 0, 1600, 600);
        context.backend.setView(this.view);
        context.render(this.bg);
        context.render(this.boss);
        context.backend.setView(null);
        context.render(this.title);
        this.bars.clear();
        this.bars.fillColor = Color.black;
        this.bars.drawRectangle(0, 0, 800, this.barSize.v);
        this.bars.drawRectangle(0, 600 - this.barSize.v, 800, this.barSize.v);
        context.render(this.bars);
    }
}

app.start(new BossIntroCinematicScene());
