// Each dispatch token carries a distinct nominal brand (`_token`, `declare`-only,
// never emitted). Without it these otherwise-empty marker classes are
// structurally interchangeable in constructor-based registry APIs and tests.
// The brand keeps each token distinct from the others and from resource classes.

/**
 * Dispatch token for generic JSON loading.
 *
 * `loader.load({ type: 'json', source: 'config.json' })` returns `Promise<unknown>`.
 * Narrow via generic: `loader.load({ type: 'json', source: 'config.json', parse: (raw): Config => raw as Config })`.
 * Handles all JSON shapes - objects, arrays, scalars.
 */
export abstract class Json {
  declare protected readonly _token: 'json';
}

/**
 * Dispatch token for plain text loading.
 *
 * `loader.load({ type: 'text', source: 'greeting.txt' })` returns `Promise<string>`.
 */
export abstract class TextAsset {
  declare protected readonly _token: 'text';
}

/**
 * Dispatch token for SVG loading.
 *
 * `loader.load({ type: 'svg', source: 'icon.svg' })` returns `Promise<HTMLImageElement>`.
 */
export abstract class SvgAsset {
  declare protected readonly _token: 'svg';
}

/**
 * Dispatch token for subtitle loading (WebVTT and SRT).
 *
 * `loader.load({ type: 'subtitle', source: 'subs.vtt' })` returns `Promise<VTTCue[]>`,
 * and so does the same call for a `.srt` file. The format is taken from the file
 * extension; anything else reads as WebVTT.
 */
export abstract class SubtitleAsset {
  declare protected readonly _token: 'subtitle';
}

/**
 * Dispatch token for XML document loading.
 *
 * `loader.load({ type: 'xml', source: 'data.xml' })` returns `Promise<Document>`.
 * Throws if the file cannot be parsed as well-formed XML.
 */
export abstract class XmlAsset {
  declare protected readonly _token: 'xml';
}

/**
 * Dispatch token for CSV loading.
 *
 * `loader.load({ type: 'csv', source: 'table.csv' })` returns `Promise<string[][]>`.
 * Each inner array is one row; values are raw strings (no type coercion).
 */
export abstract class CsvAsset {
  declare protected readonly _token: 'csv';
}

/**
 * Dispatch token for image loading.
 *
 * `loader.load({ type: 'image', source: 'img.png' })` returns `Promise<DecodedImage>`: an
 * `ImageBitmap` where the environment has `createImageBitmap`, an
 * `HTMLImageElement` otherwise. Narrow before reading element-only members such
 * as `naturalWidth` or `src`.
 */
export abstract class ImageAsset {
  declare protected readonly _token: 'image';
}

/**
 * Dispatch token for font loading.
 *
 * `loader.load({ type: 'font', source: 'font.woff2', family: 'MyFont' })` returns `Promise<FontFace>`.
 */
export abstract class FontAsset {
  declare protected readonly _token: 'font';
}

/**
 * Dispatch token for binary data loading.
 *
 * `loader.load({ type: 'binary', source: 'data.bin' })` returns `Promise<ArrayBuffer>`.
 */
export abstract class BinaryAsset {
  declare protected readonly _token: 'binary';
}

/**
 * Dispatch token for WebAssembly module loading.
 *
 * `loader.load({ type: 'wasm', source: 'module.wasm' })` returns `Promise<WebAssembly.Module>`.
 */
export abstract class WasmAsset {
  declare protected readonly _token: 'wasm';
}
