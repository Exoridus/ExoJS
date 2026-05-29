import { Application, Color, Scene, Video } from '@codexo/exojs';

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

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Video, { demo: 'video/demo-loop.webm' });
        }
        init(loader) {
            const { width, height } = this.app.canvas;

            this._video = loader.get(Video, 'demo');
            this._video.width = width;
            this._video.height = height;
            this._video.applyOptions({ loop: true, muted: false, volume: 0.5 });

            this.app.input.onPointerTap.add(() => this._video.toggle());
        }
        draw(context) {
            context.backend.clear();
            context.render(this._video);
        }
    })()
);
