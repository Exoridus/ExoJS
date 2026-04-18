import {
    BlurFilter,
    Color,
    ColorFilter,
    Container,
    RenderTargetPass,
    RenderTexture,
    Sprite,
    type SceneRenderRuntime,
} from 'exojs';

function setupEffects(content: Container, maskSprite: Sprite): void {
    content.addFilter(new BlurFilter({ radius: 2, quality: 1 }));
    content.addFilter(new ColorFilter(new Color(255, 200, 200, 1)));
    content.mask = maskSprite;
    content.cacheAsBitmap = true;
}

function drawWithPass(runtime: SceneRenderRuntime, world: Container): void {
    const intermediate = new RenderTexture(512, 512);

    runtime.execute(new RenderTargetPass(() => {
        world.render(runtime);
    }, {
        target: intermediate,
        view: intermediate.view,
        clearColor: Color.transparentBlack,
    }));

    const composited = new Sprite(intermediate);

    composited.setPosition(80, 40);
    composited.render(runtime);
}

export { setupEffects, drawWithPass };
