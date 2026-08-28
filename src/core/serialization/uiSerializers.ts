import type { RenderNode } from '#rendering/RenderNode';
import { Button } from '#ui/Button';
import { Label } from '#ui/Label';
import { Panel } from '#ui/Panel';
import type { ProgressBarFillMode } from '#ui/ProgressBar';
import { ProgressBar } from '#ui/ProgressBar';
import { ScrollContainer, type ScrollDirection } from '#ui/ScrollContainer';
import { Stack } from '#ui/Stack';
import type { UIFillPatch } from '#ui/theme';
import { UIRoot } from '#ui/UIRoot';

import type { NodeSerializer } from './NodeSerializer';
import { asSerializedNode } from './read';
import type { SerializationRegistry } from './SerializationRegistry';
import { arrayToColor, colorToArray, compact, deserializeStyleOptions, serializeStyleOptions } from './serializerHelpers';

const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/** The fields a widget's fill overrides contribute, omitting what it does not override. */
const serializeFill = (fill: UIFillPatch | null): Record<string, unknown> => ({
  ...(fill?.color !== undefined && { color: colorToArray(fill.color) }),
  ...(fill?.borderColor !== undefined && { borderColor: colorToArray(fill.borderColor) }),
  ...(fill?.borderWidth !== undefined && { borderWidth: fill.borderWidth }),
  ...(fill?.cornerRadius !== undefined && { cornerRadius: fill.cornerRadius }),
});

/** Just the colour of a fill override, under the key the widget's options use for it. */
const serializeFillColor = (key: string, fill: UIFillPatch | null): Record<string, unknown> =>
  fill?.color !== undefined ? { [key]: colorToArray(fill.color) } : {};

// Widget composition note: widgets own internal children (a Label's Text, a
// Panel's background Graphics, a ScrollContainer's content Container, etc.) that
// their constructors rebuild - those are never serialized. Only user-added
// children of the container widgets (Panel, ScrollContainer, Stack, UIRoot)
// round-trip; for ScrollContainer those live one level down, inside `content`.
// Anchoring (anchorIn) references a UIRoot and is not serialized; the resolved
// position still round-trips via the common fields.
//
// Style: only a widget's OWN overrides round-trip, never the values it resolved
// from a theme - otherwise loading a scene under a different theme would replay
// the theme it was saved under. Whole-background overrides (`setBackground`)
// are skipped as well: a texture reference has no serialized form here.

// ── Label ────────────────────────────────────────────────────────────────────

const labelSerializer: NodeSerializer<Label> = {
  write(node) {
    const out: Record<string, unknown> = { text: node.text };
    const style = serializeStyleOptions(node.textStyleOverrides);

    if (style !== undefined) out.style = style;
    if (!node.enabled) out.enabled = false;

    return out;
  },
  read(data) {
    const label = new Label(typeof data.text === 'string' ? data.text : '', deserializeStyleOptions(data.style));

    if (data.enabled === false) label.enabled = false;

    return label;
  },
};

// ── Panel ────────────────────────────────────────────────────────────────────

const panelSerializer: NodeSerializer<Panel> = {
  write(node, ctx) {
    const fill = node.fillOverrides;
    const out: Record<string, unknown> = {
      width: node.uiWidth,
      height: node.uiHeight,
      ...serializeFill(fill),
    };

    if (!node.enabled) out.enabled = false;

    const userChildren = node.children.filter(child => child !== node.backgroundNode);
    if (userChildren.length > 0) out.children = userChildren.map(child => ctx.writeNode(child));

    return out;
  },
  read(data, ctx) {
    const panel = new Panel(
      compact({
        width: num(data.width),
        height: num(data.height),
        color: arrayToColor(data.color),
        borderColor: arrayToColor(data.borderColor),
        borderWidth: num(data.borderWidth),
        cornerRadius: num(data.cornerRadius),
      }),
    );

    if (data.enabled === false) panel.enabled = false;

    const children = data.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        const childNode = asSerializedNode(child);
        if (childNode !== null) panel.addChild(ctx.readNode(childNode) as RenderNode);
      }
    }

    return panel;
  },
};

// ── Button ───────────────────────────────────────────────────────────────────

const buttonSerializer: NodeSerializer<Button> = {
  write(node) {
    const normal = node.fillOverridesIn('normal');
    const out: Record<string, unknown> = {
      width: node.uiWidth,
      height: node.uiHeight,
      label: node.label,
      ...serializeFill(normal),
      ...serializeFillColor('hoverColor', node.fillOverridesIn('hover')),
      ...serializeFillColor('pressedColor', node.fillOverridesIn('pressed')),
      ...serializeFillColor('disabledColor', node.fillOverridesIn('disabled')),
    };

    const style = node.textStyleOverrides;

    if (style?.fillColor !== undefined) out.textColor = colorToArray(style.fillColor);
    if (style?.fontSize !== undefined) out.fontSize = style.fontSize;

    if (!node.enabled) out.enabled = false;

    return out;
  },
  read(data) {
    const button = new Button(
      compact({
        width: num(data.width),
        height: num(data.height),
        label: typeof data.label === 'string' ? data.label : undefined,
        cornerRadius: num(data.cornerRadius),
        color: arrayToColor(data.color),
        hoverColor: arrayToColor(data.hoverColor),
        pressedColor: arrayToColor(data.pressedColor),
        disabledColor: arrayToColor(data.disabledColor),
        textColor: arrayToColor(data.textColor),
        fontSize: num(data.fontSize),
      }),
    );

    if (data.enabled === false) button.enabled = false;

    return button;
  },
};

// ── ProgressBar ──────────────────────────────────────────────────────────────

const isFillMode = (value: unknown): value is ProgressBarFillMode => value === 'scale' || value === 'clip';

const progressBarSerializer: NodeSerializer<ProgressBar> = {
  write(node) {
    const { track, bar } = node.fillOverrides;
    const out: Record<string, unknown> = {
      width: node.uiWidth,
      height: node.uiHeight,
      value: node.value,
      ...serializeFillColor('trackColor', track),
      ...serializeFillColor('fillColor', bar),
      ...(track?.cornerRadius !== undefined && { cornerRadius: track.cornerRadius }),
      ...(node.fillMode !== 'clip' && { fillMode: node.fillMode }),
    };

    if (!node.enabled) out.enabled = false;

    return out;
  },
  read(data) {
    const bar = new ProgressBar(
      compact({
        width: num(data.width),
        height: num(data.height),
        value: num(data.value),
        trackColor: arrayToColor(data.trackColor),
        fillColor: arrayToColor(data.fillColor),
        cornerRadius: num(data.cornerRadius),
        fillMode: isFillMode(data.fillMode) ? data.fillMode : undefined,
      }),
    );

    if (data.enabled === false) bar.enabled = false;

    return bar;
  },
};

// ── ScrollContainer ──────────────────────────────────────────────────────────

const isScrollDirection = (value: unknown): value is ScrollDirection => value === 'vertical' || value === 'horizontal' || value === 'both';

const scrollContainerSerializer: NodeSerializer<ScrollContainer> = {
  write(node, ctx) {
    const out: Record<string, unknown> = {
      width: node.uiWidth,
      height: node.uiHeight,
      direction: node.direction,
      scrollX: node.scrollX,
      scrollY: node.scrollY,
    };

    if (!node.enabled) out.enabled = false;

    // `content` is an internal child the constructor rebuilds; its children are
    // the user's, so they round-trip one level flatter than the live tree.
    if (node.content.children.length > 0) out.children = node.content.children.map(child => ctx.writeNode(child));

    return out;
  },
  read(data, ctx) {
    const scroll = new ScrollContainer(
      compact({
        width: num(data.width) ?? 0,
        height: num(data.height) ?? 0,
        direction: isScrollDirection(data.direction) ? data.direction : undefined,
      }),
    );

    if (data.enabled === false) scroll.enabled = false;

    const children = data.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        const childNode = asSerializedNode(child);
        if (childNode !== null) scroll.content.addChild(ctx.readNode(childNode) as RenderNode);
      }
    }

    // After the content exists, so the stored offset clamps against the real
    // content range instead of a still-empty one.
    scroll.scrollTo(num(data.scrollX) ?? 0, num(data.scrollY) ?? 0);

    return scroll;
  },
};

// ── Stack ────────────────────────────────────────────────────────────────────

const stackSerializer: NodeSerializer<Stack> = {
  write(node, ctx) {
    const out: Record<string, unknown> = {
      direction: node.direction,
      spacing: node.spacing,
      padding: node.padding,
    };

    if (!node.enabled) out.enabled = false;
    if (node.children.length > 0) out.children = node.children.map(child => ctx.writeNode(child));

    return out;
  },
  read(data, ctx) {
    const stack = new Stack(
      compact({
        direction: data.direction === 'row' || data.direction === 'column' ? data.direction : undefined,
        spacing: num(data.spacing),
        padding: num(data.padding),
      }),
    );

    if (data.enabled === false) stack.enabled = false;

    const children = data.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        const childNode = asSerializedNode(child);
        if (childNode !== null) stack.addChild(ctx.readNode(childNode) as RenderNode);
      }

      stack.layout();
    }

    return stack;
  },
};

// ── UIRoot ───────────────────────────────────────────────────────────────────

const uiRootSerializer: NodeSerializer<UIRoot> = {
  write(node, ctx) {
    return node.children.length > 0 ? { children: node.children.map(child => ctx.writeNode(child)) } : {};
  },
  read(data, ctx) {
    const root = new UIRoot();
    const children = data.children;

    if (Array.isArray(children)) {
      for (const child of children) {
        const childNode = asSerializedNode(child);
        if (childNode !== null) root.addChild(ctx.readNode(childNode) as RenderNode);
      }
    }

    return root;
  },
};

/**
 * Register the UI widget node serializers on `registry`.
 * @internal
 */
export const registerUiSerializers = (registry: SerializationRegistry): void => {
  registry.register('Label', Label, labelSerializer);
  registry.register('Panel', Panel, panelSerializer);
  registry.register('Button', Button, buttonSerializer);
  registry.register('ProgressBar', ProgressBar, progressBarSerializer);
  registry.register('ScrollContainer', ScrollContainer, scrollContainerSerializer);
  registry.register('Stack', Stack, stackSerializer);
  registry.register('UIRoot', UIRoot, uiRootSerializer);
};
