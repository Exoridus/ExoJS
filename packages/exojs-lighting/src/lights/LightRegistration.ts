import { Component } from '@codexo/exojs';

import type { Lighting } from '../Lighting';
import { sceneLighting } from '../sceneLighting';
import type { Light } from './Light';

/**
 * The component every {@link Light} carries: while it is active, an
 * unregistered light joins its scene's lighting system (see
 * {@link Lighting.add}), and leaves it again when it stops being active.
 * @internal
 */
export class LightRegistration extends Component<Light> {
  /**
   * Join the lighting system scene membership selects now, leaving the one it
   * selected before; an explicit registration is never touched. `excluded`
   * does not count as a candidate. @internal
   */
  public _reconcile(excluded: Lighting | null): void {
    const light = this.node;

    if (light._lighting !== null && !light._autoRegistered) {
      return;
    }

    const target = sceneLighting(this, excluded);

    if (light._lighting === target) {
      return;
    }

    light._lighting?.remove(light);
    target?._adoptLight(light);
  }

  protected override onEnable(): void {
    this._reconcile(null);
  }

  protected override onDisable(): void {
    const light = this.node;

    if (light._autoRegistered) {
      light._lighting?.remove(light);
    }
  }
}
