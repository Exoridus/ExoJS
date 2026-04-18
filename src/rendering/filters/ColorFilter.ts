import { Color } from 'core/Color';
import { BlendModes } from 'rendering/types';
import { Sprite } from 'rendering/sprite/Sprite';
import { RenderTargetPass } from 'rendering/RenderTargetPass';
import type { RenderTexture } from 'rendering/texture/RenderTexture';
import type { SceneRenderRuntime } from 'rendering/SceneRenderRuntime';
import { Filter } from './Filter';

export class ColorFilter extends Filter {

    private readonly _color: Color;
    private readonly _sprite: Sprite = new Sprite(null);

    public constructor(color: Color = Color.white) {
        super();

        this._color = color.clone();
    }

    public get color(): Color {
        return this._color;
    }

    public apply(runtime: SceneRenderRuntime, input: RenderTexture, output: RenderTexture): void {
        this._sprite
            .setTexture(input)
            .setBlendMode(BlendModes.Normal)
            .setTint(this._color)
            .setPosition(0, 0)
            .setRotation(0)
            .setScale(1, 1);

        this._sprite.width = output.width;
        this._sprite.height = output.height;

        runtime.execute(new RenderTargetPass(
            () => {
                this._sprite.render(runtime);
            },
            {
                target: output,
                view: output.view,
                clearColor: Color.transparentBlack,
            },
        ));
    }

    public destroy(): void {
        this._sprite.destroy();
        this._color.destroy();
    }
}
