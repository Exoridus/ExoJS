import { Music } from '@/audio/Music';
import { Sound } from '@/audio/Sound';
import type { AssetBinding, AssetHandler, AssetLoadRequest } from '@/extensions/Extension';
import { BmFont } from '@/rendering/text/BmFont';
import { Texture } from '@/rendering/texture/Texture';
import { Video } from '@/rendering/video/Video';

import type { AssetConstructor } from './FactoryRegistry';
import type { AssetLoaderContext, Loader } from './Loader';
import { BinaryFactory } from './factories/BinaryFactory';
import { parseBmFontText } from './factories/BmFontFactory';
import { CsvFactory } from './factories/CsvFactory';
import { FontFactory } from './factories/FontFactory';
import { ImageFactory } from './factories/ImageFactory';
import { MusicFactory } from './factories/MusicFactory';
import { SoundFactory } from './factories/SoundFactory';
import { SvgFactory } from './factories/SvgFactory';
import { SubtitleFactory } from './factories/SubtitleFactory';
import { TextFactory } from './factories/TextFactory';
import { TextureFactory } from './factories/TextureFactory';
import { VideoFactory } from './factories/VideoFactory';
import { WasmFactory } from './factories/WasmFactory';
import { XmlFactory } from './factories/XmlFactory';
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
function textFactoryHandler<T>(
  makeFactory: () => { create(raw: string, options?: unknown): Promise<T>; destroy(): void },
): (loader: Loader) => AssetHandler {
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
  opts: { typeName?: string; typeNames?: readonly string[]; extensions?: readonly string[] },
  create: (loader: Loader) => AssetHandler<T>,
): AssetBinding {
  return { type, ...opts, create } as AssetBinding;
}

// ---------------------------------------------------------------------------
// Core asset bindings
// ---------------------------------------------------------------------------

const textureBinding = binding(
  Texture,
  { typeName: 'texture' },
  binaryFactoryHandler(() => new TextureFactory()),
);

const soundBinding = binding(
  Sound,
  { typeName: 'sound' },
  binaryFactoryHandler(() => new SoundFactory()),
);

const musicBinding = binding(
  Music,
  { typeName: 'music' },
  binaryFactoryHandler(() => new MusicFactory()),
);

const videoBinding = binding(
  Video,
  { typeName: 'video' },
  binaryFactoryHandler(() => new VideoFactory()),
);

const jsonBinding = binding(
  Json as unknown as AssetConstructor,
  { typeName: 'json' },
  () => ({
    async load({ source }: AssetLoadRequest, context: AssetLoaderContext): Promise<unknown> {
      return context.fetchJson(source);
    },
  }),
);

const textBinding = binding(
  TextAsset as unknown as AssetConstructor,
  { typeName: 'text' },
  () => ({
    async load({ source }: AssetLoadRequest, context: AssetLoaderContext): Promise<string> {
      return context.fetchText(source);
    },
  }),
);

const svgBinding = binding(
  SvgAsset as unknown as AssetConstructor,
  { typeName: 'svg' },
  textFactoryHandler(() => new SvgFactory()),
);

const subtitleBinding = binding(
  SubtitleAsset as unknown as AssetConstructor,
  { typeNames: ['vtt', 'srt'] },
  () => {
    const factory = new SubtitleFactory();
    return {
      async load({ source }: AssetLoadRequest, context: AssetLoaderContext): Promise<VTTCue[]> {
        const text = await context.fetchText(source);
        const url = source.split('?')[0].toLowerCase();
        const fmt = url.endsWith('.srt') ? 'srt' : 'vtt';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (factory as any).create({ fmt, text }) as Promise<VTTCue[]>;
      },
      destroy() {
        factory.destroy();
      },
    };
  },
);

const xmlBinding = binding(
  XmlAsset as unknown as AssetConstructor,
  { typeName: 'xml' },
  textFactoryHandler(() => new XmlFactory()),
);

const csvBinding = binding(
  CsvAsset as unknown as AssetConstructor,
  { typeName: 'csv' },
  textFactoryHandler(() => new CsvFactory()),
);

const binaryBinding = binding(
  BinaryAsset as unknown as AssetConstructor,
  { typeName: 'binary' },
  binaryFactoryHandler(() => new BinaryFactory()),
);

const bmFontBinding = binding(
  BmFont,
  { typeName: 'bmFont', extensions: ['fnt'] },
  (loader: Loader) => ({
    async load({ source }: AssetLoadRequest, context: AssetLoaderContext): Promise<BmFont> {
      const text = await context.fetchText(source);
      const fontData = parseBmFontText(text);
      const textures = await Promise.all(
        fontData.pages.map(page => loader.load(Texture, new URL(page, source).href)),
      );
      return new BmFont(fontData, textures as Texture[]);
    },
  }),
);

// Conditional bindings — only registered when the environment supports them.
const conditionalBindings: AssetBinding[] = [];

if (typeof FontFace !== 'undefined') {
  conditionalBindings.push(binding(
    FontAsset as unknown as AssetConstructor,
    { typeName: 'font', extensions: ['woff', 'woff2', 'ttf', 'otf'] },
    binaryFactoryHandler(() => new FontFactory()),
  ));
}

if (typeof HTMLImageElement !== 'undefined') {
  conditionalBindings.push(binding(
    ImageAsset as unknown as AssetConstructor,
    { typeName: 'image' },
    binaryFactoryHandler(() => new ImageFactory()),
  ));
}

if (typeof WebAssembly !== 'undefined') {
  conditionalBindings.push(binding(
    WasmAsset as unknown as AssetConstructor,
    { typeName: 'wasm' },
    binaryFactoryHandler(() => new WasmFactory()),
  ));
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
