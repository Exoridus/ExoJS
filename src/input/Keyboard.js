import ChannelHandler from './ChannelHandler';
import { CHANNEL_OFFSET, CHANNEL_LENGTH } from '../const';

/**
 * @class Keyboard
 * @extends {ChannelHandler}
 */
export default class Keyboard extends ChannelHandler {

    /**
     * @constructor
     * @param {Game} game
     * @param {ArrayBuffer} channelBuffer
     */
    constructor(game, channelBuffer) {
        super(channelBuffer, CHANNEL_OFFSET.KEYBOARD, CHANNEL_LENGTH.DEVICE);

        /**
         * @private
         * @member {Game}
         */
        this._game = game;

        /**
         * @private
         * @member {Set<Number>}
         */
        this._channelsPressed = new Set();

        /**
         * @private
         * @member {Set<Number>}
         */
        this._channelsReleased = new Set();

        /**
         * @private
         * @member {Number}
         */
        this._flags = Keyboard.FLAGS.NONE;

        this._addEventListeners();
    }

    /**
     * @override
     */
    update() {
        if (!this._flags) {
            return;
        }

        if (this._flags & Keyboard.FLAGS.KEY_DOWN) {
            this.trigger('keyboard:down', this._channelsPressed, this);
            this._channelsPressed.clear();
        }

        if (this._flags & Keyboard.FLAGS.KEY_UP) {
            this.trigger('keyboard:up', this._channelsReleased, this);
            this._channelsReleased.clear();
        }

        this._flags = 0;

    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._removeEventListeners();

        this._channelsPressed.clear();
        this._channelsPressed = null;

        this._channelsReleased.clear();
        this._channelsReleased = null;

        this._flags = null;
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
        this.channels[event.keyCode] = 1;
        this._channelsPressed.add(Keyboard.getChannelCode(event.keyCode));

        this._flags |= Keyboard.FLAGS.KEY_DOWN;
    }

    /**
     * @private
     * @param {Event} event
     */
    _onKeyUp(event) {
        this.channels[event.keyCode] = 0;
        this._channelsReleased.add(Keyboard.getChannelCode(event.keyCode));

        this._flags |= Keyboard.FLAGS.KEY_UP;
    }

    /**
     * @public
     * @static
     * @param {Number} key
     * @returns {Number}
     */
    static getChannelCode(key) {
        return CHANNEL_OFFSET.KEYBOARD + (key % CHANNEL_LENGTH.DEVICE);
    }
}

/**
 * @public
 * @static
 * @type {Object<String, Number>}
 * @property {Number} NONE
 * @property {Number} KEY_DOWN
 * @property {Number} KEY_UP
 */
Keyboard.FLAGS = {
    NONE: 0,
    KEY_DOWN: 1 << 0,
    KEY_UP: 1 << 1,
};

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Backspace = CHANNEL_OFFSET.KEYBOARD + 8;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Tab = CHANNEL_OFFSET.KEYBOARD + 9;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Clear = CHANNEL_OFFSET.KEYBOARD + 12;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Enter = CHANNEL_OFFSET.KEYBOARD + 13;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Shift = CHANNEL_OFFSET.KEYBOARD + 16;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Control = CHANNEL_OFFSET.KEYBOARD + 17;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Alt = CHANNEL_OFFSET.KEYBOARD + 18;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Pause = CHANNEL_OFFSET.KEYBOARD + 19;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.CapsLock = CHANNEL_OFFSET.KEYBOARD + 20;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Escape = CHANNEL_OFFSET.KEYBOARD + 27;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Space = CHANNEL_OFFSET.KEYBOARD + 32;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.PageUp = CHANNEL_OFFSET.KEYBOARD + 33;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.PageDown = CHANNEL_OFFSET.KEYBOARD + 34;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.End = CHANNEL_OFFSET.KEYBOARD + 35;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Home = CHANNEL_OFFSET.KEYBOARD + 36;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Left = CHANNEL_OFFSET.KEYBOARD + 37;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Up = CHANNEL_OFFSET.KEYBOARD + 38;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Right = CHANNEL_OFFSET.KEYBOARD + 39;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Down = CHANNEL_OFFSET.KEYBOARD + 40;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Insert = CHANNEL_OFFSET.KEYBOARD + 45;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Delete = CHANNEL_OFFSET.KEYBOARD + 46;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Help = CHANNEL_OFFSET.KEYBOARD + 47;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Zero = CHANNEL_OFFSET.KEYBOARD + 48;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.One = CHANNEL_OFFSET.KEYBOARD + 49;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Two = CHANNEL_OFFSET.KEYBOARD + 50;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Three = CHANNEL_OFFSET.KEYBOARD + 51;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Four = CHANNEL_OFFSET.KEYBOARD + 52;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Five = CHANNEL_OFFSET.KEYBOARD + 53;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Six = CHANNEL_OFFSET.KEYBOARD + 54;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Seven = CHANNEL_OFFSET.KEYBOARD + 55;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Eight = CHANNEL_OFFSET.KEYBOARD + 56;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Nine = CHANNEL_OFFSET.KEYBOARD + 57;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.A = CHANNEL_OFFSET.KEYBOARD + 65;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.B = CHANNEL_OFFSET.KEYBOARD + 66;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.C = CHANNEL_OFFSET.KEYBOARD + 67;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.D = CHANNEL_OFFSET.KEYBOARD + 68;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.E = CHANNEL_OFFSET.KEYBOARD + 69;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F = CHANNEL_OFFSET.KEYBOARD + 70;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.G = CHANNEL_OFFSET.KEYBOARD + 71;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.H = CHANNEL_OFFSET.KEYBOARD + 72;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.I = CHANNEL_OFFSET.KEYBOARD + 73;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.J = CHANNEL_OFFSET.KEYBOARD + 74;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.K = CHANNEL_OFFSET.KEYBOARD + 75;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.L = CHANNEL_OFFSET.KEYBOARD + 76;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.M = CHANNEL_OFFSET.KEYBOARD + 77;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.N = CHANNEL_OFFSET.KEYBOARD + 78;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.O = CHANNEL_OFFSET.KEYBOARD + 79;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.P = CHANNEL_OFFSET.KEYBOARD + 80;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Q = CHANNEL_OFFSET.KEYBOARD + 81;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.R = CHANNEL_OFFSET.KEYBOARD + 82;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.S = CHANNEL_OFFSET.KEYBOARD + 83;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.T = CHANNEL_OFFSET.KEYBOARD + 84;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.U = CHANNEL_OFFSET.KEYBOARD + 85;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.V = CHANNEL_OFFSET.KEYBOARD + 86;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.W = CHANNEL_OFFSET.KEYBOARD + 87;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.X = CHANNEL_OFFSET.KEYBOARD + 88;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Y = CHANNEL_OFFSET.KEYBOARD + 89;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Z = CHANNEL_OFFSET.KEYBOARD + 90;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad0 = CHANNEL_OFFSET.KEYBOARD + 96;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad1 = CHANNEL_OFFSET.KEYBOARD + 97;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad2 = CHANNEL_OFFSET.KEYBOARD + 98;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad3 = CHANNEL_OFFSET.KEYBOARD + 99;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad4 = CHANNEL_OFFSET.KEYBOARD + 100;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad5 = CHANNEL_OFFSET.KEYBOARD + 101;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad6 = CHANNEL_OFFSET.KEYBOARD + 102;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad7 = CHANNEL_OFFSET.KEYBOARD + 103;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad8 = CHANNEL_OFFSET.KEYBOARD + 104;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPad9 = CHANNEL_OFFSET.KEYBOARD + 105;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadMultiply = CHANNEL_OFFSET.KEYBOARD + 106;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadAdd = CHANNEL_OFFSET.KEYBOARD + 107;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadEnter = CHANNEL_OFFSET.KEYBOARD + 108;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadSubtract = CHANNEL_OFFSET.KEYBOARD + 109;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadDecimal = CHANNEL_OFFSET.KEYBOARD + 110;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumPadDivide = CHANNEL_OFFSET.KEYBOARD + 111;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F1 = CHANNEL_OFFSET.KEYBOARD + 112;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F2 = CHANNEL_OFFSET.KEYBOARD + 113;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F3 = CHANNEL_OFFSET.KEYBOARD + 114;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F4 = CHANNEL_OFFSET.KEYBOARD + 115;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F5 = CHANNEL_OFFSET.KEYBOARD + 116;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F6 = CHANNEL_OFFSET.KEYBOARD + 117;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F7 = CHANNEL_OFFSET.KEYBOARD + 118;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F8 = CHANNEL_OFFSET.KEYBOARD + 119;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F9 = CHANNEL_OFFSET.KEYBOARD + 120;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F10 = CHANNEL_OFFSET.KEYBOARD + 121;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F11 = CHANNEL_OFFSET.KEYBOARD + 122;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.F12 = CHANNEL_OFFSET.KEYBOARD + 123;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.NumLock = CHANNEL_OFFSET.KEYBOARD + 144;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.ScrollLock = CHANNEL_OFFSET.KEYBOARD + 145;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Colon = CHANNEL_OFFSET.KEYBOARD + 186;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Equals = CHANNEL_OFFSET.KEYBOARD + 187;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Comma = CHANNEL_OFFSET.KEYBOARD + 188;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Dash = CHANNEL_OFFSET.KEYBOARD + 189;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Period = CHANNEL_OFFSET.KEYBOARD + 190;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.QuestionMark = CHANNEL_OFFSET.KEYBOARD + 191;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Tilde = CHANNEL_OFFSET.KEYBOARD + 192;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.OpenBracket = CHANNEL_OFFSET.KEYBOARD + 219;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.BackwardSlash = CHANNEL_OFFSET.KEYBOARD + 220;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.ClosedBracket = CHANNEL_OFFSET.KEYBOARD + 221;

/**
 * @public
 * @static
 * @member {Number}
 */
Keyboard.Quotes = CHANNEL_OFFSET.KEYBOARD + 222;
