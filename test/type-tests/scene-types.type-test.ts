import { Scene } from '#core/Scene';
import type { AnySceneConstructor, InferSceneData, SetSceneArgs } from '#core/SceneTypes';

interface GameData {
  readonly level: number;
}

class VoidScene extends Scene {}
class DataScene extends Scene<GameData> {}

// InferSceneData
type VoidInferred = InferSceneData<typeof VoidScene>; // expect: void
type DataInferred = InferSceneData<typeof DataScene>; // expect: GameData
const _voidCheck: VoidInferred = undefined as void;
const _dataCheck: DataInferred = { level: 1 };

// SetSceneArgs — void target: options-only tuple, data forbidden
const _voidArgsEmpty: SetSceneArgs<void> = [];
const _voidArgsOptions: SetSceneArgs<void> = [{ transition: { type: 'fade' } }];
// @ts-expect-error — void target must not accept a data argument
const _voidArgsRejectsData: SetSceneArgs<void> = [{ level: 1 }];

// SetSceneArgs — data target: data required, options optional
const _dataArgsRequired: SetSceneArgs<GameData> = [{ level: 1 }];
const _dataArgsWithOptions: SetSceneArgs<GameData> = [{ level: 1 }, { transition: { type: 'fade' } }];
// @ts-expect-error — required data cannot be omitted
const _dataArgsRejectsEmpty: SetSceneArgs<GameData> = [];
// @ts-expect-error — structurally incompatible data is rejected
const _dataArgsRejectsMismatch: SetSceneArgs<GameData> = [{ wrongField: true }];

// AnySceneConstructor accepts a heterogeneous constructor map
const _registry: Record<string, AnySceneConstructor> = { voidScene: VoidScene, dataScene: DataScene };

// AnySceneConstructor rejects a non-Scene constructor
class NotAScene {}
// @ts-expect-error — must be a Scene subclass constructor
const _rejectsNonScene: AnySceneConstructor = NotAScene;

export {};
