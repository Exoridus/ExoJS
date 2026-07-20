import { ApplicationStatus, type Scene, type SceneConstructor } from '@codexo/exojs';
import { type DependencyList, useEffect, useState } from 'react';

import { useExoApp } from './useExoApp';

/**
 * Activates `SceneClass` on the ExoJS {@link Application} and returns the
 * resulting instance once it is live. `SceneClass` must be registered in
 * `ApplicationOptions.scenes` (passed to {@link import('./useExoApplication').useExoApplication}
 * / {@link import('./ExoCanvas').ExoCanvas}) — unregistered targets reject in
 * development builds.
 *
 * On first call (engine not yet started) this hook calls `app.start(SceneClass)`,
 * which initializes the render backend and begins the per-frame loop. On
 * subsequent dep-change remounts it calls `app.scenes.setScene(SceneClass)` to
 * switch scenes without restarting the engine. Each activation constructs a
 * fresh instance (definition §11.4) — this hook never reuses one across calls.
 *
 * A failure in `app.start()`/`app.scenes.setScene()` (e.g. a scene's `onLoad`
 * rejects) is caught and routed to {@link Application.onError} rather than
 * left as an unhandled promise rejection — subscribe via
 * `app.onError.add(...)` or the {@link import('./ExoCanvas').ExoCanvas}
 * `onError` prop to observe it.
 *
 * @param SceneClass - Constructor for the scene to activate.
 * @param deps - Extra deps that trigger scene replacement when changed, in
 *   addition to the stable `app` reference (same semantics as `useEffect`).
 * @returns The active scene instance, or `null` while it is loading.
 *
 * @example
 * ```tsx
 * function GameScreen() {
 *   const scene = useScene(MyGameScene);
 *   if (!scene) return null;
 *   return <ScoreHud scene={scene} />;
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function useScene<T extends Scene>(SceneClass: new () => T, deps: DependencyList = []): T | null {
  const app = useExoApp();
  const [scene, setScene] = useState<T | null>(null);

  useEffect(() => {
    let cancelled = false;
    // This hook's contract has always been zero-arg activation only (no data
    // parameter) — `T extends Scene` (Data defaults to void), but that generic
    // `T` can't be distributed through the navigation call's conditional types
    // (InferSceneData/SetSceneArgs) inside this function body, so it's pinned
    // to its concrete void-data instantiation here.
    const target = SceneClass as SceneConstructor;

    const apply = async (): Promise<void> => {
      try {
        if (app.status === ApplicationStatus.Stopped) {
          // First activation — initialize the backend and start the frame loop.
          await app.start(target);
        } else {
          // Engine already running — switch scenes without restarting.
          await app.scenes.setScene(target);
        }

        if (!cancelled) {
          setScene(app.scenes.currentScene as T);
        }
      } catch (error) {
        // Route to Application.onError instead of leaving an unhandled
        // rejection — app.start()/setScene() reject rather than dispatching
        // onError themselves.
        app.onError.dispatch(error instanceof Error ? error : new Error(String(error)));
      }
    };

    void apply();

    return () => {
      cancelled = true;
      setScene(null);
      // No public API switches the director back to scene-less mid-lifetime
      // (definition §10.1 — navigation always targets a registered
      // constructor). Application.destroy() (called by ExoCanvas cleanup)
      // tears down whatever scene is still active.
    };
    // SceneClass is intentionally excluded from deps: a new class reference
    // (e.g. inline arrow class) on every render would recreate the scene
    // each frame. Pass an explicit deps array to react to changes.
  }, [app, ...deps]);

  return scene;
}
