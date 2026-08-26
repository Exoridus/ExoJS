import { registerSerializer, SceneNode } from '@codexo/exojs';

// #region guide:custom-node
class Marker extends SceneNode {
  public kind = 'spawn';
}

registerSerializer('Marker', Marker, {
  write: node => ({ kind: node.kind }),
  read: data => {
    const marker = new Marker();
    marker.kind = String(data.kind);
    return marker;
  },
});
// #endregion guide:custom-node

export { Marker };
