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
new SceneDirector(app, { title: VoidScene, game: { scene: GameScene, transition: 'placeholder' } });

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

// `transition` is deliberately not part of change()'s/restore()'s public options
// shape yet (routed through an @internal, non-re-exported bridge type until the
// real transition runtime lands in Slice 5) — both must reject it at the type level.
declare const registryDirector: SceneDirector<{ title: typeof VoidScene }>;
// @ts-expect-error — transition is not public until Slice 5
void registryDirector.change('title', { transition: { type: 'fade' } });
// @ts-expect-error — transition is not public until Slice 5
void registryDirector.restore('title', { transition: { type: 'fade' } });

export {};
