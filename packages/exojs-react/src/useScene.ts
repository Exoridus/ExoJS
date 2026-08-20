import { ApplicationState, type Scene, type SceneConstructor } from '@codexo/exojs';
import { type DependencyList, useEffect, useRef, useState } from 'react';

import { useExoApp } from './useExoApp';

/**
 * Activates `SceneClass` on the ExoJS {@link Application} and returns the
 * resulting instance once it is live. `SceneClass` must be registered in
 * `ApplicationOptions.scenes` (passed to {@link import('./useExoApplication').useExoApplication}
 * / {@link import('./ExoCanvas').ExoCanvas}) - unregistered targets reject in
 * development builds.
 *
 * On first call (engine not yet started) this hook calls `app.start(SceneClass)`,
 * which initializes the render backend and begins the per-frame loop. On
 * subsequent dep-change remounts it calls `app.scenes.change(SceneClass)` to
 * switch scenes without restarting the engine, constructing a fresh instance.
 *
 * Effects that run while startup is still in flight - React StrictMode
 * double-mounts every effect in development - join that `app.start()` call
 * instead of racing a second navigation against it, and only activate
 * `SceneClass` afterwards if startup did not already leave it active. A
 * StrictMode double mount therefore activates the scene exactly once.
 *
 * A failure in `app.start()`/`app.scenes.change()` (e.g. a scene's `load()`
 * rejects) is caught and routed to {@link Application.onError} rather than
 * left as an unhandled promise rejection - subscribe via
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
export function useScene<T extends Scene>(SceneClass: new () => T, deps: DependencyList = []): T | null {
  const app = useExoApp();
  const [scene, setScene] = useState<T | null>(null);
  // Bumped on every effect run so an async `apply()` can tell whether a newer
  // run has since taken over - the flag below only covers a run whose own
  // cleanup has fired.
  const generationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const generation = ++generationRef.current;
    // Only the newest, still-mounted run may touch component/app state: an
    // earlier one's activation result is no longer what the component asked
    // for, and neither is its failure.
    const isStale = (): boolean => cancelled || generationRef.current !== generation;
    // This hook's contract has always been zero-arg activation only (no data
    // parameter) - `T extends Scene` (Data defaults to void), but that generic
    // `T` can't be distributed through the navigation call's conditional types
    // (InferSceneData/ChangeSceneArgs) inside this function body, so it's pinned
    // to its concrete void-data instantiation here.
    const target = SceneClass as SceneConstructor;

    const apply = async (): Promise<void> => {
      try {
        if (app.state === ApplicationState.Stopped || app.state === ApplicationState.Loading) {
          // Stopped: first activation, which initializes the backend and starts
          // the frame loop. Loading: an earlier effect's `start()` is still in
          // flight - including its own initial scene navigation, which
          // `scenes.change()` would collide with (navigation never queues, it
          // rejects). `start()` joins that in-flight run instead, ignoring the
          // target passed here.
          await app.start(target);

          if (isStale()) {
            return;
          }

          // Startup activates its own target, which is this one whenever the
          // joined `start()` came from an effect for the same scene (the
          // StrictMode double-mount case) - activating again would needlessly
          // tear the scene down and rebuild it. A `start()` that targeted a
          // different scene, or none at all, still needs the switch.
          if (!(app.scenes.currentScene instanceof SceneClass)) {
            await app.scenes.change(target);
          }
        } else {
          // The engine is already running: a scene switch without a restart.
          await app.scenes.change(target);
        }

        if (!isStale()) {
          setScene(app.scenes.currentScene as T);
        }
      } catch (error) {
        // Route to Application.onError instead of leaving an unhandled
        // rejection - app.start()/change() reject rather than dispatching
        // onError themselves. A superseded run stays silent: its failure is no
        // longer this component's state, exactly like its success.
        if (!isStale()) {
          app.onError.dispatch(error instanceof Error ? error : new Error(String(error)));
        }
      }
    };

    void apply();

    return () => {
      cancelled = true;
      setScene(null);
      // No public API switches the director back to scene-less mid-lifetime
      // (navigation always targets a registered
      // constructor). Application.destroy() (called by ExoCanvas cleanup)
      // tears down whatever scene is still active.
    };
    // SceneClass is intentionally excluded from deps: a new class reference
    // (e.g. inline arrow class) on every render would recreate the scene
    // each frame. Pass an explicit deps array to react to changes - which is
    // also why the spread is here and why the lint rule can't verify this list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, ...deps]);

  return scene;
}
