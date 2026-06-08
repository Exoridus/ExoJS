import { Music } from '#audio/Music';
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

import type { AssetConstructor } from './FactoryRegistry';
import type { AssetLoaderContext, Loader } from './Loader';
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
      destroy() {
        factory.destroy();
      },
    };
  };
}

// Typed binding factory that accepts abstract token classes.
function binding<T>(
  type: AssetConstructor,
  opts: { typeNames?: readonly string[]; extensions?: readonly string[] },
  create: (loader: Loader) => AssetHandler<T>,
): AssetBinding {
  return { type, ...opts, create };
}

/**
 * Resolve a sub-asset reference (e.g. a BmFont page image) relative to its
 * parent's source. `new URL(ref, source)` only works when `source` is an
 * absolute URL; loaders are frequently called with relative paths (e.g.
 * `assets/demo/fonts/x.fnt`), so fall back to a synthetic base and strip it.
 */
function resolveSubAssetPath(ref: string, source: string): string {
  try {
    return new URL(ref, source).href;
  } catch {
    const base = 'https://exojs.invalid/';
    return new URL(ref, base + source.replace(/^\/+/, '')).href.slice(base.length);
  }
}

// ---------------------------------------------------------------------------
// Core asset bindings
// ---------------------------------------------------------------------------

const textureBinding = binding(
  Texture,
  { typeNames: ['texture'] },
  binaryFactoryHandler(() => new TextureFactory()),
);

const soundBinding = binding(
  Sound,
  { typeNames: ['sound'] },
  binaryFactoryHandler(() => new SoundFactory()),
);

const musicBinding = binding(
  Music,
  { typeNames: ['music'] },
  binaryFactoryHandler(() => new MusicFactory()),
);

const videoBinding = binding(
  Video,
  { typeNames: ['video'] },
  binaryFactoryHandler(() => new VideoFactory()),
);

const jsonBinding = binding(Json as unknown as AssetConstructor, { typeNames: ['json'] }, () => ({
  async load({ source }: AssetLoadRequest, context: AssetLoaderContext): Promise<unknown> {
    return context.fetchJson(source);
  },
}));

const textBinding = binding(TextAsset as unknown as AssetConstructor, { typeNames: ['text'] }, () => ({
  async load({ source }: AssetLoadRequest, context: AssetLoaderContext): Promise<string> {
    return context.fetchText(source);
  },
}));

const svgBinding = binding(
  SvgAsset as unknown as AssetConstructor,
  { typeNames: ['svg'] },
  textFactoryHandler(() => new SvgFactory()),
);

const subtitleBinding = binding(SubtitleAsset as unknown as AssetConstructor, { typeNames: ['vtt', 'srt'] }, () => {
  const factory = new SubtitleFactory();
  return {
    async load({ source }: AssetLoadRequest, context: AssetLoaderContext): Promise<VTTCue[]> {
      const text = await context.fetchText(source);
      const url = source.split('?')[0].toLowerCase();
      const fmt = url.endsWith('.srt') ? 'srt' : 'vtt';
      const fakeResponse = { text: () => Promise.resolve(text), url: source } as unknown as Response;
      const intermediate = await factory.process(fakeResponse);
      return factory.create({ ...intermediate, fmt });
    },
    destroy() {
      factory.destroy();
    },
  };
});

const xmlBinding = binding(
  XmlAsset as unknown as AssetConstructor,
  { typeNames: ['xml'] },
  textFactoryHandler(() => new XmlFactory()),
);

const csvBinding = binding(
  CsvAsset as unknown as AssetConstructor,
  { typeNames: ['csv'] },
  textFactoryHandler(() => new CsvFactory()),
);

const binaryBinding = binding(
  BinaryAsset as unknown as AssetConstructor,
  { typeNames: ['binary'] },
  binaryFactoryHandler(() => new BinaryFactory()),
);

const bmFontBinding = binding(BmFont, { typeNames: ['bmFont'], extensions: ['fnt'] }, (loader: Loader) => ({
  async load({ source }: AssetLoadRequest, context: AssetLoaderContext): Promise<BmFont> {
    const text = await context.fetchText(source);
    const fontData = parseBmFontText(text);
    const textures = await Promise.all(fontData.pages.map(page => loader.load(Texture, resolveSubAssetPath(page, source))));
    return new BmFont(fontData, textures as Texture[]);
  },
}));

// Conditional bindings — only registered when the environment supports them.
const conditionalBindings: AssetBinding[] = [];

if (typeof FontFace !== 'undefined') {
  conditionalBindings.push(
    binding(
      FontAsset as unknown as AssetConstructor,
      { typeNames: ['font'], extensions: ['woff', 'woff2', 'ttf', 'otf'] },
      binaryFactoryHandler(() => new FontFactory()),
    ),
  );
}

if (typeof HTMLImageElement !== 'undefined') {
  conditionalBindings.push(
    binding(
      ImageAsset as unknown as AssetConstructor,
      { typeNames: ['image'] },
      binaryFactoryHandler(() => new ImageFactory()),
    ),
  );
}

if (typeof WebAssembly !== 'undefined') {
  conditionalBindings.push(
    binding(
      WasmAsset as unknown as AssetConstructor,
      { typeNames: ['wasm'] },
      binaryFactoryHandler(() => new WasmFactory()),
    ),
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
