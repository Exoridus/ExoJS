// Declarations for `select-lanes.mjs`, which is plain JavaScript so that the CI
// workflow can run it through Node without a loader. Its JSDoc already carries
// these shapes; this file is what makes them visible to the TypeScript callers
// in `scripts/`.

export interface LaneAreas {
  engine: boolean;
  site: boolean;
  audioFx: boolean;
  tilemapWorker: boolean;
  exampleCatalog: boolean;
}

export interface EffectiveLanes {
  typecheck: boolean;
  lint: boolean;
  unit: boolean;
  coverage: boolean;
  browserWebgl2: boolean;
  browserWebgpu: boolean;
  browserFirefox: boolean;
  browserAudio: boolean;
  browserTilemapWorker: boolean;
  packageVerify: boolean;
  siteBuild: boolean;
  exampleSmoke: boolean;
}

/** Classify a list of changed files into the effective validation areas. */
export function selectAreas(changedFiles: readonly string[]): LaneAreas;

/** Expand the areas into the lanes a change actually requires. */
export function effectiveLanes(areas: LaneAreas): EffectiveLanes;
