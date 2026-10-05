import type { ParticleShaderContribution } from './ParticleShaderContribution';

/**
 * GLSL ES 3.00 contribution executed once per live particle after integration.
 * Mutable locals are `vec2 position`, `velocity`, `scale`, `rotation` (angle,
 * angular speed), `timing` (elapsed, lifetime), and `uint color`, `textureIndex`.
 * `float dt` and `uint idx` identify the frame delta and storage slot.
 * Uniforms are `u_KEY.field`; textures are `sampler2D u_KEY_NAME` with height 1.
 * The body runs in its own block. Helpers belong in `prelude`.
 */
export interface GlslContribution extends ParticleShaderContribution {}
