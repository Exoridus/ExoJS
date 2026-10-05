import { ApplicationState, type Scene as ExoScene, type SceneTransitionSelection } from '@codexo/exojs';
import { Children, createContext, isValidElement, type ReactElement, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useExoApp } from './useExoApp';

/** Carries the active {@link ExoScene} instance to descendants (HUD overlays). */
const ActiveSceneContext = createContext<ExoScene | null>(null);
ActiveSceneContext.displayName = 'ExoActiveScene';

/**
 * Returns the currently-active scene instance from the nearest {@link Scenes},
 * or `null` while none is live. Useful for HUD/overlay components that need to
 * read scene state.
 *
 * Pass a scene class to narrow the result: the active scene is returned only
 * when it is an instance of `SceneClass` (checked with `instanceof` at
 * runtime), and `null` otherwise.
 *
 * @example
 * ```tsx
 * function Hud() {
 *   const scene = useActiveScene(GameScene);
 *   if (scene === null) return null;
 *   return <div>Score: {scene.score}</div>;
 * }
 * ```
 */
export function useActiveScene(): ExoScene | null;
export function useActiveScene<T extends ExoScene>(SceneClass: abstract new (...args: never[]) => T): T | null;
export function useActiveScene<T extends ExoScene>(SceneClass?: abstract new (...args: never[]) => T): ExoScene | null {
  const scene = useContext(ActiveSceneContext);

  if (SceneClass === undefined) {
    return scene;
  }

  return scene instanceof SceneClass ? scene : null;
}

/** Props for a {@link Scene} declaration. */
export interface SceneProps {
  /** Unique name used to select this scene via {@link ScenesProps.active}. */
  readonly name: string;
  /** Scene class to instantiate when this scene becomes active. */
  readonly component: new () => ExoScene;
  /** React overlay (HUD) rendered only while this scene is active. */
  readonly children?: ReactNode;
}

/**
 * Declares one scene inside a {@link Scenes} switch. Renders nothing on its own -
 * {@link Scenes} reads its props and renders its {@link SceneProps.children} only
 * while the scene is active.
 */
export function Scene(_props: SceneProps): ReactElement | null {
  return null;
}

/** Props for the {@link Scenes} switch. */
export interface ScenesProps {
  /** Name of the active {@link Scene}. Changing it switches scenes. */
  readonly active: string;
  /** Optional transition (e.g. a `FadeSceneTransition`) applied when switching scenes. */
  readonly transition?: SceneTransitionSelection;
  /** {@link Scene} declarations. */
  readonly children?: ReactNode;
}

/**
 * Declarative scene switch over the one-active-scene model. Renders a set of
 * {@link Scene} declarations and activates the one whose `name` equals `active`
 * via `app.start()` (first activation) or `app.scenes.change()` (subsequent
 * switches, with the optional `transition`) - the declaration's `component`
 * constructor must be registered in `ApplicationOptions.scenes`. The active
 * scene's React children (HUD overlay) render alongside, and can read the
 * instance via {@link useActiveScene}.
 *
 * Activations that run while startup is still in flight - React StrictMode
 * double-mounts every effect in development, and `active` may change before
 * the first scene has loaded - join that `app.start()` call instead of racing
 * a second navigation against it, and only switch afterwards if startup did
 * not already leave the requested scene active. A StrictMode double mount
 * therefore activates the scene exactly once.
 *
 * A failure in `app.start()`/`app.scenes.change()` (e.g. a scene's `load()`
 * rejects) is caught and routed to {@link Application.onError} rather than
 * left as an unhandled promise rejection - subscribe via `app.onError.add(...)`
 * or the {@link import('./ExoCanvas').ExoCanvas} `onError` prop to observe it.
 *
 * @example
 * ```tsx
 * import { FadeSceneTransition } from '@codexo/exojs';
 *
 * <ExoCanvas>
 *   <Scenes active={screen} transition={new FadeSceneTransition({ duration: 300 })}>
 *     <Scene name="title" component={TitleScene} />
 *     <Scene name="game" component={GameScene}>
 *       <Hud />
 *     </Scene>
 *   </Scenes>
 * </ExoCanvas>
 * ```
 */
export function Scenes({ active, transition, children }: ScenesProps): ReactElement {
  const app = useExoApp();
  const [instance, setInstance] = useState<ExoScene | null>(null);
  // Bumped on every effect run so an async activation can tell whether a newer
  // run has taken over since it started.
  const generationRef = useRef(0);

  // Collect the <Scene> declarations from children (keyed by name).
  const registry = useMemo(() => {
    const map = new Map<string, SceneProps>();
    Children.forEach(children, child => {
      if (isValidElement(child) && child.type === Scene) {
        const props = child.props as SceneProps;
        map.set(props.name, props);
      }
    });
    return map;
  }, [children]);

  const entry = registry.get(active);
  const SceneClass = entry?.component ?? null;

  useEffect(() => {
    const generation = ++generationRef.current;

    if (SceneClass === null) {
      // No matching <Scene name={active}> declaration. No public API switches
      // the director back to scene-less mid-lifetime - the
      // last-active scene keeps running underneath; only the React-rendered
      // HUD overlay is cleared. This is a caller mismatch (an `active` name
      // with no matching <Scene>), not a supported "show nothing" path.
      console.warn(`<Scenes>: no <Scene name="${active}"> declaration found; the previously active scene (if any) keeps running.`);
      setInstance(null);
      return;
    }

    let cancelled = false;
    // Only the newest, still-mounted run may touch component or app state: an
    // older run's activation is no longer what the caller asked for, and
    // neither is its failure.
    const isStale = (): boolean => cancelled || generationRef.current !== generation;
    const changeOptions = transition !== undefined ? { transition } : {};

    const apply = async (): Promise<void> => {
      try {
        if (app.state === ApplicationState.Stopped || app.state === ApplicationState.Loading) {
          // Loading means an earlier run's start() is still in flight,
          // including its initial navigation, which scenes.change() would
          // collide with (navigation rejects instead of queueing). start()
          // joins that run and ignores the target passed here. Transitions
          // only apply to switches, never to the first activation.
          await app.start(SceneClass);

          if (isStale()) {
            return;
          }

          // Exact class comparison rather than instanceof: one declared scene
          // may subclass another, and startup must not count as having
          // activated the base when it activated the subclass.
          if (app.scenes.currentScene?.constructor !== SceneClass) {
            await app.scenes.change(SceneClass, changeOptions);
          }
        } else {
          await app.scenes.change(SceneClass, changeOptions);
        }

        if (!isStale()) {
          setInstance(app.scenes.currentScene);
        }
      } catch (error) {
        // Route to Application.onError instead of leaving an unhandled
        // rejection - app.start()/change() reject rather than dispatching
        // onError themselves.
        if (!isStale()) {
          app.onError.dispatch(error instanceof Error ? error : new Error(String(error)));
        }
      }
    };

    void apply();

    return () => {
      cancelled = true;
      setInstance(null);
    };
    // Re-activate when the active name changes. SceneClass/transition derive
    // from `active`; keying on app + active avoids re-instantiating each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, active]);

  return <ActiveSceneContext.Provider value={instance}>{instance !== null && entry?.children}</ActiveSceneContext.Provider>;
}
