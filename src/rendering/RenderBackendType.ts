/**
 * Identifies the active GPU backend used by the engine.
 * Passed to renderers and shaders so they can select backend-specific code paths.
 *
 * The member values are the same strings `ApplicationOptions.backend.type`
 * accepts, so the option a caller writes and the backend the engine reports are
 * one vocabulary rather than two.
 */
export enum RenderBackendType {
  WebGl2 = 'webgl2',
  WebGpu = 'webgpu',
}
