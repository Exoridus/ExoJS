// Auto-generated from local-vs-global-transform.ts — edit the .ts source, not this file.
import { Application, Color, Container, Scene, Sprite, Text, Texture } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});
document.body.append(app.canvas);
class LocalVsGlobalTransformScene extends Scene {
    parent;
    localSprite;
    globalSprite;
    localLabel;
    globalLabel;
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }
    init(loader) {
        const texture = loader.get(Texture, 'bunny');
        this.parent = new Container().setPosition(250, 300);
        this.localSprite = new Sprite(texture)
            .setAnchor(0.5)
            .setScale(0.8)
            .setPosition(120, 0)
            .setTint(new Color(120, 190, 255));
        this.globalSprite = new Sprite(texture)
            .setAnchor(0.5)
            .setScale(0.8)
            .setPosition(580, 300)
            .setTint(new Color(255, 190, 120));
        this.parent.addChild(this.localSprite);
        this.localLabel = new Text('inherited rotation', { fillColor: Color.white, fontSize: 16 });
        this.localLabel.setPosition(180, 80);
        this.globalLabel = new Text('screen-space', { fillColor: Color.white, fontSize: 16 });
        this.globalLabel.setPosition(520, 80);
    }
    update(delta) {
        this.parent.rotate(delta.seconds * 60);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.parent);
        context.render(this.globalSprite);
        context.render(this.localLabel);
        context.render(this.globalLabel);
    }
}
app.start(new LocalVsGlobalTransformScene());
