import type { LibraryProvenance } from '../shared/provenance';
import { csvField, formatCount as count, formatMs as ms, writeReportArtifacts } from '../shared/report';
import type { Provenance } from './driver';
import type { CellResult } from './EngineAdapter';

/** Node count at or above which a full-frame time is beyond any interactive budget. */
const FRAME_BUDGET_NODE_THRESHOLD = 100_000;

/** Marker appended to timing columns when the run used a software rasterizer. */
const UNTRUSTED_MARK = 'UNTRUSTED (software rasterizer)';

/**
 * A cell is `hitching` when its p95 CPU time towers over its median AND lands
 * above an interactive frame budget.
 *
 * Both halves are needed. The ratio alone fires on a cell that is fast
 * throughout (0.1ms median, 0.5ms p95 is a scheduling blip, not a hitch); the
 * absolute alone fires on a cell that is uniformly slow, which the median
 * already reports honestly.
 *
 * The marker exists because an optimisation that turns per-frame work into
 * PERIODIC work looks, in the median, exactly like an optimisation that removed
 * the work. `scrolling-world` at 1M is the worked example: 0.190ms median
 * against a 400.155ms p95, i.e. a full re-collect every tenth frame. Reading
 * only the median made that curve look flat.
 */
const HITCH_RATIO = 4;
const HITCH_FLOOR_MS = 8;

/** True when the cell's CPU time is periodically spiking rather than uniformly fast. */
export const isHitching = (result: CellResult): boolean =>
  result.cpuMsP95 >= HITCH_FLOOR_MS && result.cpuMsP95 >= result.cpuMsMedian * HITCH_RATIO;

/** The `cpuMsP95` cell text, suffixed `hitching` when the spike test trips. */
const cpuP95Cell = (result: CellResult): string => (isHitching(result) ? `${ms(result.cpuMsP95)} hitching` : ms(result.cpuMsP95));

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
  'queueMsMedian',
  'queueMsP95',
  'drawCalls',
  'textureBinds',
  'bufferUploads',
  'frameBudget',
  'hitching',
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
    ms(result.queueMsMedian),
    ms(result.queueMsP95),
    count(structural.drawCalls),
    count(structural.textureBinds),
    count(structural.bufferUploads),
    beyondBudget,
    isHitching(result) ? 'hitching' : '',
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

  // Methodology disclosure: leaving per-archetype culling on while an archetype
  // keeps its sprites on-screen would mean the cull check never removes a node —
  // pure asymmetric overhead, since ExoJS's `cullable` drives a real per-node
  // bounds check in the render walk while Pixi's `cullable` is inert unless
  // something calls `Culler.shared.cull(...)`. Culling is therefore disabled on
  // every fully-visible archetype, and the one archetype with real off-screen
  // content resolves the asymmetry by MEASURING both Pixi behaviours instead of
  // assuming one. These lines make that explicit in every generated report
  // rather than leaving it to source-comment archaeology.
  lines.push(
    '## Methodology',
    '',
    '- **Culling:** disabled on every archetype whose content is fully on-screen (`cullingEnabled: false`) — there a cull check never removes a node and can only add overhead, and the arms do not pay equally for it: ExoJS\'s `cullable` flag drives a real per-node bounds/intersection check in the render walk, while Pixi\'s `cullable` flag is inert unless something calls `Culler.shared.cull(...)`. The Phaser arm does no bounds culling (its default `willRender` checks only visibility/alpha flags), and the Excalibur arm never runs its off-screen culling system (only the draw path is stepped, not the update systems that tag entities off-screen). On those archetypes every arm therefore does identical visible-set work.',
    '- **`scrolling-world` is the one archetype with off-screen content**, and the only one with a moving camera: `nodeCount` leaves are laid out over 4x the viewport\'s area (`worldSpan: 2`), so roughly 25% are visible at any moment, and the camera travels the world diagonal at `cameraSpeed` units per frame, reflecting off the world edges on a path that is a closed form in the frame index (identical on every arm). Two disclosures apply to its rows. **(1) Camera mechanism differs by arm, idiomatically:** ExoJS moves its `View` centre (the engine has a real camera, and the view rect is what its culling and its retained-render-product validity key on); Pixi has no camera object, so that arm translates the world container under a fixed screen rect. Both show the identical world content per frame. **(2) Two Pixi arms:** `pixi default` is stock Pixi and does NOT cull — it draws the off-screen content too, which is Pixi\'s out-of-the-box behaviour and the honest upper bound; `pixi culled` adds the explicit per-frame `Culler.shared.cull(root, renderer.screen, false)` a Pixi app that wants culling has to write itself. Read the ExoJS rows against `pixi culled` for a culling-vs-culling comparison, and against `pixi default` for the out-of-the-box one. `pixi culled` is measured only on this archetype.',
    '- **Phaser renders WebGL, not WebGL2.** The Phaser arm is measured as a stock Phaser 4 app: Phaser 4.2 is often described as a from-scratch WebGL2 renderer, but its `WebGLRenderer` requests a plain `webgl` (WebGL1) context by default (`canvas.getContext(\'webgl\')`, WebGLRenderer.js:709), uses GLSL ES 1.00 shaders, and polyfills the WebGL2-core features it needs (instanced arrays, VAO) from WebGL1 extensions — its renderer is an evolution of the Phaser 3.85+ WebGL path, not a WebGL2 rewrite. The arm runs under the `webgl2` backend *request* but its rows are WebGL-rendered. Its CPU-time column is measured identically to the other arms and **is** cross-arm comparable; its full-frame time comes from the rAF delta (as it does for any arm when the optional GPU-timer extension is absent). The WebGL2 draw-call structural probe cannot attach to a WebGL context, so the Phaser arm reports **no structural counters** (`drawCalls`/`textureBinds`/`bufferUploads` show 0 with an explanatory `note`) — the counts are omitted, never faked. Compare structural columns only among the WebGL2 arms (ExoJS, Pixi, Excalibur). Phaser 4 ships no WebGPU renderer, so it never runs the `webgpu` backend.',
    '- **`hitching` marks a periodic spike, and the median alone will not show it.** A cell is marked when its `cpuMsP95` is at least 4x its `cpuMsMedian` AND at least 8ms — i.e. most frames are cheap and a few are not. This matters because an optimisation that converts per-frame work into PERIODIC work (a cache that is rebuilt every n-th frame instead of every frame) improves the median exactly as much as one that removed the work, while the worst frame is unchanged. Read `cpuMsMedian` for the amortised cost and `cpuMsP95` for the frame the player actually feels; a `hitching` row means the two answer different questions and the median must not be quoted on its own.',
    '- **`frameMs*` and `queueMs*` are different measurements, and only WebGL2 has one of them.** On WebGL2 `frameMs*` is an `EXT_disjoint_timer_query_webgl2` `TIME_ELAPSED` query bracketing the frame\'s whole GL command stream, uploads included. On WebGPU it is a hardware `timestamp-query` pair around each of the frame\'s render passes, which covers pass EXECUTION only — `queue.writeBuffer` is a queue operation outside every command buffer, so its device copy cannot be bracketed by any timestamp. WebGPU rows therefore also carry `queueMs*`: the `queue.onSubmittedWorkDone` interval charged to the frame that caused it (`doneAt − max(submitAt, previous doneAt)`), which is the only signal that sees upload cost — but which is floored by when the browser OBSERVES completion (measured: 0.50ms for a canvas-clearing frame doing 2µs of GPU work, 3.18ms for the identical clear into an offscreen texture), so any `queueMs` below ~4ms is observation latency rather than GPU work. Read `frameMs*` within a backend, never across the two; `cpuMs*` is the cross-backend, cross-arm metric.',
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
    `queueMsMedian${timingSuffix}`,
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
      cpuP95Cell(result),
      frameMedianCell(result),
      ms(result.queueMsMedian),
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
