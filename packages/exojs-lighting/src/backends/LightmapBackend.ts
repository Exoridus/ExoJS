import { FrameLightingBackend, type FrameLightingBackendOptions } from './FrameLightingBackend';

/** Construction options for {@link LightmapBackend}. */
export type LightmapBackendOptions = FrameLightingBackendOptions;

/**
 * Accumulates every light into a target of its own, then multiplies the drawn
 * frame by it.
 *
 * One instanced draw covers every visible light, each with one polar row of a
 * shadow map, and the frame is composited against the result. Nothing here
 * walks the scene, so a project on this renderer never links the transport
 * tables or the cascade chain.
 * @internal
 */
export class LightmapBackend extends FrameLightingBackend {
  protected readonly _cascading = false;

  public constructor(options: LightmapBackendOptions) {
    super(options);
    this._attach();
  }
}
