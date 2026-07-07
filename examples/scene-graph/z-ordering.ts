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

    override init(): void {
        const { width, height } = this.app.canvas;
        const texture = this.loader.get(Texture, 'image/ship-a.png');

        this.group = new Container();
        this.label = new Text('Press 1, 2, 3 — front: 3 (blue)', { fillColor: Color.white, fontSize: 18 });
        this.label.setPosition(18, 18);

        // Large, tightly spaced sprites so they clearly overlap — otherwise a
        // zIndex change has nothing visible to reorder.
        this.sprites = [0, 1, 2].map(index => {
            const sprite = new Sprite(texture)
                .setAnchor(0.5)
                .setScale(2.4)
                .setPosition(width / 2 - 90 + index * 90, height / 2);
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
        const names = ['1 (red)', '2 (green)', '3 (blue)'];
        this.label.text = `Press 1, 2, 3 — front: ${names[index]}`;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.group);
        context.render(this.label);
    }
}

app.start(new ZOrderingScene());
