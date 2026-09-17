import type { RenderTexture } from '@codexo/exojs';

import type { LightingQuality } from '../Lighting';
import { DistanceField } from './distanceField';
import { RadianceField } from './radianceField';

/** Tuning for {@link radiance}. Every entry is optional and defaults to something derived from the surface. */
export interface RadianceOptions {
  /**
   * Light-field texels between the finest cascade's probes. Lower is sharper
   * and costs a probe grid four times as large per halving. Defaults to `2`.
   *
   * This is tuning rather than scene description: it changes how finely the
   * same scene is sampled, never what is in it.
   */
  readonly probeSpacing?: number;
  /**
   * Levels in the cascade chain. Defaults to as many as the view's own diagonal
   * needs, which is what keeps the far end of a scene from going dark on a
   * large surface.
   */
  readonly cascades?: number;
  /**
   * The finest cascade's ray length, in probe spacings. Each level covers four
   * times what the level below it did, so this sets where the chain starts.
   * Defaults to `1`.
   */
  readonly interval?: number;
}

/**
 * The pieces a value-selected renderer brings with it, built on demand so a
 * project that never imports one never links them.
 * @internal
 */
export interface LightingFields {
  distance(mask: RenderTexture): DistanceField;
  radiance(distance: RenderTexture, target: RenderTexture): RadianceField;
}

/**
 * A renderer chosen by importing it rather than by naming it.
 *
 * {@link Lighting} takes one in place of a `quality` string, and
 * {@link Lighting.quality} still reports the plain name afterwards - so a scene
 * asks for a renderer in exactly one place and reads back the same vocabulary
 * everywhere else.
 */
export interface LightingRenderer {
  /** What {@link Lighting.quality} reports once this renderer is in use. */
  readonly quality: LightingQuality;
  /** @internal */
  readonly _fields: LightingFields;
}

/**
 * Light that spreads: the light field filled by a chain of radiance cascades
 * instead of by one quad per light.
 *
 * ```ts
 * const lighting = new Lighting({ app, quality: radiance({ probeSpacing: 2 }) });
 * ```
 *
 * It is a VALUE rather than a name because everything it needs - the cascade
 * chain and the distance field it traces - is linked only by projects that
 * import it. Naming it as a string would put the whole of it into every bundle
 * that reads `quality` from a config file.
 *
 * Light propagates from what emits rather than falling off inside each light's
 * radius, so a lamp lights the room it stands in, a wall between two rooms
 * leaves the second one dark, and a source with a size casts a penumbra that
 * widens with distance. A `SunLight` has nowhere to emit from and is skipped, a
 * `SpotLight` emits like a point, and a surface this renderer lit does not
 * itself become a source - there is no bounced colour yet.
 *
 * Needs the application and a device that can render into float targets, and is
 * refused at construction without either.
 */
export const radiance = (options: RadianceOptions = {}): LightingRenderer => {
  const tuning = {
    probeSpacing: Math.max(1, Math.round(options.probeSpacing ?? 2)),
    cascades: options.cascades ?? null,
    interval: Math.max(0.25, options.interval ?? 1),
  };

  return {
    quality: 'radiance',
    _fields: {
      distance: (mask: RenderTexture): DistanceField => new DistanceField(mask),
      radiance: (distance: RenderTexture, target: RenderTexture): RadianceField => new RadianceField(distance, target, tuning),
    },
  };
};
