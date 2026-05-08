/**
 * Identifies the active GPU backend used by the engine.
 * Passed to renderers and shaders so they can select backend-specific code paths.
 */
export enum RenderBackendType {
  WebGl2,
  WebGpu,
}
