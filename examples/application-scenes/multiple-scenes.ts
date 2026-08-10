import { Application, Color, Keyboard, type RenderingContext, Scene, Text } from '@codexo/exojs';

class MenuScene extends Scene {
    private label!: Text;
    private onTap!: () => void;

    override init(): void {
        const app = this.app;
        const { width, height } = app;

        // Each scene owns its background: `init` runs once per activation, so
        // navigating back and forth repaints the frame in this scene's colour.
        app.clearColor.set(18, 38, 72, 1);

        this.label = new Text('MENU\nClick to Start', { align: 'center', fillColor: Color.white, fontSize: 34, fontWeight: 'bold' });
        this.label.setAnchor(0.5);
        this.label.setPosition(width / 2, height / 2);

        this.inputs.onTrigger(Keyboard.Space, () => {
            void app.scenes.change(GameScene);
        });

        this.onTap = () => {
            void app.scenes.change(GameScene);
        };
        app.input.onPointerTap.add(this.onTap);
    }

    override draw(context: RenderingContext): void {
        context.render(this.label);
    }

    override destroy(): void {
        const app = this.app;
        app.input.onPointerTap.remove(this.onTap);
        super.destroy();
    }
}

class GameScene extends Scene {
    private label!: Text;

    override init(): void {
        const app = this.app;
        const { width, height } = app;

        app.clearColor.set(24, 72, 42, 1);

        this.label = new Text('GAME\nEsc to Menu', { align: 'center', fillColor: Color.white, fontSize: 34, fontWeight: 'bold' });
        this.label.setAnchor(0.5);
        this.label.setPosition(width / 2, height / 2);

        this.inputs.onTrigger(Keyboard.Escape, () => {
            void app.scenes.change(MenuScene);
        });
    }

    override draw(context: RenderingContext): void {
        context.render(this.label);
    }
}

const app = new Application({
    scenes: { MenuScene, GameScene },
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

app.start(MenuScene);
