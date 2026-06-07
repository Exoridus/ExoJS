import { Application, Color, Graphics, Scene, Sound, Text } from '@codexo/exojs';

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

class MovingSourceScene extends Scene {
    private sound!: Sound;
    private listener!: { x: number; y: number };
    private angle = 0;
    private graphics!: Graphics;
    private text!: Text;

    override async load(loader): Promise<void> {
        await loader.load(Sound, { tone: 'audio/impact-light.ogg' });
    }

    override init(loader): void {
        this.sound = loader.get(Sound, 'tone');
        this.sound.position = { x: 560, y: 300 };
        this.sound.setLoop(true).setVolume(1).play();
        this.listener = { x: 400, y: 300 };
        app.audio.listener.target = this.listener;
        this.angle = 0;
        this.graphics = new Graphics();
        this.text = new Text('Auto-circling spatial source', { fillColor: Color.white, fontSize: 20 });
        this.text.setPosition(230, 20);
    }

    override update(delta): void {
        this.angle += delta.seconds * 1.1;
        this.sound.position = {
            x: this.listener.x + Math.cos(this.angle) * 210,
            y: this.listener.y + Math.sin(this.angle) * 120,
        };
    }

    override draw(context): void {
        context.backend.clear();
        this.graphics.clear();
        this.graphics.fillColor = new Color(120, 255, 160);
        this.graphics.drawCircle(this.listener.x, this.listener.y, 12);
        this.graphics.fillColor = new Color(255, 150, 120);
        this.graphics.drawCircle(this.sound.position.x, this.sound.position.y, 16);
        context.render(this.graphics);
        context.render(this.text);
    }
}

app.start(new MovingSourceScene());
