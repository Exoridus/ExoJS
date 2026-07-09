// Auto-generated from resize-and-dpr.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Sprite, Text } from '@codexo/exojs';
// #region guide:app-setup
const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
        pixelRatio: window.devicePixelRatio || 1,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});
// #endregion guide:app-setup
document.body.style.margin = '0';
// #region guide:resize
// This example demonstrates manual resize handling: the canvas is resized to
// fill the window on every `resize` event. (For a hands-off alternative, enable
// the `autosize` canvas option instead.)
window.addEventListener('resize', () => {
    app.resize(window.innerWidth, window.innerHeight);
});
app.resize(window.innerWidth, window.innerHeight);
// #endregion guide:resize
class ResizeScene extends Scene {
    sprite;
    info;
    async load(loader) {
        this.sprite = new Sprite(await loader.load('image/ship-a.png'));
    }
    init() {
        this.sprite.setAnchor(0.5);
        this.info = new Text('', { fillColor: Color.white, fontSize: 16 });
        this.info.setAnchor(0.5, 0);
        this.layout();
    }
    update() {
        this.layout();
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
        context.render(this.info);
    }
    // #region guide:layout
    layout() {
        const { width, height } = this.app.canvas;
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        this.sprite.setPosition(width / 2, height / 2);
        this.info.setPosition(width / 2, 12);
        this.info.text = `${width}x${height} @ DPR ${dpr.toFixed(2)}`;
    }
}
app.start(new ResizeScene());
