import { Application, Color, Scene, Video } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
    backend: { type: 'webgpu' },
});

document.body.append(app.canvas);

app.start(new class extends Scene {

    async load(loader) {
        await loader.load(Video, { example: 'video/example.webm' });
    }
    init(loader) {
        const { width, height } = this.app.canvas;

        this._video = loader.get(Video, 'example');
        this._video.setAnchor(0.5);
        this._video.setPosition(width / 2, height / 2);
        this._video.width = 384;
        this._video.height = 216;
        this._video.play({ loop: true, muted: false, volume: 0.5 });

        this.app.inputManager.onPointerTap.add(() => this._video.toggle());
    }
    update() {
        const time = this.app.activeTime.seconds;

        this._video.x = (this.app.canvas.width / 2) + Math.sin(time * 1.2) * 54;
        this._video.y = (this.app.canvas.height / 2) + Math.cos(time * 1.7) * 22;
        this._video.rotation = Math.sin(time * 0.9) * 6;

        const scale = 1 + (Math.sin(time * 2) * 0.08);
        this._video.setScale(scale);
    }
    draw(backend) {
        backend.clear();
        this._video.render(backend);

    }
    unload() {
        this._video?.stop({ time: 0 });
        this._video?.destroy();
        this._video = null;
    }
    destroy() {
        this._video?.stop({ time: 0 });
        this._video?.destroy();
        this._video = null;
    }
}).catch((error) => {
    app.canvas.remove();
    app.destroy();

    throw error;
});

