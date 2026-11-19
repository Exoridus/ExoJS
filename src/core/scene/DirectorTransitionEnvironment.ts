import { SceneTransitionLifecycleError } from './sceneErrors';
import type { SceneLoader } from './SceneLoader';
import type { SceneTransitionContext, SceneTransitionEnvironment } from './SceneTransition';

/** @internal The Director's live state for one transition session. */
export class DirectorTransitionEnvironment implements SceneTransitionEnvironment {
  public readonly context: SceneTransitionContext;
  private _commitRequested = false;
  private _committed = false;
  private _progressLoader: SceneLoader | null = null;
  private _loadingProgress: SceneTransitionEnvironment['loadingProgress'];
  private readonly _resetProgress = (): void => {
    this._loadingProgress = undefined;
  };
  private readonly _recordProgress = (loaded: number, total: number): void => {
    this._loadingProgress = { loaded, total };
  };

  public constructor(context: SceneTransitionContext) {
    this.context = context;
  }

  public get commitRequested(): boolean {
    return this._commitRequested;
  }

  public get committed(): boolean {
    return this._committed;
  }

  public get loadingProgress(): SceneTransitionEnvironment['loadingProgress'] {
    return this._loadingProgress;
  }

  public _watchLoadingProgress(loader: SceneLoader): void {
    this._progressLoader = loader;
    loader.onLoadStart.add(this._resetProgress);
    loader.onLoadProgress.add(this._recordProgress);
  }

  public _stopWatchingLoadingProgress(): void {
    this._progressLoader?.onLoadStart.remove(this._resetProgress);
    this._progressLoader?.onLoadProgress.remove(this._recordProgress);
    this._progressLoader = null;
  }

  public commit(): void {
    if (this._commitRequested) {
      if (__DEV__) {
        throw new SceneTransitionLifecycleError('commit-reentrant');
      }

      return;
    }

    this._commitRequested = true;
  }

  /** @internal Called by the Director once the atomic commit boundary is actually crossed. */
  public _markCommitted(): void {
    this._committed = true;
  }
}
