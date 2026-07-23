import { Scene } from '#core/Scene';

import type { app } from './scene-app-anchor-app';

// A project's own base scene, anchored to `typeof app` from a SEPARATE
// module — this is the cross-file type-only cycle the pattern relies on
// (this file needs `scene-app-anchor-app.ts`'s type; nothing there needs
// this file's).
export abstract class AppScene<Data = void> extends Scene<Data, typeof app> {}
