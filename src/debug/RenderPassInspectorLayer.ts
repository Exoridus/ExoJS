import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import type { Time } from '#core/Time';
import { Container } from '#rendering/Container';
import type { Filter } from '#rendering/filters/Filter';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';
import { RenderPipeline } from '#rendering/RenderPipeline';
import { Text as Text } from '#rendering/text/Text';
import type { TextStyleOptions } from '#rendering/text/TextStyle';

import { DebugLayer, type DebugLayerViewMode } from './DebugLayer';

const panelX = 200; // sit to the right of the PerformanceLayer panel
const panelY = 8;
const panelMinW = 240;
const panelMaxLines = 24;
const panelLineH = 13;
const panelPadding = 8;
const textSize = 11;

const bgColor = new Color(0, 0, 0, 0.7);
const headerColor = new Color(153, 255, 255, 1);
const textColor = Color.white.clone();
const dimColor = new Color(178, 178, 178, 1);

/**
 * Snapshot of one drawable's filter chain at the moment the inspector
 * collected it. Held by reference inside {@link RenderPassInspectorLayer}
 * for the duration of one frame; replaced on the next update.
 */
export interface RenderPassInspectorEntry {
  /** Constructor name of the inspected drawable (e.g. `Sprite`, `Container`). */
  readonly drawableLabel: string;
  /** Filter instances currently attached, in execution order. */
  readonly filters: readonly Filter[];
  /** Bounding-box width as the filter pipeline sees it (ceil). */
  readonly width: number;
  /** Bounding-box height as the filter pipeline sees it (ceil). */
  readonly height: number;
  /** Whether the drawable has a mask attached (mask passes count toward total). */
  readonly hasMask: boolean;
  /** Whether the drawable is bitmap-cached (cached drawables apply filters once, not per frame). */
  readonly cachedAsBitmap: boolean;
}

/**
 * One row of a {@link RenderPipeline} listing produced by {@link RenderPassInspectorLayer.describePipeline}.
 * Identity is the pass object; `label` is display-only (no names are required). Nested pipelines increase `depth`.
 */
export interface RenderPipelineRow {
  /** Nesting depth (0 = top-level pass). */
  readonly depth: number;
  /** The pass's label (defaults to its constructor name). */
  readonly label: string;
  /** Whether the pass is enabled. */
  readonly enabled: boolean;
  /** Whether the pass is itself a {@link RenderPipeline}. */
  readonly isPipeline: boolean;
}

/**
 * Debug layer that lists every {@link RenderNode} with an active filter chain
 * each frame. Renders a compact text panel with per-drawable rows showing
 * the filter sequence, bounding-box dimensions, and mask/cache status.
 *
 * Use during development to answer:
 *
 *   - "Is my filter actually attached?" → it appears in the list
 *   - "Why does my frame have N render passes?" → see total pass count
 *   - "Is this drawable being re-rendered or cached?" → `[cached]` flag
 *
 * For deep per-pass inspection (intermediate render-target contents, GLSL/WGSL
 * source, uniform values), use Spector.js or Chrome DevTools' WebGPU panel —
 * the engine emits debug-group labels around filter and mesh-custom-shader
 * passes so those tools show meaningful pass names.
 */
export class RenderPassInspectorLayer extends DebugLayer {
  private readonly _entries: RenderPassInspectorEntry[] = [];
  private _root: Container | null = null;
  private _bg: Graphics | null = null;
  private _header: Text | null = null;
  private _lines: Text[] = [];
  private _pipeline: RenderPipeline | null = null;

  public constructor(app: Application) {
    super(app);
  }

  /**
   * Flatten a {@link RenderPipeline} into depth-tagged rows, recursing into nested pipelines. Pure and
   * app-independent: identity is the pass object and `label` is display-only — no names are required.
   */
  public static describePipeline(pipeline: RenderPipeline): RenderPipelineRow[] {
    const rows: RenderPipelineRow[] = [];
    RenderPassInspectorLayer._collectPipelineRows(pipeline, 0, rows);
    return rows;
  }

  private static _collectPipelineRows(pipeline: RenderPipeline, depth: number, rows: RenderPipelineRow[]): void {
    for (const pass of pipeline) {
      rows.push({ depth, label: pass.label, enabled: pass.enabled, isPipeline: pass instanceof RenderPipeline });
      if (pass instanceof RenderPipeline) {
        RenderPassInspectorLayer._collectPipelineRows(pass, depth + 1, rows);
      }
    }
  }

  public override get viewMode(): DebugLayerViewMode {
    return 'screen';
  }

  /**
   * Walk the scene graph and collect filter-chain entries for every
   * {@link RenderNode} with at least one filter. Replaces the previous
   * frame's snapshot. The current snapshot is exposed via {@link entries}
   * for tests and external consumers.
   */
  public override update(_delta: Time): void {
    if (this._root === null) {
      this._build();
    }

    this._entries.length = 0;

    const root = this._app.scene.currentScene?.root;
    if (root) {
      this._collect(root);
    }

    this._refreshPanel();
  }

  /** Submit the panel's {@link Container} subtree to the backend for drawing. */
  public override render(backend: RenderBackend): void {
    this._root?.render(backend);
  }

  public override destroy(): void {
    if (this._root !== null) {
      this._root.destroy();
      this._root = null;
    }
    this._bg = null;
    this._header = null;
    this._lines = [];
    this._entries.length = 0;
    this._pipeline = null;
  }

  /**
   * Read-only snapshot of the entries collected on the most recent
   * {@link update} call. Useful for tests and for external tooling that
   * wants to render its own visualisation rather than use the built-in
   * panel.
   */
  public get entries(): readonly RenderPassInspectorEntry[] {
    return this._entries;
  }

  /** Total pass count across all collected entries. */
  public get totalPasses(): number {
    let total = 0;
    for (const entry of this._entries) {
      total += entry.filters.length;
      if (entry.hasMask) total++;
    }
    return total;
  }

  /** Set a {@link RenderPipeline} to list beneath the filter chains, or `null` to clear it. */
  public setPipeline(pipeline: RenderPipeline | null): this {
    this._pipeline = pipeline;

    return this;
  }

  /** The pipeline currently being inspected, or `null`. */
  public get pipeline(): RenderPipeline | null {
    return this._pipeline;
  }

  /** Depth-tagged rows for the inspected pipeline (empty if none is set). */
  public pipelineRows(): RenderPipelineRow[] {
    return this._pipeline !== null ? RenderPassInspectorLayer.describePipeline(this._pipeline) : [];
  }

  // -----------------------------------------------------------------------

  private _collect(node: RenderNode): void {
    if (!node.visible) return;

    if (node.filters.length > 0) {
      const bounds = node.getBounds();
      this._entries.push({
        drawableLabel: node.constructor.name,
        filters: [...node.filters],
        width: Math.max(1, Math.ceil(bounds.width)),
        height: Math.max(1, Math.ceil(bounds.height)),
        hasMask: node.mask !== null,
        cachedAsBitmap: node.cacheAsBitmap,
      });
    }

    const container = node as Partial<{ children: RenderNode[] }>;
    if (Array.isArray(container.children)) {
      for (const child of container.children) {
        this._collect(child);
      }
    }
  }

  private _build(): void {
    const style: TextStyleOptions = {
      fontSize: textSize,
      fontFamily: 'Arial',
      fontWeight: 'normal',
      fillColor: textColor,
    };

    this._bg = new Graphics();
    const headerStyle: TextStyleOptions = { ...style, fillColor: headerColor };
    this._header = new Text('', headerStyle);
    this._header.x = panelX + panelPadding;
    this._header.y = panelY + panelPadding;

    this._lines = [];
    for (let i = 0; i < panelMaxLines; i++) {
      const line = new Text('', style);
      line.x = panelX + panelPadding;
      line.y = panelY + panelPadding + panelLineH + i * panelLineH;
      this._lines.push(line);
    }

    this._root = new Container();
    this._root.addChild(this._bg);
    this._root.addChild(this._header);
    for (const line of this._lines) this._root.addChild(line);
  }

  private _refreshPanel(): void {
    if (this._header === null || this._bg === null) return;

    const lines: Array<{ text: string; dim: boolean }> = [];

    if (this._entries.length === 0) {
      lines.push({ text: '(no active filter chains)', dim: true });
    } else {
      for (const entry of this._entries) {
        const flags: string[] = [];
        if (entry.hasMask) flags.push('mask');
        if (entry.cachedAsBitmap) flags.push('cached');
        const flagsText = flags.length > 0 ? ` [${flags.join(',')}]` : '';
        lines.push({
          text: `${entry.drawableLabel} ${entry.width}x${entry.height}${flagsText}`,
          dim: false,
        });
        for (let i = 0; i < entry.filters.length; i++) {
          const filter = entry.filters[i];
          if (filter === undefined) {
            continue;
          }
          lines.push({ text: `  ${i}. ${filter.constructor.name}`, dim: false });
        }
      }
    }

    const pipelineRows = this.pipelineRows();
    if (pipelineRows.length > 0) {
      lines.push({ text: 'Pipeline:', dim: true });
      for (const row of pipelineRows) {
        const indent = '  '.repeat(row.depth + 1);
        lines.push({ text: `${indent}${row.label}${row.enabled ? '' : ' [off]'}`, dim: !row.enabled });
      }
    }

    this._header.text = `Render Passes: ${this.totalPasses}`;

    const visibleCount = Math.min(lines.length, this._lines.length);
    for (let i = 0; i < this._lines.length; i++) {
      const line = this._lines[i];
      if (line === undefined) {
        continue;
      }
      const entry = i < visibleCount ? lines[i] : undefined;
      if (entry !== undefined) {
        line.text = entry.text;
        line.style.fillColor = entry.dim ? dimColor : textColor;
        line.visible = true;
      } else {
        line.text = '';
        line.visible = false;
      }
    }

    if (lines.length > this._lines.length) {
      const last = this._lines[this._lines.length - 1];
      const overflow = lines.length - this._lines.length;
      if (last !== undefined) {
        last.text = `... (+${overflow} more)`;
        last.style.fillColor = dimColor;
        last.visible = true;
      }
    }

    // Resize background to fit content.
    const panelHeight = panelPadding * 2 + panelLineH * (1 + visibleCount);
    this._bg.clear();
    this._bg.fillColor = bgColor;
    this._bg.drawRectangle(panelX, panelY, panelMinW, panelHeight);
  }
}
