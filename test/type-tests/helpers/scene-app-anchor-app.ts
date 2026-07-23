import { Application } from '#core/Application';

// The explicit-fixed-point anchor pattern from spec §6.2: a named
// `Application` subclass, constructed with an explicit type annotation,
// breaks the inference cycle a fully-inferred `const app = new
// Application(...)` cannot (confirmed: TS2506/TS7022 in an un-anchored
// version of this pattern).
export class GameApplication extends Application {}

export const app: GameApplication = new GameApplication();
