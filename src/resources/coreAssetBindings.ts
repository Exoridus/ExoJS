import { AudioStream } from '#audio/AudioStream';
import { Sound } from '#audio/Sound';
import type { AssetBinding, AssetHandler, AssetLoadRequest } from '#extensions/Extension';
import { BmFont } from '#rendering/text/BmFont';
import { Texture } from '#rendering/texture/Texture';
import { Video } from '#rendering/video/Video';
import { BinaryFactory } from '#resources/factories/BinaryFactory';
import { parseBmFontText } from '#resources/factories/BmFontFactory';
import { CsvFactory } from '#resources/factories/CsvFactory';
import { FontFactory } from '#resources/factories/FontFactory';
import { ImageFactory } from '#resources/factories/ImageFactory';
import { MusicFactory } from '#resources/factories/MusicFactory';
import { SoundFactory } from '#resources/factories/SoundFactory';
import { SubtitleFactory } from '#resources/factories/SubtitleFactory';
import { SvgFactory } from '#resources/factories/SvgFactory';
import { TextureFactory } from '#resources/factories/TextureFactory';
import { VideoFactory } from '#resources/factories/VideoFactory';
import { WasmFactory } from '#resources/factories/WasmFactory';
import { XmlFactory } from '#resources/factories/XmlFactory';

import { registerAssetKind } from './assetKindRegistry';
import { defineAsset } from './defineAsset';
import { registerExtensionKind } from './extensionKindRegistry';
import type { AssetConstructor } from './FactoryRegistry';
import type { AssetLoaderContext, Loader } from './Loader';
import { soundSeamlessAdapter, textureSeamlessAdapter } from './seamless';
import { BinaryAsset, CsvAsset, FontAsset, ImageAsset, Json, SubtitleAsset, SvgAsset, TextAsset, WasmAsset, XmlAsset } from './tokens';

// ---------------------------------------------------------------------------
// Adapter helpers
// ---------------------------------------------------------------------------

/** Create an AssetHandler backed by a factory that uses fetchArrayBuffer. */
function binaryFactoryHandler<T>(
  makeFactory: () => { create(raw: ArrayBuffer, options?: unknown): Promise<T>; destroy(): void },
): (loader: Loader) => AssetHandler {
  return () => {
    const factory = makeFactory();
    return {
      async load({ source, options }: AssetLoadRequest, context: AssetLoaderContext): Promise<T> {
        const raw = await context.fetchArrayBuffer(source);
        return factory.create(raw, options);
      },
      createFromBytes(bytes: ArrayBuffer, options?: unknown): Promise<T> {
        return factory.create(bytes, options);
      },
      destroy() {
        factory.destroy();
      },
    };
  };
}

/** Create an AssetHandler backed by a factory that uses fetchText. */
function textFactoryHandler<T>(makeFactory: () => { create(raw: string, options?: unknown): Promise<T>; destroy(): void }): (loader: Loader) => AssetHandler {
  return () => {
    const factory = makeFactory();
    return {
      async load({ source, options }: AssetLoadRequest, context: AssetLoaderContext): Promise<T> {
        const raw = await context.fetchText(source);
        return factory.create(raw, options);
      },
      createFromBytes(bytes: ArrayBuffer, options?: unknown): Promise<T> {
        return factory.create(new TextDecoder().decode(bytes), options);
      },
      destroy() {
        factory.destroy();
      },
    };
  };
}

/**
 * Resolve a sub-asset reference (e.g. a BmFont page image) relative to its
 * parent's source. `new URL(ref, source)` only works when `source` is an
 * absolute URL; loaders are frequently called with relative paths (e.g.
 * `assets/demo/fonts/x.fnt`), so fall back to a synthetic base and strip it.
 * A root-absolute source (`/assets/demo/fonts/x.fnt`) must yield a
 * root-absolute result again — dropping the leading slash would make the
 * browser re-resolve the page image against the document base URL.
 * @internal exported for tests
 */
export function resolveSubAssetPath(ref: string, source: string): string {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(ref)) {
    return ref;
  }
  try {
    return new URL(ref, source).href;
  } catch {
    const base = 'https://exojs.invalid/';
    const resolved = new URL(ref, base + source.replace(/^\/+/, '')).href.slice(base.length);
    return source.startsWith('/') ? `/${resolved}` : resolved;
  }
}

// ---------------------------------------------------------------------------
// Core asset bindings
// ---------------------------------------------------------------------------

const textureBinding = defineAsset({
  type: Texture,
  kind: 'texture',
  extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif'],
  seamless: textureSeamlessAdapter,
  create: binaryFactoryHandler(() => new TextureFactory()),
});

const soundBinding = defineAsset({
  type: Sound,
  kind: 'sound',
  extensions: ['ogg', 'mp3', 'wav', 'm4a', 'aac'],
  seamless: soundSeamlessAdapter,
  create: binaryFactoryHandler(() => new SoundFactory()),
});

// music/video/svg/font/image/bmFont are non-leaf resource kinds: no placeholder
// strategy, so `isValue: false` keeps them OUT of the global kind/inference
// registries (bare paths need `X.of()`); their extensions still ride the binding.
const musicBinding = defineAsset({
  type: AudioStream,
  kind: 'music',
  isValue: false,
  create: binaryFactoryHandler(() => new MusicFactory()),
});

const videoBinding = defineAsset({
  type: Video,
  kind: 'video',
  isValue: false,
  create: binaryFactoryHandler(() => new VideoFactory()),
});

const jsonBinding = defineAsset({
  type: Json,
  kind: 'json',
  extensions: ['json'],
  create: () => ({
    async load({ source }: AssetLoadRequest, context: AssetLoaderContext): Promise<unknown> {
      return context.fetchJson(source);
    },
    createFromBytes(bytes: ArrayBuffer): Promise<unknown> {
      return Promise.resolve(JSON.parse(new TextDecoder().decode(bytes)));
    },
  }),
});

const textBinding = defineAsset({
  type: TextAsset as unknown as AssetConstructor<string>,
  kind: 'text',
  extensions: ['txt'],
  create: () => ({
    async load({ source }: AssetLoadRequest, context: AssetLoaderContext): Promise<string> {
      return context.fetchText(source);
    },
    createFromBytes(bytes: ArrayBuffer): Promise<string> {
      return Promise.resolve(new TextDecoder().decode(bytes));
    },
  }),
});

const svgBinding = defineAsset({
  type: SvgAsset,
  kind: 'svg',
  isValue: false,
  create: textFactoryHandler(() => new SvgFactory()),
});

// Subtitle serves two value kinds through one handler. `defineAsset` registers
// its primary kind `vtt` (+ the `vtt` suffix); the `srt` alias kind — a distinct
// AssetDefinitions key sharing this handler — is registered explicitly so both
// suffixes resolve to a value leaf and both load via the subtitle handler
// (routed at runtime by `typeNames: ['vtt', 'srt']`).
const subtitleBinding = defineAsset({
  type: SubtitleAsset as unknown as AssetConstructor<VTTCue[]>,
  kind: 'vtt',
  typeNames: ['vtt', 'srt'],
  extensions: ['vtt'],
  create: () => {
    const factory = new SubtitleFactory();
    return {
      async load({ source }: AssetLoadRequest, context: AssetLoaderContext): Promise<VTTCue[]> {
        const text = await context.fetchText(source);
        const url = (source.split('?')[0] ?? source).toLowerCase();
        const fmt = url.endsWith('.srt') ? 'srt' : 'vtt';
        const intermediate = await factory.process({ text: () => Promise.resolve(text), url: source });
        return factory.create({ ...intermediate, fmt });
      },
      destroy() {
        factory.destroy();
      },
    };
  },
});

registerAssetKind('srt', { isValue: true });
registerExtensionKind('srt', 'srt');

const xmlBinding = defineAsset({
  type: XmlAsset,
  kind: 'xml',
  extensions: ['xml'],
  create: textFactoryHandler(() => new XmlFactory()),
});

const csvBinding = defineAsset({
  type: CsvAsset,
  kind: 'csv',
  extensions: ['csv'],
  create: textFactoryHandler(() => new CsvFactory()),
});

const binaryBinding = defineAsset({
  type: BinaryAsset,
  kind: 'binary',
  extensions: ['bin'],
  create: binaryFactoryHandler(() => new BinaryFactory()),
});

const bmFontBinding = defineAsset({
  type: BmFont,
  kind: 'bmFont',
  extensions: ['fnt'],
  isValue: false,
  create: (loader: Loader) => ({
    async load({ source }: AssetLoadRequest, context: AssetLoaderContext): Promise<BmFont> {
      const text = await context.fetchText(source);
      const fontData = parseBmFontText(text);
      const textures = await Promise.all(fontData.pages.map(page => loader.load(Texture.of(resolveSubAssetPath(page, source)))));
      return new BmFont(fontData, textures);
    },
  }),
});

// Conditional bindings — only registered when the environment supports them.
const conditionalBindings: AssetBinding[] = [];

if (typeof FontFace !== 'undefined') {
  conditionalBindings.push(
    defineAsset({
      type: FontAsset,
      kind: 'font',
      extensions: ['woff', 'woff2', 'ttf', 'otf'],
      isValue: false,
      create: binaryFactoryHandler(() => new FontFactory()),
    }),
  );
}

if (typeof HTMLImageElement !== 'undefined') {
  conditionalBindings.push(
    defineAsset({
      type: ImageAsset,
      kind: 'image',
      isValue: false,
      create: binaryFactoryHandler(() => new ImageFactory()),
    }),
  );
}

if (typeof WebAssembly !== 'undefined') {
  conditionalBindings.push(
    defineAsset({
      type: WasmAsset,
      kind: 'wasm',
      extensions: ['wasm'],
      create: binaryFactoryHandler(() => new WasmFactory()),
    }),
  );
}

/**
 * Core asset bindings — installed by every Application for built-in asset types.
 * Uses the same materializeAssetBindings path as extension packages.
 * @internal
 */
export const coreAssetBindings: readonly AssetBinding[] = Object.freeze([
  textureBinding,
  soundBinding,
  musicBinding,
  videoBinding,
  jsonBinding,
  textBinding,
  svgBinding,
  subtitleBinding,
  xmlBinding,
  csvBinding,
  binaryBinding,
  bmFontBinding,
  ...conditionalBindings,
]);
