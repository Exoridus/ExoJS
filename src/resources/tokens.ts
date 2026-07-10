
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
 * `loader.load(Asset.kind('json', 'config.json'))` returns `Promise<unknown>`.
 * Narrow via generic: `loader.load(Asset.kind<Config>('json', 'config.json'))`.
 * Handles all JSON shapes — objects, arrays, scalars.
 */
export abstract class Json {
  declare protected readonly _token: 'json';

}

/**
 * Dispatch token for plain text loading.
 *
 * `loader.load(Asset.kind('text', 'greeting.txt'))` returns `Promise<string>`.
 */
export abstract class TextAsset {
  declare protected readonly _token: 'text';

}

/**
 * Dispatch token for SVG loading.
 *
 * `loader.load(Asset.kind('svg', 'icon.svg'))` returns `Promise<HTMLImageElement>`.
 */
export abstract class SvgAsset {
  declare protected readonly _token: 'svg';

}

/**
 * Dispatch token for subtitle loading (WebVTT and SRT).
 *
 * `loader.load(Asset.kind('vtt', 'subs.vtt'))` returns `Promise<VTTCue[]>`.
 * `loader.load(Asset.kind('vtt', 'subs.srt'))` returns `Promise<VTTCue[]>`.
 * Format is detected from the file extension; unknown extensions default to VTT.
 */
export abstract class SubtitleAsset {
  declare protected readonly _token: 'subtitle';

}

/**
 * Dispatch token for XML document loading.
 *
 * `loader.load(Asset.kind('xml', 'data.xml'))` returns `Promise<Document>`.
 * Throws if the file cannot be parsed as well-formed XML.
 */
export abstract class XmlAsset {
  declare protected readonly _token: 'xml';

}

/**
 * Dispatch token for CSV loading.
 *
 * `loader.load(Asset.kind('csv', 'table.csv'))` returns `Promise<string[][]>`.
 * Each inner array is one row; values are raw strings (no type coercion).
 */
export abstract class CsvAsset {
  declare protected readonly _token: 'csv';

}

/**
 * Dispatch token for image loading.
 *
 * `loader.load(Asset.kind('image', 'img.png'))` returns `Promise<HTMLImageElement>`.
 */
export abstract class ImageAsset {
  declare protected readonly _token: 'image';

}

/**
 * Dispatch token for font loading.
 *
 * `loader.load(Asset.kind('font', 'font.woff2', { family: 'MyFont' }))` returns `Promise<FontFace>`.
 */
export abstract class FontAsset {
  declare protected readonly _token: 'font';

}

/**
 * Dispatch token for binary data loading.
 *
 * `loader.load(Asset.kind('binary', 'data.bin'))` returns `Promise<ArrayBuffer>`.
 */
export abstract class BinaryAsset {
  declare protected readonly _token: 'binary';

}

/**
 * Dispatch token for WebAssembly module loading.
 *
 * `loader.load(Asset.kind('wasm', 'module.wasm'))` returns `Promise<WebAssembly.Module>`.
 */
export abstract class WasmAsset {
  declare protected readonly _token: 'wasm';

}
