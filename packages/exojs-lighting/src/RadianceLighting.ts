import { RadianceBackend } from './backends/RadianceBackend';
import { frameBackendOptions, type FrameLightingOptions } from './frameLighting';
import { Lighting } from './Lighting';
import type { LightingHost } from './LightingHost';

/** Construction options for {@link RadianceLighting}. */
export interface RadianceLightingOptions extends FrameLightingOptions {
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
  /**
   * How much of the light that lands on a surface it gives off again, in
   * `0..1`. A lit wall then tints what stands beside it with its own colour,
   * one frame later - the light field of the previous frame is what says how
   * lit it was. `0` switches the bounce off. Defaults to `0.5`.
   *
   * Above one the feedback runs away; the value is clamped below it.
   */
  readonly bounce?: number;
}

/**
 * Lighting as radiance that propagates, filled by a chain of cascades traced
 * over this frame's geometry.
 *
 * ```ts
 * const lighting = new RadianceLighting(app, { probeSpacing: 2, interval: 1, bounce: 0.5 });
 *
 * scene.systems.add(lighting);
 * lighting.occludeFrom(new PhysicsOccluder(world));
 * ```
 *
 * Light propagates from what emits rather than falling off inside each light's
 * radius, so a lamp fills the room it stands in, a wall between two rooms
 * leaves the second one dark, a source with a size casts a penumbra that widens
 * with distance, and a lit surface gives part of that light off again in its
 * own colour (see {@link RadianceLightingOptions.bounce}). A `SpotLight` emits
 * across its cone and a `SunLight` is the sky every unblocked ray ends in.
 *
 * It does NOT make a scene look the way {@link LightmapLighting} makes it look,
 * and it is the only renderer whose cost is per probe rather than per light.
 * Registered normal surfaces are recorded and ignored: the gather averages a
 * probe's rays into one arriving colour, which leaves no incident direction for
 * a normal to be measured against.
 *
 * The host is required and is the first argument. Float render targets are
 * required too - a field of radiance has no ceiling to clamp at - and a device
 * without them is refused at construction rather than shaded differently under
 * the same name.
 */
export class RadianceLighting extends Lighting {
  public constructor(host: LightingHost, options: RadianceLightingOptions = {}) {
    super(
      new RadianceBackend({
        // The cascades SAMPLE the light field rather than painting into it, so
        // it is rasterised at full density by default: a coarse field
        // quantises the scene rather than the light, and a source that moves
        // by less than a texel makes the whole picture jump. Measured on a
        // moving lamp, a quarter-probe step changed the light arriving at a
        // fixed point by 25 percent at half resolution and by 2 percent at full.
        ...frameBackendOptions(host, options, 1),
        field: {
          probeSpacing: Math.max(1, Math.round(options.probeSpacing ?? 2)),
          cascades: options.cascades ?? null,
          interval: Math.max(0.25, options.interval ?? 1),
          bounce: Math.min(0.95, Math.max(0, options.bounce ?? 0.5)),
        },
      }),
      host,
      options,
    );
  }
}
