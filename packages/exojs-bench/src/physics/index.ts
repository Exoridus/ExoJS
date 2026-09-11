// Physics benchmark domain - the SECOND domain of `@codexo/exojs-bench`.
//
// Like the rendering domain, physics is measured in a real browser driven
// through a Vite/Playwright harness. There is no GPU API involved - the work is
// pure CPU - but the runtime is: nobody runs ExoJS physics in Node, browsers
// differ from it in heap limits, garbage collection and WASM compilation, and
// the JavaScript engine differs between browsers, which is the whole point of
// measuring on a second reference machine. The cells are therefore driven inside
// the page under `page/`, and the browser is stamped into the run's provenance.
//
// Everything physics-specific - the archetypes, the arms, the page harness, the
// driver and the report - lives under this folder; the domain-agnostic pieces
// (timing, RNG, mutation-determinism, the incremental checkpoint writer,
// provenance/report skeletons, the Vite server, CLI arg parsing) live under
// `../shared` and are shared with the rendering domain.
//
// The matter.js, planck.js, nape-js and rapier adapter arms live under
// `adapters/` alongside the native arm: each implements the `PhysicsAdapter`
// interface and builds the shared deterministic scene from `adapters/scene.ts`. Their
// competitor libraries are loaded lazily via dynamic `import()`; a factory that
// rejects (an unlinked competitor, or a browser that refuses the arm) is
// recorded as an unavailable arm carrying that reason, never omitted.

export { buildPhysicsMatrix, PHYSICS_ARCHETYPES, STEP_DELTA } from './archetypes';
export { PhysicsDeterminismError, type PhysicsMatrixOutcome, type PhysicsProvenance, runPhysicsMatrix } from './driver';
export type { PhysicsArmReport, PhysicsClockReport } from './page/contract';
export type {
  PhysicsAdapter,
  PhysicsArchetypeId,
  PhysicsArchetypeSpec,
  PhysicsArmIdentity,
  PhysicsCellResult,
  PhysicsCellSpec,
  PhysicsStructuralCounters,
} from './PhysicsAdapter';
export { type PhysicsReportData, writePhysicsReport } from './report';
