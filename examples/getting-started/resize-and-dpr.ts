import { Application, Color, Scene, Sprite, Text, Texture } from '@codexo/exojs';

// #region guide:app-setup
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
        pixelRatio: window.devicePixelRatio || 1,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});
// #endregion guide:app-setup

document.body.style.margin = '0';
document.body.append(app.canvas);

// #region guide:resize
window.addEventListener('resize', () => {
    app.resize(window.innerWidth, window.innerHeight);
});

app.resize(window.innerWidth, window.innerHeight);
// #endregion guide:resize

class ResizeScene extends Scene {
    private sprite!: Sprite;
    private info!: Text;

    override async load(loader): Promise<void> {
        this.sprite = new Sprite(await loader.load(Texture, 'image/ship-a.png'));
    }

    override init(): void {
        this.sprite.setAnchor(0.5);

        this.info = new Text('', { fillColor: Color.white, fontSize: 16 });
        this.info.setAnchor(0.5, 0);

        this.layout();
    }

    override update(): void {
        this.layout();
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.sprite);
        context.render(this.info);
    }

    // #region guide:layout
    private layout(): void {
        const { width, height } = this.app.canvas;
        const dpr = Math.max(1, window.devicePixelRatio || 1);

        this.sprite.setPosition(width / 2, height / 2);
        this.info.setPosition(width / 2, 12);
        this.info.text = `${width}x${height} @ DPR ${dpr.toFixed(2)}`;
    }
    // #endregion guide:layout
}

app.start(new ResizeScene());
