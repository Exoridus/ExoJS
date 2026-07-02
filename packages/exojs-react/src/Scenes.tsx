import { ApplicationStatus, type Scene as ExoScene, type SceneTransition } from '@codexo/exojs';
import {
  Children,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useExoApp } from './useExoApp';

/** Carries the active {@link ExoScene} instance to descendants (HUD overlays). */
const ActiveSceneContext = createContext<ExoScene | null>(null);
ActiveSceneContext.displayName = 'ExoActiveScene';

/**
 * Returns the currently-active scene instance from the nearest {@link Scenes},
 * or `null` while none is live. Useful for HUD/overlay components that need to
 * read scene state.
 */
export function useActiveScene<T extends ExoScene = ExoScene>(): T | null {
  return useContext(ActiveSceneContext) as T | null;
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
 * Declares one scene inside a {@link Scenes} switch. Renders nothing on its own —
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
  /** Optional transition (e.g. a fade) applied when switching scenes. */
  readonly transition?: SceneTransition;
  /** {@link Scene} declarations. */
  readonly children?: ReactNode;
}

/**
 * Declarative scene switch over the one-active-scene model. Renders a set of
 * {@link Scene} declarations and activates the one whose `name` equals `active`
 * via `app.start()` (first activation) or `app.scene.setScene()` (subsequent
 * switches, with the optional `transition`). The active scene's React children
 * (HUD overlay) render alongside, and can read the instance via
 * {@link useActiveScene}.
 *
 * A failure in `app.start()`/`app.scene.setScene()` (e.g. a scene's `onLoad`
 * rejects) is caught and routed to {@link Application.onError} rather than
 * left as an unhandled promise rejection — subscribe via `app.onError.add(...)`
 * or the {@link import('./ExoCanvas').ExoCanvas} `onError` prop to observe it.
 *
 * @example
 * ```tsx
 * <ExoCanvas>
 *   <Scenes active={screen} transition={{ type: 'fade', duration: 0.3 }}>
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
    if (SceneClass === null) {
      setInstance(null);
      void app.scene.setScene(null).catch((error: unknown) => {
        app.onError.dispatch(error instanceof Error ? error : new Error(String(error)));
      });
      return;
    }

    let cancelled = false;
    const scene = new SceneClass();

    const apply = async (): Promise<void> => {
      try {
        if (app.status === ApplicationStatus.Stopped) {
          // First activation initializes the backend and starts the frame loop;
          // transitions only apply to subsequent switches.
          await app.start(scene);
        } else {
          await app.scene.setScene(scene, transition !== undefined ? { transition } : {});
        }
        if (!cancelled) {
          setInstance(scene);
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
      setInstance(null);
    };
    // Re-activate when the active name changes. SceneClass/transition derive
    // from `active`; keying on app + active avoids re-instantiating each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, active]);

  return (
    <ActiveSceneContext.Provider value={instance}>
      {instance !== null && entry?.children}
    </ActiveSceneContext.Provider>
  );
}
