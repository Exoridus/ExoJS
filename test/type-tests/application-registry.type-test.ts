import { Application } from '#core/Application';
import { Scene } from '#core/Scene';

class TitleScene extends Scene {}
interface GameData {
  readonly level: number;
}
class GameScene extends Scene<GameData> {}
class NotAScene {}

// Bare-constructor registry, inferred.
new Application({ scenes: { title: TitleScene } });

// Descriptor form, including a registered default `transition` (spec §3.10).
new Application({
  scenes: {
    title: TitleScene,
    game: { scene: GameScene, transition: false },
  },
});

// No `scenes` option at all — Registry defaults to {}.
new Application();
new Application({});

// A plain interface (no index signature) satisfies the registry constraint
// as an explicit class type argument (spec §6.1's own TypeScript-verified claim).
interface GameScenesRegistry {
  readonly title: typeof TitleScene;
  readonly game: typeof GameScene;
}
class TypedGameApplication extends Application<GameScenesRegistry> {}
declare const typedApp: TypedGameApplication;
void typedApp;

// An invalid entry (neither a Scene subclass constructor nor a valid
// descriptor) is rejected at the type level too, not just at runtime.
// @ts-expect-error — NotAScene is not a Scene subclass constructor
new Application({ scenes: { bad: NotAScene } });
// @ts-expect-error — NotAScene is not a Scene subclass constructor
new Application({ scenes: { bad: { scene: NotAScene } } });

// start() accepts a registered string key directly (no cast/bridge type).
void typedApp.start('title');
void typedApp.start('game', { data: { level: 1 } });

// start()'s constructor overload is constrained to the registry
// (NavigableSceneConstructor<Registry>) — an unregistered constructor is
// rejected at compile time, not just by the dev-only UnregisteredSceneError
// runtime check. A data-bearing registry entry is needed to observe this —
// an empty, data-less scene subclass would be structurally identical to
// TitleScene (structural typing can't tell two empty classes apart) and TS
// would accept it despite not being registered; typedApp's registered
// GameScene (with GameData) gives a genuine structural difference to check
// against instead.
class UnregisteredScene extends Scene<{ readonly totallyDifferent: string }> {}

// @ts-expect-error — UnregisteredScene is not in typedApp's registry; start() must reject it at compile time.
void typedApp.start(UnregisteredScene);

export {};
