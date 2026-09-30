/**
 * Direct `InferSceneData` contracts.
 *
 * These localise a regression on its own: a failure here means the type itself
 * no longer recovers a scene's activation data, as opposed to an overload
 * integration problem further out in `Application` or `SceneDirector`.
 */
import type { InferSceneData, SceneConstructor } from '@codexo/exojs';

import { BareScene, DataScene, type PlayerData } from './fixtures';

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
