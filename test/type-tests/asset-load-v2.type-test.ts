import { type Application, AudioStream, type LoadingQueue, Music, type Scene, Sound, Texture, Video } from '@codexo/exojs';

declare const app: Application;
declare const scene: Scene;

class Palette {
  public constructor(public readonly colors: readonly string[]) {}
}

export const single: LoadingQueue<Texture> = app.assets.load('hero.png');
export const value: LoadingQueue<unknown> = app.assets.load('level.json');
export const handle: LoadingQueue<Sound> = scene.assets.load(new Sound('click.wav'));
export const typed: LoadingQueue<Palette> = scene.assets.load({ type: Palette, source: 'sunset.palette' });
export const descriptor: LoadingQueue<{ start: string }> = scene.assets.load({
  type: 'json',
  source: 'config.json',
  parse: (raw: unknown) => raw as { start: string },
});

export const record: LoadingQueue<{
  hero: Texture;
  theme: Sound;
  config: unknown;
  intro: Video;
  music: Music;
  radio: AudioStream;
  palette: Palette;
}> = app.assets.load({
  hero: 'hero.png',
  theme: new Sound('theme.ogg'),
  config: 'config.json',
  intro: { type: Video, source: 'intro.mp4' },
  music: { type: Music, source: 'music.ogg', loadEvent: 'canplay' },
  radio: { type: AudioStream, source: 'https://radio.example/live', reconnect: false },
  palette: { type: Palette, source: 'sunset.palette' },
});

export const tuple: LoadingQueue<[Texture, Sound, unknown]> = scene.assets.load(['a.png', new Sound('b.wav'), 'c.json']);
export const scoped: LoadingQueue<Texture> = scene.assets.createScope().load(new Texture('x.png'));

// @ts-expect-error an unclaimed literal suffix names no asset type
scene.assets.load('intro.mp4');
// @ts-expect-error an unclaimed suffix inside a group is rejected as well
scene.assets.load({ intro: 'intro.mp4' });
// @ts-expect-error a number is not an asset entry
scene.assets.load([new Texture('a.png'), 42]);
// @ts-expect-error a group's resolved values are not handles
export const wrong: LoadingQueue<{ hero: Sound }> = scene.assets.load({ hero: 'hero.png' });

declare const dynamicPath: string;
export const dynamic: LoadingQueue<unknown> = scene.assets.load(dynamicPath);

scene.assets.release('hero.png');
scene.assets.release({ hero: 'hero.png', theme: new Sound('theme.ogg') });
scene.assets.release({ type: Palette, source: 'sunset.palette' });
