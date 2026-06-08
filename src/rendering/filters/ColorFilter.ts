import { Color } from '@/core/Color';
import { BackendTargetPass } from '@/rendering/BackendTargetPass';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { Sprite } from '@/rendering/sprite/Sprite';
import type { RenderTexture } from '@/rendering/texture/RenderTexture';
import { BlendModes } from '@/rendering/types';

import { Filter } from './Filter';

/**
 * A {@link Filter} that multiplies the input texture by a solid {@link Color}.
 *
 * Useful for tinting, fade-to-black/white, flash effects, and
 * colour-grading passes. The `color` property can be mutated at runtime
 * without recreating the filter.
 */
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

  public apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture): void {
    this._sprite.setTexture(input).setBlendMode(BlendModes.Normal).setTint(this._color).setPosition(0, 0).setRotation(0).setScale(1, 1);

    this._sprite.width = output.width;
    this._sprite.height = output.height;

    backend.execute(
      new BackendTargetPass(
        () => {
          this._sprite.render(backend);
        },
        {
          target: output,
          view: output.view,
          clearColor: Color.transparentBlack,
        },
      ),
    );
  }

  public override destroy(): void {
    this._sprite.destroy();
    this._color.destroy();
  }
}
