// Physics benchmark domain — the SECOND domain of `@codexo/exojs-bench`.
//
// Unlike the rendering domain (webgl2/webgpu, driven through a headless-browser
// Vite/Playwright harness), physics is pure CPU work: `@codexo/exojs-physics`
// runs in plain Node, so this domain is a straight loop calling `world.step`
// with no browser and no GPU. Everything physics-specific — the archetypes, the
// native exojs-physics arm, the step-time driver and report — lives under this
// folder; the domain-agnostic pieces (timing, RNG, mutation-determinism, the
// incremental checkpoint writer, provenance/report skeletons, CLI arg parsing)
// live under `../shared` and are shared with the rendering domain.
//
// The matter.js + rapier adapter arms live under `adapters/` alongside the
// native arm: each implements the `PhysicsAdapter` interface, builds the shared
// deterministic scene from `adapters/scene.ts`, and is passed into
// `runPhysicsMatrix({ adapters })`. Their competitor libraries are loaded lazily
// via dynamic `import()`, so an unlinked competitor degrades to a skipped arm
// (the resolver returns `null`) rather than crashing the run.

export { createExoJsPhysicsAdapter } from './adapters/exojs-physics';
export { createMatterJsAdapter } from './adapters/matter-js';
export { createRapierAdapter } from './adapters/rapier';
export { buildPhysicsMatrix, PHYSICS_ARCHETYPES, STEP_DELTA } from './archetypes';
export { type PhysicsMatrixOutcome, type PhysicsProvenance, runPhysicsMatrix } from './driver';
export type {
  PhysicsAdapter,
  PhysicsArchetypeId,
  PhysicsArchetypeSpec,
  PhysicsCellResult,
  PhysicsCellSpec,
  PhysicsStructuralCounters,
} from './PhysicsAdapter';
export { type PhysicsReportData, writePhysicsReport } from './report';
