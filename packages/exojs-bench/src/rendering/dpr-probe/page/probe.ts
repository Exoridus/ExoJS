import { requestTimestampFeature } from '../../page/gpuFrameTimer';
import type { ProbeCell, ProbeCellResult, ProbeMode, ProbeResult, ProbeSceneId } from '../matrix';
import { buildProbeMatrix, PROBE_PIXEL_RATIOS, PROBE_SCENES, PROBE_SCHEMA_VERSION, serializeProbeResult } from '../matrix';
import type { ProbeBackendRequest, StageSize, VisualPreview } from '../runner';
import { DEFAULT_MEASURE_MS, measureTimerResolutionMs, runProbeCell, startVisualPreview, SUSTAINED_MEASURE_MS, WARMUP_FRAMES } from '../runner';
import { STAGE_SIZE } from '../scenes';

/**
 * Manual DPR / internal-render-target probe page.
 *
 * Opened by hand on a real device; there is no driver, no result collector and
 * no remote control. Everything the run produces stays in the page until the
 * tester presses `Copy JSON`.
 */

// Same reason as the matrix harness: a device's feature set is immutable, so
// `timestamp-query` has to be added to the descriptor before the engine's own
// `requestDevice` runs.
requestTimestampFeature();

/**
 * Build metadata folded in as a compile-time constant by the serve script
 * (`shared/viteServer.ts`'s `extraDefine`). The serve script is the only thing
 * that serves this page, so the define is always present; there is no fallback
 * to invent, and a capture with a guessed commit would be worse than none.
 */
declare const __PROBE_META__: { gitSha: string; engineVersion: string };

const meta = __PROBE_META__;

const element = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);

  if (found === null) {
    throw new Error(`The probe page is missing #${id}.`);
  }

  return found as T;
};

const deviceLabelInput = element<HTMLInputElement>('device-label');
const testerNoteInput = element<HTMLInputElement>('tester-note');
const backendSelect = element<HTMLSelectElement>('backend');
const environmentEl = element('environment');
const stageHost = element('stage-host');
const sceneButtons = element('scene-buttons');
const dprButtons = element('dpr-buttons');
const modeButtons = element('mode-buttons');
const textRatioButtons = element('text-ratio-buttons');
const stageButtons = element('stage-buttons');
const visualReadout = element('visual-readout');
const visualProgress = element('visual-progress');
const visualTitle = element('visual-title');
const runMatrixButton = element<HTMLButtonElement>('run-matrix');
const runSustained2Button = element<HTMLButtonElement>('run-sustained-2');
const runSustained3Button = element<HTMLButtonElement>('run-sustained-3');
const statusEl = element('status');
const resultsTable = element<HTMLTableElement>('results');
const submitButton = element<HTMLButtonElement>('submit-json');
const copyButton = element<HTMLButtonElement>('copy-json');
const clearButton = element<HTMLButtonElement>('clear-results');
const jsonOutput = element<HTMLTextAreaElement>('json-output');

/** `Application.resolveAutoPixelRatio` - mirrored so the capture records what `auto` WOULD have chosen. */
const ENGINE_MAX_AUTO_PIXEL_RATIO = 2;
const engineAutoPixelRatio = Math.min(window.devicePixelRatio || 1, ENGINE_MAX_AUTO_PIXEL_RATIO);

const timerResolutionMs = measureTimerResolutionMs();

/** Live UI state for the visual (unmeasured) preview. */
const visual: { scene: ProbeSceneId; dpr: number; mode: ProbeMode; textRatio: number | null; preview: VisualPreview | null } = {
  scene: 'baseline',
  dpr: engineAutoPixelRatio,
  mode: 'inherit',
  // `null` is the shipped default - no override, so the text inherits the
  // application's ratio. It is a distinct choice from any number, which is why
  // it gets its own button rather than being spelled as one of them.
  textRatio: null,
  preview: null,
};

/**
 * Logical stage the run uses.
 *
 * `fixed` is a 360 x 360 square - small, identical on every device, and
 * therefore the only preset whose numbers compare across devices. `fill` takes
 * the usable area of THIS device, which is what a real full-screen game renders
 * and roughly twice the pixel count of the square on a phone. Captured once when
 * a run starts: a stage that changed mid-run would make the cells incomparable.
 */
let stagePreset: 'fixed' | 'fill' = 'fixed';

const resolveStage = (): StageSize => {
  if (stagePreset === 'fixed') {
    return { width: STAGE_SIZE, height: STAGE_SIZE };
  }

  // Leave room for the page's own padding so the canvas never forces a
  // horizontal scroll, which would change the layout mid-run.
  const width = Math.max(160, Math.floor(document.documentElement.clientWidth - 44));
  const height = Math.max(160, Math.floor(document.documentElement.clientHeight - 44));

  return { width, height };
};

const collected: ProbeCellResult[] = [];
let busy = false;

const requestedBackend = new URLSearchParams(window.location.search).get('backend');

if (requestedBackend === 'auto' || requestedBackend === 'webgl2' || requestedBackend === 'webgpu') {
  backendSelect.value = requestedBackend;
}

const backendRequest = (): ProbeBackendRequest => backendSelect.value as ProbeBackendRequest;

const setStatus = (text: string, warn = false): void => {
  statusEl.textContent = text;
  statusEl.classList.toggle('warn', warn);
};

/**
 * Mirror the run's progress beside the "Look at it" title.
 *
 * The measure controls and the results table are far below the canvas on a phone,
 * so during a run the tester is looking at the stage with no indication of how
 * far along it is - or whether it finished at all. This keeps both in one view.
 */
const setProgress = (text: string, state: 'running' | 'done' | 'error' | 'idle'): void => {
  visualProgress.textContent = text;

  // REPLACES the section title rather than sitting beside it: the cell line is
  // long enough that both together wrap to a second row on a phone, which moves
  // the canvas down mid-run and makes it hard to compare what is on screen.
  visualTitle.hidden = state !== 'idle';

  if (state === 'idle') {
    delete visualProgress.dataset.state;

    return;
  }

  visualProgress.dataset['state'] = state;
};

const formatMs = (value: number | null): string => (value === null ? '—' : value.toFixed(2));

const describeTargets = (result: Pick<ProbeCellResult, 'internalTargets'>): string =>
  result.internalTargets.length === 0
    ? 'none'
    : result.internalTargets.map(target => `${target.kind} ${target.width}×${target.height}${target.count > 1 ? ` ×${target.count}` : ''}`).join(', ');

const renderEnvironment = (): void => {
  environmentEl.textContent = [
    `git ${meta.gitSha}  ·  exojs ${meta.engineVersion}`,
    `devicePixelRatio ${window.devicePixelRatio}  ·  engine auto would pick ${engineAutoPixelRatio}`,
    `crossOriginIsolated ${String(window.crossOriginIsolated)}  ·  performance.now() resolution ${timerResolutionMs.toFixed(4)} ms`,
    `navigator.gpu ${'gpu' in navigator ? 'present' : 'absent'}  ·  stage ${stagePreset} ${resolveStage().width}×${resolveStage().height} CSS px`,
  ].join('\n');
};

const setPressed = (host: HTMLElement, value: string): void => {
  for (const button of host.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset['value'] === value));
  }
};

const addButton = (host: HTMLElement, value: string, label: string, onClick: () => void): void => {
  const button = document.createElement('button');

  button.textContent = label;
  button.dataset['value'] = value;
  button.addEventListener('click', onClick);
  host.append(button);
};

/**
 * (Re)start the preview.
 *
 * Always tears the previous one down first: only one variant may be on screen at
 * a time, and two `Application`s sharing the page would also compete for GPU
 * contexts.
 */
const refreshPreview = async (): Promise<void> => {
  if (busy) {
    return;
  }

  await visual.preview?.stop();
  visual.preview = null;
  visualReadout.textContent = 'starting…';

  try {
    const preview = await startVisualPreview({
      scene: visual.scene,
      mode: visual.mode,
      pixelRatio: visual.dpr,
      ...(visual.textRatio !== null && { textPixelRatio: visual.textRatio }),
      stage: resolveStage(),
      backend: backendRequest(),
      host: stageHost,
    });

    visual.preview = preview;
    visualReadout.textContent = [
      `${visual.scene}  ·  DPR ${visual.dpr}  ·  text ${visual.textRatio === null ? `inherit (${visual.dpr})` : visual.textRatio}  ·  ${visual.mode}  ·  ${preview.backendType}`,
      `css ${preview.cssWidth}×${preview.cssHeight}  ·  backing ${preview.backingWidth}×${preview.backingHeight} (${preview.backingWidth * preview.backingHeight} px)`,
      `internal targets: ${describeTargets({ internalTargets: preview.internalTargets })}`,
      PROBE_SCENES.find(scene => scene.id === visual.scene)?.purpose ?? '',
    ].join('\n');
  } catch (error) {
    visualReadout.textContent = `preview failed: ${error instanceof Error ? error.message : String(error)}`;
  }
};

const buildControls = (): void => {
  for (const scene of PROBE_SCENES) {
    addButton(sceneButtons, scene.id, scene.label, () => {
      visual.scene = scene.id;
      setPressed(sceneButtons, scene.id);
      void refreshPreview();
    });
  }

  for (const ratio of PROBE_PIXEL_RATIOS) {
    addButton(dprButtons, String(ratio), String(ratio), () => {
      visual.dpr = ratio;
      setPressed(dprButtons, String(ratio));
      void refreshPreview();
    });
  }

  const modes: ReadonlyArray<{ id: ProbeMode; label: string }> = [
    { id: 'inherit', label: 'inherit (default)' },
    { id: 'logical', label: 'logical (resolution 1)' },
  ];

  for (const mode of modes) {
    addButton(modeButtons, mode.id, mode.label, () => {
      visual.mode = mode.id;
      setPressed(modeButtons, mode.id);
      void refreshPreview();
    });
  }

  // Only meaningful for the `text-ratio` scene; left live for every scene so a
  // tester can sanity-check that it changes nothing elsewhere.
  const textRatios: ReadonlyArray<{ id: string; label: string; value: number | null }> = [
    { id: 'inherit', label: 'inherit', value: null },
    { id: '1', label: '1', value: 1 },
    { id: '2', label: '2', value: 2 },
    { id: '3', label: '3', value: 3 },
  ];

  for (const ratio of textRatios) {
    addButton(textRatioButtons, ratio.id, ratio.label, () => {
      visual.textRatio = ratio.value;
      setPressed(textRatioButtons, ratio.id);
      void refreshPreview();
    });
  }

  const stages: ReadonlyArray<{ id: 'fixed' | 'fill'; label: string }> = [
    { id: 'fixed', label: `fixed ${STAGE_SIZE}x${STAGE_SIZE}` },
    { id: 'fill', label: 'fill the screen' },
  ];

  for (const stage of stages) {
    addButton(stageButtons, stage.id, stage.label, () => {
      stagePreset = stage.id;
      setPressed(stageButtons, stage.id);
      renderEnvironment();
      void refreshPreview();
    });
  }

  setPressed(sceneButtons, visual.scene);
  setPressed(dprButtons, String(visual.dpr));
  setPressed(modeButtons, visual.mode);
  setPressed(textRatioButtons, visual.textRatio === null ? 'inherit' : String(visual.textRatio));
  setPressed(stageButtons, stagePreset);
};

const HEADERS = ['scene', 'mode', 'dpr', 'text px', 'backing', 'main px', 'internal', 'int/main', 'cpu med', 'cpu p95', 'gpu med', 'raf med', 'frames'];

const renderResults = (): void => {
  resultsTable.replaceChildren();

  const head = resultsTable.insertRow();

  for (const header of HEADERS) {
    const cell = document.createElement('th');

    cell.textContent = header;
    head.append(cell);
  }

  for (const result of collected) {
    const row = resultsTable.insertRow();
    const values = [
      result.scene,
      result.mode,
      String(result.configuredPixelRatio),
      // Both halves, because the inherit path is the contract under test: an
      // overridden cell reads `3`, an inheriting one reads `= 2` and a capture
      // where the resolved half disagrees with the DPR column is the finding.
      result.textPixelRatio === null
        ? `= ${result.textRasterPixelRatio ?? '—'}`
        : `${result.textPixelRatio}${result.textRasterPixelRatio === result.textPixelRatio ? '' : ` (got ${result.textRasterPixelRatio ?? '—'})`}`,
      `${result.backingWidth}×${result.backingHeight}`,
      String(result.mainPixelCount),
      describeTargets(result),
      result.internalToMainPixelRatio === null ? '—' : result.internalToMainPixelRatio.toFixed(3),
      formatMs(result.cpuMsMedian),
      formatMs(result.cpuMsP95),
      formatMs(result.gpuMsMedian),
      formatMs(result.rafDeltaMsMedian),
      String(result.measuredFrames),
    ];

    for (const value of values) {
      const cell = row.insertCell();

      cell.textContent = value;
    }

    if (result.errors.length > 0) {
      row.classList.add('warn');
    }
  }
};

/**
 * Caveats that describe the WHOLE capture rather than a single cell.
 *
 * Written into the JSON rather than left for the reader to remember, because the
 * capture is copied off a phone into a report and read weeks later.
 */
const buildNotes = (backendSelected: string, webgpuTimestampQuery: boolean | null): string[] => {
  const notes = [
    'Both modes are ordinary production settings since NEU-S4 shipped: `inherit` leaves `Filter.resolution` / `RenderNode.cacheResolution` at their default, `logical` pins both to 1 and reproduces the pre-NEU-S4 sizing exactly. No bench-only sizing hook is involved; every cell measures the production path.',
    'BlurFilter.radius is in LOGICAL units, so it is identical in both arms - the filter converts it into target texels itself. The arms therefore blur over the same on-screen distance and differ only in how finely it is sampled.',
    'The `cache-texture` scene is static: the cache is baked once and replayed, so its CPU column is a REPLAY cost and its interesting property is sharpness. The `cache-dirty` scene is the same content moved every frame, so the cache re-bakes every frame - that column is the bake cost, and it is the one that scales with the target resolution.',
    `Cells are ordered scene → mode → ascending DPR, so the four ratios of one pair are adjacent in time. Each result carries \`index\` and \`startOffsetMs\` so a thermal drift across the run stays visible.`,
    `Warmup is ${WARMUP_FRAMES} frames and the measured window is ${DEFAULT_MEASURE_MS} ms for every cell alike.`,
    'The `cache-texture` scene omits the two text nodes the other scenes carry. It was measured while building this probe that a `cacheAsTexture` container containing a `Text` node drew NOTHING on WebGL2 — text and non-text siblings alike — while the same scene rendered on WebGPU. That defect has since been fixed (a texture upload leaked `UNPACK_PREMULTIPLY_ALPHA_WEBGL` into the next one) and is pinned by browser tests on both backends; the omission is kept so a capture stays comparable with the ones taken before the fix.',
    'The `text-ratio` scene is the only one that sets `Text.pixelRatio`. Its four cells hold the SURFACE at 2 while raising only the glyph raster (1 → 2 → 3), then raise both to 3, so the sharpness a denser atlas buys can be told apart from the sharpness a denser surface buys. Every other scene leaves the option unset, which is the shipped default: the text inherits `Application.pixelRatio`.',
    'Nothing in the text stack reads `window.devicePixelRatio`. A cell whose `textPixelRatio` is null must report a `textRasterPixelRatio` equal to its `enginePixelRatio`; anything else is a defect, not a device quirk.',
  ];

  if (!window.crossOriginIsolated) {
    notes.push('crossOriginIsolated is FALSE — `performance.now()` is coarsened, so the cpuMs columns are quantised. Check `timerResolutionMs` before reading small differences.');
  }

  if (backendSelected === 'webgl2') {
    notes.push('WebGL2 run. `EXT_disjoint_timer_query_webgl2` is the only hardware GPU clock available here and browsers usually withhold it; a null gpuMs column means it was absent, never that GPU time was zero.');
  }

  if (webgpuTimestampQuery === false) {
    notes.push('The granted WebGPU device exposed no `timestamp-query` feature, so this run has no hardware GPU clock.');
  }

  notes.push(
    stagePreset === 'fixed'
      ? `The stage is a fixed ${STAGE_SIZE}x${STAGE_SIZE} CSS square, far smaller than a full-screen game. It is the preset that compares across devices; use "fill the screen" for a number that reflects what an app actually renders.`
      : "The stage was the device's usable area, so these numbers reflect a full-screen app but do not compare to a capture taken on a differently sized screen.",
  );

  notes.push('rafDeltaMs* is PRESENTATION CADENCE, not GPU time. On a vsync-paced device it reads ~16.7 ms for anything the device keeps up with and only rises once it does not.');

  return notes;
};

/**
 * Backend identity and GPU-clock provenance observed from a throwaway boot.
 *
 * Held separately rather than derived from the cells after the fact: a cell
 * result carries timings, not device identity, and a capture whose
 * `backendSelected` was guessed would be exactly the kind of invented fact this
 * probe exists to avoid.
 */
let runStage: StageSize = { width: STAGE_SIZE, height: STAGE_SIZE };
let lastBackendSelected: string | null = null;
let lastWebgpuTimestampQuery: boolean | null = null;
let lastGpuTimerSource = 'not determined yet';

const buildResult = (): ProbeResult => {
  const backendSelected = lastBackendSelected ?? 'unknown';

  return {
    schemaVersion: PROBE_SCHEMA_VERSION,
    gitSha: meta.gitSha,
    engineVersion: meta.engineVersion,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    deviceLabel: deviceLabelInput.value.trim(),
    testerNote: testerNoteInput.value.trim(),
    devicePixelRatio: window.devicePixelRatio,
    engineAutoPixelRatio,
    backendRequested: backendRequest(),
    backendSelected,
    webgpuTimestampQuery: lastWebgpuTimestampQuery,
    gpuTimerSource: lastGpuTimerSource,
    crossOriginIsolated: window.crossOriginIsolated,
    timerResolutionMs,
    stageWidth: runStage.width,
    stageHeight: runStage.height,
    stagePreset,
    cells: collected,
    notes: buildNotes(backendSelected, lastWebgpuTimestampQuery),
  };
};

const refreshJson = (): void => {
  jsonOutput.value = serializeProbeResult(buildResult());
};

/** Run a list of cells, updating the table as each finishes. */
const runCells = async (cells: readonly ProbeCell[], measureMs: number, label: string): Promise<void> => {
  if (busy) {
    return;
  }

  busy = true;
  runMatrixButton.disabled = true;
  runSustained2Button.disabled = true;
  runSustained3Button.disabled = true;

  await visual.preview?.stop();
  visual.preview = null;
  visualReadout.textContent = 'preview stopped while measuring — one variant on screen at a time.';

  const runStartedAt = performance.now();
  const backend = backendRequest();

  // Frozen for the whole run: `fill` reads the viewport, and a rotation or a
  // browser-chrome change mid-run would silently make the later cells a
  // different measurement than the earlier ones.
  runStage = resolveStage();

  try {
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;

      const textArm = cell.textPixelRatio === undefined ? '' : ` · text ${cell.textPixelRatio}`;

      setStatus(`${label} — cell ${i + 1}/${cells.length}: ${cell.scene} · ${cell.mode} · DPR ${cell.pixelRatio}${textArm}`);
      setProgress(`${i + 1}/${cells.length} · ${cell.scene} · ${cell.mode} · DPR ${cell.pixelRatio}${textArm}`, 'running');
      stageHost.scrollIntoView({ block: 'center' });

      const result = await runProbeCell({
        cell,
        backend,
        stage: runStage,
        host: stageHost,
        index: collected.length,
        runStartedAt,
        measureMs,
      });

      collected.push(result);
      renderResults();
      refreshJson();
    }

    setStatus(`${label} — done (${cells.length} cells). Press Submit to host or Copy JSON.`);
    setProgress(`DONE — ${cells.length}/${cells.length}`, 'done');
  } catch (error) {
    setStatus(`${label} — aborted: ${error instanceof Error ? error.message : String(error)}`, true);
    setProgress('ABORTED', 'error');
  } finally {
    busy = false;
    runMatrixButton.disabled = false;
    runSustained2Button.disabled = false;
    runSustained3Button.disabled = false;
  }
};

/**
 * Read backend identity and GPU-clock availability once, from a throwaway boot,
 * so the capture states them as observed facts.
 */
const probeEnvironmentOnce = async (): Promise<void> => {
  const preview = await startVisualPreview({ scene: 'baseline', mode: 'inherit', pixelRatio: 1, stage: resolveStage(), backend: backendRequest(), host: stageHost });

  lastBackendSelected = preview.backendType;
  await preview.stop();

  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;

  if (lastBackendSelected === 'webgpu' && gpu !== undefined) {
    const adapter = await gpu.requestAdapter().catch(() => null);

    lastWebgpuTimestampQuery = adapter?.features.has('timestamp-query') ?? false;
    lastGpuTimerSource =
      lastWebgpuTimestampQuery === true
        ? 'WebGPU hardware timestamp-query around the frame\'s render passes'
        : 'none — the WebGPU device exposes no timestamp-query feature';
  } else {
    lastWebgpuTimestampQuery = null;
    lastGpuTimerSource = 'EXT_disjoint_timer_query_webgl2 when the browser exposes it; otherwise none (gpuMs stays null — never derived from frame cadence)';
  }
};

runMatrixButton.addEventListener('click', () => {
  const cells = buildProbeMatrix();

  void runCells(cells, DEFAULT_MEASURE_MS, 'matrix');
});

runSustained2Button.addEventListener('click', () => {
  void runCells([{ scene: 'blur', mode: 'inherit', pixelRatio: 2 }], SUSTAINED_MEASURE_MS, 'sustained DPR 2');
});

runSustained3Button.addEventListener('click', () => {
  void runCells([{ scene: 'blur', mode: 'inherit', pixelRatio: 3 }], SUSTAINED_MEASURE_MS, 'sustained DPR 3');
});

/**
 * Send the capture to the machine serving the page, which writes it into the
 * repository's scratch directory.
 *
 * `Copy JSON` stays as the fallback rather than being replaced: the clipboard
 * route needs no server support and works if the endpoint is ever missing, and
 * moving 30 KB of JSON from a phone to a desktop by hand is exactly the friction
 * this button removes.
 */
submitButton.addEventListener('click', () => {
  refreshJson();
  submitButton.disabled = true;
  setStatus('submitting…');

  void fetch('/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: jsonOutput.value })
    .then(async response => {
      const payload = (await response.json().catch(() => ({}))) as { path?: string; error?: string };

      if (!response.ok) {
        setStatus(`submit failed (${response.status}): ${payload.error ?? 'unknown'} — use Copy JSON instead.`, true);

        return;
      }

      setStatus(`saved on the host as ${payload.path ?? '(path not reported)'}`);
    })
    .catch((error: unknown) => {
      setStatus(`submit failed: ${error instanceof Error ? error.message : String(error)} — use Copy JSON instead.`, true);
    })
    .finally(() => {
      submitButton.disabled = false;
    });
});

copyButton.addEventListener('click', () => {
  refreshJson();
  jsonOutput.select();

  void navigator.clipboard
    ?.writeText(jsonOutput.value)
    .then(() => setStatus('JSON copied to the clipboard.'))
    .catch(() => setStatus('Clipboard refused — the JSON is selected in the box below; copy it by hand.', true));
});

clearButton.addEventListener('click', () => {
  collected.length = 0;
  renderResults();
  refreshJson();
  setStatus('cleared');
});

/**
 * Changing the backend RELOADS the page rather than booting a second backend
 * into the live one.
 *
 * Measured while building this probe: the first WebGL2 `Application` created on
 * a page that has already run a WebGPU one fails to compile the sprite vertex
 * shader, and the affected cell then renders nothing while still reporting
 * timings. Reloading gives each backend a page of its own, which is also how the
 * matrix harness isolates them (one browser per backend). Any collected results
 * are dropped with the reload, which is correct - they belong to the other
 * backend.
 */
backendSelect.addEventListener('change', () => {
  const url = new URL(window.location.href);

  url.searchParams.set('backend', backendSelect.value);
  window.location.replace(url.toString());
});

/**
 * Automation hook, mirroring the matrix harness's `globalThis.__runBaselineCell`.
 *
 * Exists so the probe can be driven headlessly for a desktop control run and so
 * its page can be smoke-tested without a human tapping buttons - the same
 * escape hatch the matrix harness already relies on. The manual run never
 * touches it.
 */
declare global {
  var __dprProbe:
    | {
        runProbeCell: typeof runProbeCell;
        buildProbeMatrix: typeof buildProbeMatrix;
        buildResult: () => ProbeResult;
        collected: ProbeCellResult[];
      }
    | undefined;
}

globalThis.__dprProbe = { runProbeCell, buildProbeMatrix, buildResult, collected };

const estimatedMinutes = ((buildProbeMatrix().length * (DEFAULT_MEASURE_MS + 1_500)) / 60_000).toFixed(1);

renderEnvironment();
buildControls();
renderResults();
setStatus(`idle — the full matrix is ${buildProbeMatrix().length} cells, roughly ${estimatedMinutes} minutes.`);

void (async (): Promise<void> => {
  await probeEnvironmentOnce();
  renderEnvironment();
  refreshJson();
  await refreshPreview();
})();
