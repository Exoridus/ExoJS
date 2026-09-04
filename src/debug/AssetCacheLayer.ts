import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { type Seconds, Time } from '#core/units';
import { Container } from '#rendering/Container';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderBackend } from '#rendering/RenderBackend';
import { Text as Text } from '#rendering/text/Text';
import type { TextStyleOptions } from '#rendering/text/TextStyle';

import { DebugLayer, type DebugLayerViewMode } from './DebugLayer';

const panelX = 8;
// Below the PerformanceLayer panel, which is 158 tall from y = 8.
const panelY = 174;
const panelW = 190;
const panelPadding = 8;
const panelLineH = 13;
const panelMaxLines = 14;
const textSize = 11;

const bgColor = new Color(0, 0, 0, 0.7);
const headerColor = new Color(153, 255, 255, 1);
const textColor = Color.white.clone();
const dimColor = new Color(178, 178, 178, 1);
const failedColor = new Color(255, 96, 96, 1);

/** Default gap between residency snapshots. */
const defaultRefreshInterval = Time.seconds(0.5);

/** Default number of heaviest assets listed. */
const defaultTopCount = 4;

const byteUnits = ['B', 'KB', 'MB', 'GB'] as const;

/** Byte counts at panel width: three significant digits and a unit, never more. */
const formatBytes = (bytes: number): string => {
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < byteUnits.length - 1) {
    value /= 1024;
    unit++;
  }

  const amount = unit === 0 ? value.toFixed(0) : value.toFixed(value < 10 ? 2 : 1);

  return `${amount} ${byteUnits[unit] ?? 'B'}`;
};

/** The tail of a source string, which is the part that identifies it at panel width. */
const shorten = (source: string, maxLength: number): string => (source.length <= maxLength ? source : `...${source.slice(source.length - maxLength + 3)}`);

/**
 * Debug layer that reports what the application's {@link Loader} currently
 * holds: ready / pending / failed counts, estimated resident bytes broken down
 * by asset type, and the heaviest resident assets.
 *
 * The snapshot walks the whole residency, so it is taken on an interval
 * ({@link refreshInterval}) rather than every frame. Byte figures are the
 * loader's own estimate and count CPU-side payloads only - see
 * `AssetStats.bytes` for what they do and do not cover.
 *
 * Enable via {@link DebugOverlay} or by pressing F7 while the canvas has focus.
 */
export class AssetCacheLayer extends DebugLayer {
  /**
   * How long a snapshot is kept before the panel takes a new one. Lower it to
   * watch a load land in real time; the cost is a full residency walk per
   * refresh.
   */
  public refreshInterval: Seconds = defaultRefreshInterval;

  /** How many of the heaviest resident assets the panel lists. */
  public topCount = defaultTopCount;

  private _elapsed = 0;
  private _root: Container | null = null;
  private _bg: Graphics | null = null;
  private _header: Text | null = null;
  private _lines: Text[] = [];

  public constructor(app: Application) {
    super(app);
  }

  public override get viewMode(): DebugLayerViewMode {
    return 'screen';
  }

  /** Take a fresh residency snapshot when the refresh interval has elapsed, and repaint the panel. */
  public override update(delta: Seconds): void {
    if (this._root === null) {
      this._build();
      // Forces a snapshot on this very frame rather than after the first
      // interval, so a freshly shown panel is never blank.
      this._elapsed = Number.POSITIVE_INFINITY;
    }

    this._elapsed += delta;

    if (this._elapsed < this.refreshInterval) {
      return;
    }

    this._elapsed = 0;
    this._refreshPanel();
  }

  /** Submit the panel's {@link Container} subtree to the backend for drawing. */
  public override render(backend: RenderBackend): void {
    this._root?.render(backend);
  }

  /** Destroy the panel's subtree and release all child references. */
  public override destroy(): void {
    if (this._root !== null) {
      this._root.destroy();
      this._root = null;
    }

    this._bg = null;
    this._header = null;
    this._lines = [];
  }

  // -----------------------------------------------------------------------

  private _refreshPanel(): void {
    if (this._header === null || this._bg === null) {
      return;
    }

    const stats = this._app.loader.stats(this.topCount);
    const lines: Array<{ text: string; color: Color }> = [];

    this._header.text = `Assets: ${stats.ready} ready  ${formatBytes(stats.bytes)}`;

    lines.push({
      text: `pending ${stats.pending}   failed ${stats.failed}`,
      color: stats.failed > 0 ? failedColor : dimColor,
    });

    for (const type of stats.byType) {
      lines.push({ text: `${type.type.padEnd(9)} ${String(type.ready).padStart(4)}  ${formatBytes(type.bytes)}`, color: textColor });
    }

    if (stats.largest.length > 0) {
      lines.push({ text: 'Largest:', color: dimColor });

      for (const asset of stats.largest) {
        lines.push({ text: `  ${shorten(asset.canonicalKey, 22)}  ${formatBytes(asset.bytes)}`, color: textColor });
      }
    }

    const visibleCount = Math.min(lines.length, this._lines.length);

    for (const [index, line] of this._lines.entries()) {
      const entry = index < visibleCount ? lines[index] : undefined;

      line.text = entry?.text ?? '';
      line.visible = entry !== undefined;

      if (entry !== undefined) {
        line.style.fillColor = entry.color;
      }
    }

    if (lines.length > this._lines.length) {
      const last = this._lines[this._lines.length - 1];

      if (last !== undefined) {
        last.text = `... (+${lines.length - this._lines.length} more)`;
        last.style.fillColor = dimColor;
        last.visible = true;
      }
    }

    this._bg.clear();
    this._bg.fillColor = bgColor;
    this._bg.drawRectangle(panelX, panelY, panelW, panelPadding * 2 + panelLineH * (1 + visibleCount));
  }

  private _build(): void {
    const style: TextStyleOptions = {
      fontSize: textSize,
      fontFamily: 'Arial',
      fontWeight: 'normal',
      fillColor: textColor,
    };

    this._bg = new Graphics();
    this._header = new Text('', { ...style, fillColor: headerColor });
    this._header.x = panelX + panelPadding;
    this._header.y = panelY + panelPadding;

    this._lines = [];

    for (let index = 0; index < panelMaxLines; index++) {
      const line = new Text('', style);

      line.x = panelX + panelPadding;
      line.y = panelY + panelPadding + panelLineH * (index + 1);
      this._lines.push(line);
    }

    this._root = new Container();
    this._root.addChild(this._bg);
    this._root.addChild(this._header);

    for (const line of this._lines) {
      this._root.addChild(line);
    }
  }
}
