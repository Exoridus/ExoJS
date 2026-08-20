import { BinaryFactory } from '#assets/factories/BinaryFactory';
import { parseBmFontText } from '#assets/factories/BmFontFactory';
import { CsvFactory } from '#assets/factories/CsvFactory';
import { FontFactory } from '#assets/factories/FontFactory';
import { ImageFactory } from '#assets/factories/ImageFactory';
import { MusicFactory } from '#assets/factories/MusicFactory';
import { SoundFactory } from '#assets/factories/SoundFactory';
import { SubtitleFactory } from '#assets/factories/SubtitleFactory';
import { SvgFactory } from '#assets/factories/SvgFactory';
import { TextureFactory } from '#assets/factories/TextureFactory';
import { VideoFactory } from '#assets/factories/VideoFactory';
import { WasmFactory } from '#assets/factories/WasmFactory';
import { XmlFactory } from '#assets/factories/XmlFactory';
import { AudioStream } from '#audio/AudioStream';
import { Sound } from '#audio/Sound';
import type { AssetBinding, AssetHandler, AssetLoadRequest } from '#extensions/Extension';
import { BmFont } from '#rendering/text/BmFont';
import { Texture } from '#rendering/texture/Texture';
import { Video } from '#rendering/video/Video';

import { Asset } from './Asset';
import { defineAsset } from './defineAsset';
import type { AssetConstructor } from './FactoryRegistry';
import type { AssetLoaderContext, Loader } from './Loader';
import { soundSeamlessAdapter, textureSeamlessAdapter } from './seamless';
import { BinaryAsset, CsvAsset, FontAsset, ImageAsset, Json, SubtitleAsset, SvgAsset, TextAsset, WasmAsset, XmlAsset } from './tokens';

// ---------------------------------------------------------------------------
// Adapter helpers
// ---------------------------------------------------------------------------

/**
 * The slice of `AssetFactory` the two generic handler adapters below drive:
 * `create`, the optional per-resource `dispose` they forward when the loader
 * evicts one asset, and the factory-wide `destroy` they forward on teardown.
 */
interface FactoryLike<Source, T> {
  create(raw: Source, options?: unknown): Promise<T>;
  dispose?(resource: T): void;
  destroy(): void;
}

/**
 * The option keys a core factory bakes irreversibly into the resource it
 * produces, and which therefore identify a distinct resource rather than a
 * distinct consumer of one.
 *
 * Everything absent from this list is deliberately NOT identity: sampler state
 * and placeholder sizing belong to the individual handle, and playback settings
 * stay mutable on the produced stream, so folding either in would fetch and
 * decode the same bytes twice.
 */
function identityDiscriminatorFor(keys: readonly string[]): (request: AssetLoadRequest) => string {
  return ({ options }: AssetLoadRequest): string => {
    if (typeof options !== 'object') {
      return '';
    }

    const record = options as Record<string, unknown>;

    return keys
      .filter(key => record[key] !== undefined)
      .map(key => `${key}=${String(record[key])}`)
      .join(',');
  };
}

/** Create an AssetHandler backed by a factory that uses fetchArrayBuffer. */
function binaryFactoryHandler<T>(makeFactory: () => FactoryLike<ArrayBuffer, T>, identityOptions: readonly string[] = []): (loader: Loader) => AssetHandler {
  return () => {
    const factory = makeFactory();
    return {
      ...(identityOptions.length > 0 && { getIdentityDiscriminator: identityDiscriminatorFor(identityOptions) }),
      async load({ source, options }: AssetLoadRequest, context: AssetLoaderContext): Promise<T> {
        const raw = await context.fetchArrayBuffer(source);
        return factory.create(raw, options);
      },
      createFromBytes(bytes: ArrayBuffer, options?: unknown): Promise<T> {
        return factory.create(bytes, options);
      },
      dispose(resource: unknown): void {
        factory.dispose?.(resource as T);
      },
      destroy() {
        factory.destroy();
      },
    };
  };
}

/** Create an AssetHandler backed by a factory that uses fetchText. */
function textFactoryHandler<T>(makeFactory: () => FactoryLike<string, T>): (loader: Loader) => AssetHandler {
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
      dispose(resource: unknown): void {
        factory.dispose?.(resource as T);
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
  ctor: Texture,
  type: 'texture',
  extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif'],
  seamless: textureSeamlessAdapter,
  create: binaryFactoryHandler(() => new TextureFactory(), ['mimeType']),
});

const soundBinding = defineAsset({
  ctor: Sound,
  type: 'sound',
  extensions: ['ogg', 'mp3', 'wav', 'm4a', 'aac'],
  seamless: soundSeamlessAdapter,
  create: binaryFactoryHandler(() => new SoundFactory(), ['mimeType']),
});

// music/video/svg/font/image/bmFont are non-leaf resource types: no placeholder
// strategy, so `isValue: false` keeps them OUT of the global type/inference
// registries (bare paths need `Asset.type(...)`); their extensions still ride the binding.
const musicBinding = defineAsset({
  ctor: AudioStream,
  type: 'music',
  isValue: false,
  create: binaryFactoryHandler(() => new MusicFactory(), ['mimeType']),
});

const videoBinding = defineAsset({
  ctor: Video,
  type: 'video',
  isValue: false,
  create: binaryFactoryHandler(() => new VideoFactory(), ['mimeType']),
});

const jsonBinding = defineAsset({
  ctor: Json,
  type: 'json',
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
  ctor: TextAsset as unknown as AssetConstructor<string>,
  type: 'text',
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
  ctor: SvgAsset,
  type: 'svg',
  isValue: false,
  create: textFactoryHandler(() => new SvgFactory()),
});

// Subtitle serves two value types through one handler. `defineAsset` registers
// its primary type `vtt` (+ the `vtt` suffix) globally; the `srt` alias type - a
// distinct AssetDefinitions key sharing this handler - rides the `aliases` list
// so it gets the same global (kind + extension) registration through the one
// declarative call, and both suffixes load via the subtitle handler (routed at
// runtime by `typeNames: ['vtt', 'srt']`).
const subtitleBinding = defineAsset({
  ctor: SubtitleAsset as unknown as AssetConstructor<VTTCue[]>,
  type: 'vtt',
  typeNames: ['vtt', 'srt'],
  extensions: ['vtt'],
  aliases: [{ type: 'srt', extensions: ['srt'] }],
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

const xmlBinding = defineAsset({
  ctor: XmlAsset,
  type: 'xml',
  extensions: ['xml'],
  create: textFactoryHandler(() => new XmlFactory()),
});

const csvBinding = defineAsset({
  ctor: CsvAsset,
  type: 'csv',
  extensions: ['csv'],
  create: textFactoryHandler(() => new CsvFactory()),
});

const binaryBinding = defineAsset({
  ctor: BinaryAsset,
  type: 'binary',
  extensions: ['bin'],
  create: binaryFactoryHandler(() => new BinaryFactory()),
});

const bmFontBinding = defineAsset({
  ctor: BmFont,
  type: 'bmFont',
  extensions: ['fnt'],
  isValue: false,
  create: (loader: Loader) => ({
    async load({ source }: AssetLoadRequest, context: AssetLoaderContext): Promise<BmFont> {
      const text = await context.fetchText(source);
      const fontData = parseBmFontText(text);
      const textures = await Promise.all(fontData.pages.map(page => loader.load(Asset.type('texture', resolveSubAssetPath(page, source)))));
      return new BmFont(fontData, textures);
    },
  }),
});

// Conditional bindings — only registered when the environment supports them.
const conditionalBindings: AssetBinding[] = [];

if (typeof FontFace !== 'undefined') {
  conditionalBindings.push(
    defineAsset({
      ctor: FontAsset,
      type: 'font',
      extensions: ['woff', 'woff2', 'ttf', 'otf'],
      isValue: false,
      create: binaryFactoryHandler(() => new FontFactory(), ['family']),
    }),
  );
}

if (typeof HTMLImageElement !== 'undefined') {
  conditionalBindings.push(
    defineAsset({
      ctor: ImageAsset,
      type: 'image',
      isValue: false,
      create: binaryFactoryHandler(() => new ImageFactory(), ['mimeType']),
    }),
  );
}

if (typeof WebAssembly !== 'undefined') {
  conditionalBindings.push(
    defineAsset({
      ctor: WasmAsset,
      type: 'wasm',
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
