import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { type Seconds, Time } from '#core/units';
import { Container } from '#rendering/Container';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';
import { Text as Text } from '#rendering/text/Text';
import type { TextStyleOptions } from '#rendering/text/TextStyle';

import { DebugLayer, type DebugLayerViewMode } from './DebugLayer';

// --- layout constants (camelCase to satisfy lint naming convention) ----------

const panelX = 8;
const panelY = 8;
const panelW = 200;
const panelH = 158;

const lineH = 14;
const textSize = 11;
const textRowCount = 6;
const sparklineY = panelY + 8 + textRowCount * lineH + 4;
const sparklineH = panelH - (sparklineY - panelY) - 4;
const sparklineW = panelW - 16;
const sparklineX = panelX + 8;

const fpsSampleCount = 60;
const sparklineSampleCount = 120;

/** Frame budget assumed when none is configured: one frame of a 60 Hz display. */
const defaultFrameBudget = Time.seconds(1 / 60);

// Semi-transparent dark background.
const bgColor = new Color(0, 0, 0, 0.7);
// Bright text color (light blue-white).
const textColor = Color.white.clone();
// Cyan sparkline.
const sparklineColor = new Color(0, 255, 255, 1);
// Warning red for the rows reporting a budget overrun.
const overBudgetColor = new Color(255, 96, 96, 1);
// Dimmed warning red for the budget guide line across the sparkline.
const budgetLineColor = new Color(255, 96, 96, 0.4);

// -----------------------------------------------------------------------------

/**
 * GPU results resolve a frame or more after the frame they describe, so the row
 * is labelled `last` rather than presented as this frame's cost.
 */
const formatGpuFrameTime = (gpuFrameTimeMs: number | null): string => (gpuFrameTimeMs === null ? 'pending' : `${gpuFrameTimeMs.toFixed(2)}ms last`);

/** Recursively count nodes under a RenderNode. */
const countNodes = (node: RenderNode): number => {
  let count = 1;
  const container = node as Partial<{ children: RenderNode[] }>;

  if (Array.isArray(container.children)) {
    for (const child of container.children) {
      count += countNodes(child);
    }
  }

  return count;
};

/**
 * Debug layer that renders a compact screen-space HUD (top-left) showing
 * rolling-average FPS, per-frame time in milliseconds, GPU frame time,
 * draw-call count, scene-node count, and how many of the last 120 frames ran
 * over {@link frameBudget}, alongside a 120-sample frame-time sparkline.
 *
 * The layer asks the backend for hardware GPU timing when it first becomes
 * visible and turns it off again in {@link destroy}. Devices that expose no GPU
 * timer report `GPU: n/a`; where one exists, the value is the last frame whose
 * results have come back, which trails the frame on screen.
 *
 * Enable via {@link DebugOverlay} or by pressing F1 while the canvas has focus.
 */
export class PerformanceLayer extends DebugLayer {
  /**
   * Frame duration treated as the target budget.
   *
   * A frame longer than this turns the frame-time row red and is counted by the
   * `Over` row, which reports the overruns among the 120 frames the sparkline
   * plots. The sparkline's vertical range is twice the budget, so the guide line
   * drawn across it always marks the budget and a reassigned budget rescales the
   * plot with it. Defaults to one 60 Hz frame.
   */
  public frameBudget: Seconds = defaultFrameBudget;

  // Rolling FPS sample buffer (60 samples).
  private readonly _fpsSamples: Float32Array = new Float32Array(fpsSampleCount);
  private _fpsSampleIndex = 0;

  // Rolling frame-time buffer (120 samples) for sparkline.
  private readonly _sparkSamples: Float32Array = new Float32Array(sparklineSampleCount);
  private _sparkSampleIndex = 0;

  // Whether the budget rows are currently painted red. Tracked so the style is
  // only reassigned on a change - every assignment dispatches TextStyle.onChange.
  private _overBudgetPainted = false;

  // Whether the backend reported a hardware GPU clock when timing was switched
  // on. A device without one never produces a sample, so the row says so once
  // instead of reading as a frame that took no GPU time.
  private _gpuTimingAvailable = false;

  // Root container - lazily initialized on first update() call so the
  // glyph atlas is not touched in environments where canvas 2D is absent.
  private _root: Container | null = null;
  private _textFps: Text | null = null;
  private _textFrame: Text | null = null;
  private _textGpu: Text | null = null;
  private _textDraws: Text | null = null;
  private _textNodes: Text | null = null;
  private _textBudget: Text | null = null;
  private _sparkline: Graphics | null = null;

  public constructor(app: Application) {
    super(app);
  }

  public override get viewMode(): DebugLayerViewMode {
    return 'screen';
  }

  /**
   * Sample the current frame time, recompute the rolling FPS average,
   * update stat text nodes, and rebuild the sparkline geometry. Lazily
   * initializes the panel scene graph on first call to avoid touching the
   * glyph atlas until the layer is actually shown.
   */
  public override update(delta: Seconds): void {
    // Lazily build the scene graph on first update so that Text (which
    // touches the glyph atlas immediately) is only constructed when the
    // layer is first made visible - not at DebugOverlay construction time.
    if (this._root === null) {
      this._build();
      // Deferred to here for the same reason: nothing is allocated on the GPU
      // until the panel is actually shown.
      this._gpuTimingAvailable = this._app.backend.setGpuTimingEnabled(true);
    }

    // --- FPS rolling average ---
    const frameMs = delta * 1000;

    this._fpsSamples[this._fpsSampleIndex] = frameMs;
    this._fpsSampleIndex = (this._fpsSampleIndex + 1) % fpsSampleCount;

    let totalMs = 0;
    let validSamples = 0;

    for (let i = 0; i < fpsSampleCount; i++) {
      const s = this._fpsSamples[i];

      if (s !== undefined && s > 0) {
        totalMs += s;
        validSamples++;
      }
    }

    const avgMs = validSamples > 0 ? totalMs / validSamples : 0;
    const fps = avgMs > 0 ? 1000 / avgMs : 0;

    // --- Sparkline sample ---
    this._sparkSamples[this._sparkSampleIndex] = frameMs;
    this._sparkSampleIndex = (this._sparkSampleIndex + 1) % sparklineSampleCount;

    // --- Stats ---
    const stats = this._app.backend.stats;
    const scene = this._app.scenes.currentScene;
    const nodeCount = scene ? countNodes(scene.root) : 0;
    const budgetMs = this.frameBudget * 1000;

    // --- Update text ---
    if (this._textFps !== null) {
      this._textFps.text = `FPS: ${fps.toFixed(1)}`;
    }

    if (this._textFrame !== null) {
      this._textFrame.text = `Frame: ${frameMs.toFixed(1)}ms`;
    }

    if (this._textGpu !== null) {
      this._textGpu.text = this._gpuTimingAvailable ? `GPU: ${formatGpuFrameTime(stats.gpuFrameTimeMs)}` : 'GPU: n/a';
    }

    if (this._textDraws !== null) {
      this._textDraws.text = `Draws: ${stats.drawCalls}`;
    }

    if (this._textNodes !== null) {
      this._textNodes.text = `Nodes: ${nodeCount}`;
    }

    const overBudgetCount = this._rebuildSparkline(budgetMs);

    if (this._textBudget !== null) {
      this._textBudget.text = `Over: ${overBudgetCount}/${sparklineSampleCount} (${budgetMs.toFixed(1)}ms)`;
    }

    this._paintBudgetState(frameMs > budgetMs || overBudgetCount > 0);
  }

  /** Submit the panel's {@link Container} subtree to the backend for drawing. */
  public override render(backend: RenderBackend): void {
    this._root?.render(backend);
  }

  /** Destroy the panel's subtree, release all child references, and hand GPU timing back to the backend. */
  public override destroy(): void {
    if (this._root !== null) {
      this._root.destroy();
      this._root = null;
      this._app.backend.setGpuTimingEnabled(false);
      this._gpuTimingAvailable = false;
    }

    this._textFps = null;
    this._textFrame = null;
    this._textGpu = null;
    this._textDraws = null;
    this._textNodes = null;
    this._textBudget = null;
    this._sparkline = null;
  }

  // -----------------------------------------------------------------------

  /**
   * Redraw the sparkline over a vertical range of twice `budgetMs`, so the
   * budget guide line always sits at the plot's midpoint, and return how many
   * retained samples exceeded the budget - counted here because the walk over
   * the ring buffer happens either way.
   */
  private _rebuildSparkline(budgetMs: number): number {
    const sparkline = this._sparkline;

    if (sparkline === null) {
      return 0;
    }

    const ceilingMs = budgetMs * 2;

    sparkline.clear();
    sparkline.lineWidth = 1;
    sparkline.lineColor = sparklineColor;

    // Walk samples in chronological order (oldest first).
    const oldest = this._sparkSampleIndex;
    const stepX = sparklineW / (sparklineSampleCount - 1);

    let started = false;
    let overBudgetCount = 0;

    for (let i = 0; i < sparklineSampleCount; i++) {
      const sampleIndex = (oldest + i) % sparklineSampleCount;
      const ms = this._sparkSamples[sampleIndex] ?? 0;
      const px = sparklineX + i * stepX;
      const py = sparklineY + sparklineH - Math.min(1, ceilingMs > 0 ? ms / ceilingMs : 0) * sparklineH;

      if (ms > budgetMs) {
        overBudgetCount++;
      }

      if (!started) {
        sparkline.moveTo(px, py);
        started = true;
      } else {
        sparkline.lineTo(px, py);
      }
    }

    return overBudgetCount;
  }

  /** Recolour the frame-time and budget rows, skipping the work when nothing changed. */
  private _paintBudgetState(over: boolean): void {
    if (over === this._overBudgetPainted) {
      return;
    }

    this._overBudgetPainted = over;

    const color = over ? overBudgetColor : textColor;

    if (this._textFrame !== null) {
      this._textFrame.style.fillColor = color;
    }

    if (this._textBudget !== null) {
      this._textBudget.style.fillColor = color;
    }
  }

  private _build(): void {
    const style: TextStyleOptions = {
      fontSize: textSize,
      fontFamily: 'Arial',
      fontWeight: 'normal',
      fillColor: textColor,
    };

    const bg = new Graphics();

    bg.fillColor = bgColor;
    bg.drawRectangle(panelX, panelY, panelW, panelH);

    // Static geometry: the sparkline's range is defined as twice the budget, so
    // the budget always maps to the plot's midpoint whatever it is set to.
    const budgetLine = new Graphics();

    budgetLine.lineWidth = 1;
    budgetLine.lineColor = budgetLineColor;
    budgetLine.moveTo(sparklineX, sparklineY + sparklineH / 2);
    budgetLine.lineTo(sparklineX + sparklineW, sparklineY + sparklineH / 2);

    this._textFps = new Text('FPS: -', style);
    this._textFrame = new Text('Frame: -', style);
    this._textGpu = new Text('GPU: -', style);
    this._textDraws = new Text('Draws: -', style);
    this._textNodes = new Text('Nodes: -', style);
    this._textBudget = new Text('Over: -', style);

    const rows = [this._textFps, this._textFrame, this._textGpu, this._textDraws, this._textNodes, this._textBudget];

    for (const [index, row] of rows.entries()) {
      row.x = panelX + 8;
      row.y = panelY + 8 + lineH * index;
    }

    this._sparkline = new Graphics();

    this._root = new Container();
    this._root.addChild(bg);

    for (const row of rows) {
      this._root.addChild(row);
    }

    this._root.addChild(budgetLine);
    this._root.addChild(this._sparkline);
  }
}
