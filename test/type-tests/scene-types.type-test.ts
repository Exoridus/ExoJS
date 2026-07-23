import { Scene } from '#core/Scene';
import type { AnySceneConstructor, ConstructorOf, InferSceneData, SceneRegistration, SceneRegistryShape, SetSceneArgs } from '#core/SceneTypes';

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

// SceneRegistration / SceneRegistryShape / ConstructorOf
class RegGameScene extends Scene<GameData> {}

const _bareRegistration: SceneRegistration<typeof VoidScene> = VoidScene;
const _descriptorRegistration: SceneRegistration<typeof RegGameScene> = { scene: RegGameScene };
const _descriptorWithTransition: SceneRegistration<typeof RegGameScene> = { scene: RegGameScene, transition: 'placeholder' };

// A plain interface (no index signature) satisfies the mapped-type constraint.
interface GameScenesRegistry {
  readonly voidScene: typeof VoidScene;
  readonly gameScene: { readonly scene: typeof RegGameScene };
}
const _acceptsInterfaceRegistry: SceneRegistryShape<GameScenesRegistry> = {
  voidScene: VoidScene,
  gameScene: { scene: RegGameScene },
};

type BareCtorOf = ConstructorOf<typeof VoidScene>; // expect: typeof VoidScene
type DescriptorCtorOf = ConstructorOf<{ scene: typeof RegGameScene }>; // expect: typeof RegGameScene
const _bareCtorCheck: BareCtorOf = VoidScene;
const _descriptorCtorCheck: DescriptorCtorOf = RegGameScene;

export {};
