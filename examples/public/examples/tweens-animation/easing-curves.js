import { Application, Color, Ease, Scene, Sprite, Text, Texture } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

const easings = [
    ['linear', Ease.linear],
    ['quadIn', Ease.quadIn],
    ['quadOut', Ease.quadOut],
    ['cubicInOut', Ease.cubicInOut],
    ['sineInOut', Ease.sineInOut],
    ['backOut', Ease.backOut],
    ['bounceOut', Ease.bounceOut],
    ['elasticOut', Ease.elasticOut],
];

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/bunny.png' });
        }
        init(loader) {
            const texture = loader.get(Texture, 'bunny');
            this._rows = easings.map(([name, easing], index) => {
                const y = 70 + index * 64;
                const sprite = new Sprite(texture)
                    .setAnchor(0.5)
                    .setScale(0.65)
                    .setPosition(90, y + 22);
                const label = new Text(name, { fill: 'white', fontSize: 14 });
                label.setPosition(18, y);
                const tween = this.app.tweens.create(sprite.position).to({ x: 730 }, 1.5).easing(easing).yoyo(true).repeat(-1).start();
                return { sprite, label, tween };
            });
        }
        draw(backend) {
            backend.clear();
            for (const row of this._rows) {
                row.sprite.render(backend);
                row.label.render(backend);
            }
        }
    })()
);
