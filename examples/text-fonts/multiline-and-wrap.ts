import { Application, Color, Scene, Text } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 980,
        height: 620,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

const paragraph = 'ExoJS text layout can render multiline content with configurable wrapping behavior and style.';
const longToken = 'ExoJStextlayoutrendersaverylongunbrokentokenwithoutanyspacestobreakon';

const titleColor = new Color(140, 170, 210);

class MultilineAndWrapScene extends Scene {
    private titleA!: Text;
    private textA!: Text;
    private titleB!: Text;
    private textB!: Text;
    private titleC!: Text;
    private textC!: Text;

    override init(): void {
        this.titleA = new Text('No wrap — single line overflows the bounds', { fillColor: titleColor, fontSize: 16 });
        this.titleA.setPosition(40, 50);
        this.textA = new Text(paragraph, { fillColor: Color.white, fontSize: 22 });
        this.textA.setPosition(40, 80);

        this.titleB = new Text('Word wrap @ 360px — breaks at word boundaries', { fillColor: titleColor, fontSize: 16 });
        this.titleB.setPosition(40, 210);
        this.textB = new Text(paragraph, { fillColor: Color.white, fontSize: 22 }, { maxWidth: 360 });
        this.textB.setPosition(40, 240);

        this.titleC = new Text('Break words @ 280px — splits a long token', { fillColor: titleColor, fontSize: 16 });
        this.titleC.setPosition(40, 430);
        this.textC = new Text(longToken, { fillColor: Color.white, fontSize: 22 }, { maxWidth: 280, breakWords: true });
        this.textC.setPosition(40, 460);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.titleA);
        context.render(this.titleB);
        context.render(this.titleC);
        context.render(this.textA);
        context.render(this.textB);
        context.render(this.textC);
    }
}

app.start(new MultilineAndWrapScene());
