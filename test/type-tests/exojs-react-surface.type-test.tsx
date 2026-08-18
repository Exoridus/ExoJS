// Type contract for `@codexo/exojs-react`'s public hook/component props: the
// canvas-ownership `Omit` on `ExoApplicationOptions`/`ExoCanvasProps`
// (`element`/`mount`/`ref`/`width`/`height` are hook-managed, not
// caller-supplied), the zero-arg `Scene`-subclass constructor
// `SceneProps.component`/`useScene` require, and the `Signal`-or-nullish
// shape `useSignal` accepts. Compiled by the dedicated
// `tsconfig.type-tests-react.json` (react/jsx-runtime resolved through the
// exojs-react package's own node_modules - the root package has no react
// dependency of its own) via `pnpm typecheck:type-tests`.

import { Scene, type Signal } from '@codexo/exojs';
import {
  type ExoApplicationOptions,
  type ExoCanvasProps,
  type SceneProps,
  type ScenesProps,
  useExoApp,
  type UseExoApplicationResult,
  useScene,
  useSignal,
} from '@codexo/exojs-react';

class GameScene extends Scene {}
class NotAScene {}
class SceneNeedingArgs extends Scene {
  public constructor(public readonly level: number) {
    super();
  }
}

// ── ExoApplicationOptions: canvas.element/mount are hook-managed, not caller-supplied ──
const validAppOptions: ExoApplicationOptions = { canvas: { width: 800, height: 600 } };
void validAppOptions;
// @ts-expect-error - `canvas.element` is bound internally by the hook's own canvasRef.
const withElement: ExoApplicationOptions = { canvas: { element: undefined as unknown as HTMLCanvasElement } };
void withElement;
// @ts-expect-error - `canvas.mount` has no meaning once the hook owns the canvas element.
const withMount: ExoApplicationOptions = { canvas: { mount: '#app' } };
void withMount;

declare const appResult: UseExoApplicationResult;
const app: UseExoApplicationResult['app'] = appResult.app;
void app;

// useExoApp() (unlike the context it wraps) never returns null - it throws
// outside an <ExoCanvas> tree instead.
const strictApp = useExoApp();
void strictApp;

// ── ExoCanvasProps: canvasProps forbids ref/width/height (engine-managed) ──
const validCanvasProps: ExoCanvasProps = { canvasProps: { className: 'game-canvas' } };
void validCanvasProps;
// @ts-expect-error - width is derived from the Application, not settable on the DOM canvas directly.
const canvasPropsWithWidth: ExoCanvasProps = { canvasProps: { width: 800 } };
void canvasPropsWithWidth;
// @ts-expect-error - ref is owned by useExoApplication's canvasRef.
const canvasPropsWithRef: ExoCanvasProps = { canvasProps: { ref: undefined as unknown as never } };
void canvasPropsWithRef;

// ── SceneProps.component / useScene: a zero-arg Scene subclass constructor ──
const sceneDeclaration: SceneProps = { name: 'game', component: GameScene };
void sceneDeclaration;
// @ts-expect-error - component must extend Scene.
const nonSceneDeclaration: SceneProps = { name: 'bad', component: NotAScene };
void nonSceneDeclaration;
// @ts-expect-error - component must be a zero-argument constructor.
const argfulSceneDeclaration: SceneProps = { name: 'bad', component: SceneNeedingArgs };
void argfulSceneDeclaration;

useScene(GameScene);
// @ts-expect-error - useScene's SceneClass must extend Scene.
useScene(NotAScene);
// @ts-expect-error - useScene's SceneClass must be zero-argument.
useScene(SceneNeedingArgs);

const scenesDeclaration: ScenesProps = { active: 'game' };
void scenesDeclaration;
// @ts-expect-error - `active` selects a scene by name and must be a string.
const badScenesDeclaration: ScenesProps = { active: 1 };
void badScenesDeclaration;

// ── useSignal: accepts a Signal, or null/undefined before one exists ──
declare const signal: Signal<[]>;
useSignal(signal, () => 1);
useSignal(null, () => 1);
useSignal(undefined, () => 1);
// @ts-expect-error - a plain object is not a Signal.
useSignal({ notASignal: true }, () => 1);

export { app };
