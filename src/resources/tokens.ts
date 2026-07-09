import type { Asset } from './Asset';
import { _makeAsset } from './Asset';

// Each dispatch token carries a distinct nominal brand (`_token`, `declare`-only,
// never emitted). Without it these otherwise-empty marker classes are
// structurally interchangeable, so `LoadReturn<T>`'s `T extends typeof Json` /
// `… typeof WasmAsset` probes collapse — e.g. `Asset<WebAssembly.Module>` is
// `Asset<{}>` (Module is an empty interface), which every resource class's
// `X.of()` return is assignable to, making `LoadReturn<typeof Texture>` wrongly
// resolve to `WebAssembly.Module`. The brand makes each token match only its own
// `LoadReturn` branch and keeps resource classes out of all of them. (§5 typing bug.)

/**
 * Dispatch token for generic JSON loading.
 *
 * `loader.load(Json, 'config.json')` returns `Promise<unknown>`.
 * Narrow via generic: `loader.load<Config>(Json, 'config.json')`.
 * Handles all JSON shapes — objects, arrays, scalars.
 */
export abstract class Json {
  declare protected readonly _token: 'json';
  /**
   * Annotation descriptor for a JSON asset (asset-system v2 §5). Supply `T` to
   * type the parsed value: `Json.of<LevelData>('levels/1.json')`. Use in
   * `Assets.from({...})` or `loader.get(...)`/`loader.load(...)`.
   */
  public static of<T = unknown>(source: string): Asset<T> {
    return _makeAsset('json', source) as unknown as Asset<T>;
  }
}

/**
 * Dispatch token for plain text loading.
 *
 * `loader.load(TextAsset, 'greeting.txt')` returns `Promise<string>`.
 */
export abstract class TextAsset {
  declare protected readonly _token: 'text';
  /**
   * Annotation descriptor for a plain-text asset (asset-system v2 §5). Use in
   * `Assets.from({...})` or `loader.get(...)`/`loader.load(...)`.
   */
  public static of(source: string): Asset<string> {
    return _makeAsset('text', source);
  }
}

/**
 * Dispatch token for SVG loading.
 *
 * `loader.load(SvgAsset, 'icon.svg')` returns `Promise<HTMLImageElement>`.
 */
export abstract class SvgAsset {
  declare protected readonly _token: 'svg';
  /**
   * Annotation descriptor for an SVG asset (asset-system v2 §5). Pass
   * `{ width, height }` to rasterize the SVG at an explicit size (an unsized SVG
   * decodes at its intrinsic dimensions). Use in `Assets.from({...})` or
   * `loader.get(...)`/`loader.load(...)`.
   */
  public static of(source: string, options?: { width?: number; height?: number }): Asset<HTMLImageElement> {
    return _makeAsset('svg', source, options);
  }
}

/**
 * Dispatch token for subtitle loading (WebVTT and SRT).
 *
 * `loader.load(SubtitleAsset, 'subs.vtt')` returns `Promise<VTTCue[]>`.
 * `loader.load(SubtitleAsset, 'subs.srt')` returns `Promise<VTTCue[]>`.
 * Format is detected from the file extension; unknown extensions default to VTT.
 */
export abstract class SubtitleAsset {
  declare protected readonly _token: 'subtitle';
  /**
   * Annotation descriptor for a subtitle asset (asset-system v2 §5). Use in
   * `Assets.from({...})` or `loader.get(...)`/`loader.load(...)`.
   */
  public static of(source: string): Asset<VTTCue[]> {
    return _makeAsset('vtt', source);
  }
}

/**
 * Dispatch token for XML document loading.
 *
 * `loader.load(XmlAsset, 'data.xml')` returns `Promise<Document>`.
 * Throws if the file cannot be parsed as well-formed XML.
 */
export abstract class XmlAsset {
  declare protected readonly _token: 'xml';
  /**
   * Annotation descriptor for an XML asset (asset-system v2 §5). Use in
   * `Assets.from({...})` or `loader.get(...)`/`loader.load(...)`.
   */
  public static of(source: string): Asset<Document> {
    return _makeAsset('xml', source);
  }
}

/**
 * Dispatch token for CSV loading.
 *
 * `loader.load(CsvAsset, 'table.csv')` returns `Promise<string[][]>`.
 * Each inner array is one row; values are raw strings (no type coercion).
 */
export abstract class CsvAsset {
  declare protected readonly _token: 'csv';
  /**
   * Annotation descriptor for a CSV asset (asset-system v2 §5). Use in
   * `Assets.from({...})` or `loader.get(...)`/`loader.load(...)`.
   */
  public static of(source: string): Asset<string[][]> {
    return _makeAsset('csv', source);
  }
}

/**
 * Dispatch token for image loading.
 *
 * `loader.load(ImageAsset, 'img.png')` returns `Promise<HTMLImageElement>`.
 */
export abstract class ImageAsset {
  declare protected readonly _token: 'image';
  /**
   * Annotation descriptor for a plain `<img>`-loaded image asset (asset-system
   * v2 §5) — no GPU upload, unlike {@link Texture.of}. Use in
   * `Assets.from({...})` or `loader.get(...)`/`loader.load(...)`.
   */
  public static of(source: string): Asset<HTMLImageElement> {
    return _makeAsset('image', source);
  }
}

/**
 * Dispatch token for font loading.
 *
 * `loader.load(FontAsset, 'font.woff2', { family: 'MyFont' })` returns `Promise<FontFace>`.
 */
export abstract class FontAsset {
  declare protected readonly _token: 'font';
  /**
   * Annotation descriptor for a font-face asset (asset-system v2 §5). `family`
   * is required — it names the `FontFace` registered with the document. Use in
   * `Assets.from({...})` or `loader.get(...)`/`loader.load(...)`.
   */
  public static of(source: string, options: { family: string; descriptors?: FontFaceDescriptors; addToDocument?: boolean }): Asset<FontFace> {
    return _makeAsset('font', source, options);
  }
}

/**
 * Dispatch token for binary data loading.
 *
 * `loader.load(BinaryAsset, 'data.bin')` returns `Promise<ArrayBuffer>`.
 */
export abstract class BinaryAsset {
  declare protected readonly _token: 'binary';
  /**
   * Annotation descriptor for a raw binary asset (asset-system v2 §5). Use in
   * `Assets.from({...})` or `loader.get(...)`/`loader.load(...)`.
   */
  public static of(source: string): Asset<ArrayBuffer> {
    return _makeAsset('binary', source);
  }
}

/**
 * Dispatch token for WebAssembly module loading.
 *
 * `loader.load(WasmAsset, 'module.wasm')` returns `Promise<WebAssembly.Module>`.
 */
export abstract class WasmAsset {
  declare protected readonly _token: 'wasm';
  /**
   * Annotation descriptor for a WebAssembly module asset (asset-system v2 §5).
   * Use in `Assets.from({...})` or `loader.get(...)`/`loader.load(...)`.
   */
  public static of(source: string): Asset<WebAssembly.Module> {
    return _makeAsset('wasm', source);
  }
}
