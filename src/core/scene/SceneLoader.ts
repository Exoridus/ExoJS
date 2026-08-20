import { LoaderScope } from '#assets/LoaderScope';
import type { Application } from '#core/Application';

/**
 * A scene's own asset claim scope.
 *
 * Assets acquired through `scene.loader.get/load(…)` are owned by this scene and
 * released when it ends permanently, so scene-private assets need no manual
 * bookkeeping. An asset another owner also holds - a second scene, the
 * application, a streaming scope - stays resident regardless.
 *
 * Assets that must outlive every scene are acquired on `app.loader` instead,
 * which holds them for the application's lifetime. Access via {@link Scene.loader}.
 */
export class SceneLoader extends LoaderScope {
  public constructor(app: Application) {
    super(app.loader, 'scene');
  }
}
