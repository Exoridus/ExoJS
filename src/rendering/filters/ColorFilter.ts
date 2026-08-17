import { Color } from '#core/Color';
import { BackendTargetPass } from '#rendering/BackendTargetPass';
import { drawDrawableDirect } from '#rendering/plan/drawDrawableDirect';
import type { RenderBackend } from '#rendering/RenderBackend';
import { Sprite } from '#rendering/sprite/Sprite';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { BlendModes } from '#rendering/types';

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
  /** One redirect pass, re-pointed per application — see {@link BackendTargetPass.reconfigure}. */
  private readonly _pass: BackendTargetPass = new BackendTargetPass(backend => drawDrawableDirect(this._sprite, backend));

  public constructor(color: Color = Color.white) {
    super();

    this._color = color.clone();
  }

  public get color(): Color {
    return this._color;
  }

  public apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture, _resolution = 1): void {
    this._sprite.setTexture(input).setBlendMode(BlendModes.Normal).setTint(this._color).setPosition(0, 0).setRotation(0).setScale(1, 1);

    this._sprite.width = output.width;
    this._sprite.height = output.height;

    backend.execute(this._pass.retarget(output, output.view, Color.transparentBlack));
  }

  public override destroy(): void {
    super.destroy();
    this._sprite.destroy();
    this._color.destroy();
  }
}
