import { Component } from './Component';
import type { SceneNode } from './SceneNode';
import type { Synchronous } from './types';
import type { Seconds } from './units';

/**
 * A {@link Component} with per-frame behaviour of its own: override
 * {@link fixedUpdate}, {@link update}, or both.
 *
 * While the component is {@link Component.active} and its scene is not
 * paused, the scene calls the overridden hooks in the scene's frame phases:
 *
 * ```text
 * Scene.fixedUpdate -> BehaviorComponent.fixedUpdate -> scene systems' fixedUpdate   (per fixed step)
 * Scene.update      -> BehaviorComponent.update      -> scene systems' update        (once per frame)
 * ```
 *
 * Behaviours within a phase run in the order they became active. Only hooks a
 * subclass actually overrides are scheduled. Rendering never calls them, so a
 * scene that draws several views or render textures still ticks each
 * behaviour once. Pausing the scene stops the calls without disabling the
 * component; hiding its node does not stop them.
 *
 * A behaviour enabled or attached during a frame is first called on the next
 * frame. One disabled, removed or destroyed during a frame is not called again
 * in that frame. A hook that throws is reported like a throwing
 * {@link Scene.update}.
 *
 * For processing many objects together, or for ordering against other
 * systems, write a {@link System} over a {@link Scene.query} instead.
 *
 * @example
 * ```ts
 * class Spin extends BehaviorComponent<Sprite> {
 *   public speed = 90;
 *
 *   public override update(delta: Seconds): void {
 *     this.node.rotate(this.speed * delta);
 *   }
 * }
 *
 * sprite.addComponent(new Spin());
 * ```
 */
export abstract class BehaviorComponent<N extends SceneNode = SceneNode> extends Component<N> {
  /**
   * Advance by one fixed-timestep `step`, after the scene's own
   * {@link Scene.fixedUpdate} and before its systems. Must be synchronous.
   */
  public fixedUpdate(_step: Seconds): Synchronous {
    // Override in subclass.
  }

  /**
   * Advance by the variable frame `delta`, after the scene's own
   * {@link Scene.update} and before its systems. Must be synchronous.
   */
  public update(_delta: Seconds): Synchronous {
    // Override in subclass.
  }
}
