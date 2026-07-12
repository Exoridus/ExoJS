// Rendering benchmark domain — the FIRST domain of `@codexo/exojs-bench`.
//
// This barrel is the single entry the CLI composes against, so a sibling domain
// (e.g. a future `physics/` benchmarking @codexo/exojs-physics vs matter.js /
// planck / rapier) can be added as its own folder + barrel without the CLI or
// the shared layer changing shape. Everything rendering-specific — the WebGL2/
// WebGPU backends, the GPU provenance, the sprite-scene archetypes and the arm
// adapters — lives under this folder; the domain-agnostic pieces (timing, RNG,
// mutation-determinism, the incremental checkpoint writer, CLI arg parsing) live
// under `../shared`.

export { type LibraryProvenance, type MatrixOutcome, type Provenance, runMatrix } from './driver';
export type { ArchetypeId, Backend, CellResult, CellSpec } from './EngineAdapter';
export { type ReportData, writeReport } from './report';
