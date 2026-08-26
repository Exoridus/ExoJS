import type { Container } from '@codexo/exojs';
import type { MapSpawnSession } from '@codexo/exojs-tilemap';

// #region guide:spawn-session
export function restore(session: MapSpawnSession<Container>, saved: Map<string, boolean>): void {
  for (const [id, visible] of saved) {
    const object = session.get(id);
    if (object !== undefined) object.visible = visible;
  }
}
// #endregion guide:spawn-session
