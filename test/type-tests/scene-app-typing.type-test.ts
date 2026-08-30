import type { Application } from '#core/Application';
import { Scene } from '#core/scene/Scene';

import { type app, type GameApplication } from './helpers/scene-app-anchor-app';
import { AppScene } from './helpers/scene-app-anchor-scene';

// Plain Scene (no AppLike) - this.app types as bare Application.
class PlainScene extends Scene {}
declare const plain: PlainScene;
const _plainAppCheck: Application = plain.app;

// Scene<Data, GameApplication> - direct instance-type form.
class DirectScene extends Scene<void, GameApplication> {}
declare const direct: DirectScene;
const _directAppCheck: GameApplication = direct.app;

// Scene<Data, typeof GameApplication> - constructor form.
class CtorFormScene extends Scene<void, typeof GameApplication> {}
declare const ctorForm: CtorFormScene;
const _ctorFormAppCheck: GameApplication = ctorForm.app;

// Scene<Data, typeof app> - direct typeof-instance form.
class DirectTypeofAppScene extends Scene<void, typeof app> {}
declare const directTypeofApp: DirectTypeofAppScene;
const _directTypeofAppCheck: GameApplication = directTypeofApp.app;

// The explicit-fixed-point anchor pattern, via an intermediate AppScene base
// declared in yet another module - the exact cross-file type-only cycle an
// un-anchored, fully-inferred `const app` cannot support without hitting
// TS2506/TS7022.
class TitleScene extends AppScene {}
declare const title: TitleScene;
const _titleAppCheck: GameApplication = title.app;

export {};
