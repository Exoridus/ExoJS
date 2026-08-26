import { Rectangle, Vector } from '@codexo/exojs';

// #region guide:hitbox-tracking
const enemyHitbox: Rectangle = new Rectangle(0, 0, 100, 100);
const pointer: Vector = new Vector(0, 0);
function selectEnemy(): void {
  // ... select the enemy under the pointer
}

if (enemyHitbox.contains(pointer.x, pointer.y)) {
  selectEnemy();
}
// #endregion guide:hitbox-tracking
