import { Application, Color, Graphics, Music, Scene, Sprite, Text, Texture, View } from '@codexo/exojs';

const assets = globalThis.assets;

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

const title = 'VOID EMPEROR';

app.start(
    new (class extends Scene {
        async load(loader) {
            const bossUrl = assets?.textures?.shipA ?? 'assets/image/ship-a.png';
            const trackUrl = assets?.music?.loopMain ?? 'assets/demo/music/demo-loop-main.ogg';
            await loader.load(Texture, { boss: bossUrl });
            await loader.load(Music, { track: trackUrl });
        }
        init(loader) {
            this._view = new View(220, 300, 800, 600);
            this._bg = new Graphics();
            this._bars = new Graphics();
            this._barSize = { v: 0 };
            this._title = new Text('', { fill: 'white', fontSize: 56 });
            this._title.setPosition(150, 120);
            this._titleState = { count: 0 };
            this._boss = new Sprite(loader.get(Texture, 'boss'))
                .setAnchor(0.5)
                .setScale(0.4)
                .setPosition(560, 320)
                .setTint(new Color(255, 130, 130));
            this._music = loader.get(Music, 'track').setLoop(true).setVolume(0.2).play();

            this.app.tweens.create(this._barSize).to({ v: 70 }, 0.6).start();
            this.app.tweens.create(this._view.center).to({ x: 520, y: 300 }, 2.0).start();
            this.app.tweens.create(this._boss.scale).to({ x: 2.1, y: 2.1 }, 1.8).delay(1.1).start();
            this.app.tweens
                .create(this._titleState)
                .to({ count: title.length }, 1.0)
                .delay(1.6)
                .onUpdate(() => {
                    this._title.text = title.slice(0, this._titleState.count | 0);
                })
                .start();
            this.app.tweens.create(this._music).to({ volume: 0.85 }, 2.0).start();
        }
        draw(context) {
            context.backend.clear(new Color(16, 16, 24));
            this._bg.clear();
            this._bg.fillColor = new Color(36, 42, 70);
            this._bg.drawRectangle(-200, 0, 1600, 600);
            context.backend.setView(this._view);
            context.render(this._bg);
            context.render(this._boss);
            context.backend.setView(null);
            context.render(this._title);
            this._bars.clear();
            this._bars.fillColor = Color.black;
            this._bars.drawRectangle(0, 0, 800, this._barSize.v);
            this._bars.drawRectangle(0, 600 - this._barSize.v, 800, this._barSize.v);
            context.render(this._bars);
        }
    })()
);
