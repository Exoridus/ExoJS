// Side-effect-free public API for @codexo/exojs-particles.
// No registration is performed on import.

export type { Extension, RendererBinding } from '@codexo/exojs/extensions';
export type { ParticlesExtensionOptions } from './particlesExtension';
export { createParticlesExtension, particlesExtension } from './particlesExtension';
export * from './distributions';
export * from './modules';
export { ParticleSystem } from './ParticleSystem';
export type { ParticleSystemOptions } from './ParticleSystem';
