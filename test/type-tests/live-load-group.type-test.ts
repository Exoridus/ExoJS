import { type Application, type LoadingQueue, type Scene, Sound, type Texture } from '../../src/index';

declare const app: Application;
declare const scene: Scene;
declare const texture: Texture;
const sound = new Sound('theme.ogg');

export const single: LoadingQueue<Sound> = app.load(sound);
export const rest: LoadingQueue<readonly [Texture, Sound]> = app.load(texture, sound);
export const tuple: LoadingQueue<readonly [Texture, Sound]> = app.load([texture, sound]);
export const record: LoadingQueue<{ readonly texture: Texture; readonly sound: Sound }> = app.load({ texture, sound });
export const sceneGroup: LoadingQueue<readonly [Texture, Sound]> = scene.assets.load([texture, sound]);

// @ts-expect-error - every item must be an asset.
app.load([texture, 42]);
