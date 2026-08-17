import { requestTimestampFeature } from '../../page/gpuFrameTimer';
import type { ProbeCell, ProbeCellResult, ProbeMode, ProbeResult, ProbeSceneId } from '../matrix';
import { buildProbeMatrix, PROBE_PIXEL_RATIOS, PROBE_SCENES, PROBE_SCHEMA_VERSION, serializeProbeResult } from '../matrix';
import type { ProbeBackendRequest, VisualPreview } from '../runner';
import { DEFAULT_MEASURE_MS, measureTimerResolutionMs, runProbeCell, startVisualPreview, SUSTAINED_MEASURE_MS, WARMUP_FRAMES } from '../runner';
import { STAGE_SIZE } from '../scenes';

/**
 * Manual DPR / internal-render-target probe page for `NEU-S4`.
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
const visualReadout = element('visual-readout');
const runMatrixButton = element<HTMLButtonElement>('run-matrix');
const runSustained2Button = element<HTMLButtonElement>('run-sustained-2');
const runSustained3Button = element<HTMLButtonElement>('run-sustained-3');
const statusEl = element('status');
const resultsTable = element<HTMLTableElement>('results');
const submitButton = element<HTMLButtonElement>('submit-json');
const copyButton = element<HTMLButtonElement>('copy-json');
const clearButton = element<HTMLButtonElement>('clear-results');
const jsonOutput = element<HTMLTextAreaElement>('json-output');

/** `Application.resolveAutoPixelRatio` — mirrored so the capture records what `auto` WOULD have chosen. */
const ENGINE_MAX_AUTO_PIXEL_RATIO = 2;
const engineAutoPixelRatio = Math.min(window.devicePixelRatio || 1, ENGINE_MAX_AUTO_PIXEL_RATIO);

const timerResolutionMs = measureTimerResolutionMs();

/** Live UI state for the visual (unmeasured) preview. */
const visual: { scene: ProbeSceneId; dpr: number; mode: ProbeMode; preview: VisualPreview | null } = {
  scene: 'baseline',
  dpr: engineAutoPixelRatio,
  mode: 'current',
  preview: null,
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

const formatMs = (value: number | null): string => (value === null ? '—' : value.toFixed(2));

const describeTargets = (result: Pick<ProbeCellResult, 'internalTargets'>): string =>
  result.internalTargets.length === 0
    ? 'none'
    : result.internalTargets
        .map(target => `${target.kind} ${target.logicalWidth}×${target.logicalHeight} → ${target.actualWidth}×${target.actualHeight}${target.count > 1 ? ` ×${target.count}` : ''}`)
        .join(', ');

const renderEnvironment = (): void => {
  environmentEl.textContent = [
    `git ${meta.gitSha}  ·  exojs ${meta.engineVersion}`,
    `devicePixelRatio ${window.devicePixelRatio}  ·  engine auto would pick ${engineAutoPixelRatio}`,
    `crossOriginIsolated ${String(window.crossOriginIsolated)}  ·  performance.now() resolution ${timerResolutionMs.toFixed(4)} ms`,
    `navigator.gpu ${'gpu' in navigator ? 'present' : 'absent'}  ·  stage ${STAGE_SIZE}×${STAGE_SIZE} CSS px`,
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
  host.appendChild(button);
};

/**
 * (Re)start the preview.
 *
 * Always tears the previous one down first: §6 of the brief forbids two live
 * scenes at once, and two `Application`s sharing the page would also compete for
 * GPU contexts.
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
      backend: backendRequest(),
      host: stageHost,
    });

    visual.preview = preview;
    visualReadout.textContent = [
      `${visual.scene}  ·  DPR ${visual.dpr}  ·  ${visual.mode}  ·  ${preview.backendType}`,
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
    { id: 'current', label: 'current' },
    { id: 'parent-resolution', label: 'parent-resolution probe' },
  ];

  for (const mode of modes) {
    addButton(modeButtons, mode.id, mode.label, () => {
      visual.mode = mode.id;
      setPressed(modeButtons, mode.id);
      void refreshPreview();
    });
  }

  setPressed(sceneButtons, visual.scene);
  setPressed(dprButtons, String(visual.dpr));
  setPressed(modeButtons, visual.mode);
};

const HEADERS = ['scene', 'mode', 'dpr', 'backing', 'main px', 'internal', 'int/main', 'cpu med', 'cpu p95', 'gpu med', 'raf med', 'frames'];

const renderResults = (): void => {
  resultsTable.replaceChildren();

  const head = resultsTable.insertRow();

  for (const header of HEADERS) {
    const cell = document.createElement('th');

    cell.textContent = header;
    head.appendChild(cell);
  }

  for (const result of collected) {
    const row = resultsTable.insertRow();
    const values = [
      result.scene,
      result.mode === 'current' ? 'current' : 'probe',
      String(result.configuredPixelRatio),
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
    'The `parent-resolution` mode is a BENCH-ONLY probe: it shadows `acquireRenderTexture` / `_renderPlanEnsureCacheTexture` on the probe\'s own instances so the internal target is allocated at `logical size × pixelRatio`. Production rendering code is unchanged, and nothing here is an implementation of NEU-S4.',
    'The blur radius is multiplied by the same factor in probe mode. Radius is expressed in TARGET texels, so leaving it alone would shrink the blur in logical space and make the probe arm look sharper for a reason unrelated to resolution.',
    'The `cache-bitmap` scene is static by design: a bitmap cache is baked once and replayed, and any per-frame mutation would change the node\'s world bounds and re-bake it every frame. Its CPU column is therefore a replay cost, and its interesting property is sharpness, not milliseconds.',
    `Cells are ordered scene → mode → ascending DPR, so the four ratios of one pair are adjacent in time. Each result carries \`index\` and \`startOffsetMs\` so a thermal drift across the run stays visible.`,
    `Warmup is ${WARMUP_FRAMES} frames and the measured window is ${DEFAULT_MEASURE_MS} ms for every cell alike.`,
    'The `cache-bitmap` scene omits the two text nodes the other scenes carry. Measured on desktop Chromium while building this probe: a `cacheAsBitmap` container containing a `Text` node draws NOTHING on WebGL2 — text and non-text siblings alike — while the same scene renders on WebGPU and the same content behind a filter renders on both. Since iOS Safari is always WebGL2, keeping the text would have made this whole arm a black rectangle.',
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
    stageWidth: STAGE_SIZE,
    stageHeight: STAGE_SIZE,
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

  try {
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;

      setStatus(`${label} — cell ${i + 1}/${cells.length}: ${cell.scene} · ${cell.mode} · DPR ${cell.pixelRatio}`);
      stageHost.scrollIntoView({ block: 'center' });

      const result = await runProbeCell({
        cell,
        backend,
        host: stageHost,
        index: collected.length,
        runStartedAt,
        measureMs,
      });

      collected.push(result);
      renderResults();
      refreshJson();
    }

    setStatus(`${label} — done (${cells.length} cells). Press Copy JSON.`);
  } catch (error) {
    setStatus(`${label} — aborted: ${error instanceof Error ? error.message : String(error)}`, true);
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
  const preview = await startVisualPreview({ scene: 'baseline', mode: 'current', pixelRatio: 1, backend: backendRequest(), host: stageHost });

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
  void runCells([{ scene: 'blur', mode: 'current', pixelRatio: 2 }], SUSTAINED_MEASURE_MS, 'sustained DPR 2');
});

runSustained3Button.addEventListener('click', () => {
  void runCells([{ scene: 'blur', mode: 'current', pixelRatio: 3 }], SUSTAINED_MEASURE_MS, 'sustained DPR 3');
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
 * are dropped with the reload, which is correct — they belong to the other
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
 * its page can be smoke-tested without a human tapping buttons — the same
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
