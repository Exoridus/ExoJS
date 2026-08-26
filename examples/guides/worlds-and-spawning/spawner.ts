import { Container } from '@codexo/exojs';
import { MapObjectSpawner } from '@codexo/exojs-tilemap';

// #region guide:object-spawner
class Enemy extends Container {}
class Chest extends Container {}

interface GameContext {
  difficulty: number;
  save: Map<string, unknown>;
}

export const spawner = new MapObjectSpawner<GameContext, Enemy | Chest>({
  Enemy: (object, context) => {
    const enemy = new Enemy();
    enemy.position.set(object.x, object.y);
    enemy.scale.set(context.difficulty);
    return enemy;
  },
  Chest: (object, context) => {
    const chest = new Chest();
    chest.name = object.id;
    chest.visible = !context.save.has(object.id);
    return chest;
  },
});
// #endregion guide:object-spawner

export { Chest, Enemy };
