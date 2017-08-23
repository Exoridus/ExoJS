import ChannelHandler from './ChannelHandler';
import {CHANNEL_RANGE_DEVICE, INPUT_DEVICE} from '../const';

const offset = INPUT_DEVICE.KEYBOARD * CHANNEL_RANGE_DEVICE;

/**
 * @class Keyboard
 * @extends {Exo.ChannelHandler}
 * @memberof Exo
 */
export default class Keyboard extends ChannelHandler {

    /**
     * @constructor
     * @param {Exo.Game} game
     * @param {ArrayBuffer} channelBuffer
     */
    constructor(game, channelBuffer) {
        super(channelBuffer, offset, CHANNEL_RANGE_DEVICE);

        /**
         * @private
         * @member {Exo.Game}
         */
        this._game = game;

        this._addEventListeners();
    }

    /**
     * @public
     * @param {Boolean} [resetChannels=false]
     */
    destroy(resetChannels = false) {
        super.destroy(resetChannels);

        this._removeEventListeners();
        this._game = null;
    }

    /**
     * @private
     */
    _addEventListeners() {
        this._onKeyDownHandler = this._onKeyDown.bind(this);
        this._onKeyUpHandler = this._onKeyUp.bind(this);

        window.addEventListener('keydown', this._onKeyDownHandler, true);
        window.addEventListener('keyup', this._onKeyUpHandler, true);
    }

    /**
     * @private
     */
    _removeEventListeners() {
        window.removeEventListener('keydown', this._onKeyDownHandler, true);
        window.removeEventListener('keyup', this._onKeyUpHandler, true);

        this._onKeyDownHandler = null;
        this._onKeyUpHandler = null;
    }

    /**
     * @private
     * @param {Event} event
     */
    _onKeyDown(event) {
        if (!this.active) {
            return;
        }

        const keyCode = event.keyCode;

        this._channels[keyCode] = 1;
        this.trigger('keyboard:down', Keyboard.getChannelCode(keyCode), this);
    }

    /**
     * @private
     * @param {Event} event
     */
    _onKeyUp(event) {
        if (!this.active) {
            return;
        }

        const keyCode = event.keyCode;

        this._channels[keyCode] = 0;
        this.trigger('keyboard:up', Keyboard.getChannelCode(keyCode), this);
    }

    /**
     * @public
     * @static
     * @param {Number} keyCode
     * @returns {Number}
     */
    static getChannelCode(keyCode) {
        return offset | (keyCode & 255);
    }
}

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Backspace = offset | 8;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Tab = offset | 9;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Clear = offset | 12;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Enter = offset | 13;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Shift = offset | 16;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Control = offset | 17;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Alt = offset | 18;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Pause = offset | 19;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.CapsLock = offset | 20;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Escape = offset | 27;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Space = offset | 32;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.PageUp = offset | 33;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.PageDown = offset | 34;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.End = offset | 35;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Home = offset | 36;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Left = offset | 37;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Up = offset | 38;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Right = offset | 39;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Down = offset | 40;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Insert = offset | 45;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Delete = offset | 46;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Help = offset | 47;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Zero = offset | 48;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.One = offset | 49;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Two = offset | 50;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Three = offset | 51;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Four = offset | 52;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Five = offset | 53;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Six = offset | 54;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Seven = offset | 55;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Eight = offset | 56;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Nine = offset | 57;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.A = offset | 65;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.B = offset | 66;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.C = offset | 67;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.D = offset | 68;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.E = offset | 69;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F = offset | 70;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.G = offset | 71;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.H = offset | 72;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.I = offset | 73;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.J = offset | 74;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.K = offset | 75;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.L = offset | 76;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.M = offset | 77;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.N = offset | 78;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.O = offset | 79;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.P = offset | 80;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Q = offset | 81;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.R = offset | 82;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.S = offset | 83;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.T = offset | 84;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.U = offset | 85;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.V = offset | 86;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.W = offset | 87;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.X = offset | 88;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Y = offset | 89;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Z = offset | 90;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad0 = offset | 96;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad1 = offset | 97;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad2 = offset | 98;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad3 = offset | 99;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad4 = offset | 100;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad5 = offset | 101;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad6 = offset | 102;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad7 = offset | 103;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad8 = offset | 104;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad9 = offset | 105;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadMultiply = offset | 106;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadAdd = offset | 107;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadEnter = offset | 108;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadSubtract = offset | 109;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadDecimal = offset | 110;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadDivide = offset | 111;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F1 = offset | 112;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F2 = offset | 113;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F3 = offset | 114;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F4 = offset | 115;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F5 = offset | 116;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F6 = offset | 117;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F7 = offset | 118;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F8 = offset | 119;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F9 = offset | 120;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F10 = offset | 121;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F11 = offset | 122;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F12 = offset | 123;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumLock = offset | 144;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.ScrollLock = offset | 145;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Colon = offset | 186;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Equals = offset | 187;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Comma = offset | 188;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Dash = offset | 189;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Period = offset | 190;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.QuestionMark = offset | 191;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Tilde = offset | 192;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.OpenBracket = offset | 219;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.BackwardSlash = offset | 220;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.ClosedBracket = offset | 221;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Quotes = offset | 222;
