import {
  Asset,
  type BmFont,
  type BmFontAssetOptions,
  type BmFontDistanceField,
  bmFontType,
  type LeaflessAsset,
  type Loader,
  type LoadingQueue,
} from '@codexo/exojs';

const field: BmFontDistanceField = { fieldType: 'mtsdf', distanceRange: 8, zeroDistanceValue: 0.75 };
const options: BmFontAssetOptions = { distanceField: field };
const builtIn: LeaflessAsset<BmFont> = Asset.type('bmFont', 'ui.fnt', options);
const firstClass: LeaflessAsset<BmFont> = bmFontType.asset('ui.fnt', options);
const ordinary: LeaflessAsset<BmFont> = Asset.type('bmFont', 'color.fnt');

declare const loader: Loader;
const loading: LoadingQueue<BmFont> = loader.load(builtIn);
void [firstClass, ordinary, loading];

Asset.type('bmFont', 'unknown.fnt', {
  distanceField: { fieldType: 'msdf', distanceRange: null, zeroDistanceValue: null },
});

// @ts-expect-error Unknown zero must be explicit, not silently symmetric.
const missingZero: BmFontDistanceField = { fieldType: 'msdf', distanceRange: 4 };
// @ts-expect-error Unknown range must be explicit, not replaced by a default.
const missingRange: BmFontDistanceField = { fieldType: 'msdf', zeroDistanceValue: 0.5 };
// @ts-expect-error Unsupported field types cannot be declared as a supported distance font.
const pseudoDistance: BmFontDistanceField = { fieldType: 'psdf', distanceRange: 4, zeroDistanceValue: 0.5 };
void [missingZero, missingRange, pseudoDistance];
