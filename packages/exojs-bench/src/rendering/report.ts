import type { LibraryProvenance } from '../shared/provenance';
import { csvField, formatCount as count, formatMs as ms, writeReportArtifacts } from '../shared/report';
import type { Provenance } from './driver';
import type { CellResult } from './EngineAdapter';

/** Node count at or above which a full-frame time is beyond any interactive budget. */
const FRAME_BUDGET_NODE_THRESHOLD = 100_000;

/** Marker appended to timing columns when the run used a software rasterizer. */
const UNTRUSTED_MARK = 'UNTRUSTED (software rasterizer)';

/** Everything one baseline run produces: the provenance stamps and the per-cell results. */
export interface ReportData {
  /** One provenance stamp per backend exercised. */
  readonly provenance: readonly Provenance[];
  /** Version + resolution provenance for each committed competitor library arm. */
  readonly libraries: readonly LibraryProvenance[];
  /** One result per matrix cell. */
  readonly results: readonly CellResult[];
}

/** True when any provenance stamp reports a software rasterizer. */
const isSoftware = (data: ReportData): boolean => data.provenance.some(entry => entry.software);

/** The `frameMsMedian` cell text, suffixed `beyond-frame-budget` past the node threshold. */
const frameMedianCell = (result: CellResult): string => {
  const base = ms(result.frameMsMedian);

  return result.spec.nodeCount >= FRAME_BUDGET_NODE_THRESHOLD ? `${base} beyond-frame-budget` : base;
};

/** Ordered columns shared by the CSV and the Markdown table. */
const CSV_HEADER = [
  'engine',
  'config',
  'backend',
  'archetype',
  'nodeCount',
  'warmupFrames',
  'timedFrames',
  'cpuMsMedian',
  'cpuMsP95',
  'frameMsMedian',
  'frameMsP95',
  'drawCalls',
  'textureBinds',
  'bufferUploads',
  'frameBudget',
  'status',
  'note',
] as const;

const toCsvRow = (result: CellResult): string => {
  const { spec, structural } = result;
  const beyondBudget = spec.nodeCount >= FRAME_BUDGET_NODE_THRESHOLD ? 'beyond-frame-budget' : '';
  const fields = [
    spec.engine,
    spec.config,
    spec.backend,
    spec.archetype,
    String(spec.nodeCount),
    String(spec.warmupFrames),
    String(spec.timedFrames),
    ms(result.cpuMsMedian),
    ms(result.cpuMsP95),
    ms(result.frameMsMedian),
    ms(result.frameMsP95),
    count(structural.drawCalls),
    count(structural.textureBinds),
    count(structural.bufferUploads),
    beyondBudget,
    result.status,
    result.note ?? '',
  ];

  return fields.map(csvField).join(',');
};

const toCsv = (data: ReportData): string => [CSV_HEADER.join(','), ...data.results.map(toCsvRow)].join('\n');

/**
 * Human-readable Markdown: one provenance block PER BACKEND first (so a reader
 * knows which GPU produced which backend's numbers — presenting a WebGPU row
 * under WebGL2's adapter string would misattribute it), then one table with the
 * structural counters sitting BESIDE the timings — a timing win that came from
 * doing less work must be visible in the same row — and a `note` column so the
 * reason behind an `unavailable`/`exceeded` cell, or a timing sourced from an
 * rAF delta rather than a real GPU timer, is visible in the row it belongs to.
 */
const toMarkdown = (data: ReportData): string => {
  const software = isSoftware(data);
  const lines: string[] = [];

  lines.push('# Baseline Benchmark Results', '');

  // Competitor-library provenance first: any "ExoJS vs X" number is only
  // auditable if the reader can see the exact library version it was measured
  // against and where it resolved from. Versions are pinned exact in
  // `@codexo/exojs-bench`'s devDependencies, so this is the reproducibility
  // receipt, not a moving target.
  lines.push('## Library arms', '');

  if (data.libraries.length === 0) {
    lines.push('- (none — ExoJS-only run)', '');
  } else {
    for (const library of data.libraries) {
      const provenance = library.resolvedFrom.length > 0 ? library.resolvedFrom : 'not resolved';

      lines.push(`- \`${library.name}\` @ **${library.version}** (resolved from: ${provenance})`);
    }

    lines.push('');
  }

  lines.push('## Provenance', '');

  for (const entry of data.provenance) {
    lines.push(`### ${entry.backend}`, '');
    lines.push(`- Adapter (GPU): ${entry.adapter}`);

    // Sprite-batch slot tier (WebGPU only): the negotiated texture-slot ceiling
    // (8/16/32) the sprite batcher resolved for this adapter. Recorded so a
    // slot-sensitive archetype (e.g. `batch-breaking`) is auditable — a reader
    // can see whether this run's tier is below the archetype's textureCount (so
    // batches actually broke) or a future ceiling change lifted the tier past it.
    if (entry.slotTier !== undefined) {
      lines.push(`- Sprite-batch slot tier: ${entry.slotTier}`);
    }

    lines.push(`- Flags: ${entry.flags.map(flag => `\`${flag}\``).join(' ')}`);
    lines.push(`- Headless: ${String(entry.headless)}`);
    lines.push(`- Engine version: ${entry.engineVersion}`);
    lines.push(`- Timestamp: ${entry.timestamp}`);
    lines.push(`- Software rasterizer: ${String(entry.software)}`);

    if (entry.software) {
      lines.push('', `**SOFTWARE RASTERIZER — TIMINGS UNTRUSTED FOR ${entry.backend}**`);
    }

    lines.push('');
  }

  // Methodology disclosure (review C4): the benchmark used to leave
  // per-archetype culling on while every archetype kept its sprites
  // on-screen, so the cull check never removed a node — pure asymmetric
  // overhead, since ExoJS's `cullable` drives a real per-node bounds check in
  // the render walk while Pixi's `cullable` is inert unless `CullerPlugin` is
  // registered (it is not, in `adapters/pixi.ts`). Culling is now disabled on
  // every archetype (`cullingEnabled: false` in `archetypes.ts`) so both arms
  // do identical visible-set work; this line makes that explicit in every
  // generated report rather than leaving it to source-comment archaeology.
  lines.push(
    '## Methodology',
    '',
    '- **Culling:** disabled on every archetype (`cullingEnabled: false`). Every archetype keeps its sprites fully on-screen, so a cull check never removes a node — it can only add overhead. ExoJS\'s `cullable` flag drives a real per-node bounds/intersection check in the render walk; Pixi\'s `cullable` flag is inert unless the app registers `CullerPlugin`, which this harness does not do. The Phaser arm does no bounds culling (its default `willRender` checks only visibility/alpha flags), and the Excalibur arm never runs its off-screen culling system (only the draw path is stepped, not the update systems that tag entities off-screen). Every arm therefore does identical visible-set work.',
    '- **Phaser renders WebGL, not WebGL2.** The Phaser arm is measured as a stock Phaser 4 app: Phaser 4.2 is often described as a from-scratch WebGL2 renderer, but its `WebGLRenderer` requests a plain `webgl` (WebGL1) context by default (`canvas.getContext(\'webgl\')`, WebGLRenderer.js:709), uses GLSL ES 1.00 shaders, and polyfills the WebGL2-core features it needs (instanced arrays, VAO) from WebGL1 extensions — its renderer is an evolution of the Phaser 3.85+ WebGL path, not a WebGL2 rewrite. The arm runs under the `webgl2` backend *request* but its rows are WebGL-rendered. Its CPU-time column is measured identically to the other arms and **is** cross-arm comparable; its full-frame time comes from the rAF delta (as it does for any arm when the optional GPU-timer extension is absent). The WebGL2 draw-call structural probe cannot attach to a WebGL context, so the Phaser arm reports **no structural counters** (`drawCalls`/`textureBinds`/`bufferUploads` show 0 with an explanatory `note`) — the counts are omitted, never faked. Compare structural columns only among the WebGL2 arms (ExoJS, Pixi, Excalibur). Phaser 4 ships no WebGPU renderer, so it never runs the `webgpu` backend.',
    '- **Competitor render-path isolation.** Each competitor arm is driven through only its render path with its own loop suppressed: Phaser via `renderer.preRender()` + `SceneManager.render()` + `renderer.postRender()` with `game.loop.stop()`; Excalibur via its public draw sequence (`beginDrawLifecycle`/`clear`/`currentScene.draw`/`flush`/`endDrawLifecycle`) with `engine.clock.stop()`. Update/input/physics subsystems are never stepped, so only rendering is measured.',
    '',
  );

  lines.push('## Results', '');

  // Annotate the timing column headers when timings are untrusted; structural
  // counters stay unannotated because they remain valid on a software rasterizer.
  const timingSuffix = software ? ` — ${UNTRUSTED_MARK}` : '';
  const header = [
    'engine',
    'config',
    'backend',
    'archetype',
    'nodeCount',
    `cpuMsMedian${timingSuffix}`,
    `cpuMsP95${timingSuffix}`,
    `frameMsMedian${timingSuffix}`,
    'drawCalls',
    'textureBinds',
    'bufferUploads',
    'warmupFrames',
    'timedFrames',
    'status',
    'note',
  ];

  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map(() => '---').join(' | ')} |`);

  for (const result of data.results) {
    const { spec, structural } = result;
    const row = [
      spec.engine,
      spec.config,
      spec.backend,
      spec.archetype,
      String(spec.nodeCount),
      ms(result.cpuMsMedian),
      ms(result.cpuMsP95),
      frameMedianCell(result),
      count(structural.drawCalls),
      count(structural.textureBinds),
      count(structural.bufferUploads),
      String(spec.warmupFrames),
      String(spec.timedFrames),
      result.status,
      (result.note ?? '').replaceAll('|', '\\|'),
    ];

    lines.push(`| ${row.join(' | ')} |`);
  }

  lines.push('');

  return lines.join('\n');
};

/**
 * Writes the three report artifacts into `outDir`:
 * - `results.json` — full fidelity (provenance + every result field).
 * - `results.csv` — one row per cell, machine-parseable.
 * - `results.md` — provenance block plus a human-readable table.
 */
export const writeReport = (data: ReportData, outDir: string): void => {
  writeReportArtifacts(outDir, {
    json: `${JSON.stringify(data, null, 2)}\n`,
    csv: `${toCsv(data)}\n`,
    md: toMarkdown(data),
  });
};
