# ParticleSystem

`ParticleSystem` is the normal built-in particle API.

## Responsibilities

- manage particles, emitters, and affectors
- render textured particle quads through the built-in particle renderer
- participate in the normal scene graph flow

## Notes

- WebGPU supports the built-in particle path
- particle performance optimizations are internal renderer details
- normal and additive blending are supported on the built-in WebGPU path

## Normal usage

Use `ParticleSystem` through scene updates and normal drawable rendering.
No backend-specific access is required.
