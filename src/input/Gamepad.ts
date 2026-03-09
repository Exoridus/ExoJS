import { GamepadProfiles } from './GamepadProfiles';
import { GamepadChannels } from './GamepadChannels';
import type { BrowserGamepad, GamepadMapping, GamepadMappingResolver } from './GamepadMapping';
import { Signal } from 'core/Signal';
import { ChannelOffset, ChannelSize } from 'types/input';
import type { GamepadProfile, IGamepadInfo } from './GamepadProfiles';

export class Gamepad {

    public readonly onConnect = new Signal();
    public readonly onDisconnect = new Signal();
    public readonly onUpdate = new Signal();

    private readonly _index: number;
    private readonly _channels: Float32Array;
    private readonly _channelOffset: number;
    private _mapping: GamepadMapping;
    private _gamepad: BrowserGamepad | null = null;
    private _profile = 'generic' as GamepadProfile;
    private _label = 'Generic Gamepad';
    private _vendorId: string | null = null;
    private _productId: string | null = null;

    public constructor(index: number, channels: Float32Array, mapping: GamepadMapping);
    public constructor(gamepad: BrowserGamepad, channels: Float32Array, mappingResolver?: GamepadMappingResolver);
    public constructor(indexOrGamepad: number | BrowserGamepad, channels: Float32Array, mappingOrResolver?: GamepadMapping | GamepadMappingResolver) {
        const isRawGamepad = typeof indexOrGamepad !== 'number';
        const rawGamepad = isRawGamepad ? indexOrGamepad as BrowserGamepad : null;
        const index = rawGamepad ? rawGamepad.index : indexOrGamepad as number;

        this._index = index;
        this._channelOffset = Gamepad.resolveChannelOffset(index, ChannelOffset.gamepads);
        this._channels = channels;
        this._mapping = rawGamepad
            ? Gamepad._resolveMapping(rawGamepad, mappingOrResolver as GamepadMappingResolver | undefined)
            : mappingOrResolver as GamepadMapping;

        if (rawGamepad) {
            this.setInfo(GamepadProfiles.resolveGamepadInfo(rawGamepad));
            this.connect(rawGamepad);
        }
    }

    public get mapping(): GamepadMapping {
        return this._mapping;
    }

    public set mapping(mapping: GamepadMapping) {
        this._mapping = mapping;
    }

    public get channels(): Float32Array {
        return this._channels;
    }

    public get gamepad(): BrowserGamepad | null {
        return this._gamepad;
    }

    public get index(): number {
        return this._index;
    }

    public get connected(): boolean {
        return this._gamepad !== null;
    }

    public get profile(): GamepadProfile {
        return this._profile;
    }

    public get label(): string {
        return this._label;
    }

    public get vendorId(): string | null {
        return this._vendorId;
    }

    public get productId(): string | null {
        return this._productId;
    }

    public setInfo({ profile, label, vendorId, productId }: IGamepadInfo): this {
        this._profile = profile;
        this._label = label;
        this._vendorId = vendorId;
        this._productId = productId;

        return this;
    }

    public connect(gamepad: BrowserGamepad): this {
        const wasConnected = this.connected;

        this._gamepad = gamepad;

        if (!wasConnected) {
            this.onConnect.dispatch(this);
        }

        return this;
    }

    public disconnect(): this {
        if (this.connected) {
            this._gamepad = null;
            this._clearMappedChannels();
            this.onDisconnect.dispatch(this);
        }

        return this;
    }

    public update(): this {
        if (this._gamepad === null) {
            return this;
        }

        const channels = this._channels;
        const { buttons: gamepadButtons, axes: gamepadAxes } = this._gamepad;
        const { buttons: mappingButtons, axes: mappingAxes } = this._mapping;

        for (const mapping of mappingButtons) {
            const { index, channel } = mapping;
            const offsetChannel = this.resolveChannelOffset(channel);

            if (index < gamepadButtons.length) {
                const value = mapping.transformValue(gamepadButtons[index].value) || 0;

                if (channels[offsetChannel] !== value) {
                    channels[offsetChannel] = value;
                    this.onUpdate.dispatch(channel, value, this);
                }
            }
        }

        for (const mapping of mappingAxes) {
            const { index, channel } = mapping;
            const offsetChannel = this.resolveChannelOffset(channel);

            if (index < gamepadAxes.length) {
                const value = mapping.transformValue(gamepadAxes[index]) || 0;

                if (channels[offsetChannel] !== value) {
                    channels[offsetChannel] = value;
                    this.onUpdate.dispatch(channel, value, this);
                }
            }
        }

        return this;
    }

    public destroy(): void {
        this.disconnect();
        this._clearMappedChannels();

        this.onConnect.destroy();
        this.onDisconnect.destroy();
        this.onUpdate.destroy();
    }

    public resolveChannelOffset(channel: GamepadChannel): number {
        return this._channelOffset + (channel ^ ChannelOffset.gamepads);
    }

    public clearChannels(): this {
        this._clearMappedChannels();

        return this;
    }

    public static resolveChannelOffset(gamepadIndex: number, channel: GamepadChannel): number {
        return ChannelOffset.gamepads + (gamepadIndex * ChannelSize.gamepad) + (channel ^ ChannelOffset.gamepads);
    }

    public static readonly faceBottom = GamepadChannels.faceBottom;
    public static readonly faceLeft = GamepadChannels.faceLeft;
    public static readonly faceRight = GamepadChannels.faceRight;
    public static readonly faceTop = GamepadChannels.faceTop;
    public static readonly shoulderLeftBottom = GamepadChannels.shoulderLeftBottom;
    public static readonly shoulderRightBottom = GamepadChannels.shoulderRightBottom;
    public static readonly shoulderLeftTop = GamepadChannels.shoulderLeftTop;
    public static readonly shoulderRightTop = GamepadChannels.shoulderRightTop;
    public static readonly menuLeft = GamepadChannels.menuLeft;
    public static readonly menuRight = GamepadChannels.menuRight;
    public static readonly leftStickPress = GamepadChannels.leftStickPress;
    public static readonly rightStickPress = GamepadChannels.rightStickPress;
    public static readonly dPadUp = GamepadChannels.dPadUp;
    public static readonly dPadDown = GamepadChannels.dPadDown;
    public static readonly dPadLeft = GamepadChannels.dPadLeft;
    public static readonly dPadRight = GamepadChannels.dPadRight;
    public static readonly menuCenter = GamepadChannels.menuCenter;
    public static readonly menuSpecial = GamepadChannels.menuSpecial;
    public static readonly extra1 = GamepadChannels.extra1;
    public static readonly extra2 = GamepadChannels.extra2;
    public static readonly extra3 = GamepadChannels.extra3;
    public static readonly leftStickLeft = GamepadChannels.leftStickLeft;
    public static readonly leftStickRight = GamepadChannels.leftStickRight;
    public static readonly leftStickUp = GamepadChannels.leftStickUp;
    public static readonly leftStickDown = GamepadChannels.leftStickDown;
    public static readonly rightStickLeft = GamepadChannels.rightStickLeft;
    public static readonly rightStickRight = GamepadChannels.rightStickRight;
    public static readonly rightStickUp = GamepadChannels.rightStickUp;
    public static readonly rightStickDown = GamepadChannels.rightStickDown;
    public static readonly auxiliaryAxis0Negative = GamepadChannels.auxiliaryAxis0Negative;
    public static readonly auxiliaryAxis0Positive = GamepadChannels.auxiliaryAxis0Positive;
    public static readonly auxiliaryAxis1Negative = GamepadChannels.auxiliaryAxis1Negative;
    public static readonly auxiliaryAxis1Positive = GamepadChannels.auxiliaryAxis1Positive;
    public static readonly auxiliaryAxis2Negative = GamepadChannels.auxiliaryAxis2Negative;
    public static readonly auxiliaryAxis2Positive = GamepadChannels.auxiliaryAxis2Positive;
    public static readonly auxiliaryAxis3Negative = GamepadChannels.auxiliaryAxis3Negative;
    public static readonly auxiliaryAxis3Positive = GamepadChannels.auxiliaryAxis3Positive;
    public static readonly select = GamepadChannels.select;
    public static readonly start = GamepadChannels.start;
    public static readonly leftStick = GamepadChannels.leftStick;
    public static readonly rightStick = GamepadChannels.rightStick;
    public static readonly home = GamepadChannels.home;

    private _clearMappedChannels(): void {
        for (const mapping of this._mapping.buttons) {
            this._channels[this.resolveChannelOffset(mapping.channel)] = 0;
        }

        for (const mapping of this._mapping.axes) {
            this._channels[this.resolveChannelOffset(mapping.channel)] = 0;
        }
    }

    private static _resolveMapping(gamepad: BrowserGamepad, mappingResolver?: GamepadMappingResolver): GamepadMapping {
        const resolver = mappingResolver || GamepadProfiles.createAutoGamepadMappingResolver();

        return resolver(gamepad);
    }
}

const gamepadButtonNames = [
    'faceBottom',
    'faceLeft',
    'faceRight',
    'faceTop',
    'shoulderLeftBottom',
    'shoulderRightBottom',
    'shoulderLeftTop',
    'shoulderRightTop',
    'menuLeft',
    'menuRight',
    'leftStickPress',
    'rightStickPress',
    'dPadUp',
    'dPadDown',
    'dPadLeft',
    'dPadRight',
    'menuCenter',
    'menuSpecial',
    'extra1',
    'extra2',
    'extra3',
    'leftStickLeft',
    'leftStickRight',
    'leftStickUp',
    'leftStickDown',
    'rightStickLeft',
    'rightStickRight',
    'rightStickUp',
    'rightStickDown',
    'auxiliaryAxis0Negative',
    'auxiliaryAxis0Positive',
    'auxiliaryAxis1Negative',
    'auxiliaryAxis1Positive',
    'auxiliaryAxis2Negative',
    'auxiliaryAxis2Positive',
    'auxiliaryAxis3Negative',
    'auxiliaryAxis3Positive',
    'select',
    'start',
    'leftStick',
    'rightStick',
    'home',
] as const;

export type GamepadButtons = typeof gamepadButtonNames[number];
export type GamepadChannel = typeof Gamepad[GamepadButtons];

type GamepadButtonLayoutEntry<Key extends string = string> = readonly [Key, GamepadChannel];

const createButtonLayoutMap = <Key extends string>(entries: Array<GamepadButtonLayoutEntry<Key>>): ReadonlyMap<Key, GamepadChannel> => {
    return new Map(entries);
};

const createButtonLayoutRecord = <Key extends string>(buttonLayoutMap: ReadonlyMap<Key, GamepadChannel>): Readonly<Record<Key, GamepadChannel>> => {
    return Object.freeze(Object.fromEntries(buttonLayoutMap) as Record<Key, GamepadChannel>);
};

const genericButtonLayoutEntries: Array<GamepadButtonLayoutEntry> = [
    ['faceBottom', Gamepad.faceBottom],
    ['faceLeft', Gamepad.faceLeft],
    ['faceRight', Gamepad.faceRight],
    ['faceTop', Gamepad.faceTop],
    ['menuLeft', Gamepad.menuLeft],
    ['menuRight', Gamepad.menuRight],
    ['menuCenter', Gamepad.menuCenter],
    ['menuSpecial', Gamepad.menuSpecial],
    ['leftStickPress', Gamepad.leftStickPress],
    ['rightStickPress', Gamepad.rightStickPress],
    ['shoulderLeftBottom', Gamepad.shoulderLeftBottom],
    ['shoulderRightBottom', Gamepad.shoulderRightBottom],
    ['shoulderLeftTop', Gamepad.shoulderLeftTop],
    ['shoulderRightTop', Gamepad.shoulderRightTop],
    ['dPadUp', Gamepad.dPadUp],
    ['dPadDown', Gamepad.dPadDown],
    ['dPadLeft', Gamepad.dPadLeft],
    ['dPadRight', Gamepad.dPadRight],
    ['extra1', Gamepad.extra1],
    ['extra2', Gamepad.extra2],
    ['extra3', Gamepad.extra3],
] as Array<GamepadButtonLayoutEntry>;

const xboxButtonLayoutEntries: Array<GamepadButtonLayoutEntry> = [
    ['a', Gamepad.faceBottom],
    ['b', Gamepad.faceRight],
    ['x', Gamepad.faceLeft],
    ['y', Gamepad.faceTop],
    ['view', Gamepad.menuLeft],
    ['menu', Gamepad.menuRight],
    ['xbox', Gamepad.menuCenter],
    ['share', Gamepad.menuSpecial],
    ['lb', Gamepad.shoulderLeftBottom],
    ['rb', Gamepad.shoulderRightBottom],
    ['lt', Gamepad.shoulderLeftTop],
    ['rt', Gamepad.shoulderRightTop],
    ['l3', Gamepad.leftStickPress],
    ['r3', Gamepad.rightStickPress],
    ['dPadUp', Gamepad.dPadUp],
    ['dPadDown', Gamepad.dPadDown],
    ['dPadLeft', Gamepad.dPadLeft],
    ['dPadRight', Gamepad.dPadRight],
] as Array<GamepadButtonLayoutEntry>;

const playStationButtonLayoutEntries: Array<GamepadButtonLayoutEntry> = [
    ['cross', Gamepad.faceBottom],
    ['circle', Gamepad.faceRight],
    ['square', Gamepad.faceLeft],
    ['triangle', Gamepad.faceTop],
    ['create', Gamepad.menuLeft],
    ['options', Gamepad.menuRight],
    ['ps', Gamepad.menuCenter],
    ['touchpad', Gamepad.menuSpecial],
    ['l1', Gamepad.shoulderLeftBottom],
    ['l2', Gamepad.shoulderLeftTop],
    ['l3', Gamepad.leftStickPress],
    ['r1', Gamepad.shoulderRightBottom],
    ['r2', Gamepad.shoulderRightTop],
    ['r3', Gamepad.rightStickPress],
    ['dPadUp', Gamepad.dPadUp],
    ['dPadDown', Gamepad.dPadDown],
    ['dPadLeft', Gamepad.dPadLeft],
    ['dPadRight', Gamepad.dPadRight],
] as Array<GamepadButtonLayoutEntry>;

const switchButtonLayoutEntries: Array<GamepadButtonLayoutEntry> = [
    ['b', Gamepad.faceBottom],
    ['a', Gamepad.faceRight],
    ['y', Gamepad.faceLeft],
    ['x', Gamepad.faceTop],
    ['minus', Gamepad.menuLeft],
    ['plus', Gamepad.menuRight],
    ['home', Gamepad.menuCenter],
    ['capture', Gamepad.menuSpecial],
    ['sl', Gamepad.extra1],
    ['sr', Gamepad.extra2],
    ['zl', Gamepad.shoulderLeftTop],
    ['zr', Gamepad.shoulderRightTop],
    ['l', Gamepad.shoulderLeftBottom],
    ['r', Gamepad.shoulderRightBottom],
    ['l3', Gamepad.leftStickPress],
    ['r3', Gamepad.rightStickPress],
    ['dPadUp', Gamepad.dPadUp],
    ['dPadDown', Gamepad.dPadDown],
    ['dPadLeft', Gamepad.dPadLeft],
    ['dPadRight', Gamepad.dPadRight],
] as Array<GamepadButtonLayoutEntry>;

export class GamepadButtonLayouts {
    public static readonly generic = createButtonLayoutMap(genericButtonLayoutEntries);
    public static readonly xbox = createButtonLayoutMap(xboxButtonLayoutEntries);
    public static readonly playStation = createButtonLayoutMap(playStationButtonLayoutEntries);
    public static readonly nintendoSwitch = createButtonLayoutMap(switchButtonLayoutEntries);
}

export const genericGamepadButtons = createButtonLayoutRecord(GamepadButtonLayouts.generic);
export const xboxGamepadButtons = createButtonLayoutRecord(GamepadButtonLayouts.xbox);
export const playStationGamepadButtons = createButtonLayoutRecord(GamepadButtonLayouts.playStation);
export const switchGamepadButtons = createButtonLayoutRecord(GamepadButtonLayouts.nintendoSwitch);
