import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import { SceneDirector } from '#core/SceneDirector';

interface GameData {
  readonly level: number;
}

class VoidScene extends Scene {}
class GameScene extends Scene<GameData> {}
class NotAScene {}

declare const app: Application;

// Bare-constructor and descriptor-form registrations both type-check, alone and mixed.
new SceneDirector(app, { title: VoidScene });
new SceneDirector(app, { title: VoidScene, game: { scene: GameScene } });
new SceneDirector(app, { title: VoidScene, game: { scene: GameScene, transition: false } });

// No registry at all — Registry defaults to {}.
new SceneDirector(app);

// A plain interface (no index signature) is accepted as an explicit type argument.
interface GameScenesRegistry {
  readonly title: typeof VoidScene;
  readonly game: typeof GameScene;
}
new SceneDirector<GameScenesRegistry>(app, { title: VoidScene, game: GameScene });

// An entry that isn't a Scene subclass (bare or descriptor) is rejected at the type level.
// @ts-expect-error — NotAScene is not a Scene subclass constructor
new SceneDirector(app, { bad: NotAScene });
// @ts-expect-error — NotAScene is not a Scene subclass constructor
new SceneDirector(app, { bad: { scene: NotAScene } });

// `transition` is part of change()'s/restore()'s public options shape
// (SceneTransitionSelection) — a valid value type-checks directly, no cast
// or bridge type needed.
declare const registryDirector: SceneDirector<{ title: typeof VoidScene }>;
void registryDirector.change('title', { transition: false });
void registryDirector.restore('title', { transition: false });

// An invalid `transition` value — neither a SceneTransition/PhasedSceneTransition
// pair nor `false` — is still rejected at the type level (same empty-phases
// rejection as SceneTransitionSelection itself; see scene-transition-phases.type-test.ts).
// @ts-expect-error — {} is not a valid SceneTransitionSelection
void registryDirector.change('title', { transition: {} });
// @ts-expect-error — {} is not a valid SceneTransitionSelection
void registryDirector.restore('title', { transition: {} });

export {};
