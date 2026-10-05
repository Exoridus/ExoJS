/**
 * Positive public type contracts.
 *
 * Every call here is part of the documented public API and must compile against
 * the shipped declarations. A failure means the published type surface rejects
 * correct consumer code - the defect class that source-only type tests cannot
 * see, because the source and the emit differ.
 */
import { Application, Asset, Assets, Container, fontType, type Loader, musicType, type Scene, type SceneNode, type Sprite, type Texture } from '@codexo/exojs';

import { Armor, BareScene, DataScene, Health, LocalizedAssetType, MetaAssetType, type PlayerData, Spin } from './fixtures';

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

declare const loader: Loader;

/** A type with a required option is named with it; a type without one takes none. */
export const fontWithFamily = fontType.asset('Inter.woff2', { family: 'Inter' });
export const fontFacadeWithFamily = Asset.type('font', 'Inter.woff2', { family: 'Inter' });
export const textureWithoutOptions = Asset.type('texture', 'hero.png');
export const localized = new LocalizedAssetType().asset('a.txt', { locale: 'de' });

/** A type without a catalog leaf still loads directly. */
export const loadMusic = (): PromiseLike<unknown> => loader.load(musicType.asset('theme.ogg'));
export const loadFont = (): PromiseLike<unknown> => loader.load(Asset.type('font', 'ui.woff2', { family: 'UI' }));

/** Catalog leaves follow the leaf policy their type declares. */
const catalog = Assets.from({ hero: Asset.type('texture', 'hero.png'), meta: new MetaAssetType().asset('game.meta') });
export const heroIsTexture: Texture = catalog.hero;
export const metaValue: { readonly hp: number } | undefined = catalog.meta.value;

/** Components attach to any node their host type accepts and are found by exact class. */
const holder = new Container();
export const addedHealth: Health = holder.addComponent(new Health());
export const foundHealth: Health | null = holder.getComponent(Health);
export const removedArmor: Armor | null = holder.removeComponent(Armor);
export const hasHealth: boolean = holder.hasComponent(Health);
declare const sprite: Sprite;
export const spin: Spin = sprite.addComponent(new Spin());
export const genericOnSprite: Health = sprite.addComponent(new Health());

/** A scene query yields typed rows and typed forEach arguments. */
export const queryRows = (scene: Scene): number => {
  let total = 0;

  for (const [node, health, armor] of scene.query(Health, Armor)) {
    const owner: SceneNode = node;
    total += health.current + armor.value + owner.x;
  }

  scene.query(Armor).forEach((_node, armor) => {
    total += armor.value;
  });

  return total;
};
