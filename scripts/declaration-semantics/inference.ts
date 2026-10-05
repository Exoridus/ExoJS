/**
 * Direct `InferSceneData` contracts.
 *
 * These localise a regression on its own: a failure here means the type itself
 * no longer recovers a scene's activation data, as opposed to an overload
 * integration problem further out in `Application` or `SceneDirector`.
 */
import {
  Asset,
  type ComponentQueryRow,
  type DecodedImage,
  type InferSceneData,
  type KindByPath,
  type Loader,
  type Scene,
  type SceneConstructor,
  type SceneNode,
} from '@codexo/exojs';

import { Armor, BareScene, DataScene, Health, type PlayerData } from './fixtures';

/** Mutual-assignability check; deliberately not an assignability check. */
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type BareData = InferSceneData<typeof BareScene>;
type DataFromScene = InferSceneData<typeof DataScene>;

type _bareIsVoid = Expect<Exact<BareData, void>>;
type _dataIsPlayerData = Expect<Exact<DataFromScene, PlayerData>>;

type _bareIsConstructor = Expect<typeof BareScene extends SceneConstructor<void> ? true : false>;
type _dataIsConstructor = Expect<typeof DataScene extends SceneConstructor<PlayerData> ? true : false>;

// The constructor relation has to hold in the direction the conditional type
// uses, not as mutual identity: `SceneConstructor` is a structural type, so a
// class carrying additional members is a valid `SceneConstructor<void>` without
// being identical to one. Asserting identity here would be a stricter promise
// than the API makes, and would fail for correct declarations.
type _bareCtorIsSubtype = Expect<SceneConstructor<void> extends typeof BareScene ? true : false>;

// The inference has to work through a registry entry too, since that is the
// shape `Application` navigates by.
const scenes = { BareScene, DataScene };
type FromRegistryBare = InferSceneData<(typeof scenes)['BareScene']>;
type FromRegistryData = InferSceneData<(typeof scenes)['DataScene']>;
type _registryBareIsVoid = Expect<Exact<FromRegistryBare, void>>;
type _registryDataIsPlayerData = Expect<Exact<FromRegistryData, PlayerData>>;

// Suffix inference cuts the fragment before the query, as the runtime does.
type _fragmentBeforeQuery = Expect<Exact<KindByPath<'data.json#preview.png?ignored'>, 'json'>>;

// The image type resolves to what its factory produces.
declare const loader: Loader;
const loadImage = () => loader.load(Asset.type('image', 'a.png'));
type _imageIsDecoded = Expect<Exact<Awaited<ReturnType<typeof loadImage>>, DecodedImage>>;

// Component lookup and query rows keep their exact types through the emit.
declare const node: SceneNode;
declare const scene: Scene;
const lookup = node.getComponent(Health);
type _lookupIsExact = Expect<Exact<typeof lookup, Health | null>>;
const query = scene.query(Health, Armor);
type QueryRow = typeof query extends Iterable<infer Row> ? Row : never;
type _rowIsExact = Expect<Exact<QueryRow, ComponentQueryRow<[typeof Health, typeof Armor]>>>;
type _rowElements = Expect<Exact<[QueryRow[0], QueryRow[1], QueryRow[2]], [SceneNode, Health, Armor]>>;
