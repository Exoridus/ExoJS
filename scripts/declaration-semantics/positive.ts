/**
 * Positive public type contracts.
 *
 * Every call here is part of the documented public API and must compile against
 * the shipped declarations. A failure means the published type surface rejects
 * correct consumer code - the defect class that source-only type tests cannot
 * see, because the source and the emit differ.
 */
import { Application, type Scene } from '@codexo/exojs';

import { BareScene, DataScene, type PlayerData } from './fixtures';

const app = new Application({ scenes: { BareScene, DataScene } });

const data: PlayerData = { hp: 100, name: 'probe' };

/** `Application.start` accepts a data-less scene with and without options. */
export const startBare = (): Promise<unknown> => app.start(BareScene);
export const startBareWithOptions = (): Promise<unknown> => app.start(BareScene, {});

/** A scene that requires data must be given it, under the `data` key. */
export const startData = (): Promise<unknown> => app.start(DataScene, { data });
export const startDataInline = (): Promise<unknown> => app.start(DataScene, { data: { hp: 1, name: 'x' } });

/** `SceneDirector.change` carries the same conditional-arity contract. */
export const changeBare = (): Promise<unknown> => app.scenes.change(BareScene);
export const changeBareWithOptions = (): Promise<unknown> => app.scenes.change(BareScene, {});
export const changeData = (): Promise<unknown> => app.scenes.change(DataScene, { data });
export const changeDataInline = (): Promise<unknown> => app.scenes.change(DataScene, { data: { hp: 1, name: 'x' } });

/** And so does `SceneDirector.preload`. */
export const preloadBare = (): Promise<unknown> => app.scenes.preload(BareScene);
export const preloadBareWithOptions = (): Promise<unknown> => app.scenes.preload(BareScene, {});
export const preloadData = (): Promise<unknown> => app.scenes.preload(DataScene, { data });
export const preloadDataInline = (): Promise<unknown> => app.scenes.preload(DataScene, { data: { hp: 1, name: 'x' } });

/** A subclass stays assignable to its base, with and without an explicit argument. */
export const assignable: Scene = new BareScene();
export const assignableExplicit: Scene<void> = new BareScene();
export const assignableData: Scene<PlayerData> = new DataScene();
