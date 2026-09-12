import type { ArchetypeSpec } from './EngineAdapter';
import { isTilemap } from './tilemap';
import { usesRenderTargets } from './traits';
import { isUiLayoutScene } from './uiLayout';
import { isScrolling } from './world';

/**
 * Which archetypes each competitor arm covers.
 *
 * These predicates are consulted TWICE, from two processes: the driver builds
 * the matrix from them in Node, and the adapter reports the same answer inside
 * the harness page. Only the driver's copy decides which cells exist, so a
 * divergence does not fail - it publishes a row. An arm that was gated out in
 * its adapter alone still gets a cell, and its `buildScene` then falls through
 * to the ordinary sprite scene: a row that looks like a hit-test or a tilemap
 * comparison and is a sprite count under another name.
 *
 * That is the whole reason this module exists. One definition, imported by both.
 *
 * The general rule behind the individual clauses: an arm sits an archetype out
 * when it has no public path that answers the archetype's question. Approximating
 * one would mean writing the arm's missing feature and then publishing the
 * harness's implementation under the library's name.
 */

/**
 * Phaser 4.
 *
 * - Scrolling: the adapter builds a fixed, viewport-sized scene with a static
 *   camera, so a scrolling archetype would render fully visible.
 * - Render targets: no validated per-node equivalent for the shared filter and
 *   mask scenes, and `Filters.Blur` is an iterative step blur on a camera with
 *   no kernel to configure to the shared nine taps at sigma 2.
 * - UI layout: Phaser 4 ships no layout engine. `Actions.GridAlign` places
 *   objects once on a fixed raster and `GameObjects.Grid` draws one; neither
 *   re-solves a box when a child resizes.
 */
export const phaserCovers = (spec: ArchetypeSpec): boolean => !isScrolling(spec) && !usesRenderTargets(spec) && !isUiLayoutScene(spec);

/**
 * Excalibur 0.32.
 *
 * Scrolling and render targets for the same reasons as Phaser - its
 * `PostProcessor` chain is a full-SCREEN pass rather than a filtered subtree,
 * and it ships no mask source. Beyond those it has no equivalent for three more
 * archetypes, and the adapter implements none of them:
 *
 * - Tilemaps: its `TileMap` is a grid of `Tile`s each holding its own graphics
 *   list, drawn through the ordinary graphics path, so there is no dedicated
 *   tile submission path of the kind the other arms are compared on.
 * - Particles: no emitter whose lifecycle matches the shared one.
 * - UI layout: no layout container and no flexbox.
 */
export const excaliburCovers = (spec: ArchetypeSpec): boolean =>
  !isScrolling(spec) &&
  !usesRenderTargets(spec) &&
  !isTilemap(spec) &&
  !isUiLayoutScene(spec) &&
  spec.particles === undefined &&
  (spec.pointerQueriesPerFrame ?? 0) === 0;

/**
 * The second Pixi arm: stock Pixi plus the explicit per-frame
 * `Culler.shared.cull` a Pixi application has to write itself.
 *
 * It runs only where culling can remove something, so the difference between the
 * two Pixi arms is the measurement; on a fully visible archetype the cull call
 * could only add cost over an identical visible set. The tilemap scenes are the
 * exception among the culling-enabled ones: the tile path decides chunk
 * visibility itself and `Culler.shared.cull` acts on `.cullable` scene nodes it
 * never sees, so the variant would measure the stock arm a second time.
 */
export const pixiCulledCovers = (spec: ArchetypeSpec): boolean => spec.cullingEnabled && !isTilemap(spec);
