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
 * Dispatch token for WebVTT subtitle loading.
 *
 * `loader.load(VttAsset, 'subs.vtt')` returns `Promise<Array<VTTCue>>`.
 */
export abstract class VttAsset {}
