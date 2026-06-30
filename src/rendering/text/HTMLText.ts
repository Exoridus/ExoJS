import { logger, LogSeverity } from '#core/logging';
import { Container } from '#rendering/Container';
import { Mesh } from '#rendering/mesh/Mesh';
import { Texture } from '#rendering/texture/Texture';

export type FontFormat = 'woff2' | 'woff' | 'ttf' | 'otf';

const fontMime: Record<FontFormat, string> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

// eslint-disable-next-line @typescript-eslint/naming-convention
export interface HTMLTextOptions {
  /** CSS injected inside a &lt;style&gt; tag within the SVG foreignObject. */
  css?: string;
  /** Logical width in pixels. Default: 256 */
  width?: number;
  /** Logical height in pixels. Default: 128 */
  height?: number;
  /**
   * Device-pixel ratio applied to the backing canvas.
   * Values >1 produce a sharper texture at the cost of a larger canvas.
   * Default: 1
   */
  resolution?: number;
}

/**
 * Text node that renders arbitrary HTML+CSS into a canvas texture via an
 * SVG `<foreignObject>` pass and displays the result as a textured quad.
 *
 * Full CSS typography and rich markup are supported. External resources
 * (`<img src>`, `background-image: url(...)`) are **blocked** by browsers
 * when loading SVG blob-URIs — inline those as base-64 data URIs.
 *
 * Custom web fonts must be registered with {@link addFont} before use;
 * pass the raw font bytes (from {@link BinaryAsset} or a plain `fetch`):
 *
 * ```ts
 * const bytes = await loader.load(BinaryAsset, 'roboto.woff2');
 * htmlText.addFont('Roboto', bytes, 'woff2');
 * ```
 *
 * The HTML must be valid XHTML (tags closed, `&amp;` for `&`, etc.)
 * because it is embedded inside an XML document.
 *
 * @example
 * ```ts
 * const label = new HTMLText(
 *   '<b>Score</b>: <span style="color:gold">9999</span>',
 *   { width: 200, height: 40, css: 'body { font: 20px Arial; color: white; }' },
 * );
 * scene.addChild(label);
 * await label.ready; // optional — wait for first render
 * ```
 * @stable
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class HTMLText extends Container {
  private _html: string;
  private _css: string;
  private _width: number;
  private _height: number;
  private _resolution: number;

  private _canvas: HTMLCanvasElement | OffscreenCanvas;
  private _ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private _texture: Texture;
  private _mesh: Mesh;

  private _destroyed = false;
  private _renderVersion = 0;
  private _activeRender: Promise<void> | null = null;

  private readonly _fonts: Array<{ family: string; dataUri: string }> = [];

  public constructor(html: string, options: HTMLTextOptions = {}) {
    super();
    this._html = html;
    this._css = options.css ?? '';
    this._width = options.width ?? 256;
    this._height = options.height ?? 128;
    this._resolution = options.resolution ?? 1;

    const [canvas, ctx] = HTMLText._makeCanvas(Math.ceil(this._width * this._resolution), Math.ceil(this._height * this._resolution));
    this._canvas = canvas;
    this._ctx = ctx;
    this._texture = new Texture(canvas as HTMLCanvasElement);
    this._texture.setSize(this._width, this._height);

    this._mesh = this._buildMesh();
    this.addChild(this._mesh);

    if (html.length > 0) {
      this._schedule();
    }
  }

  // ── Properties ────────────────────────────────────────────────────────────

  public get html(): string {
    return this._html;
  }
  public set html(v: string) {
    if (this._html === v) return;
    this._html = v;
    this._schedule();
  }

  public get css(): string {
    return this._css;
  }
  public set css(v: string) {
    if (this._css === v) return;
    this._css = v;
    this._schedule();
  }

  public override get width(): number {
    return this._width;
  }
  public override set width(v: number) {
    this.resize(v, this._height);
  }

  public override get height(): number {
    return this._height;
  }
  public override set height(v: number) {
    this.resize(this._width, v);
  }

  public get resolution(): number {
    return this._resolution;
  }
  public set resolution(v: number) {
    if (this._resolution === v) return;
    this._resolution = v;
    this._resizeCanvas();
    this._schedule();
  }

  /**
   * Resolves when the current render pass finishes writing to the canvas.
   * Await before adding to a scene if you need the first frame to be visible
   * immediately.
   */
  public get ready(): Promise<void> {
    return this._activeRender ?? Promise.resolve();
  }

  // ── Font registration ─────────────────────────────────────────────────────

  /**
   * Register a font by its raw bytes for use inside this node's SVG render.
   * The `family` name must match the `font-family` value used in your CSS.
   *
   * Registering the same family twice replaces the previous entry.
   *
   * ```ts
   * const bytes = await loader.load(BinaryAsset, 'roboto.woff2');
   * label.addFont('Roboto', bytes, 'woff2');
   * ```
   */
  public addFont(family: string, data: ArrayBuffer, format: FontFormat = 'woff2'): this {
    const dataUri = `data:${fontMime[format]};base64,${HTMLText._toBase64(data)}`;
    const existing = this._fonts.findIndex(f => f.family === family);

    if (existing >= 0) {
      this._fonts[existing] = { family, dataUri };
    } else {
      this._fonts.push({ family, dataUri });
    }

    this._schedule();
    return this;
  }

  /** Remove a previously registered font and trigger a re-render. */
  public removeFont(family: string): this {
    const idx = this._fonts.findIndex(f => f.family === family);
    if (idx >= 0) {
      this._fonts.splice(idx, 1);
      this._schedule();
    }
    return this;
  }

  // ── Dimensions ────────────────────────────────────────────────────────────

  /**
   * Change the logical dimensions and rebuild the mesh.
   * Prefer this over setting `width` and `height` individually when changing
   * both at once — it triggers a single re-render instead of two.
   */
  public resize(width: number, height: number): this {
    if (this._width === width && this._height === height) return this;
    this._width = width;
    this._height = height;
    this._resizeCanvas();
    this._rebuildMesh();
    this._schedule();
    return this;
  }

  public override destroy(): void {
    this._destroyed = true;
    this._renderVersion++;
    this._activeRender = null;
    this._texture.destroy();
    super.destroy();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _schedule(): void {
    const version = ++this._renderVersion;
    this._activeRender = this._render(version).catch(error => {
      logger.log(LogSeverity.Warning, 'rendering', 'HTMLText render failed.', error instanceof Error ? { error } : undefined);
    });
  }

  private async _render(version: number): Promise<void> {
    if (typeof Blob === 'undefined' || typeof Image === 'undefined') return; // SSR / Node.js

    // Blob URL avoids the size and encoding overhead of a data URI,
    // which matters when large base-64 fonts are inlined.
    const blob = new Blob([this._buildSvg()], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('HTMLText: SVG render failed'));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }

    if (this._destroyed || version !== this._renderVersion) return;

    const cw = Math.ceil(this._width * this._resolution);
    const ch = Math.ceil(this._height * this._resolution);
    this._ctx.clearRect(0, 0, cw, ch);
    this._ctx.drawImage(img, 0, 0, cw, ch);
    this._texture.updateSource();
  }

  private _buildSvg(): string {
    const w = this._width;
    const h = this._height;

    const fontFaceRules = this._fonts
      .map(({ family, dataUri }) => {
        const escaped = family.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
        return `@font-face{font-family:'${escaped}';src:url('${dataUri}');}`;
      })
      .join('');

    // Guard against the user's CSS accidentally closing the <style> tag early.
    const userCss = this._css.replaceAll(/<\/style>/gi, '<\\/style>');

    const styleBlock = fontFaceRules || userCss ? `<style>${fontFaceRules}${userCss}</style>` : '';

    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<foreignObject width="100%" height="100%">` +
      `<div xmlns="http://www.w3.org/1999/xhtml"` +
      ` style="width:${w}px;height:${h}px;overflow:hidden;box-sizing:border-box;">${styleBlock}${this._html}</div>` +
      `</foreignObject>` +
      `</svg>`
    );
  }

  private _buildMesh(): Mesh {
    const w = this._width;
    const h = this._height;
    return new Mesh({
      vertices: new Float32Array([0, 0, w, 0, w, h, 0, h]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      texture: this._texture,
    });
  }

  private _rebuildMesh(): void {
    this.removeChild(this._mesh);
    this._mesh.destroy();
    this._mesh = this._buildMesh();
    this.addChild(this._mesh);
  }

  private _resizeCanvas(): void {
    const cw = Math.ceil(this._width * this._resolution);
    const ch = Math.ceil(this._height * this._resolution);
    this._canvas.width = cw;
    this._canvas.height = ch;
    // Canvas is blank after resize; the scheduled render fills it.
    // updateSource() bumps the texture version so the GPU re-uploads.
    this._texture.updateSource();
  }

  private static _toBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      // In-bounds: i < bytes.length.
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  }

  private static _makeCanvas(
    width: number,
    height: number,
  ): [HTMLCanvasElement | OffscreenCanvas, CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D] {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d')!;
      if (!ctx) throw new Error('HTMLText: could not obtain 2D context.');
      return [canvas, ctx];
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('HTMLText: could not obtain 2D context.');
    return [canvas, ctx];
  }
}
