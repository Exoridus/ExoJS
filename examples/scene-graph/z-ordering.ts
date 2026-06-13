import { Application, Color, Container, Keyboard, Scene, Sprite, Text, Texture } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

class ZOrderingScene extends Scene {
    private group!: Container;
    private label!: Text;
    private sprites!: Sprite[];

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.group = new Container();
        this.label = new Text('Press 1, 2, 3', { fillColor: Color.white, fontSize: 18 });
        this.label.setPosition(18, 18);

        this.sprites = [0, 1, 2].map(index => {
            const sprite = new Sprite(loader.get(Texture, 'bunny'))
                .setAnchor(0.5)
                .setScale(0.9)
                .setPosition(width / 2 - 60 + index * 60, height / 2);
            sprite.setTint([new Color(255, 120, 120), new Color(120, 255, 170), new Color(120, 170, 255)][index]);
            sprite.zIndex = index;
            this.group.addChild(sprite);
            return sprite;
        });

        this.inputs.onTrigger(Keyboard.One, () => this.setFront(0));
        this.inputs.onTrigger(Keyboard.Two, () => this.setFront(1));
        this.inputs.onTrigger(Keyboard.Three, () => this.setFront(2));
    }

    private setFront(index: number): void {
        this.sprites.forEach((sprite, i) => {
            sprite.zIndex = i === index ? 3 : i;
        });
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.group);
        context.render(this.label);
    }
}

app.start(new ZOrderingScene());
