// Auto-generated from post-processing-chain.ts — edit the .ts source, not this file.
import { Application, BlurFilter, Color, ColorFilter, Graphics, RenderTargetPass, RenderTexture, Scene, Sprite } from '@codexo/exojs';
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
class PostProcessingChainScene extends Scene {
    scene;
    a;
    b;
    c;
    blur;
    color;
    final;
    time = 0;
    init() {
        this.scene = new Graphics();
        this.a = new RenderTexture(800, 600);
        this.b = new RenderTexture(800, 600);
        this.c = new RenderTexture(800, 600);
        this.blur = new BlurFilter({ radius: 6, quality: 2 });
        this.color = new ColorFilter(new Color(140, 190, 255));
        this.final = new Sprite(this.c);
    }
    update(delta) {
        this.time += delta.seconds;
    }
    drawScene(backend) {
        this.scene.clear();
        this.scene.fillColor = new Color(80, 130, 255);
        this.scene.drawCircle(400 + Math.cos(this.time * 1.6) * 220, 300 + Math.sin(this.time * 1.8) * 160, 78);
        this.scene.fillColor = new Color(255, 170, 90);
        this.scene.drawCircle(400 + Math.cos(this.time * 1.2 + 1) * 210, 300 + Math.sin(this.time * 1.3 + 0.7) * 170, 54);
        this.scene.render(backend);
    }
    draw(context) {
        context.backend.execute(new RenderTargetPass(() => {
            context.backend.clear();
            this.drawScene(context.backend);
        }, { target: this.a, view: this.a.view }));
        this.blur.apply(context.backend, this.a, this.b);
        this.color.apply(context.backend, this.b, this.c);
        context.backend.clear();
        context.render(this.final);
    }
}
app.start(new PostProcessingChainScene());
