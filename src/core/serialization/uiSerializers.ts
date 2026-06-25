import type { RenderNode } from '#rendering/RenderNode';
import { Button } from '#ui/Button';
import { Label } from '#ui/Label';
import { Panel } from '#ui/Panel';
import { ProgressBar } from '#ui/ProgressBar';
import { Stack } from '#ui/Stack';
import { UIRoot } from '#ui/UIRoot';

import type { NodeSerializer } from './NodeSerializer';
import { asSerializedNode } from './read';
import type { SerializationRegistry } from './SerializationRegistry';
import { arrayToColor, colorToArray, compact, deserializeStyleOptions, serializeStyle } from './serializerHelpers';

const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

// Widget composition note: widgets own internal children (a Label's Text, a
// Panel's background Graphics, etc.) that their constructors rebuild — those are
// never serialized. Only user-added children of the container widgets (Panel,
// Stack, UIRoot) round-trip. Anchoring (anchorIn) references a UIRoot and is not
// serialized; the resolved position still round-trips via the common fields.

// ── Label ────────────────────────────────────────────────────────────────────

const labelSerializer: NodeSerializer<Label> = {
  write(node) {
    const out: Record<string, unknown> = { text: node.text };
    const style = serializeStyle(node.textNode.style);

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
    const out: Record<string, unknown> = {
      width: node.uiWidth,
      height: node.uiHeight,
      color: colorToArray(node.color),
      borderColor: colorToArray(node.borderColor),
      borderWidth: node.borderWidth,
      cornerRadius: node.cornerRadius,
    };

    if (!node.enabled) out.enabled = false;

    const userChildren = node.children.filter(child => child !== node.background);
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
    const out: Record<string, unknown> = {
      width: node.uiWidth,
      height: node.uiHeight,
      label: node.label,
      cornerRadius: node.cornerRadius,
      color: colorToArray(node.colors.normal),
      hoverColor: colorToArray(node.colors.hover),
      pressedColor: colorToArray(node.colors.pressed),
      disabledColor: colorToArray(node.colors.disabled),
      textColor: colorToArray(node.textColor),
      fontSize: node.fontSize,
    };

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

const progressBarSerializer: NodeSerializer<ProgressBar> = {
  write(node) {
    const out: Record<string, unknown> = {
      width: node.uiWidth,
      height: node.uiHeight,
      value: node.value,
      trackColor: colorToArray(node.trackColor),
      fillColor: colorToArray(node.fillColor),
      cornerRadius: node.cornerRadius,
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
      }),
    );

    if (data.enabled === false) bar.enabled = false;

    return bar;
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
export function registerUiSerializers(registry: SerializationRegistry): void {
  registry.register('Label', Label, labelSerializer);
  registry.register('Panel', Panel, panelSerializer);
  registry.register('Button', Button, buttonSerializer);
  registry.register('ProgressBar', ProgressBar, progressBarSerializer);
  registry.register('Stack', Stack, stackSerializer);
  registry.register('UIRoot', UIRoot, uiRootSerializer);
}
