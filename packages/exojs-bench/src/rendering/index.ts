// Rendering benchmark domain - the FIRST domain of `@codexo/exojs-bench`.
//
// This barrel is the CLI's main entry, but not its only one: `run.ts` also
// imports the archetype list and `resolveMatrixCells` from this folder directly,
// so a sibling domain (the implemented `physics/` domain benchmarks
// @codexo/exojs-physics vs matter.js / planck / rapier) is added as its own
// folder + barrel alongside those direct imports. Everything rendering-specific -
// the WebGL2/WebGPU backends, the GPU provenance, the sprite-scene archetypes and
// the arm adapters - lives under this folder; the domain-agnostic pieces (timing,
// RNG, mutation-determinism, the incremental checkpoint writer, CLI arg parsing)
// live under `../shared`.

export {
  applySelection,
  DEFAULT_RENDERING_BROWSER,
  type LibraryProvenance,
  type MatrixOutcome,
  type MatrixSelection,
  parseRenderingBrowser,
  profileCell,
  type ProfileOutcome,
  type ProfileRow,
  type Provenance,
  RENDERING_BROWSERS,
  type RenderingBrowser,
  runMatrix,
} from './driver';
export type { ArchetypeId, Backend, CellResult, CellSpec } from './EngineAdapter';
export { isHitching, type ReportData, writeReport } from './report';
