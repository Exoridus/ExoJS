import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';

import type { UITheme } from './theme';
import { defaultUITheme } from './theme';

/**
 * A container that carries a {@link UITheme} for the subtree below it. Widgets
 * resolve their skins from the nearest themed ancestor, which is how a theme
 * assigned on a {@link UIRoot} reaches every widget in that layer without a
 * global registry.
 */
export abstract class ThemedContainer extends Container {
  protected _theme: UITheme = defaultUITheme;

  /** The theme in effect for this node and everything below it. */
  public get theme(): UITheme {
    return this._theme;
  }

  /**
   * @internal - re-resolve this node's theme against its ancestor chain. The
   * cascade calls this on every themed node below a change; `force` re-resolves
   * even when the inherited theme is unchanged, which is what a change to the
   * node's own overrides needs.
   */
  public abstract _refreshTheme(force?: boolean): void;

  /** The nearest themed ancestor's theme, or the built-in default when this node has none. */
  protected _resolveInheritedTheme(): UITheme {
    return resolveThemeAt(this.parent);
  }

  /** Push a theme refresh into every themed descendant. */
  protected _cascadeTheme(): void {
    for (const child of this.children) {
      cascadeThemeInto(child);
    }
  }

  /** @internal - prepare this subtree's theme before any widget applies it. */
  public _prepareInheritedTheme(_inherited: UITheme, _apply: Array<() => void>): void {
    // A UIRoot owns its theme independently of its ancestors.
  }

  /** @internal */
  protected _prepareChildThemes(theme: UITheme, apply: Array<() => void>): void {
    for (const child of this.children) {
      prepareThemeInto(child, theme, apply);
    }
  }
}

const prepareThemeInto = (node: RenderNode, inherited: UITheme, apply: Array<() => void>): void => {
  if (node instanceof ThemedContainer) {
    node._prepareInheritedTheme(inherited, apply);
  } else if (node instanceof Container) {
    for (const child of node.children) {
      prepareThemeInto(child, inherited, apply);
    }
  }
};

/** Resolve the theme a child at this parent would inherit. @internal */
export const resolveThemeAt = (parent: Container | null): UITheme => {
  for (let current = parent; current !== null; current = current.parent) {
    if (current instanceof ThemedContainer) {
      return current.theme;
    }
  }

  return defaultUITheme;
};

/**
 * Push a theme refresh into `node`: directly if it is themed, or forwarded to
 * themed descendants through any plain container in between.
 *
 * @internal
 */
export const cascadeThemeInto = (node: RenderNode): void => {
  if (node instanceof ThemedContainer) {
    node._refreshTheme();

    return;
  }

  if (node instanceof Container) {
    for (const child of node.children) {
      cascadeThemeInto(child);
    }
  }
};
