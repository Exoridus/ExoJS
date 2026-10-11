// Descriptor and catalog contracts: required options, reserved request keys,
// leaf-policy classification, leafless types, the decoded image type and
// fragment-before-query suffix inference.

import {
  Asset,
  Assets,
  AssetType,
  type DecodedImage,
  fontType,
  imageType,
  type KindByPath,
  type LeaflessAsset,
  type Loader,
  musicType,
  type ResourceAsset,
  type Texture,
  textureType,
  type ValueAsset,
  videoType,
} from '@codexo/exojs';

import type { CatalogValueLeaf } from './helpers/catalog-leaf';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

declare const loader: Loader;

// --- Required options ------------------------------------------------------

fontType.asset('Inter.woff2', { family: 'Inter' });
Asset.type('font', 'Inter.woff2', { family: 'Inter' });
// @ts-expect-error `family` is required on the font type
fontType.asset('Inter.woff2');
// @ts-expect-error the core facade carries the same requirement
Asset.type('font', 'Inter.woff2');
// @ts-expect-error an option bag without the required field is rejected too
fontType.asset('Inter.woff2', {});

// Types without required options stay option-free.
Asset.type('texture', 'hero.png');
Asset.type('texture', 'hero.png', { mimeType: 'image/png' });
textureType.asset('hero.png');

class NoOptionsType extends AssetType<unknown, { hp: number }> {
  public readonly id = 'com.example.no-options';

  public createFactory() {
    return { create: async () => ({ hp: 1 }) };
  }
}

class OptionalType extends AssetType<unknown, { hp: number }, { locale?: string }> {
  public readonly id = 'com.example.optional';

  public createFactory() {
    return { create: async () => ({ hp: 1 }) };
  }
}

class RequiredType extends AssetType<unknown, { hp: number }, { locale: string }> {
  public readonly id = 'com.example.required';

  public createFactory() {
    return { create: async () => ({ hp: 1 }) };
  }
}

class UnionType extends AssetType<unknown, { hp: number }, { mode: 'a' } | { mode?: 'b'; extra?: number }> {
  public readonly id = 'com.example.union';

  public createFactory() {
    return { create: async () => ({ hp: 1 }) };
  }
}

new NoOptionsType().asset('a.dat');
// @ts-expect-error a type that declares no options takes none
new NoOptionsType().asset('a.dat', { locale: 'de' });
new OptionalType().asset('a.dat');
new OptionalType().asset('a.dat', { locale: 'de' });
new RequiredType().asset('a.dat', { locale: 'de' });
// @ts-expect-error required options cannot be omitted on a custom type either
new RequiredType().asset('a.dat');
// A union that has an all-optional member keeps the argument optional.
new UnionType().asset('a.dat');
new UnionType().asset('a.dat', { mode: 'a' });

// --- Reserved request keys -------------------------------------------------

class SourceOptionType extends AssetType<unknown, { hp: number }, { source?: string; mode?: string }> {
  public readonly id = 'com.example.source-option';

  public createFactory() {
    return { create: async () => ({ hp: 1 }) };
  }
}

new SourceOptionType().asset('a.dat', { mode: 'fast' });
// @ts-expect-error `source` is reserved for the request, even where a type declares it
new SourceOptionType().asset('a.dat', { source: 'b.dat' });
// @ts-expect-error `type` is reserved as well
Asset.type('texture', 'hero.png', { type: 'json' });

// --- Leaf policy -----------------------------------------------------------

class MetaType extends AssetType<unknown, { hp: number }> {
  public readonly id = 'com.example.meta';

  public createFactory() {
    return { create: async () => ({ hp: 1 }) };
  }
}

const metaCatalog = Assets.from({ metadata: new MetaType().asset('game.meta'), hero: Asset.type('texture', 'hero.png') });

type _MetaIsRef = Expect<Equal<typeof metaCatalog.metadata, CatalogValueLeaf<{ hp: number }>>>;
type _MetaValue = Expect<Equal<typeof metaCatalog.metadata.value, { hp: number }>>;
// @ts-expect-error the runtime leaf is an AssetRef, which has no `hp`
void metaCatalog.metadata.hp;

const hero: Texture = metaCatalog.hero;
void hero;

type _TextureDescriptor = Expect<Equal<ReturnType<typeof textureType.asset>, ResourceAsset<Texture>>>;
type _MetaDescriptor = Expect<Equal<ReturnType<MetaType['asset']>, ValueAsset<{ hp: number }>>>;
type _FontDescriptor = Expect<Equal<ReturnType<typeof fontType.asset>, LeaflessAsset<FontFace>>>;

// --- Leafless types --------------------------------------------------------

void loader.load(Asset.type('music', 'theme.ogg'));
void loader.load(musicType.asset('theme.ogg'));
void loader.load(Asset.type('video', 'intro.mp4'));
void loader.load(Asset.type('font', 'ui.woff2', { family: 'UI' }));
void loader.load(Asset.type('bmFont', 'ui.fnt'));
void loader.load(Asset.type('svg', 'icon.svg'));
void loader.load(Asset.type('image', 'a.png'));

// @ts-expect-error music hands out no catalog leaf
Assets.from({ theme: Asset.type('music', 'theme.ogg') });
// @ts-expect-error nor does its type instance
Assets.from({ theme: musicType.asset('theme.ogg') });
// @ts-expect-error nor does video
Assets.from({ intro: videoType.asset('intro.mp4') });
// @ts-expect-error nor does font
Assets.from({ ui: Asset.type('font', 'ui.woff2', { family: 'UI' }) });
// @ts-expect-error nor does bmFont
Assets.from({ ui: Asset.type('bmFont', 'ui.fnt') });
// @ts-expect-error nor does svg
Assets.from({ icon: Asset.type('svg', 'icon.svg') });
// @ts-expect-error nor does image
Assets.from({ raw: imageType.asset('a.png') });
// @ts-expect-error nor does an explicit config of a leafless type
Assets.from({ theme: { type: 'music', source: 'theme.ogg' } });
// @ts-expect-error get() hands out a leaf, so it rejects a leafless descriptor
loader.get(Asset.type('music', 'theme.ogg'));

// --- Decoded image ---------------------------------------------------------

const loadImage = () => loader.load(Asset.type('image', 'a.png'));
const loadImageByType = () => loader.load(imageType.asset('a.png'));
type _ImageFacade = Expect<Equal<Awaited<ReturnType<typeof loadImage>>, DecodedImage>>;
type _ImageType = Expect<Equal<Awaited<ReturnType<typeof loadImageByType>>, DecodedImage>>;

declare const decoded: DecodedImage;
// @ts-expect-error an ImageBitmap has no naturalWidth: narrow first
void decoded.naturalWidth;
void decoded.width;

if (decoded instanceof HTMLImageElement) {
  void decoded.naturalWidth;
}

// --- Fragment before query -------------------------------------------------

type _FragmentThenQuery = Expect<Equal<KindByPath<'data.json#preview.png?ignored'>, 'json'>>;
type _QueryThenFragment = Expect<Equal<KindByPath<'hero.png?v=2#frame.json'>, 'texture'>>;
type _PlainQuery = Expect<Equal<KindByPath<'level.json?v=3'>, 'json'>>;
type _PlainFragment = Expect<Equal<KindByPath<'hero.png#frame'>, 'texture'>>;
