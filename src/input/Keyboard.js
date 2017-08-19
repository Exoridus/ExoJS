import ChannelHandler from './ChannelHandler';
import InputDevice from '../const/InputDevice';

const device = InputDevice.Keyboard << 8,
    bufferSize = 1 << 8;

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
        super(channelBuffer, device, bufferSize);

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
        const keyCode = event.keyCode;

        if (!this.active) {
            return;
        }

        this._channels[keyCode] = 1;

        this.trigger('keyboard:down', Keyboard.getChannelCode(keyCode), this);
    }

    /**
     * @private
     * @param {Event} event
     */
    _onKeyUp(event) {
        const keyCode = event.keyCode;

        if (!this.active) {
            return;
        }

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
        return device | (keyCode & 255);
    }
}

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Backspace = device | 8;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Tab = device | 9;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Clear = device | 12;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Enter = device | 13;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Shift = device | 16;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Control = device | 17;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Alt = device | 18;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Pause = device | 19;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.CapsLock = device | 20;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Escape = device | 27;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Space = device | 32;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.PageUp = device | 33;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.PageDown = device | 34;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.End = device | 35;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Home = device | 36;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Left = device | 37;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Up = device | 38;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Right = device | 39;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Down = device | 40;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Insert = device | 45;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Delete = device | 46;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Help = device | 47;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Zero = device | 48;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.One = device | 49;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Two = device | 50;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Three = device | 51;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Four = device | 52;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Five = device | 53;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Six = device | 54;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Seven = device | 55;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Eight = device | 56;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Nine = device | 57;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.A = device | 65;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.B = device | 66;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.C = device | 67;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.D = device | 68;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.E = device | 69;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F = device | 70;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.G = device | 71;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.H = device | 72;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.I = device | 73;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.J = device | 74;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.K = device | 75;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.L = device | 76;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.M = device | 77;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.N = device | 78;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.O = device | 79;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.P = device | 80;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Q = device | 81;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.R = device | 82;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.S = device | 83;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.T = device | 84;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.U = device | 85;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.V = device | 86;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.W = device | 87;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.X = device | 88;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Y = device | 89;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Z = device | 90;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad0 = device | 96;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad1 = device | 97;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad2 = device | 98;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad3 = device | 99;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad4 = device | 100;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad5 = device | 101;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad6 = device | 102;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad7 = device | 103;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad8 = device | 104;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad9 = device | 105;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadMultiply = device | 106;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadAdd = device | 107;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadEnter = device | 108;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadSubtract = device | 109;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadDecimal = device | 110;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadDivide = device | 111;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F1 = device | 112;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F2 = device | 113;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F3 = device | 114;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F4 = device | 115;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F5 = device | 116;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F6 = device | 117;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F7 = device | 118;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F8 = device | 119;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F9 = device | 120;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F10 = device | 121;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F11 = device | 122;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F12 = device | 123;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumLock = device | 144;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.ScrollLock = device | 145;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Colon = device | 186;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Equals = device | 187;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Comma = device | 188;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Dash = device | 189;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Period = device | 190;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.QuestionMark = device | 191;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Tilde = device | 192;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.OpenBracket = device | 219;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.BackwardSlash = device | 220;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.ClosedBracket = device | 221;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Quotes = device | 222;
