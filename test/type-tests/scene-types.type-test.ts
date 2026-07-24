import { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import type {
  AnySceneConstructor,
  ApplicationLike,
  ApplicationOf,
  ChangeSceneArgs,
  ConstructorOf,
  InferSceneData,
  SceneRegistration,
  SceneRegistryShape,
} from '#core/SceneTypes';

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

// ChangeSceneArgs — void target: the single options tuple slot is itself optional, and its `data` key is forbidden
const _voidArgsEmpty: ChangeSceneArgs<void> = [];
const _voidArgsOptions: ChangeSceneArgs<void> = [{ suspendCurrent: true }];
// @ts-expect-error — void target must not accept a data field
const _voidArgsRejectsData: ChangeSceneArgs<void> = [{ data: { level: 1 } }];

// ChangeSceneArgs — data target: the options object is required, and its `data` key is required
const _dataArgsRequired: ChangeSceneArgs<GameData> = [{ data: { level: 1 } }];
const _dataArgsWithSuspend: ChangeSceneArgs<GameData> = [{ data: { level: 1 }, suspendCurrent: true }];
// @ts-expect-error — the options tuple slot cannot be omitted when data is required
const _dataArgsRejectsEmpty: ChangeSceneArgs<GameData> = [];
// @ts-expect-error — required data cannot be omitted from the options object
const _dataArgsRejectsMissingData: ChangeSceneArgs<GameData> = [{}];
// @ts-expect-error — structurally incompatible data is rejected
const _dataArgsRejectsMismatch: ChangeSceneArgs<GameData> = [{ data: { wrongField: true } }];

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
const _descriptorWithTransition: SceneRegistration<typeof RegGameScene> = { scene: RegGameScene, transition: false };

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

// ApplicationLike / ApplicationOf, in isolation — Scene's own AppLike
// generic is exercised end-to-end in scene-app-typing.type-test.ts (Task 5).
class CustomApp extends Application {}

// ApplicationLike accepts both instances and constructors
const _appLikeInstance: ApplicationLike = new CustomApp({ scenes: {} });
const _appLikeCtor: ApplicationLike = CustomApp;
declare const baseApp: Application;
const _appLikeBase: ApplicationLike = baseApp;

type FromInstance = ApplicationOf<CustomApp>;
type FromCtor = ApplicationOf<typeof CustomApp>;
declare const customAppInstance: CustomApp;
type FromTypeofInstance = ApplicationOf<typeof customAppInstance>;
type FromBase = ApplicationOf<Application>;

const _fromInstance: FromInstance = customAppInstance;
const _fromCtor: FromCtor = customAppInstance;
const _fromTypeofInstance: FromTypeofInstance = customAppInstance;
const _fromBase: FromBase = baseApp;

// A type not resolving to any Application shape is rejected by the constraint.
class NotAnApp {}
// @ts-expect-error — NotAnApp does not extend ApplicationLike
type _rejectsNonApp = ApplicationOf<NotAnApp>;

export {};
