import { Application, Color, Scene, Video } from 'exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(Scene.create({

    async load(loader) {
        await loader.load(Video, { example: 'video/example.webm' });
    },
    init(loader) {
        const { width, height } = this.app.canvas;

        this._video = loader.get(Video, 'example');
        this._video.width = width;
        this._video.height = height;
        this._video.applyOptions({ loop: true, muted: false, volume: 0.5 });

        this.app.inputManager.onPointerTap.add(() => this._video.toggle());
    },

    draw(renderManager) {
        renderManager.clear();
        this._video.render(renderManager);
    },
}));
