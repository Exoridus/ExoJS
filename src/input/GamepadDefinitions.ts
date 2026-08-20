import type { GamepadMapping } from './GamepadMapping';
import { GamepadMappingLayout } from './GamepadMapping';
import {
  createArcadeStickGamepadMapping,
  createJoyConLeftGamepadMapping,
  createJoyConRightGamepadMapping,
  createPlayStationGamepadMapping,
  createStandardGamepadMapping,
  createSteamControllerGamepadMapping,
  createSteamDeckGamepadMapping,
  createSwitchProGamepadMapping,
  createXboxGamepadMapping,
  PlayStationGeneration,
} from './gamepadMappings';

/** Convenience alias for the non-null element type returned by `navigator.getGamepads()`. */
export type BrowserGamepad = NonNullable<ReturnType<Navigator['getGamepads']>[number]>;

/**
 * Value a {@link GamepadDefinition.resolve} callback may return.
 *
 * Return a bare {@link GamepadMapping} to accept the device with the definition's
 * default name, an object with an optional `name` override, or `null`/`undefined`
 * to decline the device and let the next definition in the list try.
 */
export type GamepadDefinitionResult =
  | GamepadMapping
  | {
      name?: string;
      mapping: GamepadMapping;
    }
  | null
  | undefined;

/**
 * Parsed metadata extracted from a browser `Gamepad.id` string.
 *
 * `vendorId` and `productId` are four-hex-digit strings (e.g. `"045e"`, `"028e"`).
 * `productKey` is the colon-joined pair (`"045e:028e"`), used as a compact lookup key.
 * `name` is the human-readable portion of the id with the vendor/product tokens removed,
 * or `null` when the id contained only identifiers.
 * `mapping` is the browser's own verdict, verbatim — `"standard"` when it has
 * normalised the device into the W3C layout, `""` when it hands the raw HID
 * report through.
 */
export interface GamepadDescriptor {
  id: string;
  index: number;
  label: string;
  vendorId: string | null;
  productId: string | null;
  productKey: string | null;
  name: string | null;
  mapping: BrowserGamepad['mapping'];
}

/**
 * A rule that matches one or more physical gamepads and produces a {@link GamepadMapping}.
 *
 * `ids` is an optional allow-list of vendor IDs (`"045e"`) or `vendorId:productId`
 * pairs (`"045e:028e"`); when omitted the definition matches every device.
 * `resolve` is called with the parsed {@link GamepadDescriptor} and must return a
 * {@link GamepadDefinitionResult} — `null`/`undefined` to skip, a mapping otherwise.
 */
export interface GamepadDefinition {
  ids?: string | string[];
  name?: string;
  resolve: (descriptor: GamepadDescriptor) => GamepadDefinitionResult;
}

/**
 * The fully resolved product of running a {@link GamepadDefinition} against a
 * connected gamepad — bundles the original descriptor, the resolved display name,
 * and the chosen {@link GamepadMapping} together for use by {@link Gamepad}.
 */
export interface ResolvedGamepadDefinition {
  descriptor: GamepadDescriptor;
  name: string;
  mapping: GamepadMapping;
}

const vendorProductPattern = /vendor[:\s]*([0-9a-f]{4})\s*product[:\s]*([0-9a-f]{4})/i;
const vendorProductHexPattern = /vendor[:\s]*0x([0-9a-f]{4})\s*product[:\s]*0x([0-9a-f]{4})/i;
const vendorProductPairPattern = /\b([0-9a-f]{4})[-: ]([0-9a-f]{4})\b/i;
const vidPidPattern = /vid[_:\s]*([0-9a-f]{4}).{0,8}pid[_:\s]*([0-9a-f]{4})/i;

const createStaticGamepadDefinition = (name: string, createMapping: () => GamepadMapping, ids?: string | string[]): GamepadDefinition => ({
  ...(ids !== undefined && { ids }),
  name,
  resolve: () => ({
    name,
    mapping: createMapping(),
  }),
});

const normalizeId = (id: string): string => id.trim().toLowerCase();

const parseProductKey = (id: string): string | null => {
  const match = vendorProductHexPattern.exec(id) || vendorProductPattern.exec(id) || vidPidPattern.exec(id) || vendorProductPairPattern.exec(id);

  if (!match) {
    return null;
  }

  const [, vendor, product] = match;
  if (vendor === undefined || product === undefined) {
    return null;
  }

  return `${vendor.toLowerCase()}:${product.toLowerCase()}`;
};

const parseName = (label: string): string | null => {
  const name = label
    .replace(vendorProductHexPattern, '')
    .replace(vendorProductPattern, '')
    .replace(vidPidPattern, '')
    .replace(vendorProductPairPattern, '')
    .replaceAll(/\s+/g, ' ')
    .trim();

  return name.length > 0 ? name : null;
};

const resolveDefinitionResult = (definition: GamepadDefinition, descriptor: GamepadDescriptor): ResolvedGamepadDefinition | null => {
  const result = definition.resolve(descriptor);

  if (result == null) {
    return null;
  }

  if ('mapping' in result) {
    return {
      descriptor,
      name: result.name ?? definition.name ?? descriptor.name ?? descriptor.label,
      mapping: result.mapping,
    };
  }

  return {
    descriptor,
    name: definition.name ?? descriptor.name ?? descriptor.label,
    mapping: result,
  };
};

/**
 * Normalises an `ids` value into a trimmed, lower-case string array ready for
 * comparison against a {@link GamepadDescriptor}.
 */
const normalizeIds = (ids?: string | string[]): string[] => {
  if (!ids) {
    return [];
  }

  const values = Array.isArray(ids) ? ids : [ids];

  return values.map(normalizeId);
};

/**
 * Returns `true` when `descriptor` matches any entry in `ids`.
 *
 * A colon-containing id (e.g. `"045e:028e"`) is matched against
 * `descriptor.productKey`; a bare four-hex id is matched against
 * `descriptor.vendorId`. Passing no `ids` always returns `true`.
 */
export const matchesIds = (descriptor: GamepadDescriptor, ids?: string | string[]): boolean => {
  if (!ids) {
    return true;
  }

  for (const id of normalizeIds(ids)) {
    if (id.includes(':')) {
      if (descriptor.productKey === id) {
        return true;
      }

      continue;
    }

    if (descriptor.vendorId === id) {
      return true;
    }
  }

  return false;
};

/**
 * Parses the raw browser `Gamepad.id` string into a structured {@link GamepadDescriptor}.
 *
 * Attempts multiple vendor/product ID patterns (hex-prefixed, plain, VID/PID, bare pair)
 * in order of specificity, then strips the matched tokens to derive a clean `name`.
 */
export const parseGamepadDescriptor = (gamepad: BrowserGamepad): GamepadDescriptor => {
  const label = gamepad.id.trim() || `Gamepad ${gamepad.index}`;
  const productKey = parseProductKey(label);
  const vendorId = productKey?.slice(0, 4) ?? null;
  const productId = productKey?.slice(5) ?? null;

  return {
    id: gamepad.id,
    index: gamepad.index,
    label,
    vendorId,
    productId,
    productKey,
    name: parseName(label),
    mapping: gamepad.mapping,
  };
};

/**
 * Runs a single {@link GamepadDefinition} against a descriptor, respecting its
 * `ids` filter. Returns `null` when the definition declines the device.
 */
export const resolveDefinition = (definition: GamepadDefinition, descriptor: GamepadDescriptor): ResolvedGamepadDefinition | null => {
  if (!matchesIds(descriptor, definition.ids)) {
    return null;
  }

  return resolveDefinitionResult(definition, descriptor);
};

/**
 * Discards a {@link GamepadMappingLayout.Raw} mapping when the browser reports
 * the device as already standard-normalised.
 *
 * A raw mapping encodes one device's unnormalised HID report order, so routing
 * standard indices through it produces silently wrong channels — the Steam Deck
 * expects its face cluster at 3-6, which a standard-mapped pad puts at 0-3. The
 * resolved family and name are kept: the device is still what the definition
 * says it is, and its prompt labels are a property of the hardware, not of the
 * index space the browser chose to report it in. Prompt UIs should keep gating
 * on {@link GamepadMapping.hasChannel}, which now honestly answers `false` for
 * the paddles the generic layout has no room for.
 */
const withStandardLayoutGuard = (resolved: ResolvedGamepadDefinition, descriptor: GamepadDescriptor): ResolvedGamepadDefinition => {
  if (descriptor.mapping !== 'standard' || resolved.mapping.layout !== GamepadMappingLayout.Raw) {
    return resolved;
  }

  const { family, promptLabels } = resolved.mapping;

  return {
    ...resolved,
    mapping: createStandardGamepadMapping({ family, ...(promptLabels !== undefined && { promptLabels }) }),
  };
};

/**
 * Resolves the best-matching {@link ResolvedGamepadDefinition} for a connected gamepad.
 *
 * Iterates `definitions` in order — exact product IDs first, then vendor fallbacks,
 * then a generic catch-all — and returns the first match. Falls back to
 * {@link GenericDualAnalogGamepadMapping} when no definition matches, and
 * replaces a matched {@link GamepadMappingLayout.Raw} mapping with the generic
 * layout when the browser reports `mapping: "standard"` for the device.
 *
 * @example
 * const resolved = resolveGamepadDefinition(navigator.getGamepads()[0]!);
 * const gamepad = new Gamepad(browserGamepad, channels, resolved);
 */
export const resolveGamepadDefinition = (
  gamepadOrDescriptor: BrowserGamepad | GamepadDescriptor,
  definitions: readonly GamepadDefinition[] = builtInGamepadDefinitions,
): ResolvedGamepadDefinition => {
  const descriptor = 'connected' in gamepadOrDescriptor ? parseGamepadDescriptor(gamepadOrDescriptor) : gamepadOrDescriptor;

  for (const definition of definitions) {
    const resolvedDefinition = resolveDefinition(definition, descriptor);

    if (resolvedDefinition) {
      return withStandardLayoutGuard(resolvedDefinition, descriptor);
    }
  }

  return {
    descriptor,
    name: descriptor.name ?? descriptor.label,
    mapping: createStandardGamepadMapping(),
  };
};

const exactDeviceDefinitions: GamepadDefinition[] = [
  createStaticGamepadDefinition('Xbox 360 Controller', () => createXboxGamepadMapping(), '045e:028e'),
  createStaticGamepadDefinition('Xbox One Controller', () => createXboxGamepadMapping(), ['045e:02d1', '045e:02dd']),
  createStaticGamepadDefinition('Xbox Wireless Controller', () => createXboxGamepadMapping(), ['045e:02e0', '045e:02ea', '045e:02fd', '045e:0b20']),
  createStaticGamepadDefinition('Xbox One Elite Controller', () => createXboxGamepadMapping(), '045e:02e3'),
  createStaticGamepadDefinition('Xbox Elite Wireless Controller Series 2', () => createXboxGamepadMapping(), ['045e:0b00', '045e:0b05', '045e:0b22']),
  createStaticGamepadDefinition('Xbox Series Controller', () => createXboxGamepadMapping(), ['045e:0b12', '045e:0b13']),
  createStaticGamepadDefinition('PlayStation 3 Controller', () => createPlayStationGamepadMapping(PlayStationGeneration.PS3), '054c:0268'),
  createStaticGamepadDefinition('DualShock 4 Controller', () => createPlayStationGamepadMapping(PlayStationGeneration.PS4), [
    '054c:05c4',
    '054c:09cc',
    '054c:0ba0',
  ]),
  createStaticGamepadDefinition('DualSense Controller', () => createPlayStationGamepadMapping(PlayStationGeneration.PS5), '054c:0ce6'),
  createStaticGamepadDefinition('DualSense Edge Controller', () => createPlayStationGamepadMapping(PlayStationGeneration.PS5), '054c:0df2'),
  createStaticGamepadDefinition('Joy-Con (L)', () => createJoyConLeftGamepadMapping(), '057e:2006'),
  createStaticGamepadDefinition('Joy-Con (R)', () => createJoyConRightGamepadMapping(), '057e:2007'),
  createStaticGamepadDefinition('Joy-Con Charging Grip', () => createSwitchProGamepadMapping(), '057e:200e'),
  createStaticGamepadDefinition('Switch Pro Controller', () => createSwitchProGamepadMapping(), '057e:2009'),
  // Switch 2 product IDs: unverified against real hardware, and absent from
  // Chromium's Nintendo device tables, so the browser does not normalise them
  // to the standard layout either. The mappings below are the plausible
  // Switch 1 analogues, not confirmed layouts.
  createStaticGamepadDefinition('Joy-Con 2 (L)', () => createJoyConLeftGamepadMapping(), '057e:2066'),
  createStaticGamepadDefinition('Joy-Con 2 (R)', () => createJoyConRightGamepadMapping(), '057e:2067'),
  createStaticGamepadDefinition('Switch 2 Pro Controller', () => createSwitchProGamepadMapping(), '057e:2069'),
  createStaticGamepadDefinition('Steam Controller', () => createSteamControllerGamepadMapping(), ['28de:1102', '28de:1142']),
  createStaticGamepadDefinition('Steam Virtual Gamepad', () => createStandardGamepadMapping(), '28de:11ff'),
  createStaticGamepadDefinition('Steam Deck', () => createSteamDeckGamepadMapping(), '28de:1205'),
  createStaticGamepadDefinition('F310 Gamepad', () => createStandardGamepadMapping(), '046d:c216'),
  createStaticGamepadDefinition('F710 Gamepad', () => createStandardGamepadMapping(), ['046d:c219', '046d:c21f']),
  createStaticGamepadDefinition('8BitDo P30 Controller', () => createStandardGamepadMapping(), ['2dc8:5107', '2dc8:5108']),
  createStaticGamepadDefinition('8BitDo SF30 Pro Controller', () => createSwitchProGamepadMapping(), ['2dc8:3000', '2dc8:6100', '2dc8:6101']),
  createStaticGamepadDefinition('8BitDo SN30 Controller', () => createSwitchProGamepadMapping(), [
    '2dc8:3001',
    '2dc8:5103',
    '2dc8:9020',
    '2dc8:ab20',
    '2dc8:2840',
    '2dc8:2862',
  ]),
  createStaticGamepadDefinition('8BitDo NES30 Controller', () => createStandardGamepadMapping(), '2dc8:ab12'),
  createStaticGamepadDefinition('PowerA Switch Controller', () => createSwitchProGamepadMapping(), '20d6:a713'),
  createStaticGamepadDefinition('PowerA OPS Pro Wireless Controller', () => createStandardGamepadMapping(), '20d6:4033'),
  createStaticGamepadDefinition('PowerA OPS Wireless Controller', () => createStandardGamepadMapping(), '20d6:4026'),
  createStaticGamepadDefinition('Nacon Revolution 3 Controller', () => createPlayStationGamepadMapping(PlayStationGeneration.PS4), '146b:0611'),
  createStaticGamepadDefinition('Nacon Revolution Unlimited Pro Controller', () => createPlayStationGamepadMapping(PlayStationGeneration.PS4), '146b:0d08'),
  createStaticGamepadDefinition('Nacon Revolution Infinity Controller', () => createPlayStationGamepadMapping(PlayStationGeneration.PS4), '146b:0d10'),
  createStaticGamepadDefinition('Nacon Revolution 5 Pro Controller', () => createPlayStationGamepadMapping(PlayStationGeneration.PS5), [
    '3285:0d17',
    '3285:0d19',
  ]),
  createStaticGamepadDefinition('Razer Raiju Controller', () => createPlayStationGamepadMapping(PlayStationGeneration.PS4), '1532:1000'),
  createStaticGamepadDefinition('Razer Raiju Mobile Controller', () => createPlayStationGamepadMapping(PlayStationGeneration.PS4), ['1532:0705', '1532:0707']),
  createStaticGamepadDefinition('Razer Raiju Tournament Edition Controller', () => createPlayStationGamepadMapping(PlayStationGeneration.PS4), [
    '1532:1007',
    '1532:100a',
  ]),
  createStaticGamepadDefinition('Razer Raiju Ultimate Controller', () => createPlayStationGamepadMapping(PlayStationGeneration.PS4), [
    '1532:1004',
    '1532:1009',
  ]),
  createStaticGamepadDefinition('Razer Raion Controller', () => createArcadeStickGamepadMapping(), '1532:1100'),
];

const vendorFallbackDefinitions: GamepadDefinition[] = [
  createStaticGamepadDefinition('Microsoft Controller', () => createXboxGamepadMapping(), '045e'),
  createStaticGamepadDefinition('Sony Controller', () => createPlayStationGamepadMapping(), '054c'),
  // Deliberately generic, not the Steam Deck layout: that layout is raw HID
  // order for one specific device, and handing it to any unrecognised Valve
  // product would route every channel through the wrong index.
  createStaticGamepadDefinition('Valve Controller', () => createStandardGamepadMapping(), '28de'),
];

const genericFallbackDefinition = createStaticGamepadDefinition('Generic Gamepad', () => createStandardGamepadMapping());

/**
 * The default ordered list of {@link GamepadDefinition} entries used by
 * {@link resolveGamepadDefinition} when no custom list is supplied.
 *
 * Ordered as: exact product-ID matches → vendor-ID fallbacks → generic catch-all.
 * Register custom definitions by prepending to a copy and passing it explicitly.
 */
export const builtInGamepadDefinitions: GamepadDefinition[] = [...exactDeviceDefinitions, ...vendorFallbackDefinitions, genericFallbackDefinition];
