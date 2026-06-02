import { Application, BlurFilter, Color, Graphics, Scene, Sprite, Texture } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

const PIXEL_GRID = globalThis.assets?.technical?.filtering?.pixelGrid128 ?? 'assets/technical/filtering/pixel-grid-128.png';

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { grid: PIXEL_GRID });
        }
        init(loader) {
            this._blur = new BlurFilter({ radius: 2, quality: 2 });
            this._sprite = new Sprite(loader.get(Texture, 'grid')).setAnchor(0.5).setScale(3.5).setPosition(400, 280);
            this._sprite.filters = [this._blur];
            this._ui = new Graphics();
            this._drag = false;

            this.app.input.onPointerDown.add(p => {
                this._drag = p.y > 500;
                this._setBlurFromX(p.x);
            });
            this.app.input.onPointerMove.add(p => {
                this._setBlurFromX(p.x);
            });
            this.app.input.onPointerUp.add(() => {
                this._drag = false;
            });
        }
        _setBlurFromX(x) {
            if (!this._drag) return;
            const t = Math.max(0, Math.min(1, (x - 180) / 440));
            this._blur.radius = t * 14;
        }
        draw(context) {
            context.backend.clear();
            context.render(this._sprite);
            this._ui.clear();
            this._ui.fillColor = new Color(60, 60, 60);
            this._ui.drawRectangle(180, 510, 440, 14);
            this._ui.fillColor = new Color(130, 220, 255);
            this._ui.drawRectangle(180, 510, (this._blur.radius / 14) * 440, 14);
            context.render(this._ui);
        }
    })()
);
