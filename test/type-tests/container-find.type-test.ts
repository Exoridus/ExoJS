import { type Container, type FindNodeOptions, Sprite, type Text } from '@codexo/exojs';

declare const root: Container;

export const sprite: Sprite | null = root.find(Sprite);
export const sprites: Sprite[] = root.findAll(Sprite, { name: 'enemy', where: node => node.texture !== null });
// @ts-expect-error the predicate receives the searched type
export const wrongPredicate = root.find(Sprite, { where: (node: Text) => node.text === '' });
// @ts-expect-error name is matched exactly as a string
export const wrongName = root.find(Sprite, { name: 1 });
// @ts-expect-error only scene nodes can be searched for
export const notANode = root.find(Map);
export const options: FindNodeOptions<Sprite> = { name: 'player' };
