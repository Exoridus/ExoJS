import type { BrowserGamepad, GamepadMapping, GamepadMappingResolver } from 'input/GamepadMapping';
import { GenericGamepadMapping } from 'input/GenericGamepadMapping';
import { XboxGamepadMapping } from 'input/XboxGamepadMapping';
import { PlayStationGamepadMapping } from 'input/PlayStationGamepadMapping';
import { SwitchGamepadMapping } from 'input/SwitchGamepadMapping';

export enum GamepadProfile {
    generic = 'generic',
    xbox = 'xbox',
    playStation = 'playStation',
    nintendoSwitch = 'nintendoSwitch',
}

interface IKnownGamepadSignature {
    profile: GamepadProfile;
    label: string;
}

export interface IGamepadInfo {
    profile: GamepadProfile;
    label: string;
    vendorId: string | null;
    productId: string | null;
}

export class GamepadProfiles {

    private static readonly _xboxIdPattern = /(xbox|xinput)/i;
    private static readonly _playStationIdPattern = /(playstation|dualshock|dualsense|wireless controller|sony)/i;
    private static readonly _switchIdPattern = /(nintendo|switch|joy-con|pro controller)/i;

    private static readonly _vendorProductPattern = /vendor[:\s]*([0-9a-f]{4})\s*product[:\s]*([0-9a-f]{4})/i;
    private static readonly _pairPattern = /\b([0-9a-f]{4})[-: ]([0-9a-f]{4})\b/i;
    private static readonly _vendorProductHexPattern = /vendor[:\s]*0x([0-9a-f]{4})\s*product[:\s]*0x([0-9a-f]{4})/i;
    private static readonly _vidPidPattern = /vid[_:\s]*([0-9a-f]{4}).{0,8}pid[_:\s]*([0-9a-f]{4})/i;

    private static readonly _knownSignatureByProductKey = new Map<string, IKnownGamepadSignature>([
        ['045e:028e', { profile: GamepadProfile.xbox, label: 'Microsoft Xbox 360' }],
        ['045e:02ea', { profile: GamepadProfile.xbox, label: 'Microsoft Xbox One' }],
        ['045e:0b13', { profile: GamepadProfile.xbox, label: 'Microsoft Xbox Series' }],
        ['054c:05c4', { profile: GamepadProfile.playStation, label: 'Sony DualShock 4' }],
        ['054c:09cc', { profile: GamepadProfile.playStation, label: 'Sony DualShock 4' }],
        ['054c:0ce6', { profile: GamepadProfile.playStation, label: 'Sony DualSense' }],
        ['057e:2009', { profile: GamepadProfile.nintendoSwitch, label: 'Nintendo Switch Pro' }],
        ['057e:2006', { profile: GamepadProfile.nintendoSwitch, label: 'Nintendo Joy-Con' }],
        ['057e:2007', { profile: GamepadProfile.nintendoSwitch, label: 'Nintendo Joy-Con' }],
    ]);

    private static readonly _profileByVendorId = new Map<string, GamepadProfile>([
        ['045e', GamepadProfile.xbox],
        ['054c', GamepadProfile.playStation],
        ['057e', GamepadProfile.nintendoSwitch],
    ]);

    private static readonly _mappingFactoryByProfile = new Map<GamepadProfile, () => GamepadMapping>([
        [GamepadProfile.generic, (): GamepadMapping => new GenericGamepadMapping()],
        [GamepadProfile.xbox, (): GamepadMapping => new XboxGamepadMapping()],
        [GamepadProfile.playStation, (): GamepadMapping => new PlayStationGamepadMapping()],
        [GamepadProfile.nintendoSwitch, (): GamepadMapping => new SwitchGamepadMapping()],
    ]);

    private static readonly _autoMappingResolver: GamepadMappingResolver = (gamepad: BrowserGamepad): GamepadMapping => {
        return GamepadProfiles.createMappingForProfile(GamepadProfiles.detectGamepadProfile(gamepad));
    };

    public static detectGamepadProfile(gamepad: BrowserGamepad): GamepadProfile {
        return this._detectProfileFromId(gamepad.id);
    }

    public static getGamepadLabel(gamepad: BrowserGamepad): string {
        return this.resolveGamepadInfo(gamepad).label;
    }

    public static resolveGamepadInfo(gamepad: BrowserGamepad): IGamepadInfo {
        const id = gamepad.id;
        const productKey = this._extractVendorProductKey(id);
        const fallbackProfile = this._detectProfileFromId(id);

        if (productKey) {
            const vendorId = this._getVendorIdFromProductKey(productKey);
            const productId = this._getProductIdFromProductKey(productKey);
            const knownSignature = this._knownSignatureByProductKey.get(productKey);

            if (knownSignature) {
                return {
                    profile: knownSignature.profile,
                    label: knownSignature.label,
                    vendorId,
                    productId,
                };
            }

            const profile = this._profileByVendorId.get(vendorId) ?? fallbackProfile;

            return {
                profile,
                label: `${this._getDefaultLabelForProfile(profile)} (${productKey})`,
                vendorId,
                productId,
            };
        }

        return {
            profile: fallbackProfile,
            label: this._getDefaultLabelForProfile(fallbackProfile),
            vendorId: null,
            productId: null,
        };
    }

    public static createMappingForProfile(profile: GamepadProfile): GamepadMapping {
        const mappingFactory = this._mappingFactoryByProfile.get(profile) ?? this._mappingFactoryByProfile.get(GamepadProfile.generic);

        return mappingFactory!();
    }

    public static createAutoGamepadMappingResolver(): GamepadMappingResolver {
        return this._autoMappingResolver;
    }

    private static _detectProfileFromId(id: string): GamepadProfile {
        const productKey = this._extractVendorProductKey(id);

        if (productKey) {
            const knownSignature = this._knownSignatureByProductKey.get(productKey);

            if (knownSignature) {
                return knownSignature.profile;
            }

            const vendorProfile = this._profileByVendorId.get(this._getVendorIdFromProductKey(productKey));

            if (vendorProfile) {
                return vendorProfile;
            }
        }

        return this._detectProfileFromText(id);
    }

    private static _detectProfileFromText(id: string): GamepadProfile {
        if (this._xboxIdPattern.test(id)) {
            return GamepadProfile.xbox;
        }

        if (this._playStationIdPattern.test(id)) {
            return GamepadProfile.playStation;
        }

        if (this._switchIdPattern.test(id)) {
            return GamepadProfile.nintendoSwitch;
        }

        return GamepadProfile.generic;
    }

    private static _getDefaultLabelForProfile(profile: GamepadProfile): string {
        switch (profile) {
            case GamepadProfile.xbox: return 'Microsoft Xbox';
            case GamepadProfile.playStation: return 'Sony PlayStation';
            case GamepadProfile.nintendoSwitch: return 'Nintendo Switch';
            default: return 'Generic Gamepad';
        }
    }

    private static _extractVendorProductKey(id: string): string | null {
        const match = this._vendorProductHexPattern.exec(id)
            || this._vendorProductPattern.exec(id)
            || this._vidPidPattern.exec(id)
            || this._pairPattern.exec(id);

        if (!match) {
            return null;
        }

        return `${match[1].toLowerCase()}:${match[2].toLowerCase()}`;
    }

    private static _getVendorIdFromProductKey(productKey: string): string {
        return productKey.slice(0, 4);
    }

    private static _getProductIdFromProductKey(productKey: string): string {
        return productKey.slice(5);
    }
}

// Compatibility exports
export const resolveGamepadInfo = (gamepad: BrowserGamepad): IGamepadInfo => GamepadProfiles.resolveGamepadInfo(gamepad);
export const detectGamepadProfile = (gamepad: BrowserGamepad): GamepadProfile => GamepadProfiles.detectGamepadProfile(gamepad);
export const getGamepadLabel = (gamepad: BrowserGamepad): string => GamepadProfiles.getGamepadLabel(gamepad);
export const createGamepadMappingForProfile = (profile: GamepadProfile): GamepadMapping => GamepadProfiles.createMappingForProfile(profile);
export const createAutoGamepadMappingResolver = (): GamepadMappingResolver => GamepadProfiles.createAutoGamepadMappingResolver();
