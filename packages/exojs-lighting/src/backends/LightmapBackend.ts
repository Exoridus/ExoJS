import { FrameLightingBackend, type FrameLightingBackendOptions } from './FrameLightingBackend';

/** Construction options for {@link LightmapBackend}. */
export type LightmapBackendOptions = FrameLightingBackendOptions;

/**
 * Accumulates every light into a target of its own, then multiplies the drawn
 * frame by it.
 *
 * Point, spot and line lights batch into one instanced draw per cookie texture,
 * each with one polar row of a shadow map; suns draw in a batch of their own,
 * and the frame is composited against the result. Nothing here walks the scene,
 * so this renderer does not use the scene-walking transport or cascade code
 * paths.
 * @internal
 */
export class LightmapBackend extends FrameLightingBackend {
  protected readonly _cascading = false;

  public constructor(options: LightmapBackendOptions) {
    super(options);
  }
}
