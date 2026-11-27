// Descriptor and catalog contracts: required options, reserved request keys,
// leaf-policy classification, leafless types, the decoded image type and
// fragment-before-query suffix inference. A descriptor is a plain object, so
// its options are checked where it is used: `identify()` stands in for every
// entry point that validates one.

import {
  type AssetDescriptorLeafPolicy,
  Assets,
  AssetType,
  type DecodedImage,
  fontType,
  imageType,
  type KindByPath,
  type Loader,
  musicType,
  Texture,
  textureType,
  videoType,
} from '@codexo/exojs';

import type { CatalogValueLeaf } from './helpers/catalog-leaf';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

declare const loader: Loader;

// --- Required options ------------------------------------------------------

loader.identify({ type: fontType, source: 'Inter.woff2', family: 'Inter' });
loader.identify({ type: 'font', source: 'Inter.woff2', family: 'Inter' });
loader.identify({ type: FontFace, source: 'Inter.woff2', family: 'Inter' });
// @ts-expect-error `family` is required on the font type
loader.identify({ type: fontType, source: 'Inter.woff2' });
// @ts-expect-error the type id carries the same requirement
loader.identify({ type: 'font', source: 'Inter.woff2' });
// @ts-expect-error and so does the class the type produces
loader.identify({ type: FontFace, source: 'Inter.woff2' });

// Types without required options stay option-free.
loader.identify({ type: 'texture', source: 'hero.png' });
loader.identify({ type: 'texture', source: 'hero.png', mimeType: 'image/png' });
loader.identify({ type: textureType, source: 'hero.png' });
loader.identify({ type: Texture, source: 'hero.png', textureOptions: {} });
// @ts-expect-error an option of another type is rejected, whichever way the type is named
loader.identify({ type: Texture, source: 'hero.png', delimiter: ',' });
// @ts-expect-error a built-in type's source is a locator
loader.identify({ type: 'texture', source: 42 });

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

loader.identify({ type: new NoOptionsType(), source: 'a.dat' });
// @ts-expect-error a type that declares no options takes none
loader.identify({ type: new NoOptionsType(), source: 'a.dat', locale: 'de' });
loader.identify({ type: new OptionalType(), source: 'a.dat' });
loader.identify({ type: new OptionalType(), source: 'a.dat', locale: 'de' });
loader.identify({ type: new RequiredType(), source: 'a.dat', locale: 'de' });
// @ts-expect-error required options cannot be omitted on a custom type either
loader.identify({ type: new RequiredType(), source: 'a.dat' });
// A union that has an all-optional member keeps the options optional.
loader.identify({ type: new UnionType(), source: 'a.dat' });
loader.identify({ type: new UnionType(), source: 'a.dat', mode: 'a' });

// --- Reserved request keys -------------------------------------------------

class SourceOptionType extends AssetType<unknown, { hp: number }, { source?: string; mode?: string }> {
  public readonly id = 'com.example.source-option';

  public createFactory() {
    return { create: async () => ({ hp: 1 }) };
  }
}

loader.identify({ type: new SourceOptionType(), source: 'a.dat', mode: 'fast' });

// --- Leaf policy -----------------------------------------------------------

class MetaType extends AssetType<unknown, { hp: number }> {
  public readonly id = 'com.example.meta';

  public createFactory() {
    return { create: async () => ({ hp: 1 }) };
  }
}

const metaCatalog = Assets.from({ metadata: { type: new MetaType(), source: 'game.meta' }, hero: { type: 'texture', source: 'hero.png' } });

type _MetaIsRef = Expect<Equal<typeof metaCatalog.metadata, CatalogValueLeaf<{ hp: number }>>>;
type _MetaValue = Expect<Equal<typeof metaCatalog.metadata.value, { hp: number }>>;
// @ts-expect-error the runtime leaf is an AssetRef, which has no `hp`
void metaCatalog.metadata.hp;

const hero: Texture = metaCatalog.hero;
void hero;

type _TexturePolicy = Expect<Equal<AssetDescriptorLeafPolicy<{ type: typeof textureType; source: string }>, 'resource'>>;
type _TextureClassPolicy = Expect<Equal<AssetDescriptorLeafPolicy<{ type: typeof Texture; source: string }>, 'resource'>>;
type _JsonPolicy = Expect<Equal<AssetDescriptorLeafPolicy<{ type: 'json'; source: string }>, 'ref'>>;
type _MetaPolicy = Expect<Equal<AssetDescriptorLeafPolicy<{ type: MetaType; source: string }>, 'ref'>>;
type _FontPolicy = Expect<Equal<AssetDescriptorLeafPolicy<{ type: typeof fontType; source: string }>, 'none'>>;
type _UnknownIdPolicy = Expect<Equal<AssetDescriptorLeafPolicy<{ type: 'com.example.unknown'; source: string }>, 'unknown'>>;

// --- Leafless types --------------------------------------------------------

void loader.load({ type: 'music', source: 'theme.ogg' });
void loader.load({ type: musicType, source: 'theme.ogg' });
void loader.load({ type: 'video', source: 'intro.mp4' });
void loader.load({ type: 'font', source: 'ui.woff2', family: 'UI' });
void loader.load({ type: 'bmFont', source: 'ui.fnt' });
void loader.load({ type: 'svg', source: 'icon.svg' });
void loader.load({ type: 'image', source: 'a.png' });

// @ts-expect-error music hands out no catalog leaf
Assets.from({ theme: { type: 'music', source: 'theme.ogg' } });
// @ts-expect-error nor does its type instance
Assets.from({ theme: { type: musicType, source: 'theme.ogg' } });
// @ts-expect-error nor does video
Assets.from({ intro: { type: videoType, source: 'intro.mp4' } });
// @ts-expect-error nor does font
Assets.from({ ui: { type: 'font', source: 'ui.woff2', family: 'UI' } });
// @ts-expect-error nor does bmFont
Assets.from({ ui: { type: 'bmFont', source: 'ui.fnt' } });
// @ts-expect-error nor does svg
Assets.from({ icon: { type: 'svg', source: 'icon.svg' } });
// @ts-expect-error nor does image
Assets.from({ raw: { type: imageType, source: 'a.png' } });
// @ts-expect-error nor does an explicit config of a leafless type
Assets.from({ theme: { type: 'music', source: 'theme.ogg' } });
// @ts-expect-error get() hands out a leaf, so it rejects a leafless descriptor
loader.get({ type: 'music', source: 'theme.ogg' });
// @ts-expect-error a catalog holds placeholders keyed by locator, so a source must be a string
Assets.from({ meta: { type: new MetaType(), source: { hp: 1 } } });
// @ts-expect-error parse is a value type's transform, not a resource type's
loader.identify({ type: 'texture', source: 'hero.png', parse: (raw: unknown) => raw });

// --- Decoded image ---------------------------------------------------------

const loadImage = () => loader.load({ type: 'image', source: 'a.png' });
const loadImageByType = () => loader.load({ type: imageType, source: 'a.png' });
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
