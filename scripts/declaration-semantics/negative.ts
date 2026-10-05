/**
 * Negative public type contracts.
 *
 * Each `@ts-expect-error` is an assertion: it fails the compile when the line
 * below it becomes *acceptable*, and fails the file when the line is missing.
 * A shipped declaration surface that accepts a data-less activation of a
 * data-carrying scene has lost the conditional arity the source declares.
 */
import { Application, Asset, Assets, Container, type DecodedImage, fontType, type Loader, musicType, type Scene } from '@codexo/exojs';

import { Armor, DataScene, Health, LocalizedAssetType, MetaAssetType, Spin } from './fixtures';

const app = new Application({ scenes: { DataScene } });

// @ts-expect-error a scene that requires data cannot be started without it
export const startWithoutData = (): Promise<unknown> => app.start(DataScene);

// @ts-expect-error nor with an options object that carries no data
export const startWithEmptyOptions = (): Promise<unknown> => app.start(DataScene, {});

// @ts-expect-error the same holds for change()
export const changeWithoutData = (): Promise<unknown> => app.scenes.change(DataScene);

// @ts-expect-error and for preload()
export const preloadWithoutData = (): Promise<unknown> => app.scenes.preload(DataScene);

// @ts-expect-error the data key is required, not optional
export const startWithWrongDataShape = (): Promise<unknown> => app.start(DataScene, { hp: 1 });

declare const loader: Loader;

// @ts-expect-error a font cannot be named without its family
export const fontWithoutFamily = fontType.asset('Inter.woff2');

// @ts-expect-error nor through the core facade
export const fontFacadeWithoutFamily = Asset.type('font', 'Inter.woff2');

// @ts-expect-error a required option bag of a custom type cannot be omitted
export const localizedWithoutOptions = new LocalizedAssetType().asset('a.txt');

// @ts-expect-error `source` is reserved for the request
export const redirected = Asset.type('texture', 'hero.png', { source: 'other.png' });

// @ts-expect-error a type without a catalog leaf cannot be held by a catalog
export const musicCatalog = Assets.from({ theme: musicType.asset('theme.ogg') });

// @ts-expect-error nor handed out by get()
export const musicLeaf = loader.get(Asset.type('music', 'theme.ogg'));

const metaCatalog = Assets.from({ meta: new MetaAssetType().asset('game.meta') });

// @ts-expect-error the catalog leaf is an AssetRef, not the payload
export const metaHp: number = metaCatalog.meta.hp;

declare const decoded: DecodedImage;

// @ts-expect-error a decoded image may be an ImageBitmap, which has no naturalWidth
export const naturalWidth: number = decoded.naturalWidth;

const holder = new Container();

// @ts-expect-error a component that requires a sprite cannot be attached to a container
export const spinOnContainer = holder.addComponent(new Spin());

// @ts-expect-error the result type comes from the class alone, never from a free generic
export const assertedLookup = holder.getComponent<Armor>(Health);

// @ts-expect-error a lookup result can be null
export const lookupNotNull: Health = holder.getComponent(Health);

declare const scene: Scene;

// @ts-expect-error a query needs at least one class
export const emptyQuery = scene.query();

// @ts-expect-error only component classes can be queried
export const nodeQuery = scene.query(Container);
