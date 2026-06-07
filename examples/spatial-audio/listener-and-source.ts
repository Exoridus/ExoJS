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

class ListenerAndSourceScene extends Scene {
    private sound!: Sound;
    private dragging = false;
    private listener!: { x: number; y: number };
    private graphics!: Graphics;
    private label!: Text;

    override async load(loader): Promise<void> {
        await loader.load(Sound, { source: 'audio/impact-light.ogg' });
    }

    override init(loader): void {
        this.sound = loader.get(Sound, 'source');
        this.sound.position = { x: 560, y: 300 };
        this.sound.setLoop(true).setVolume(1).play();
        this.listener = { x: 400, y: 300 };
        app.audio.listener.target = this.listener;

        this.graphics = new Graphics();
        this.label = new Text('', { fillColor: Color.white, fontSize: 17 });
        this.label.setPosition(20, 20);

        this.app.input.onPointerDown.add(pointer => {
            const dx = pointer.x - this.sound.position.x;
            const dy = pointer.y - this.sound.position.y;
            if (dx * dx + dy * dy < 900) this.dragging = true;
        });
        this.app.input.onPointerMove.add(pointer => {
            if (!this.dragging) return;
            this.sound.position = { x: pointer.x, y: pointer.y };
        });
        this.app.input.onPointerUp.add(() => {
            this.dragging = false;
        });
    }

    override draw(context): void {
        const dx = this.sound.position.x - this.listener.x;
        const dy = this.sound.position.y - this.listener.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.label.text = `Drag source circle  distance: ${dist.toFixed(0)}`;

        context.backend.clear();
        this.graphics.clear();
        this.graphics.fillColor = new Color(120, 255, 160);
        this.graphics.drawCircle(this.listener.x, this.listener.y, 14);
        this.graphics.fillColor = new Color(255, 140, 140);
        this.graphics.drawCircle(this.sound.position.x, this.sound.position.y, 18);
        context.render(this.graphics);
        context.render(this.label);
    }
}

app.start(new ListenerAndSourceScene());
