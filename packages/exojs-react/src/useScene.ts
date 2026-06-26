import { type DependencyList, useEffect, useState } from 'react';

import { ApplicationStatus, type Scene } from '@codexo/exojs';

import { useExoApp } from './useExoApp';

/**
 * Creates an instance of `SceneClass`, activates it on the ExoJS
 * {@link Application}, and returns it once the scene is live.
 *
 * On first call (engine not yet started) this hook calls `app.start(scene)`,
 * which initializes the render backend and begins the per-frame loop. On
 * subsequent dep-change remounts it calls `app.scene.setScene(scene)` to
 * switch scenes without restarting the engine.
 *
 * The scene is cleared (`setScene(null)`) when the component unmounts or
 * when `deps` change — mirroring `useEffect` semantics.
 *
 * @param SceneClass - Constructor for the scene to instantiate.
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
export function useScene<T extends Scene>(SceneClass: new () => T, deps: DependencyList = []): T | null {
  const app = useExoApp();
  const [scene, setScene] = useState<T | null>(null);

  useEffect(() => {
    let cancelled = false;
    const s = new SceneClass();

    const apply = async (): Promise<void> => {
      if (app.status === ApplicationStatus.Stopped) {
        // First activation — initialize the backend and start the frame loop.
        await app.start(s);
      } else {
        // Engine already running — switch scenes without restarting.
        await app.scene.setScene(s);
      }

      if (!cancelled) {
        setScene(s);
      }
    };

    void apply();

    return () => {
      cancelled = true;
      setScene(null);
      // Best-effort scene clear; the Application.destroy() called by
      // ExoCanvas cleanup will also handle any remaining active scene.
      void app.scene.setScene(null);
    };
    // SceneClass is intentionally excluded from deps: a new class reference
    // (e.g. inline arrow class) on every render would recreate the scene
    // each frame. Pass an explicit deps array to react to changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, ...deps]);

  return scene;
}
