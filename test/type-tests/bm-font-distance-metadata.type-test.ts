import {
  type AssetDescriptorResource,
  type BmFont,
  type BmFontAssetOptions,
  type BmFontDistanceField,
  bmFontType,
  type Loader,
  type LoadingQueue,
} from '@codexo/exojs';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const field: BmFontDistanceField = { fieldType: 'mtsdf', distanceRange: 8, zeroDistanceValue: 0.75 };
const options: BmFontAssetOptions = { distanceField: field };
const builtIn = { type: 'bmFont', source: 'ui.fnt', ...options } as const;
const firstClass = { type: bmFontType, source: 'ui.fnt', ...options };
const ordinary = { type: 'bmFont', source: 'color.fnt' } as const;
type _BuiltInIsBmFont = Expect<Equal<AssetDescriptorResource<typeof builtIn>, BmFont>>;
type _FirstClassIsBmFont = Expect<Equal<AssetDescriptorResource<typeof firstClass>, BmFont>>;
type _OrdinaryIsBmFont = Expect<Equal<AssetDescriptorResource<typeof ordinary>, BmFont>>;

declare const loader: Loader;
const loading: LoadingQueue<BmFont> = loader.load(builtIn);
void [firstClass, ordinary, loading];

loader.identify({
  type: 'bmFont',
  source: 'unknown.fnt',
  distanceField: { fieldType: 'msdf', distanceRange: null, zeroDistanceValue: null },
});

// @ts-expect-error Unknown zero must be explicit, not silently symmetric.
const missingZero: BmFontDistanceField = { fieldType: 'msdf', distanceRange: 4 };
// @ts-expect-error Unknown range must be explicit, not replaced by a default.
const missingRange: BmFontDistanceField = { fieldType: 'msdf', zeroDistanceValue: 0.5 };
// @ts-expect-error Unsupported field types cannot be declared as a supported distance font.
const pseudoDistance: BmFontDistanceField = { fieldType: 'psdf', distanceRange: 4, zeroDistanceValue: 0.5 };
void [missingZero, missingRange, pseudoDistance];
