/**
 * Dispatch token for generic JSON loading.
 *
 * `loader.load(Json, 'config.json')` returns `Promise<unknown>`.
 * Narrow via generic: `loader.load<Config>(Json, 'config.json')`.
 * Handles all JSON shapes — objects, arrays, scalars.
 */
export abstract class Json {}

/**
 * Dispatch token for plain text loading.
 *
 * `loader.load(TextAsset, 'greeting.txt')` returns `Promise<string>`.
 */
export abstract class TextAsset {}

/**
 * Dispatch token for SVG loading.
 *
 * `loader.load(SvgAsset, 'icon.svg')` returns `Promise<HTMLImageElement>`.
 */
export abstract class SvgAsset {}

/**
 * Dispatch token for subtitle loading (WebVTT and SRT).
 *
 * `loader.load(SubtitleAsset, 'subs.vtt')` returns `Promise<VTTCue[]>`.
 * `loader.load(SubtitleAsset, 'subs.srt')` returns `Promise<VTTCue[]>`.
 * Format is detected from the file extension; unknown extensions default to VTT.
 */
export abstract class SubtitleAsset {}

/**
 * Dispatch token for XML document loading.
 *
 * `loader.load(XmlAsset, 'data.xml')` returns `Promise<Document>`.
 * Throws if the file cannot be parsed as well-formed XML.
 */
export abstract class XmlAsset {}

/**
 * Dispatch token for CSV loading.
 *
 * `loader.load(CsvAsset, 'table.csv')` returns `Promise<string[][]>`.
 * Each inner array is one row; values are raw strings (no type coercion).
 */
export abstract class CsvAsset {}

/**
 * Dispatch token for image loading.
 *
 * `loader.load(ImageAsset, 'img.png')` returns `Promise<HTMLImageElement>`.
 */
export abstract class ImageAsset {}

/**
 * Dispatch token for font loading.
 *
 * `loader.load(FontAsset, 'font.woff2', { family: 'MyFont' })` returns `Promise<FontFace>`.
 */
export abstract class FontAsset {}

/**
 * Dispatch token for binary data loading.
 *
 * `loader.load(BinaryAsset, 'data.bin')` returns `Promise<ArrayBuffer>`.
 */
export abstract class BinaryAsset {}

/**
 * Dispatch token for WebAssembly module loading.
 *
 * `loader.load(WasmAsset, 'module.wasm')` returns `Promise<WebAssembly.Module>`.
 */
export abstract class WasmAsset {}
