// Auto-generated from multiple-scenes.ts — edit the .ts source, not this file.
import { Application, Color, Keyboard, Scene, Text } from '@codexo/exojs';
class MenuScene extends Scene {
    label;
    onTap;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.label = new Text('MENU\nClick to Start', { align: 'center', fillColor: Color.white, fontSize: 34, fontWeight: 'bold' });
        this.label.setAnchor(0.5);
        this.label.setPosition(width / 2, height / 2);
        this.inputs.onTrigger(Keyboard.Space, () => {
            void app.scenes.setScene(GameScene);
        });
        this.onTap = () => {
            void app.scenes.setScene(GameScene);
        };
        app.input.onPointerTap.add(this.onTap);
    }
    draw(context) {
        context.backend.clear(new Color(18, 38, 72, 1));
        context.render(this.label);
    }
    destroy() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        app.input.onPointerTap.remove(this.onTap);
        super.destroy();
    }
}
class GameScene extends Scene {
    label;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.label = new Text('GAME\nEsc to Menu', { align: 'center', fillColor: Color.white, fontSize: 34, fontWeight: 'bold' });
        this.label.setAnchor(0.5);
        this.label.setPosition(width / 2, height / 2);
        this.inputs.onTrigger(Keyboard.Escape, () => {
            void app.scenes.setScene(MenuScene);
        });
    }
    draw(context) {
        context.backend.clear(new Color(24, 72, 42, 1));
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
