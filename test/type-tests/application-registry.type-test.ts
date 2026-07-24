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

export {};
