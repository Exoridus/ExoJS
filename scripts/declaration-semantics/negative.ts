/**
 * Negative public type contracts.
 *
 * Each `@ts-expect-error` is an assertion: it fails the compile when the line
 * below it becomes *acceptable*, and fails the file when the line is missing.
 * A shipped declaration surface that accepts a data-less activation of a
 * data-carrying scene has lost the conditional arity the source declares.
 */
import { Application } from '@codexo/exojs';

import { DataScene } from './fixtures';

const app = new Application({ scenes: { DataScene } });

// @ts-expect-error a scene that requires data cannot be started without it
export const startWithoutData = (): Promise<unknown> => app.start(DataScene);

// @ts-expect-error nor with an options object that carries no data
export const startWithEmptyOptions = (): Promise<unknown> => app.start(DataScene, {});

// @ts-expect-error the same holds for change()
export const changeWithoutData = (): Promise<unknown> => app.scenes.change(DataScene);

// @ts-expect-error and for preload()
export const preloadWithoutData = (): Promise<unknown> => app.scenes.preload(DataScene);

// @ts-expect-error the data key is required, not optional
export const startWithWrongDataShape = (): Promise<unknown> => app.start(DataScene, { hp: 1 });
