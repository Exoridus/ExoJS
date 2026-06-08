// Auto-generated from render-pipeline.ts — edit the .ts source, not this file.
import { Application, BlurFilter, CallbackRenderPass, Color, Container, Graphics, RenderNodePass, RenderPipeline, RenderTexture, Scene, Sprite, } from '@codexo/exojs';
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
// A composable frame, configured once: the world renders off-screen, a blur step turns it into its
// blurred version, a composite step draws that to the screen, and a nested UI pipeline overlays a HUD.
// The blur step toggles on and off via `pass.enabled`; the off-screen targets track the canvas size.
class RenderPipelineScene extends Scene {
    world;
    orb;
    sceneRt;
    blurredRt;
    composite;
    blur;
    blurPass;
    hud;
    hudBar;
    frame;
    detachResize = null;
    time = 0;
    init() {
        const screenView = this.app.rendering.screenView;
        this.sceneRt = new RenderTexture(800, 600);
        this.blurredRt = new RenderTexture(800, 600);
        this.composite = new Sprite(this.blurredRt);
        this.blur = new BlurFilter({ radius: 8, quality: 2 });
        this.world = new Container();
        this.orb = new Graphics();
        this.world.addChild(this.orb);
        this.hud = new Container();
        this.hudBar = new Graphics();
        this.hud.addChild(this.hudBar);
        // A filter step: read the off-screen scene, write its blurred version.
        this.blurPass = new CallbackRenderPass((context) => this.blur.apply(context.backend, this.sceneRt, this.blurredRt), {
            label: 'blur',
        });
        // The HUD is its own nested pipeline, rendered in screen space.
        const ui = new RenderPipeline({ label: 'ui' }).addPass(new RenderNodePass(this.hud, { view: screenView, label: 'hud' }));
        // world → off-screen → blur → composite → UI overlay. A RenderPipeline is itself a RenderPass,
        // so `ui` nests directly.
        this.frame = new RenderPipeline({ label: 'frame' })
            .addPass(new RenderNodePass(this.world, { target: this.sceneRt, clear: Color.black, label: 'world' }))
            .addPass(this.blurPass)
            .addPass(new RenderNodePass(this.composite, { clear: Color.black, label: 'composite' }))
            .addPass(ui);
        // Keep the caller-owned off-screen targets matched to the canvas, then cascade resize into the
        // pipeline (effect passes would rebuild their scratch here).
        const handleResize = (width, height) => {
            this.sceneRt.setSize(width, height);
            this.blurredRt.setSize(width, height);
            this.frame.resize(width, height);
        };
        this.app.onResize.add(handleResize);
        this.detachResize = () => this.app.onResize.remove(handleResize);
    }
    update(delta) {
        this.time += delta.seconds;
        // `enabled` lives on the pass — flip it and the composer skips the step next frame.
        this.blurPass.enabled = Math.floor(this.time / 2.5) % 2 === 0;
        this.orb.clear();
        this.orb.fillColor = new Color(90, 150, 255);
        this.orb.drawCircle(400 + Math.cos(this.time) * 200, 300 + Math.sin(this.time * 1.3) * 150, 90);
        this.hudBar.clear();
        this.hudBar.fillColor = this.blurPass.enabled ? new Color(120, 230, 150) : new Color(230, 120, 120);
        this.hudBar.drawRectangle(20, 20, 200, 16);
    }
    draw(context) {
        this.frame.execute(context);
    }
    destroy() {
        this.detachResize?.();
        // Cascades destroy() to every pass; the pipeline never destroys caller-owned nodes or targets.
        this.frame.destroy();
        this.sceneRt.destroy();
        this.blurredRt.destroy();
        this.blur.destroy();
        super.destroy();
    }
}
app.start(new RenderPipelineScene());
