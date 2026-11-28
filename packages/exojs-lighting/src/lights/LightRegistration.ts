import { Component } from '@codexo/exojs';

import { sceneLighting } from '../sceneLighting';
import type { Light } from './Light';

/**
 * The component every {@link Light} carries: while it is active, an
 * unregistered light joins its scene's lighting system (see
 * {@link Lighting.add}), and leaves it again when it stops being active.
 * @internal
 */
export class LightRegistration extends Component<Light> {
  protected override onEnable(): void {
    sceneLighting(this)?._adoptLight(this.node);
  }

  protected override onDisable(): void {
    const light = this.node;

    if (light._autoRegistered) {
      light._lighting?.remove(light);
    }
  }
}
