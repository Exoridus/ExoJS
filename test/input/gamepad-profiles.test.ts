import { ArcadeStickGamepadMapping } from '#input/ArcadeStickGamepadMapping';
import { GameCubeGamepadMapping } from '#input/GameCubeGamepadMapping';
import { builtInGamepadDefinitions, parseGamepadDescriptor, resolveGamepadDefinition } from '#input/GamepadDefinitions';
import { GamepadMappingFamily } from '#input/GamepadMapping';
import { GenericDualAnalogGamepadMapping } from '#input/GenericDualAnalogGamepadMapping';
import { JoyConLeftGamepadMapping } from '#input/JoyConLeftGamepadMapping';
import { JoyConRightGamepadMapping } from '#input/JoyConRightGamepadMapping';
import { PlayStationGamepadMapping } from '#input/PlayStationGamepadMapping';
import { SteamControllerGamepadMapping } from '#input/SteamControllerGamepadMapping';
import { SwitchProGamepadMapping } from '#input/SwitchProGamepadMapping';
import { XboxGamepadMapping } from '#input/XboxGamepadMapping';

type BrowserGamepad = NonNullable<ReturnType<Navigator['getGamepads']>[number]>;

const createGamepad = (id: string): BrowserGamepad =>
  ({
    id,
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: [],
    buttons: [],
    vibrationActuator: null,
  }) as unknown as BrowserGamepad;

describe('GamepadDefinitions', () => {
  test('parses VID/PID pairs into a normalized descriptor', () => {
    const descriptor = parseGamepadDescriptor(createGamepad('Vendor: 054c Product: 0ce6'));

    expect(descriptor.vendorId).toBe('054c');
    expect(descriptor.productId).toBe('0ce6');
    expect(descriptor.productKey).toBe('054c:0ce6');
  });

  test('resolves exact device rules to stable names and mapping families', () => {
    const resolvedXbox = resolveGamepadDefinition(createGamepad('Vendor: 045e Product: 0b13'));
    const resolvedPlayStation = resolveGamepadDefinition(createGamepad('Vendor: 054c Product: 0ce6'));
    const resolvedSwitch = resolveGamepadDefinition(createGamepad('057e-2009 Nintendo Controller'));

    expect(resolvedXbox.name).toBe('Xbox Series Controller');
    expect(resolvedXbox.mapping).toBeInstanceOf(XboxGamepadMapping);
    expect(resolvedXbox.mapping.family).toBe(GamepadMappingFamily.Xbox);

    expect(resolvedPlayStation.name).toBe('DualSense Controller');
    expect(resolvedPlayStation.mapping).toBeInstanceOf(PlayStationGamepadMapping);
    expect(resolvedPlayStation.mapping.family).toBe(GamepadMappingFamily.PlayStation);

    expect(resolvedSwitch.name).toBe('Switch Pro Controller');
    expect(resolvedSwitch.mapping).toBeInstanceOf(SwitchProGamepadMapping);
    expect(resolvedSwitch.mapping.family).toBe(GamepadMappingFamily.SwitchPro);
  });

  test('uses vendor fallbacks when exact devices are unknown', () => {
    const resolved = resolveGamepadDefinition(createGamepad('Vendor: 054c Product: ffff'));

    expect(resolved.name).toBe('Sony Controller');
    expect(resolved.mapping).toBeInstanceOf(PlayStationGamepadMapping);
  });

  test('falls back to the generic dual analog mapping last', () => {
    const resolved = resolveGamepadDefinition(createGamepad('USB Generic Gamepad'));

    expect(resolved.name).toBe('Generic Gamepad');
    expect(resolved.mapping).toBeInstanceOf(GenericDualAnalogGamepadMapping);
    expect(resolved.mapping.family).toBe(GamepadMappingFamily.GenericDualAnalog);
  });

  test('lets a matching definition fall through when resolve returns null', () => {
    const gamepad = createGamepad('Vendor: 054c Product: 0ce6');
    const resolved = resolveGamepadDefinition(gamepad, [
      {
        ids: '054c:0ce6',
        resolve: () => null,
      },
      ...builtInGamepadDefinitions,
    ]);

    expect(resolved.name).toBe('DualSense Controller');
    expect(resolved.mapping).toBeInstanceOf(PlayStationGamepadMapping);
  });

  test('lets user definitions override built-in definitions by list order', () => {
    const resolved = resolveGamepadDefinition(createGamepad('Vendor: 045e Product: 0b13'), [
      {
        ids: '045e:0b13',
        name: 'Custom Xbox',
        resolve: () => ({
          name: 'Custom Xbox',
          mapping: new GenericDualAnalogGamepadMapping(),
        }),
      },
      ...builtInGamepadDefinitions,
    ]);

    expect(resolved.name).toBe('Custom Xbox');
    expect(resolved.mapping).toBeInstanceOf(GenericDualAnalogGamepadMapping);
  });

  test('resolves every exact-device product ID entry to its declared mapping family', () => {
    const cases: ReadonlyArray<[id: string, ctor: new () => unknown, family: GamepadMappingFamily]> = [
      ['Vendor: 045e Product: 028e', XboxGamepadMapping, GamepadMappingFamily.Xbox], // Xbox 360 Controller
      ['Vendor: 045e Product: 02d1', XboxGamepadMapping, GamepadMappingFamily.Xbox], // Xbox One Controller
      ['Vendor: 045e Product: 02e0', XboxGamepadMapping, GamepadMappingFamily.Xbox], // Xbox Wireless Controller
      ['Vendor: 045e Product: 02e3', XboxGamepadMapping, GamepadMappingFamily.Xbox], // Xbox One Elite Controller
      ['Vendor: 045e Product: 0b00', XboxGamepadMapping, GamepadMappingFamily.Xbox], // Xbox Elite Wireless Controller Series 2
      ['Vendor: 054c Product: 0268', PlayStationGamepadMapping, GamepadMappingFamily.PlayStation], // PlayStation 3 Controller
      ['Vendor: 054c Product: 05c4', PlayStationGamepadMapping, GamepadMappingFamily.PlayStation], // DualShock 4 Controller
      ['Vendor: 054c Product: 0df2', PlayStationGamepadMapping, GamepadMappingFamily.PlayStation], // DualSense Edge Controller
      ['Vendor: 057e Product: 0337', GameCubeGamepadMapping, GamepadMappingFamily.GameCube], // GameCube Controller Adapter
      ['Vendor: 057e Product: 2006', JoyConLeftGamepadMapping, GamepadMappingFamily.JoyConLeft], // Joy-Con (L)
      ['Vendor: 057e Product: 2007', JoyConRightGamepadMapping, GamepadMappingFamily.JoyConRight], // Joy-Con (R)
      ['Vendor: 057e Product: 200e', SwitchProGamepadMapping, GamepadMappingFamily.SwitchPro], // Joy-Con Charging Grip
      ['Vendor: 057e Product: 2066', JoyConLeftGamepadMapping, GamepadMappingFamily.JoyConLeft], // Joy-Con 2 (L)
      ['Vendor: 057e Product: 2067', JoyConRightGamepadMapping, GamepadMappingFamily.JoyConRight], // Joy-Con 2 (R)
      ['Vendor: 057e Product: 2069', SwitchProGamepadMapping, GamepadMappingFamily.SwitchPro], // Switch 2 Pro Controller
      ['Vendor: 057e Product: 2073', GameCubeGamepadMapping, GamepadMappingFamily.GameCube], // Switch 2 GameCube Controller
      ['Vendor: 28de Product: 1102', SteamControllerGamepadMapping, GamepadMappingFamily.SteamController], // Steam Controller
      ['Vendor: 046d Product: c216', GenericDualAnalogGamepadMapping, GamepadMappingFamily.GenericDualAnalog], // F310 Gamepad
      ['Vendor: 046d Product: c219', GenericDualAnalogGamepadMapping, GamepadMappingFamily.GenericDualAnalog], // F710 Gamepad
      ['Vendor: 2dc8 Product: 5107', GenericDualAnalogGamepadMapping, GamepadMappingFamily.GenericDualAnalog], // 8BitDo P30 Controller
      ['Vendor: 2dc8 Product: 3000', SwitchProGamepadMapping, GamepadMappingFamily.SwitchPro], // 8BitDo SF30 Pro Controller
      ['Vendor: 2dc8 Product: 3001', SwitchProGamepadMapping, GamepadMappingFamily.SwitchPro], // 8BitDo SN30 Controller
      ['Vendor: 2dc8 Product: ab12', GenericDualAnalogGamepadMapping, GamepadMappingFamily.GenericDualAnalog], // 8BitDo NES30 Controller
      ['Vendor: 20d6 Product: a713', SwitchProGamepadMapping, GamepadMappingFamily.SwitchPro], // PowerA Switch Controller
      ['Vendor: 20d6 Product: 4033', GenericDualAnalogGamepadMapping, GamepadMappingFamily.GenericDualAnalog], // PowerA OPS Pro Wireless Controller
      ['Vendor: 20d6 Product: 4026', GenericDualAnalogGamepadMapping, GamepadMappingFamily.GenericDualAnalog], // PowerA OPS Wireless Controller
      ['Vendor: 146b Product: 0611', PlayStationGamepadMapping, GamepadMappingFamily.PlayStation], // Nacon Revolution 3 Controller
      ['Vendor: 146b Product: 0d08', PlayStationGamepadMapping, GamepadMappingFamily.PlayStation], // Nacon Revolution Unlimited Pro Controller
      ['Vendor: 146b Product: 0d10', PlayStationGamepadMapping, GamepadMappingFamily.PlayStation], // Nacon Revolution Infinity Controller
      ['Vendor: 3285 Product: 0d17', PlayStationGamepadMapping, GamepadMappingFamily.PlayStation], // Nacon Revolution 5 Pro Controller
      ['Vendor: 1532 Product: 1000', PlayStationGamepadMapping, GamepadMappingFamily.PlayStation], // Razer Raiju Controller
      ['Vendor: 1532 Product: 0705', PlayStationGamepadMapping, GamepadMappingFamily.PlayStation], // Razer Raiju Mobile Controller
      ['Vendor: 1532 Product: 1007', PlayStationGamepadMapping, GamepadMappingFamily.PlayStation], // Razer Raiju Tournament Edition Controller
      ['Vendor: 1532 Product: 1004', PlayStationGamepadMapping, GamepadMappingFamily.PlayStation], // Razer Raiju Ultimate Controller
      ['Vendor: 1532 Product: 1100', ArcadeStickGamepadMapping, GamepadMappingFamily.ArcadeStick], // Razer Raion Controller
    ];

    for (const [id, ctor, family] of cases) {
      const resolved = resolveGamepadDefinition(createGamepad(id));

      expect(resolved.mapping).toBeInstanceOf(ctor);
      expect(resolved.mapping.family).toBe(family);
    }
  });

  test('falls back to the Microsoft vendor mapping for an unknown Xbox vendor product ID', () => {
    const resolved = resolveGamepadDefinition(createGamepad('Vendor: 045e Product: ffff'));

    expect(resolved.name).toBe('Microsoft Controller');
    expect(resolved.mapping).toBeInstanceOf(XboxGamepadMapping);
    expect(resolved.mapping.family).toBe(GamepadMappingFamily.Xbox);
  });

  test('parseName returns null when the id string contains only vendor/product tokens', () => {
    const descriptor = parseGamepadDescriptor(createGamepad('Vendor: 054c Product: 0ce6'));

    expect(descriptor.name).toBeNull();
  });

  test('parseGamepadDescriptor falls back to a synthetic label when the id string is empty', () => {
    const descriptor = parseGamepadDescriptor(createGamepad(''));

    expect(descriptor.label).toBe('Gamepad 0');
  });

  test('resolveGamepadDefinition falls back to a generic mapping using descriptor.name when no definition list entry matches', () => {
    const descriptor = parseGamepadDescriptor(createGamepad('Totally Unknown Pad'));
    const resolved = resolveGamepadDefinition(descriptor, []);

    expect(descriptor.name).toBe('Totally Unknown Pad');
    expect(resolved.name).toBe('Totally Unknown Pad');
    expect(resolved.mapping).toBeInstanceOf(GenericDualAnalogGamepadMapping);
  });

  test('resolveGamepadDefinition falls back to descriptor.label when descriptor.name is null and no definition matches', () => {
    const descriptor = parseGamepadDescriptor(createGamepad('Vendor: 054c Product: 0ce6'));
    const resolved = resolveGamepadDefinition(descriptor, []);

    expect(descriptor.name).toBeNull();
    expect(resolved.name).toBe(descriptor.label);
    expect(resolved.mapping).toBeInstanceOf(GenericDualAnalogGamepadMapping);
  });

  test('a bare-mapping resolve() result prefers the definition name, then descriptor.name, then descriptor.label', () => {
    const namedDescriptor = parseGamepadDescriptor(createGamepad('My Custom Pad'));
    const withDefinitionName = resolveGamepadDefinition(namedDescriptor, [{ name: 'Def Name', resolve: () => new GenericDualAnalogGamepadMapping() }]);
    expect(withDefinitionName.name).toBe('Def Name');

    const withDescriptorName = resolveGamepadDefinition(namedDescriptor, [{ resolve: () => new GenericDualAnalogGamepadMapping() }]);
    expect(withDescriptorName.name).toBe('My Custom Pad');

    const unnamedDescriptor = parseGamepadDescriptor(createGamepad('Vendor: 054c Product: 0ce6'));
    const withDescriptorLabel = resolveGamepadDefinition(unnamedDescriptor, [{ resolve: () => new GenericDualAnalogGamepadMapping() }]);
    expect(withDescriptorLabel.name).toBe(unnamedDescriptor.label);
  });

  test('a {mapping} resolve() result without a name prefers definition name, then descriptor.name, then descriptor.label', () => {
    const namedDescriptor = parseGamepadDescriptor(createGamepad('My Custom Pad'));
    const withDefinitionName = resolveGamepadDefinition(namedDescriptor, [
      { name: 'Def Name', resolve: () => ({ mapping: new GenericDualAnalogGamepadMapping() }) },
    ]);
    expect(withDefinitionName.name).toBe('Def Name');

    const withDescriptorName = resolveGamepadDefinition(namedDescriptor, [{ resolve: () => ({ mapping: new GenericDualAnalogGamepadMapping() }) }]);
    expect(withDescriptorName.name).toBe('My Custom Pad');

    const unnamedDescriptor = parseGamepadDescriptor(createGamepad('Vendor: 054c Product: 0ce6'));
    const withDescriptorLabel = resolveGamepadDefinition(unnamedDescriptor, [{ resolve: () => ({ mapping: new GenericDualAnalogGamepadMapping() }) }]);
    expect(withDescriptorLabel.name).toBe(unnamedDescriptor.label);
  });
});
