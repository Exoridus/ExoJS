/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 9);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});
var

/**
 * @public
 * @static
 * @readonly
 * @constant
 * @type {String}
 */
VERSION = exports.VERSION = __VERSION__,


/**
 * @public
 * @static
 * @readonly
 * @constant
 * @type {Number}
 */
TAU = exports.TAU = Math.PI * 2,


/**
 * @public
 * @static
 * @readonly
 * @constant
 * @type {Number}
 */
DEG_TO_RAD = exports.DEG_TO_RAD = Math.PI / 180,


/**
 * @public
 * @static
 * @readonly
 * @constant
 * @type {Number}
 */
RAD_TO_DEG = exports.RAD_TO_DEG = 180 / Math.PI,


/**
 * @public
 * @constant
 * @name SHAPE
 * @type {Object<String, Number>}
 * @property {Number} NONE
 * @property {Number} POLYGON
 * @property {Number} RECTANGLE
 * @property {Number} CIRCLE
 * @property {Number} ELLIPSIS
 * @property {Number} POINT
 */
SHAPE = exports.SHAPE = {
    NONE: 0,
    POLYGON: 1,
    RECTANGLE: 2,
    CIRCLE: 3,
    ELLIPSIS: 4,
    POINT: 5
},


/**
 * @public
 * @constant
 * @name SCALE_MODE
 * @type {Object<String, Number>}
 * @property {Number} NEAREST
 * @property {Number} LINEAR
 */
SCALE_MODE = exports.SCALE_MODE = {
    NEAREST: 0x2600,
    LINEAR: 0x2601
},


/**
 * @public
 * @constant
 * @name WRAP_MODE
 * @type {Object<String, Number>}
 * @property {Number} REPEAT
 * @property {Number} CLAMP_TO_EDGE
 * @property {Number} MIRRORED_REPEAT
 */
WRAP_MODE = exports.WRAP_MODE = {
    REPEAT: 0x2901,
    CLAMP_TO_EDGE: 0x812F,
    MIRRORED_REPEAT: 0x8370
},


/**
 * @public
 * @constant
 * @name ATTRIBUTE_TYPE
 * @type {Object<String, Number>}
 * @property {Number} BYTE
 * @property {Number} UNSIGNED_BYTE
 * @property {Number} SHORT
 * @property {Number} UNSIGNED_SHORT
 * @property {Number} INT
 * @property {Number} UNSIGNED_INT
 * @property {Number} FLOAT
 */
ATTRIBUTE_TYPE = exports.ATTRIBUTE_TYPE = {
    BYTE: 0x1400,
    UNSIGNED_BYTE: 0x1401,
    SHORT: 0x1402,
    UNSIGNED_SHORT: 0x1403,
    INT: 0x1404,
    UNSIGNED_INT: 0x1405,
    FLOAT: 0x1406
},


/**
 * @public
 * @constant
 * @name INPUT_DEVICE
 * @type {Object<String, Number>}
 * @property {Number} KEYBOARD
 * @property {Number} MOUSE
 * @property {Number} GAMEPAD
 * @property {Number} POINTER
 */
INPUT_DEVICE = exports.INPUT_DEVICE = {
    KEYBOARD: 0,
    MOUSE: 1,
    GAMEPAD: 2,
    POINTER: 3
},


/**
 * @public
 * @constant
 * @name CHANNEL_LENGTH
 * @type {Object}
 * @property {Number} GLOBAL
 * @property {Number} DEVICE
 * @property {Number} CHILD
 */
CHANNEL_LENGTH = exports.CHANNEL_LENGTH = {
    GLOBAL: 1024,
    DEVICE: 256,
    CHILD: 32
},


/**
 * @public
 * @constant
 * @name CHANNEL_OFFSET
 * @type {Object<String, Number>}
 * @property {Number} KEYBOARD
 * @property {Number} MOUSE
 * @property {Number} GAMEPAD
 * @property {Number} POINTER
 */
CHANNEL_OFFSET = exports.CHANNEL_OFFSET = {
    KEYBOARD: INPUT_DEVICE.KEYBOARD * CHANNEL_LENGTH.DEVICE,
    MOUSE: INPUT_DEVICE.MOUSE * CHANNEL_LENGTH.DEVICE,
    GAMEPAD: INPUT_DEVICE.GAMEPAD * CHANNEL_LENGTH.DEVICE,
    POINTER: INPUT_DEVICE.POINTER * CHANNEL_LENGTH.DEVICE
},


/**
 * @public
 * @constant
 * @name UNIFORM_TYPE
 * @type {Object<String, Number>}
 * @property {Number} INT
 * @property {Number} FLOAT
 * @property {Number} FLOAT_VEC2
 * @property {Number} FLOAT_VEC3
 * @property {Number} FLOAT_VEC4
 * @property {Number} INT_VEC2
 * @property {Number} INT_VEC3
 * @property {Number} INT_VEC4
 * @property {Number} BOOL
 * @property {Number} BOOL_VEC2
 * @property {Number} BOOL_VEC3
 * @property {Number} BOOL_VEC4
 * @property {Number} FLOAT_MAT2
 * @property {Number} FLOAT_MAT3
 * @property {Number} FLOAT_MAT4
 * @property {Number} SAMPLER_2D
 */
UNIFORM_TYPE = exports.UNIFORM_TYPE = {
    INT: 0x1404,
    INT_VEC2: 0x8B53,
    INT_VEC3: 0x8B54,
    INT_VEC4: 0x8B55,

    FLOAT: 0x1406,
    FLOAT_VEC2: 0x8B50,
    FLOAT_VEC3: 0x8B51,
    FLOAT_VEC4: 0x8B52,

    BOOL: 0x8B56,
    BOOL_VEC2: 0x8B57,
    BOOL_VEC3: 0x8B58,
    BOOL_VEC4: 0x8B59,

    FLOAT_MAT2: 0x8B5A,
    FLOAT_MAT3: 0x8B5B,
    FLOAT_MAT4: 0x8B5C,

    SAMPLER_2D: 0x8B5E
},


/**
 * @public
 * @constant
 * @name BLEND_MODE
 * @type {Object<String, Number>}
 * @property {Number} SOURCE_OVER
 * @property {Number} ADD
 * @property {Number} MULTIPLY
 * @property {Number} SCREEN
 * @property {Number} OVERLAY
 * @property {Number} DARKEN
 * @property {Number} LIGHTEN
 * @property {Number} COLOR_DODGE
 * @property {Number} COLOR_BURN
 * @property {Number} HARD_LIGHT
 * @property {Number} SOFT_LIGHT
 * @property {Number} DIFFERENCE
 * @property {Number} EXCLUSION
 * @property {Number} HUE
 * @property {Number} SATURATION
 * @property {Number} COLOR
 * @property {Number} LUMINOSITY
 */
BLEND_MODE = exports.BLEND_MODE = {
    SOURCE_OVER: 0,
    ADD: 1,
    MULTIPLY: 2,
    SCREEN: 3,
    OVERLAY: 4,
    DARKEN: 5,
    LIGHTEN: 6,
    COLOR_DODGE: 7,
    COLOR_BURN: 8,
    HARD_LIGHT: 9,
    SOFT_LIGHT: 10,
    DIFFERENCE: 11,
    EXCLUSION: 12,
    HUE: 13,
    SATURATION: 14,
    COLOR: 15,
    LUMINOSITY: 16
},


/**
 * @public
 * @constant
 * @name DATABASE_TYPES
 * @type {String[]}
 */
DATABASE_TYPES = exports.DATABASE_TYPES = ['arrayBuffer', 'audioBuffer', 'audio', 'blob', 'font', 'image', 'json', 'music', 'sound', 'string'],


/**
 * @public
 * @constant
 * @name CODEC_NOT_SUPPORTED
 * @type {RegExp}
 */
CODEC_NOT_SUPPORTED = exports.CODEC_NOT_SUPPORTED = /^no$/,


/**
 * @public
 * @constant
 * @name NEWLINE
 * @type {RegExp}
 */
NEWLINE = exports.NEWLINE = /(?:\r\n|\r|\n)/,
    TYPE_PATTERN = exports.TYPE_PATTERN = [{
    mimeType: 'image/x-icon',
    pattern: [0x00, 0x00, 0x01, 0x00],
    mask: [0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'image/x-icon',
    pattern: [0x00, 0x00, 0x02, 0x00],
    mask: [0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'image/bmp',
    pattern: [0x42, 0x4D],
    mask: [0xFF, 0xFF]
}, {
    mimeType: 'image/gif',
    pattern: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'image/gif',
    pattern: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
    mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'image/webp',
    pattern: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50],
    mask: [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'image/png',
    pattern: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'image/jpeg',
    pattern: [0xFF, 0xD8, 0xFF],
    mask: [0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'audio/basic',
    pattern: [0x2E, 0x73, 0x6E, 0x64],
    mask: [0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'audio/mpeg',
    pattern: [0x49, 0x44, 0x33],
    mask: [0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'audio/wave',
    pattern: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45],
    mask: [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'audio/midi',
    pattern: [0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06],
    mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'audio/aiff',
    pattern: [0x46, 0x4F, 0x52, 0x4D, 0x00, 0x00, 0x00, 0x00, 0x41, 0x49, 0x46, 0x46],
    mask: [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'video/avi',
    pattern: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20],
    mask: [0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF]
}, {
    mimeType: 'application/ogg',
    pattern: [0x4F, 0x67, 0x67, 0x53, 0x00],
    mask: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF]
}];

/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _MenuPath = __webpack_require__(15);

var _MenuPath2 = _interopRequireDefault(_MenuPath);

var _MenuAction = __webpack_require__(16);

var _MenuAction2 = _interopRequireDefault(_MenuAction);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Menu
 * @extends {Exo.Container}
 */
var Menu = function (_Exo$Container) {
    _inherits(Menu, _Exo$Container);

    /**
     * @constructor
     * @param {Exo.Game} game
     * @param {String} [previousMenu=null]
     */
    function Menu(game) {
        var previousMenu = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

        _classCallCheck(this, Menu);

        /**
         * @public
         * @member {Exo.Game}
         */
        var _this = _possibleConstructorReturn(this, (Menu.__proto__ || Object.getPrototypeOf(Menu)).call(this));

        _this._game = game;

        /**
         * @public
         * @member {MenuPath[]}
         */
        _this._paths = [];

        /**
         * @public
         * @member {MenuAction[]}
         */
        _this._actions = [];

        /**
         * @public
         * @member {?MenuItem}
         */
        _this._startChild = null;

        /**
         * @public
         * @member {?MenuItem}
         */
        _this._activeChild = null;

        /**
         * @public
         * @member {?String}
         */
        _this._previousMenu = previousMenu;
        return _this;
    }

    /**
     * @public
     * @member {?String}
     */


    _createClass(Menu, [{
        key: 'setStartChild',


        /**
         * @public
         * @param {MenuItem} child
         */
        value: function setStartChild(child) {
            this._startChild = child;
        }

        /**
         * @public
         * @param {MenuItem} child
         */

    }, {
        key: 'setActiveChild',
        value: function setActiveChild(child) {
            if (this._activeChild) {
                this._activeChild.reset();
            }

            this._activeChild = child;
            child.activate();
        }

        /**
         * @public
         * @param {MenuItem} fromChild
         * @param {MenuItem} toChild
         * @param {String} fromToDirection
         * @param {String} [toFromDirection]
         */

    }, {
        key: 'addPath',
        value: function addPath(fromChild, toChild, fromToDirection, toFromDirection) {
            this._paths.push(new _MenuPath2.default(fromChild, toChild, fromToDirection));

            if (toFromDirection) {
                this._paths.push(new _MenuPath2.default(toChild, fromChild, toFromDirection));
            }
        }

        /**
         * @public
         * @param {MenuItem} child
         * @param {Function} action
         * @param {String} [input=select]
         */

    }, {
        key: 'addAction',
        value: function addAction(child, action, input) {
            this._actions.push(new _MenuAction2.default(child, action, input || 'select'));
        }

        /**
         * @public
         */

    }, {
        key: 'activate',
        value: function activate() {
            this.setActiveChild(this._startChild);
        }

        /**
         * @public
         * @param {Exo.Time} delta
         */

    }, {
        key: 'update',
        value: function update(delta) {
            if (this._activeChild) {
                this._activeChild.update(delta);
            }
        }

        /**
         * @public
         */

    }, {
        key: 'reset',
        value: function reset() {
            if (this._activeChild) {
                this._activeChild.reset();
                this._activeChild = null;
            }
        }

        /**
         * @public
         * @param {String} input
         */

    }, {
        key: 'updateInput',
        value: function updateInput(input) {
            if (!this._activeChild) {
                return;
            }

            for (var i = 0, len = this._paths.length; i < len; i++) {
                var path = this._paths[i];

                if (path.fromItem === this._activeChild && path.input === input) {
                    this.setActiveChild(path.toItem);

                    break;
                }
            }

            for (var _i = 0, _len = this._actions.length; _i < _len; _i++) {
                var action = this._actions[_i];

                if (action.item === this._activeChild && action.input === input) {
                    action.action(action);

                    break;
                }
            }
        }

        /**
         * @public
         */

    }, {
        key: 'onInputUp',
        value: function onInputUp() {
            this.updateInput('up');
        }

        /**
         * @public
         */

    }, {
        key: 'onInputDown',
        value: function onInputDown() {
            this.updateInput('down');
        }

        /**
         * @public
         */

    }, {
        key: 'onInputLeft',
        value: function onInputLeft() {
            this.updateInput('left');
        }

        /**
         * @public
         */

    }, {
        key: 'onInputRight',
        value: function onInputRight() {
            this.updateInput('right');
        }

        /**
         * @public
         */

    }, {
        key: 'onInputSelect',
        value: function onInputSelect() {
            this.updateInput('select');
        }

        /**
         * @public
         */

    }, {
        key: 'onInputBack',
        value: function onInputBack() {
            this.openPreviousMenu();
        }

        /**
         * @public
         * @param {String} menu
         */

    }, {
        key: 'openMenu',
        value: function openMenu(menu) {
            this.trigger('openMenu', menu);
        }

        /**
         * @public
         */

    }, {
        key: 'openPreviousMenu',
        value: function openPreviousMenu() {
            this.trigger('openPreviousMenu');
        }

        /**
         * @public
         * @param {Boolean} [destroyChildren=true]
         */

    }, {
        key: 'destroy',
        value: function destroy(destroyChildren) {
            _get(Menu.prototype.__proto__ || Object.getPrototypeOf(Menu.prototype), 'destroy', this).call(this, destroyChildren !== false);

            this._paths.forEach(function (path) {
                path.destroy();
            });

            this._actions.forEach(function (action) {
                action.destroy();
            });

            this._paths.length = 0;
            this._paths = null;

            this._actions.length = 0;
            this._actions = null;

            this._previousMenu = null;
            this._startChild = null;
            this._activeChild = null;
            this._game = null;
        }
    }, {
        key: 'previousMenu',
        get: function get() {
            return this._previousMenu;
        },
        set: function set(value) {
            this._previousMenu = value || null;
        }
    }]);

    return Menu;
}(Exo.Container);

exports.default = Menu;

/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class MenuItem
 * @extends {Exo.Text}
 */
var MenuItem = function (_Exo$Text) {
  _inherits(MenuItem, _Exo$Text);

  /**
   * @constructor
   * @param {String} text
   * @param {MenuItem} [previousItem]
   */
  function MenuItem(text, previousItem) {
    _classCallCheck(this, MenuItem);

    /**
     * @private
     * @member {Number}
     */
    var _this = _possibleConstructorReturn(this, (MenuItem.__proto__ || Object.getPrototypeOf(MenuItem)).call(this, text, {
      fill: 'white',
      fontSize: 45,
      fontFamily: 'AndyBold',
      stroke: 'black',
      strokeThickness: 5
    }));

    _this._ticker = 0;

    /**
     * @private
     * @member {Number}
     */
    _this._scalingFactor = 1.2;

    /**
     * @private
     * @member {Number}
     */
    _this._scalingSpeed = 2;

    _this.setOrigin(0.5, 0.5);

    if (previousItem) {
      _this.setPosition(previousItem.x, previousItem.bottom + _this.height * _this._scalingFactor / 2);
    }
    return _this;
  }

  /**
   * @public
   */


  _createClass(MenuItem, [{
    key: 'activate',
    value: function activate() {
      this.tint = Exo.Color.Yellow;
      this._ticker = 0;
    }

    /**
     * @public
     * @param {Exo.Time} delta
     */

  }, {
    key: 'update',
    value: function update(delta) {
      var time = this._ticker * this._scalingSpeed,
          scalingCenter = (this._scalingFactor - 1) / 2,
          scale = 1 + Math.sin(time * Math.PI) * scalingCenter + scalingCenter;

      this.setScale(scale, scale);
      this._ticker += delta.seconds;
    }

    /**
     * @public
     */

  }, {
    key: 'reset',
    value: function reset() {
      this.tint = Exo.Color.White;
      this.setScale(1, 1);
      this._ticker = 0;
    }
  }]);

  return MenuItem;
}(Exo.Text);

exports.default = MenuItem;

/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.determineMimeType = exports.removeItems = exports.rgbToHex = exports.rangeIntersect = exports.inRange = exports.isPowerOfTwo = exports.sign = exports.clamp = exports.radiansToDegrees = exports.degreesToRadians = exports.decodeAudioBuffer = exports.supportsCodec = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _const = __webpack_require__(0);

var _support = __webpack_require__(22);

var _support2 = _interopRequireDefault(_support);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var

/**
 * @private
 * @constant
 * @type {HTMLAudioElement}
 */
audio = document.createElement('audio'),


/**
 * @private
 * @constant
 * @type {AudioContext}
 */
audioContext = _support2.default.webAudio ? new AudioContext() : null,


/**
 * @public
 * @constant
 * @type {Function}
 * @param {...String} codecs
 * @returns {Boolean}
 */
supportsCodec = function supportsCodec() {
    for (var _len = arguments.length, codecs = Array(_len), _key = 0; _key < _len; _key++) {
        codecs[_key] = arguments[_key];
    }

    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
        for (var _iterator = codecs[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var codec = _step.value;

            if (audio.canPlayType(codec).replace(_const.CODEC_NOT_SUPPORTED, '')) {
                return true;
            }
        }
    } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
    } finally {
        try {
            if (!_iteratorNormalCompletion && _iterator.return) {
                _iterator.return();
            }
        } finally {
            if (_didIteratorError) {
                throw _iteratorError;
            }
        }
    }

    return false;
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<AudioBuffer>}
 */
decodeAudioBuffer = function decodeAudioBuffer(arrayBuffer) {
    if (!_support2.default.webAudio) {
        return Promise.reject(Error('Web Audio is not supported!'));
    }

    return new Promise(function (resolve, reject) {
        audioContext.decodeAudioData(arrayBuffer, resolve, reject);
    });
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Number} degree
 * @returns {Number}
 */
degreesToRadians = function degreesToRadians(degree) {
    return degree * _const.DEG_TO_RAD;
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Number} radian
 * @returns {Number}
 */
radiansToDegrees = function radiansToDegrees(radian) {
    return radian * _const.RAD_TO_DEG;
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Number} value
 * @param {Number} min
 * @param {Number} max
 * @returns {Number}
 */
clamp = function clamp(value, min, max) {
    return Math.min(Math.max(value, Math.min(max, value)), Math.max(min, max));
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Number} value
 * @returns {Number}
 */
sign = function sign(value) {
    return value && (value < 0 ? -1 : 1);
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Number} value
 * @returns {Boolean}
 */
isPowerOfTwo = function isPowerOfTwo(value) {
    return value !== 0 && (value & value - 1) === 0;
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Number} value
 * @param {Number} min
 * @param {Number} max
 * @returns {Boolean}
 */
inRange = function inRange(value, min, max) {
    return value >= Math.min(min, max) && value <= Math.max(min, max);
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Number} minA
 * @param {Number} maxA
 * @param {Number} minB
 * @param {Number} maxB
 * @returns {Boolean}
 */
rangeIntersect = function rangeIntersect(minA, maxA, minB, maxB) {
    return Math.max(minA, maxA) >= Math.min(minB, maxB) && Math.min(minA, maxB) <= Math.max(minB, maxB);
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Number} r
 * @param {Number} g
 * @param {Number} b
 * @param {Boolean} [prefixed=true]
 * @returns {String}
 */
rgbToHex = function rgbToHex(r, g, b) {
    var prefixed = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : true;

    var color = ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).substr(1);

    return prefixed ? '#' + color : color;
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {Array} array
 * @param {Number} startIndex
 * @param {Number} amount
 */
removeItems = function removeItems(array, startIndex, amount) {
    if (startIndex >= array.length || !amount) {
        return;
    }

    var length = array.length,
        removeCount = startIndex + amount > length ? length - startIndex : amount,
        newLen = length - removeCount;

    for (var i = startIndex; i < newLen; i++) {
        array[i] = array[i + removeCount];
    }

    array.length = newLen;
},


/**
 * @private
 * @constant
 * @type {Function}
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Boolean}
 */
matchesMP4Video = function matchesMP4Video(arrayBuffer) {
    var header = new Uint8Array(arrayBuffer),
        view = new DataView(arrayBuffer),
        boxSize = view.getUint32(0, false);

    if (header.length < Math.max(12, boxSize) || boxSize % 4 !== 0) {
        return false;
    }

    return String.fromCharCode.apply(String, _toConsumableArray(header.subarray(4, 11))) === 'ftypmp4';
},


/**
 * @private
 * @constant
 * @type {Function}
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Boolean}
 */
matchesWebMVideo = function matchesWebMVideo(arrayBuffer) {
    var header = new Uint8Array(arrayBuffer),
        matching = [0x1A, 0x45, 0xDF, 0xA3].every(function (byte, i) {
        return byte === header[i];
    }),
        sliced = header.subarray(4, 4 + 4096),
        index = sliced.findIndex(function (el, i, arr) {
        return arr[i] === 0x42 && arr[i + 1] === 0x82;
    });

    if (!matching || index === -1) {
        return false;
    }

    return String.fromCharCode.apply(String, _toConsumableArray(sliced.subarray(index + 3, index + 7))) === 'webm';
},


/**
 * @public
 * @constant
 * @type {Function}
 * @param {ArrayBuffer} arrayBuffer
 * @returns {String}
 */
determineMimeType = function determineMimeType(arrayBuffer) {
    var header = new Uint8Array(arrayBuffer);

    var _loop = function _loop(type) {
        if (header.length < type.pattern.length) {
            return 'continue';
        }

        if (type.pattern.every(function (p, i) {
            return (header[i] & type.mask[i]) === p;
        })) {
            return {
                v: type.mimeType
            };
        }
    };

    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
        for (var _iterator2 = _const.TYPE_PATTERN[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
            var type = _step2.value;

            var _ret = _loop(type);

            switch (_ret) {
                case 'continue':
                    continue;

                default:
                    if ((typeof _ret === 'undefined' ? 'undefined' : _typeof(_ret)) === "object") return _ret.v;
            }
        }
    } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
    } finally {
        try {
            if (!_iteratorNormalCompletion2 && _iterator2.return) {
                _iterator2.return();
            }
        } finally {
            if (_didIteratorError2) {
                throw _iteratorError2;
            }
        }
    }

    if (matchesMP4Video(arrayBuffer)) {
        return 'video/mp4';
    }

    if (matchesWebMVideo(arrayBuffer)) {
        return 'video/webm';
    }

    return 'text/plain';
};

exports.supportsCodec = supportsCodec;
exports.decodeAudioBuffer = decodeAudioBuffer;
exports.degreesToRadians = degreesToRadians;
exports.radiansToDegrees = radiansToDegrees;
exports.clamp = clamp;
exports.sign = sign;
exports.isPowerOfTwo = isPowerOfTwo;
exports.inRange = inRange;
exports.rangeIntersect = rangeIntersect;
exports.rgbToHex = rgbToHex;
exports.removeItems = removeItems;
exports.determineMimeType = determineMimeType;

/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Vector = __webpack_require__(6);

var _Vector2 = _interopRequireDefault(_Vector);

var _Shape2 = __webpack_require__(7);

var _Shape3 = _interopRequireDefault(_Shape2);

var _utils = __webpack_require__(3);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Rectangle
 * @extends {Shape}
 */
var Rectangle = function (_Shape) {
    _inherits(Rectangle, _Shape);

    /**
     * @constructor
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     * @param {Number} [width=1]
     * @param {Number} [height=1]
     */
    function Rectangle() {
        var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
        var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        var width = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 1;
        var height = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 1;

        _classCallCheck(this, Rectangle);

        /**
         * @public
         * @member {Vector}
         */
        var _this = _possibleConstructorReturn(this, (Rectangle.__proto__ || Object.getPrototypeOf(Rectangle)).call(this));

        _this._position = new _Vector2.default(x, y);

        /**
         * @public
         * @member {Vector}
         */
        _this._size = new _Vector2.default(width, height);
        return _this;
    }

    /**
     * @override
     */


    _createClass(Rectangle, [{
        key: 'set',


        /**
         * @override
         */
        value: function set(x, y, width, height) {
            this._position.set(x, y);
            this._size.set(width, height);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'copy',
        value: function copy(rectangle) {
            this._position.copy(rectangle.position);
            this._size.copy(rectangle.size);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'clone',
        value: function clone() {
            return new Rectangle(this.x, this.y, this.width, this.height);
        }

        /**
         * @override
         */

    }, {
        key: 'reset',
        value: function reset() {
            this.set(0, 0, 1, 1);
        }

        /**
         * @override
         */

    }, {
        key: 'toArray',
        value: function toArray() {
            var array = this._array || (this._array = new Float32Array(4));

            array[0] = this.x;
            array[1] = this.y;
            array[2] = this.width;
            array[3] = this.height;

            return array;
        }

        /**
         * @override
         */

    }, {
        key: 'getBounds',
        value: function getBounds() {
            if (!this._bounds) {
                this._bounds = new Rectangle();
            }

            return this._bounds.copy(this);
        }

        /**
         * @override
         */

    }, {
        key: 'contains',
        value: function contains(shape) {
            switch (shape.type) {
                case _const.SHAPE.POINT:
                    return (0, _utils.inRange)(shape.x, this.left, this.right) && (0, _utils.inRange)(shape.y, this.top, this.bottom);
                case _const.SHAPE.CIRCLE:
                    return this.contains(shape.bounds);
                case _const.SHAPE.RECTANGLE:
                    return (0, _utils.inRange)(shape.left, this.left, this.right) && (0, _utils.inRange)(shape.right, this.left, this.right) && (0, _utils.inRange)(shape.top, this.top, this.bottom) && (0, _utils.inRange)(shape.bottom, this.top, this.bottom);
                case _const.SHAPE.POLYGON:
                    return false;
                default:
                    throw new Error('Passed item is not a valid shape!', shape);
            }
        }

        /**
         * @override
         */

    }, {
        key: 'intersects',
        value: function intersects(shape) {
            switch (shape.type) {
                case _const.SHAPE.POINT:
                    return this.contains(shape);
                case _const.SHAPE.CIRCLE:
                    return this.intersects(shape.bounds);
                case _const.SHAPE.RECTANGLE:
                    return (0, _utils.rangeIntersect)(this.left, this.right, shape.left, shape.right) && (0, _utils.rangeIntersect)(this.top, this.bottom, shape.top, shape.bottom);
                case _const.SHAPE.POLYGON:
                    return false;
                default:
                    throw new Error('Passed item is not a valid shape!', shape);
            }
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Rectangle.prototype.__proto__ || Object.getPrototypeOf(Rectangle.prototype), 'destroy', this).call(this);

            this._position.destroy();
            this._position = null;

            this._size.destroy();
            this._size = null;
        }
    }, {
        key: 'type',
        get: function get() {
            return _const.SHAPE.RECTANGLE;
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'position',
        get: function get() {
            return this._position;
        },
        set: function set(position) {
            this._position.copy(position);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'x',
        get: function get() {
            return this._position.x;
        },
        set: function set(x) {
            this._position.x = x;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'y',
        get: function get() {
            return this._position.y;
        },
        set: function set(y) {
            this._position.y = y;
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'size',
        get: function get() {
            return this._size;
        },
        set: function set(size) {
            this._size.copy(size);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'width',
        get: function get() {
            return this._size.x;
        },
        set: function set(width) {
            this._size.x = width;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'height',
        get: function get() {
            return this._size.y;
        },
        set: function set(height) {
            this._size.y = height;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'left',
        get: function get() {
            return this.x;
        },
        set: function set(left) {
            this.x = left;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'right',
        get: function get() {
            return this.x + this.width;
        },
        set: function set(right) {
            this.x = right - this.width;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'top',
        get: function get() {
            return this.y;
        },
        set: function set(top) {
            this.y = top;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'bottom',
        get: function get() {
            return this.y + this.height;
        },
        set: function set(bottom) {
            this.y = bottom - this.height;
        }
    }]);

    return Rectangle;
}(_Shape3.default);

exports.default = Rectangle;

/***/ }),
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Vector2 = __webpack_require__(6);

var _Vector3 = _interopRequireDefault(_Vector2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class ObservableVector
 * @extends {Vector}
 */
var ObservableVector = function (_Vector) {
    _inherits(ObservableVector, _Vector);

    /**
     * @constructor
     * @param {Function} callback
     * @param {*} scope
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     */
    function ObservableVector(callback, scope) {
        var x = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
        var y = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;

        _classCallCheck(this, ObservableVector);

        /**
         * @private
         * @member {Function}
         */
        var _this = _possibleConstructorReturn(this, (ObservableVector.__proto__ || Object.getPrototypeOf(ObservableVector)).call(this, x, y));

        _this._callback = callback;

        /**
         * @private
         * @member {*}
         */
        _this._scope = scope || _this;
        return _this;
    }

    /**
     * @public
     * @member {Number}
     */


    _createClass(ObservableVector, [{
        key: 'set',


        /**
         * @override
         */
        value: function set() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this._x;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this._y;

            if (this._x !== x || this._y !== y) {
                this._x = x;
                this._y = y;
                this._callback.call(this._scope);
            }

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'add',
        value: function add() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

            return this.set(this._x + x, this._y + y);
        }

        /**
         * @override
         */

    }, {
        key: 'subtract',
        value: function subtract() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

            return this.set(this._x - x, this._y - y);
        }

        /**
         * @override
         */

    }, {
        key: 'multiply',
        value: function multiply() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;

            return this.set(this._x * x, this._y * y);
        }

        /**
         * @override
         */

    }, {
        key: 'divide',
        value: function divide() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;

            return this.set(this._x / x, this._y / y);
        }

        /**
         * @override
         */

    }, {
        key: 'normalize',
        value: function normalize() {
            var mag = this.magnitude;

            return this.set(this._x / mag, this._y / mag);
        }

        /**
         * @override
         */

    }, {
        key: 'copy',
        value: function copy(vector) {
            return this.set(vector.x, vector.y);
        }

        /**
         * @override
         */

    }, {
        key: 'clone',
        value: function clone() {
            return new ObservableVector(this._callback, this._scope, this._x, this._y);
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(ObservableVector.prototype.__proto__ || Object.getPrototypeOf(ObservableVector.prototype), 'destroy', this).call(this);

            this._callback = null;
            this._scope = null;
        }
    }, {
        key: 'x',
        get: function get() {
            return this._x;
        },
        set: function set(x) {
            if (this._x !== x) {
                this._x = x;
                this._callback.call(this._scope);
            }
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'y',
        get: function get() {
            return this._y;
        },
        set: function set(y) {
            if (this._y !== y) {
                this._y = y;
                this._callback.call(this._scope);
            }
        }
    }]);

    return ObservableVector;
}(_Vector3.default);

exports.default = ObservableVector;

/***/ }),
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Shape2 = __webpack_require__(7);

var _Shape3 = _interopRequireDefault(_Shape2);

var _Rectangle = __webpack_require__(4);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Vector
 * @extends {Shape}
 */
var Vector = function (_Shape) {
    _inherits(Vector, _Shape);

    /**
     * @constructor
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     */
    function Vector() {
        var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
        var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

        _classCallCheck(this, Vector);

        /**
         * @public
         * @member {Number}
         */
        var _this = _possibleConstructorReturn(this, (Vector.__proto__ || Object.getPrototypeOf(Vector)).call(this));

        _this._x = x;

        /**
         * @public
         * @member {Number}
         */
        _this._y = y;
        return _this;
    }

    /**
     * @override
     */


    _createClass(Vector, [{
        key: 'set',


        /**
         * @override
         */
        value: function set() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this._x;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this._y;

            this._x = x;
            this._y = y;

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'copy',
        value: function copy(vector) {
            this._x = vector.x;
            this._y = vector.y;

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'clone',
        value: function clone() {
            return new Vector(this._x, this._y);
        }

        /**
         * @override
         */

    }, {
        key: 'reset',
        value: function reset() {
            this.set(0, 0);
        }

        /**
         * @override
         */

    }, {
        key: 'toArray',
        value: function toArray() {
            var array = this._array || (this._array = new Float32Array(2));

            array[0] = this._x;
            array[1] = this._y;

            return array;
        }

        /**
         * @override
         */

    }, {
        key: 'getBounds',
        value: function getBounds() {
            if (!this._bounds) {
                this._bounds = new _Rectangle2.default();
            }

            return this._bounds.set(this._x, this._y, 0, 0);
        }

        /**
         * @override
         */

    }, {
        key: 'contains',
        value: function contains(shape) {
            return shape.type === _const.SHAPE.POINT && this._x === shape.x && this._y === shape.y;
        }

        /**
         * @public
         * @param {Vector} vector
         * @returns {Number}
         */

    }, {
        key: 'distanceTo',
        value: function distanceTo(vector) {
            var x = this._x - vector.x,
                y = this._y - vector.y;

            return Math.sqrt(x * x + y * y);
        }

        /**
         * @public
         * @chainable
         * @param {Number} [x=0]
         * @param {Number} [y=0]
         * @returns {Vector}
         */

    }, {
        key: 'add',
        value: function add() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

            this._x += x;
            this._y += y;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} [x=0]
         * @param {Number} [y=0]
         * @returns {Vector}
         */

    }, {
        key: 'subtract',
        value: function subtract() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

            this._x -= x;
            this._y -= y;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} [x=1]
         * @param {Number} [y=1]
         * @returns {Vector}
         */

    }, {
        key: 'multiply',
        value: function multiply() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;

            this._x *= x;
            this._y *= y;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} [x=1]
         * @param {Number} [y=1]
         * @returns {Vector}
         */

    }, {
        key: 'divide',
        value: function divide() {
            var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;
            var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;

            this._x /= x;
            this._y /= y;

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Vector}
         */

    }, {
        key: 'normalize',
        value: function normalize() {
            var mag = this.magnitude;

            this._x /= mag;
            this._y /= mag;

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Vector.prototype.__proto__ || Object.getPrototypeOf(Vector.prototype), 'destroy', this).call(this);

            this._x = null;
            this._y = null;
        }
    }, {
        key: 'type',
        get: function get() {
            return _const.SHAPE.POINT;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'x',
        get: function get() {
            return this._x;
        },
        set: function set(x) {
            this._x = x;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'y',
        get: function get() {
            return this._y;
        },
        set: function set(y) {
            this._y = y;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'magnitude',
        get: function get() {
            return Math.sqrt(this._x * this._x + this._y * this._y);
        }
    }]);

    return Vector;
}(_Shape3.default);

exports.default = Vector;

/***/ }),
/* 7 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _const = __webpack_require__(0);

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @abstract
 * @class Shape
 */
var Shape = function () {
  function Shape() {
    _classCallCheck(this, Shape);
  }

  _createClass(Shape, [{
    key: 'set',


    /**
     * @public
     * @chainable
     * @abstract
     */
    value: function set() {
      throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     * @param {Shape|Vector|Rectangle|Cirlce|Polygon} shape
     */

  }, {
    key: 'copy',
    value: function copy(shape) {
      // eslint-disable-line
      throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     * @returns {Shape|Vector|Rectangle|Cirlce|Polygon}
     */

  }, {
    key: 'clone',
    value: function clone() {
      throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     */

  }, {
    key: 'reset',
    value: function reset() {
      throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     * @returns {Float32Array}
     */

  }, {
    key: 'toArray',
    value: function toArray() {
      throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     * @returns {Rectangle}
     */

  }, {
    key: 'getBounds',
    value: function getBounds() {
      throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     * @param {Shape|Vector|Rectangle|Cirlce|Polygon} shape
     * @returns {Boolean}
     */

  }, {
    key: 'contains',
    value: function contains(shape) {
      // eslint-disable-line
      throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     * @param {Shape|Vector|Rectangle|Cirlce|Polygon} shape
     * @returns {Boolean}
     */

  }, {
    key: 'intersects',
    value: function intersects(shape) {
      // eslint-disable-line
      throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      if (this._array) {
        this._array.fill(0);
        this._array = null;
      }

      if (this._bounds) {
        this._bounds.destroy();
        this._bounds = null;
      }
    }
  }, {
    key: 'type',


    /**
     * @private
     * @member {Float32Array} _array
     */

    /**
     * @private
     * @member {Rectangle} _bounds
     */

    /**
     * @public
     * @abstract
     * @readonly
     * @member {Number}
     */
    get: function get() {
      return _const.SHAPE.NONE;
    }

    /**
     * @public
     * @abstract
     * @readonly
     * @member {Rectangle}
     */

  }, {
    key: 'bounds',
    get: function get() {
      return this.getBounds();
    }

    /**
     * @public
     * @abstract
     * @readonly
     * @member {Float32Array}
     */

  }, {
    key: 'array',
    get: function get() {
      return this.toArray();
    }
  }]);

  return Shape;
}();

exports.default = Shape;

/***/ }),
/* 8 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * | a | b | x |
 * | c | d | y |
 * | e | f | z |
 *
 * @class Matrix
 */
var Matrix = function () {

  /**
   * @constructor
   * @param {Number} [a=1]
   * @param {Number} [b=0]
   * @param {Number} [x=0]
   * @param {Number} [c=0]
   * @param {Number} [d=1]
   * @param {Number} [y=0]
   * @param {Number} [e=0]
   * @param {Number} [f=0]
   * @param {Number} [z=1]
   */
  function Matrix() {
    var a = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;
    var b = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    var x = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
    var c = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;
    var d = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 1;
    var y = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : 0;
    var e = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : 0;
    var f = arguments.length > 7 && arguments[7] !== undefined ? arguments[7] : 0;
    var z = arguments.length > 8 && arguments[8] !== undefined ? arguments[8] : 1;

    _classCallCheck(this, Matrix);

    /**
     * @public
     * @member {Number}
     */
    this.a = a;

    /**
     * @public
     * @member {Number}
     */
    this.b = b;

    /**
     * @public
     * @member {Number}
     */
    this.x = x;

    /**
     * @public
     * @member {Number}
     */
    this.c = c;

    /**
     * @public
     * @member {Number}
     */
    this.d = d;

    /**
     * @public
     * @member {Number}
     */
    this.y = y;

    /**
     * @public
     * @member {Number}
     */
    this.e = e;

    /**
     * @public
     * @member {Number}
     */
    this.f = f;

    /**
     * @public
     * @member {Number}
     */
    this.z = z;

    /**
     * @private
     * @member {Float32Array} _array
     */
  }

  /**
   * @public
   * @readonly
   * @member {Float32Array}
   */


  _createClass(Matrix, [{
    key: "set",


    /**
     * | a | b | x |
     * | c | d | y |
     * | e | f | z |
     *
     * @public
     * @chainable
     * @param {Number} a
     * @param {Number} b
     * @param {Number} x
     * @param {Number} c
     * @param {Number} d
     * @param {Number} y
     * @param {Number} e
     * @param {Number} f
     * @param {Number} z
     * @returns {Matrix}
     */
    value: function set(a, b, x, c, d, y, e, f, z) {
      this.a = a;
      this.b = b;
      this.x = x;
      this.c = c;
      this.d = d;
      this.y = y;
      this.e = e;
      this.f = f;
      this.z = z;

      return this;
    }

    /**
     * @public
     * @chainable
     * @param {Matrix} matrix
     * @returns {Matrix}
     */

  }, {
    key: "copy",
    value: function copy(matrix) {
      return this.set(matrix.a, matrix.b, matrix.x, matrix.c, matrix.d, matrix.y, matrix.e, matrix.f, matrix.z);
    }

    /**
     * @public
     * @returns {Matrix}
     */

  }, {
    key: "clone",
    value: function clone() {
      return new Matrix(this.a, this.b, this.x, this.c, this.d, this.y, this.e, this.f, this.z);
    }

    /**
     * @public
     * @chainable
     * @param {Matrix} matrix
     * @returns {Matrix}
     */

  }, {
    key: "multiply",
    value: function multiply(matrix) {
      return this.set(this.a * matrix.a + this.c * matrix.b + this.e * matrix.x, this.b * matrix.a + this.d * matrix.b + this.f * matrix.x, this.x * matrix.a + this.y * matrix.b + this.z * matrix.x, this.a * matrix.c + this.c * matrix.d + this.e * matrix.y, this.b * matrix.c + this.d * matrix.d + this.f * matrix.y, this.x * matrix.c + this.y * matrix.d + this.z * matrix.y, this.a * matrix.e + this.c * matrix.f + this.e * matrix.z, this.b * matrix.e + this.d * matrix.f + this.f * matrix.z, this.x * matrix.e + this.y * matrix.f + this.z * matrix.z);
    }

    /**
     * @public
     * @param {Boolean} [transpose=false]
     * @returns {Float32Array}
     */

  }, {
    key: "toArray",
    value: function toArray() {
      var transpose = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

      return transpose ? this.transposedArray : this.array;
    }

    /**
     * @public
     * @returns {Matrix}
     */

  }, {
    key: "reset",
    value: function reset() {
      return this.set(1, 0, 0, 0, 1, 0, 0, 0, 1);
    }

    /**
     * @public
     */

  }, {
    key: "destroy",
    value: function destroy() {
      if (this._array) {
        this._array.fill(0);
        this._array = null;
      }

      this.a = this.c = this.e = null;
      this.b = this.d = this.f = null;
      this.x = this.y = this.z = null;
    }

    /**
     * @public
     * @static
     * @param {...Matrix} matrices
     * @returns {Matrix}
     */

  }, {
    key: "array",
    get: function get() {
      var array = this._array || (this._array = new Float32Array(9));

      array[0] = this.a;
      array[1] = this.c;
      array[2] = this.e;

      array[3] = this.b;
      array[4] = this.d;
      array[5] = this.f;

      array[6] = this.x;
      array[7] = this.y;
      array[8] = this.z;

      return array;
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */

  }, {
    key: "transposedArray",
    get: function get() {
      var array = this._array || (this._array = new Float32Array(9));

      array[0] = this.a;
      array[1] = this.b;
      array[2] = this.x;

      array[3] = this.c;
      array[4] = this.d;
      array[5] = this.y;

      array[6] = this.e;
      array[7] = this.f;
      array[8] = this.z;

      return array;
    }
  }], [{
    key: "multiply",
    value: function multiply() {
      var result = new Matrix();

      for (var _len = arguments.length, matrices = Array(_len), _key = 0; _key < _len; _key++) {
        matrices[_key] = arguments[_key];
      }

      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = matrices[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var matrix = _step.value;

          result.multiply(matrix);
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      return result;
    }

    /**
     * @public
     * @static
     * @member {Matrix}
     */

  }, {
    key: "Identity",
    get: function get() {
      return new Matrix(1, 0, 0, 0, 1, 0, 0, 0, 1);
    }
  }]);

  return Matrix;
}();

exports.default = Matrix;

/***/ }),
/* 9 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _LauncherScene = __webpack_require__(10);

var _LauncherScene2 = _interopRequireDefault(_LauncherScene);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

window.addEventListener('load', function () {
    var game = new Exo.Game({
        basePath: 'assets/',
        width: 1280,
        height: 720,
        soundVolume: 0.5,
        musicVolume: 0.5,
        canvas: '#game-canvas'
    });

    indexedDB.deleteDatabase('game');

    game.loader.request.cache = 'no-cache';
    game.loader.database = new Exo.Database('game', 2);

    game.start(new _LauncherScene2.default());
}, false); /* global WebFont */

/***/ }),
/* 10 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _TitleScene = __webpack_require__(11);

var _TitleScene2 = _interopRequireDefault(_TitleScene);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Keyboard = Exo.Keyboard,
    Gamepad = Exo.Gamepad,
    degreesToRadians = Exo.utils.degreesToRadians;

/**
 * @class LauncherScene
 * @extends {Exo.Scene}
 */

var LauncherScene = function (_Exo$Scene) {
    _inherits(LauncherScene, _Exo$Scene);

    function LauncherScene() {
        _classCallCheck(this, LauncherScene);

        return _possibleConstructorReturn(this, (LauncherScene.__proto__ || Object.getPrototypeOf(LauncherScene)).apply(this, arguments));
    }

    _createClass(LauncherScene, [{
        key: 'load',


        /**
         * @override
         */
        value: function load(loader) {
            var _this2 = this;

            /**
             * @private
             * @member {jQuery}
             */
            this._$launcher = jQuery('.launcher');
            this._$launcher.removeClass('hidden');

            /**
             * @private
             * @member {jQuery}
             */
            this._$indicator = this._$launcher.find('.loading-indicator');
            this._$indicator.removeClass('finished');

            /**
             * @private
             * @member {jQuery}
             */
            this._$indicatorText = this._$indicator.find('.indicator-text');

            /**
             * @private
             * @member {HTMLImageElement}
             */
            this._indicatorProgress = this._$indicator.find('.indicator-progress')[0];

            /**
             * @private
             * @member {HTMLCanvasElement}
             */
            this._indicatorCanvas = this._$indicator.find('.indicator-canvas')[0];

            /**
             * @private
             * @member {CanvasRenderingContext2D}
             */
            this._indicatorContext = this._indicatorCanvas.getContext('2d');

            loader.on('progress', function (length, index, resource) {
                return _this2._renderProgress(index / length * 100);
            }).addList('texture', {
                'title/logo': 'image/title/logo.png',
                'title/background': 'image/title/background.jpg',
                'game/tileset': 'image/game/tileset.png',
                'game/player': 'image/game/player.png'
            }).addList('music', {
                'title/background': 'audio/title/background.ogg',
                'game/background': 'audio/game/background.ogg'
            }).addItem('font', 'menu', 'font/AndyBold/AndyBold.woff2', {
                family: 'AndyBold'
            }).load().then(function () {
                return _this2.game.trigger('scene:start');
            });

            this._renderProgress(0);
        }

        /**
         * @override
         */

    }, {
        key: 'init',
        value: function init() {

            /**
             * @private
             * @member {Function}
             */
            this._openTitleHandler = this._openTitle.bind(this);

            /**
             * @private
             * @member {Exo.Input}
             */
            this._playInput = new Exo.Input([Keyboard.Enter, Gamepad.Start, Gamepad.FaceButtonBottom]);

            this._playInput.on('trigger', this._openTitleHandler);

            this._$indicator.addClass('finished');
            this._$indicatorText.html('PLAY');
            this._$indicatorText.on('click', this._openTitleHandler);

            this.game.trigger('input:add', this._playInput);
        }

        /**
         * @override
         */

    }, {
        key: 'unload',
        value: function unload() {
            this.game.trigger('input:remove', this._playInput);
            this._$indicatorText.off('click', this._openTitleHandler);

            this._playInput.destroy();
            this._playInput = null;

            this._openTitleHandler = null;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(LauncherScene.prototype.__proto__ || Object.getPrototypeOf(LauncherScene.prototype), 'destroy', this).call(this);

            this._$launcher.addClass('hidden');

            this._$launcher = null;
            this._$indicator = null;
            this._$indicatorText = null;
            this._indicatorProgress = null;
            this._indicatorCanvas = null;
            this._indicatorContext = null;
        }

        /**
         * @private
         * @param {Number} percentage
         */

    }, {
        key: '_renderProgress',
        value: function _renderProgress(percentage) {
            var context = this._indicatorContext,
                canvas = this._indicatorCanvas,
                width = canvas.width,
                height = canvas.height,
                centerX = width / 2 | 0,
                centerY = height / 2 | 0,
                radius = (centerX + centerY) / 2 | 0,
                offsetAngle = 270;

            this._$indicatorText.html((percentage | 0) + '%');

            context.drawImage(this._indicatorProgress, 0, 0, width, height);
            context.beginPath();
            context.moveTo(centerX, centerY);
            context.arc(centerX, centerY, radius, degreesToRadians(offsetAngle), degreesToRadians(percentage * 3.6 + offsetAngle), true);
            context.clip();
            context.clearRect(0, 0, width, height);
        }

        /**
         * @private
         */

    }, {
        key: '_openTitle',
        value: function _openTitle() {
            this.game.trigger('scene:change', new _TitleScene2.default());
        }
    }]);

    return LauncherScene;
}(Exo.Scene);

exports.default = LauncherScene;

/***/ }),
/* 11 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _TitleMenuManager = __webpack_require__(12);

var _TitleMenuManager2 = _interopRequireDefault(_TitleMenuManager);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class TitleScene
 * @extends {Exo.Scene}
 */
var TitleScene = function (_Exo$Scene) {
  _inherits(TitleScene, _Exo$Scene);

  function TitleScene() {
    _classCallCheck(this, TitleScene);

    return _possibleConstructorReturn(this, (TitleScene.__proto__ || Object.getPrototypeOf(TitleScene)).apply(this, arguments));
  }

  _createClass(TitleScene, [{
    key: 'init',


    /**
     * @override
     */
    value: function init() {
      var resources = this.game.loader.resources;

      /**
       * @private
       * @member {TitleMenuManager}
       */
      this._menuManager = new _TitleMenuManager2.default(this.game);
      this._menuManager.enable('main');

      /**
       * @private
       * @member {Exo.Sprite}
       */
      this._titleBackground = new Exo.Sprite(resources.get('sprite', 'title/background'));

      /**
       * @private
       * @member {Exo.Music}
       */
      this._titleMusic = resources.get('music', 'title/background');

      this.game.trigger('media:play', this._titleMusic, {
        loop: true
      });
    }

    /**
     * @override
     */

  }, {
    key: 'update',
    value: function update(delta) {
      this._menuManager.update(delta);

      this.game.trigger('display:begin').trigger('display:render', this._titleBackground).trigger('display:render', this._menuManager).trigger('display:end');
    }

    /**
     * @override
     */

  }, {
    key: 'unload',
    value: function unload() {
      this._menuManager.destroy();
      this._menuManager = null;

      this._titleBackground.destroy();
      this._titleBackground = null;

      this._titleMusic.destroy();
      this._titleMusic = null;
    }
  }]);

  return TitleScene;
}(Exo.Scene);

exports.default = TitleScene;

/***/ }),
/* 12 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _MenuManager2 = __webpack_require__(13);

var _MenuManager3 = _interopRequireDefault(_MenuManager2);

var _MainMenu = __webpack_require__(14);

var _MainMenu2 = _interopRequireDefault(_MainMenu);

var _NewGameMenu = __webpack_require__(24);

var _NewGameMenu2 = _interopRequireDefault(_NewGameMenu);

var _LoadGameMenu = __webpack_require__(32);

var _LoadGameMenu2 = _interopRequireDefault(_LoadGameMenu);

var _SettingsMenu = __webpack_require__(33);

var _SettingsMenu2 = _interopRequireDefault(_SettingsMenu);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class TitleMenuManager
 * @extends {MenuManager}
 */
var TitleMenuManager = function (_MenuManager) {
    _inherits(TitleMenuManager, _MenuManager);

    /**
     * @constructor
     * @param {Exo.Game} game
     */
    function TitleMenuManager(game) {
        _classCallCheck(this, TitleMenuManager);

        var _this = _possibleConstructorReturn(this, (TitleMenuManager.__proto__ || Object.getPrototypeOf(TitleMenuManager)).call(this, game));

        _this.addMenu('main', new _MainMenu2.default(game));
        _this.addMenu('newGame', new _NewGameMenu2.default(game, 'main'));
        _this.addMenu('loadGame', new _LoadGameMenu2.default(game, 'main'));
        _this.addMenu('settings', new _SettingsMenu2.default(game, 'main'));

        _this.openMenu('main');
        return _this;
    }

    return TitleMenuManager;
}(_MenuManager3.default);

exports.default = TitleMenuManager;

/***/ }),
/* 13 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Keyboard = Exo.Keyboard,
    Gamepad = Exo.Gamepad;

/**
 * @class MenuManager
 */

var MenuManager = function () {

    /**
     * @constructor
     * @param {Exo.Game} game
     */
    function MenuManager(game) {
        _classCallCheck(this, MenuManager);

        /**
         * @private
         * @member {Exo.Game}
         */
        this._game = game;

        /**
         * @private
         * @member {Map.<String, Menu>}
         */
        this._menus = new Map();

        /**
         * @private
         * @member {?Menu}
         */
        this._currentMenu = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._enabled = false;

        /**
         * @private
         * @member {Exo.Input[]}
         */
        this._inputs = [new Exo.Input([Keyboard.Up, Gamepad.DPadUp, Gamepad.LeftStickUp], {
            context: this,
            start: function start() {
                if (this._currentMenu) {
                    this._currentMenu.onInputUp();
                }
            }
        }), new Exo.Input([Keyboard.Down, Gamepad.LeftStickDown, Gamepad.DPadDown], {
            context: this,
            start: function start() {
                if (this._currentMenu) {
                    this._currentMenu.onInputDown();
                }
            }
        }), new Exo.Input([Keyboard.Left, Gamepad.LeftStickLeft, Gamepad.DPadLeft], {
            context: this,
            start: function start() {
                if (this._currentMenu) {
                    this._currentMenu.onInputLeft();
                }
            }
        }), new Exo.Input([Keyboard.Right, Gamepad.LeftStickRight, Gamepad.DPadRight], {
            context: this,
            start: function start() {
                if (this._currentMenu) {
                    this._currentMenu.onInputRight();
                }
            }
        }), new Exo.Input([Keyboard.Enter, Gamepad.FaceButtonBottom], {
            context: this,
            start: function start() {
                if (this._currentMenu) {
                    this._currentMenu.onInputSelect();
                }
            }
        }), new Exo.Input([Keyboard.Backspace, Gamepad.FaceButtonRight], {
            context: this,
            start: function start() {
                if (this._currentMenu) {
                    this._currentMenu.onInputBack();
                }
            }
        })];
    }

    /**
     * @public
     * @param {String} startMenu
     */


    _createClass(MenuManager, [{
        key: 'enable',
        value: function enable(startMenu) {
            if (this._enabled) {
                return;
            }

            this._enabled = true;
            this._game.trigger('input:add', this._inputs);

            this.openMenu(startMenu);
        }

        /**
         * @public
         */

    }, {
        key: 'disable',
        value: function disable() {
            if (!this._enabled) {
                return;
            }

            this._enabled = false;

            this._game.trigger('input:remove', this._inputs);

            if (this._currentMenu) {
                this._currentMenu.reset();
                this._currentMenu = null;
            }
        }

        /**
         * @public
         * @param {String} name
         * @param {Menu} menu
         * @param {String} [previousMenu=null]
         */

    }, {
        key: 'addMenu',
        value: function addMenu(name, menu, previousMenu) {
            if (previousMenu) {
                menu.previousMenu = previousMenu;
            }

            this._menus.set(name, menu);

            menu.on('openMenu', this.openMenu, this);
            menu.on('openPreviousMenu', this.openPreviousMenu, this);
        }

        /**
         * @public
         * @param {String} name
         */

    }, {
        key: 'openMenu',
        value: function openMenu(name) {
            if (this._currentMenu) {
                this._currentMenu.reset();
            }

            this._currentMenu = this._menus.get(name) || null;

            if (this._currentMenu) {
                this._currentMenu.activate();
            }
        }

        /**
         * @public
         */

    }, {
        key: 'openPreviousMenu',
        value: function openPreviousMenu() {
            var currentMenu = this._currentMenu;

            if (currentMenu && currentMenu.previousMenu) {
                this.openMenu(currentMenu.previousMenu);
            }
        }

        /**
         * @public
         * @param {Exo.Time} delta
         */

    }, {
        key: 'update',
        value: function update(delta) {
            if (this._currentMenu) {
                this._currentMenu.update(delta);
            }
        }

        /**
         * @public
         * @param {Exo.DisplayManager} displayManager
         * @param {Exo.Matrix} worldTransform
         */

    }, {
        key: 'render',
        value: function render(displayManager, worldTransform) {
            if (this._currentMenu) {
                this._currentMenu.render(displayManager, worldTransform);
            }
        }

        /**
         * @public
         * @param {Boolean} [destroyChildren=false]
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            if (this._enabled) {
                this.disable();
            }

            this._menus.forEach(function (menu) {
                menu.destroy();
            });
            this._menus.clear();
            this._menus = null;

            this._currentMenu = null;
            this._game = null;
        }
    }]);

    return MenuManager;
}();

exports.default = MenuManager;

/***/ }),
/* 14 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Menu2 = __webpack_require__(1);

var _Menu3 = _interopRequireDefault(_Menu2);

var _MenuItem = __webpack_require__(2);

var _MenuItem2 = _interopRequireDefault(_MenuItem);

var _VersionText = __webpack_require__(17);

var _VersionText2 = _interopRequireDefault(_VersionText);

var _Sprite = __webpack_require__(18);

var _Sprite2 = _interopRequireDefault(_Sprite);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class MainMenu
 * @extends {Menu}
 */
var MainMenu = function (_Menu) {
  _inherits(MainMenu, _Menu);

  /**
   * @constructor
   * @param {Exo.Game} game
   * @param {String} parentMenu
   */
  function MainMenu(game) {
    var parentMenu = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

    _classCallCheck(this, MainMenu);

    var _this = _possibleConstructorReturn(this, (MainMenu.__proto__ || Object.getPrototypeOf(MainMenu)).call(this, game, parentMenu));

    var canvas = game.canvas,
        resources = game.loader.resources;

    /**
     * @private
     * @member {Exo.Sprite}
     */
    _this._gameLogo = new Exo.Sprite(resources.get('texture', 'title/logo'));
    _this._gameLogo.setOrigin(0.5, 0.8);
    _this._gameLogo.setPosition(canvas.width / 2, 50 + _this._gameLogo.height * 0.8);

    /**
     * @private
     * @member {MenuItem}
     */
    _this._newGameButton = new _MenuItem2.default('New Game');
    _this._newGameButton.setPosition(canvas.width / 2, canvas.height / 2);

    /**
     * @private
     * @member {MenuItem}
     */
    _this._loadGameButton = new _MenuItem2.default('Load Game', _this._newGameButton);

    /**
     * @private
     * @member {MenuItem}
     */
    _this._settingsButton = new _MenuItem2.default('Settings', _this._loadGameButton);

    /**
     * @private
     * @member {VersionText}
     */
    _this._versionText = new _VersionText2.default('Ver. 0.0.1', canvas.width, canvas.height);

    /**
     * @private
     * @member {Number}
     */
    _this._ticker = 0;

    _this._addItems();
    _this._addPaths();
    _this._addActions();

    _this.setStartChild(_this._newGameButton);
    return _this;
  }

  /**
   * @override
   */


  _createClass(MainMenu, [{
    key: 'update',
    value: function update(delta) {
      if (this._activeChild) {
        this._activeChild.update(delta);
      }

      this._ticker += delta.seconds;
      this._gameLogo.rotation = Math.sin(this._ticker * Math.PI / 2) * -10;
    }

    /**
     * @override
     */

  }, {
    key: 'reset',
    value: function reset() {
      if (this._activeChild) {
        this._activeChild.reset();
      }

      this._ticker = 0;
      this._gameLogo.rotation = 0;
    }
  }, {
    key: '_addItems',
    value: function _addItems() {
      this.addChild(this._gameLogo);
      this.addChild(this._versionText);
      this.addChild(this._newGameButton);
      this.addChild(this._loadGameButton);
      this.addChild(this._settingsButton);
    }
  }, {
    key: '_addPaths',
    value: function _addPaths() {
      this.addPath(this._newGameButton, this._loadGameButton, 'down', 'up');
      this.addPath(this._loadGameButton, this._settingsButton, 'down', 'up');
      this.addPath(this._settingsButton, this._newGameButton, 'down', 'up');
    }
  }, {
    key: '_addActions',
    value: function _addActions() {
      this.addAction(this._newGameButton, this.openMenu.bind(this, 'newGame'), 'select');
      this.addAction(this._loadGameButton, this.openMenu.bind(this, 'loadGame'), 'select');
      this.addAction(this._settingsButton, this.openMenu.bind(this, 'settings'), 'select');
    }

    /**
     * @override
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      _get(MainMenu.prototype.__proto__ || Object.getPrototypeOf(MainMenu.prototype), 'destroy', this).call(this);

      this._gameLogo = null;
      this._versionText = null;
      this._newGameButton = null;
      this._loadGameButton = null;
      this._settingsButton = null;
    }
  }]);

  return MainMenu;
}(_Menu3.default);

exports.default = MainMenu;

/***/ }),
/* 15 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class MenuPath
 */
var MenuPath = function () {

  /**
   * @constructor
   * @param {MenuItem} fromItem
   * @param {MenuItem} toItem
   * @param {String} input
   */
  function MenuPath(fromItem, toItem, input) {
    _classCallCheck(this, MenuPath);

    /**
     * @private
     * @member {MenuItem}
     */
    this._fromItem = fromItem;

    /**
     * @private
     * @member {MenuItem}
     */
    this._toItem = toItem;

    /**
     * @private
     * @member {String}
     */
    this._input = input;
  }

  /**
   * @public
   * @member {MenuItem}
   */


  _createClass(MenuPath, [{
    key: "destroy",


    /**
     * @public
     */
    value: function destroy() {
      this._fromItem = null;
      this._toItem = null;
      this._input = null;
    }
  }, {
    key: "fromItem",
    get: function get() {
      return this._fromItem;
    },
    set: function set(value) {
      this._fromItem = value;
    }

    /**
     * @public
     * @member {MenuItem}
     */

  }, {
    key: "toItem",
    get: function get() {
      return this._toItem;
    },
    set: function set(value) {
      this._toItem = value;
    }

    /**
     * @public
     * @member {String}
     */

  }, {
    key: "input",
    get: function get() {
      return this._input;
    },
    set: function set(value) {
      this._input = value;
    }
  }]);

  return MenuPath;
}();

exports.default = MenuPath;

/***/ }),
/* 16 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var emptyFunction = function emptyFunction() {
    // do nothing
};

/**
 * @class MenuAction
 */

var MenuAction = function () {

    /**
     * @constructor
     * @param {MenuItem} item
     * @param {Function} action
     * @param {String} [input=select]
     */
    function MenuAction(item, action) {
        var input = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 'select';

        _classCallCheck(this, MenuAction);

        /**
         * @private
         * @member {MenuItem}
         */
        this._item = item;

        /**
         * @private
         * @member {Function}
         */
        this._action = action || emptyFunction;

        /**
         * @private
         * @member {String}
         */
        this._input = input;
    }

    /**
     * @public
     * @member {MenuItem}
     * @memberof MenuAction#
     */


    _createClass(MenuAction, [{
        key: 'destroy',


        /**
         * @public
         */
        value: function destroy() {
            this._item = null;
            this._action = null;
            this._input = null;
        }
    }, {
        key: 'item',
        get: function get() {
            return this._item;
        },
        set: function set(value) {
            this._item = value;
        }

        /**
         * @public
         * @member {Function}
         * @memberof MenuAction#
         */

    }, {
        key: 'action',
        get: function get() {
            return this._action;
        },
        set: function set(value) {
            this._action = value;
        }

        /**
         * @public
         * @member {String}
         * @memberof MenuAction#
         */

    }, {
        key: 'input',
        get: function get() {
            return this._input;
        },
        set: function set(value) {
            this._input = value;
        }
    }]);

    return MenuAction;
}();

exports.default = MenuAction;

/***/ }),
/* 17 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class VersionText
 * @extends {Exo.Text}
 */
var VersionText = function (_Exo$Text) {
    _inherits(VersionText, _Exo$Text);

    /**
     * @constructor
     * @param {String} text
     * @param {Number} viewportWidth
     * @param {Number} viewportHeight
     */
    function VersionText(text, viewportWidth, viewportHeight) {
        _classCallCheck(this, VersionText);

        var _this = _possibleConstructorReturn(this, (VersionText.__proto__ || Object.getPrototypeOf(VersionText)).call(this, text, {
            fill: 'white',
            fontSie: 25,
            fontFamily: 'AndyBold',
            stroke: 'black',
            strokeThickness: 3
        }));

        _this.setOrigin(1, 1);
        _this.setPosition(viewportWidth - 10, viewportHeight);
        return _this;
    }

    return VersionText;
}(Exo.Text);

exports.default = VersionText;

/***/ }),
/* 18 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Renderable2 = __webpack_require__(19);

var _Renderable3 = _interopRequireDefault(_Renderable2);

var _Rectangle = __webpack_require__(4);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

var _Color = __webpack_require__(23);

var _Color2 = _interopRequireDefault(_Color);

var _ObservableVector = __webpack_require__(5);

var _ObservableVector2 = _interopRequireDefault(_ObservableVector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Sprite
 * @extends {Renderable}
 */
var Sprite = function (_Renderable) {
    _inherits(Sprite, _Renderable);

    /**
     * @constructor
     * @param {?Texture} texture
     */
    function Sprite(texture) {
        _classCallCheck(this, Sprite);

        /**
         * @private
         * @member {?Texture}
         */
        var _this = _possibleConstructorReturn(this, (Sprite.__proto__ || Object.getPrototypeOf(Sprite)).call(this));

        _this._texture = null;

        /**
         * 4 vertices with 5 properties:
         *
         * 2 = posCoordinates (x, y) +
         * 2 = texCoordinates (u, v) +
         * 1 = color     (ARGB uint)
         *
         * @private
         * @type {Float32Array}
         */
        _this._vertexData = new Float32Array(20);

        /**
         * @private
         * @member {Rectangle}
         */
        _this._textureRect = new _Rectangle2.default();

        /**
         * @private
         * @member {ObservableVector}
         */
        _this._size = new _ObservableVector2.default(_this._updatePositions, _this);

        /**
         * @private
         * @member {Color}
         */
        _this._tint = _Color2.default.White.clone();

        if (texture) {
            _this.texture = texture;
        }
        return _this;
    }

    /**
     * @public
     * @member {Texture}
     */


    _createClass(Sprite, [{
        key: 'getBounds',


        /**
         * @override
         */
        value: function getBounds() {
            return this._bounds.set(this.x, this.y, this.width, this.height);
        }

        /**
         * @override
         */

    }, {
        key: 'setOrigin',
        value: function setOrigin(x, y) {
            var absolute = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

            var bounds = this.bounds;

            this._dirtyTransform = true;

            if (absolute) {
                this._origin.set(x, y);
            } else {
                this._origin.set(x * bounds.width, y * bounds.height);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} width
         * @param {Number} height
         * @returns {Sprite}
         */

    }, {
        key: 'setSize',
        value: function setSize(width, height) {
            this._size.set(width, height);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Rectangle} rectangle
         * @param {Boolean} [updateSize=true]
         * @returns {Sprite}
         */

    }, {
        key: 'setTextureRect',
        value: function setTextureRect(rectangle) {
            var updateSize = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

            this._textureRect.copy(rectangle);

            if (updateSize) {
                this.setSize(rectangle.width, rectangle.height);
            }

            this._updatePositions();
            this._updateTexCoords();

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Texture} texture
         * @returns {Sprite}
         */

    }, {
        key: 'setTexture',
        value: function setTexture(texture) {
            this._texture = texture;
            this.setTextureRect(texture.frame);

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Sprite}
         */

    }, {
        key: 'updateTexture',
        value: function updateTexture() {
            this._texture.updateSource();

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'render',
        value: function render(displayManager, parentTransform) {
            if (!this.visible) {
                return this;
            }

            this._worldTransform.copy(parentTransform);
            this._worldTransform.multiply(this.transform);

            displayManager.getRenderer('sprite').render(this);

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Sprite.prototype.__proto__ || Object.getPrototypeOf(Sprite.prototype), 'destroy', this).call(this);

            this._texture = null;
            this._vertexData = null;

            this._textureRect.destroy();
            this._textureRect = null;

            this._size.destroy();
            this._size = null;

            this._tint.destroy();
            this._tint = null;
        }

        /**
         * @private
         */

    }, {
        key: '_updatePositions',
        value: function _updatePositions() {
            var vertexData = this._vertexData,
                bounds = this.getBounds();

            vertexData[0] = vertexData[1] = vertexData[5] = vertexData[8] = 0;
            vertexData[4] = vertexData[12] = bounds.width;
            vertexData[9] = vertexData[13] = bounds.height;
        }

        /**
         * @private
         */

    }, {
        key: '_updateTexCoords',
        value: function _updateTexCoords() {
            var vertexData = this._vertexData,
                texture = this._texture,
                textureRect = this._textureRect,
                left = textureRect.x / texture.width,
                top = textureRect.y / texture.height;

            vertexData[2] = vertexData[10] = left;
            vertexData[3] = vertexData[7] = top;
            vertexData[6] = vertexData[14] = left + textureRect.width / texture.width;
            vertexData[11] = vertexData[15] = top + textureRect.height / texture.height;
        }
    }, {
        key: 'texture',
        get: function get() {
            return this._texture;
        },
        set: function set(texture) {
            this.setTexture(texture);
        }

        /**
         * @public
         * @member {Rectangle}
         */

    }, {
        key: 'textureRect',
        get: function get() {
            return this._textureRect;
        },
        set: function set(textureRect) {
            this.setTextureRect(textureRect);
        }

        /**
         * @public
         * @member {Color}
         */

    }, {
        key: 'tint',
        get: function get() {
            return this._tint;
        },
        set: function set(tint) {
            this._tint.copy(tint);
        }

        /**
         * @public
         * @readonly
         * @member {Float32Array}
         */

    }, {
        key: 'vertexData',
        get: function get() {
            return this._vertexData;
        }

        /**
         * @public
         * @readonly
         * @member {Rectangle}
         */

    }, {
        key: 'bounds',
        get: function get() {
            return this.getBounds();
        }

        /**
         * @public
         * @member {ObservableVector}
         */

    }, {
        key: 'size',
        get: function get() {
            return this._size;
        },
        set: function set(size) {
            this._size.copy(size);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'width',
        get: function get() {
            return this._size.x;
        },
        set: function set(width) {
            this._size.x = width;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'height',
        get: function get() {
            return this._size.y;
        },
        set: function set(height) {
            this._size.y = height;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'left',
        get: function get() {
            return this.x - this.width + this.origin.x;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'top',
        get: function get() {
            return this.y - this.height + this.origin.y;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'right',
        get: function get() {
            return this.x + this.width + this.origin.x;
        }

        /**
         * @public
         * @readonly
         * @member {Number}
         */

    }, {
        key: 'bottom',
        get: function get() {
            return this.y + this.height + this.origin.y;
        }
    }]);

    return Sprite;
}(_Renderable3.default);

exports.default = Sprite;

/***/ }),
/* 19 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Transformable2 = __webpack_require__(20);

var _Transformable3 = _interopRequireDefault(_Transformable2);

var _Matrix = __webpack_require__(8);

var _Matrix2 = _interopRequireDefault(_Matrix);

var _Rectangle = __webpack_require__(4);

var _Rectangle2 = _interopRequireDefault(_Rectangle);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Renderable
 * @extends {Transformable}
 */
var Renderable = function (_Transformable) {
  _inherits(Renderable, _Transformable);

  /**
   * @constructor
   */
  function Renderable() {
    _classCallCheck(this, Renderable);

    /**
     * @private
     * @member {Matrix}
     */
    var _this = _possibleConstructorReturn(this, (Renderable.__proto__ || Object.getPrototypeOf(Renderable)).call(this));

    _this._worldTransform = new _Matrix2.default();

    /**
     * @private
     * @member {Rectangle}
     */
    _this._bounds = new _Rectangle2.default();

    /**
     * @private
     * @member {Boolean}
     */
    _this._visible = true;

    /**
     * @private
     * @member {?Renderable}
     */
    _this._parent = null;
    return _this;
  }

  /**
   * @public
   * @member {Matrix}
   */


  _createClass(Renderable, [{
    key: 'getBounds',


    /**
     * @public
     * @returns {Rectangle}
     */
    value: function getBounds() {
      return this._bounds.set(this.x, this.y, 0, 0);
    }

    /**
     * @public
     * @virtual
     * @chainable
     * @param {DisplayManager} renderManager
     * @param {Matrix} worldTransform
     * @returns {Renderable}
     */

  }, {
    key: 'render',
    value: function render(renderManager, worldTransform) {
      // eslint-disable-line
      return this;
    }

    /**
     * @override
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      _get(Renderable.prototype.__proto__ || Object.getPrototypeOf(Renderable.prototype), 'destroy', this).call(this);

      this._worldTransform.destroy();
      this._worldTransform = null;

      this._bounds.destroy();
      this._bounds = null;

      this._visible = null;
      this._parent = null;
    }
  }, {
    key: 'worldTransform',
    get: function get() {
      return this._worldTransform;
    },
    set: function set(worldTransform) {
      this._worldTransform.copy(worldTransform);
    }

    /**
     * @public
     * @member {Boolean}
     */

  }, {
    key: 'visible',
    get: function get() {
      return this._visible;
    },
    set: function set(visible) {
      this._visible = visible;
    }

    /**
     * @public
     * @member {?Renderable}
     */

  }, {
    key: 'parent',
    get: function get() {
      return this._parent;
    },
    set: function set(parent) {
      this._parent = parent;
    }

    /**
     * @public
     * @member {Rectangle}
     */

  }, {
    key: 'bounds',
    get: function get() {
      return this.getBounds();
    }
  }]);

  return Renderable;
}(_Transformable3.default);

exports.default = Renderable;

/***/ }),
/* 20 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _EventEmitter2 = __webpack_require__(21);

var _EventEmitter3 = _interopRequireDefault(_EventEmitter2);

var _ObservableVector = __webpack_require__(5);

var _ObservableVector2 = _interopRequireDefault(_ObservableVector);

var _Matrix = __webpack_require__(8);

var _Matrix2 = _interopRequireDefault(_Matrix);

var _const = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Transformable
 * @extends {EventEmitter}
 */
var Transformable = function (_EventEmitter) {
    _inherits(Transformable, _EventEmitter);

    /**
     * @constructor
     */
    function Transformable() {
        _classCallCheck(this, Transformable);

        /**
         * @private
         * @member {Matrix}
         */
        var _this = _possibleConstructorReturn(this, (Transformable.__proto__ || Object.getPrototypeOf(Transformable)).call(this));

        _this._transform = new _Matrix2.default();

        /**
         * @private
         * @member {ObservableVector}
         */
        _this._position = new _ObservableVector2.default(_this._setDirty, _this);

        /**
         * @private
         * @member {ObservableVector}
         */
        _this._scale = new _ObservableVector2.default(_this._setDirty, _this, 1, 1);

        /**
         * @private
         * @member {ObservableVector}
         */
        _this._origin = new _ObservableVector2.default(_this._setDirty, _this, 0, 0);

        /**
         * @private
         * @member {Number}
         */
        _this._rotation = 0;

        /**
         * @private
         * @member {Boolean}
         */
        _this._dirtyTransform = true;
        return _this;
    }

    /**
     * @public
     * @member {Number}
     */


    _createClass(Transformable, [{
        key: 'setPosition',


        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} y
         * @returns {Transformable}
         */
        value: function setPosition(x, y) {
            this._position.set(x, y);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} y
         * @returns {Transformable}
         */

    }, {
        key: 'setScale',
        value: function setScale(x, y) {
            this._scale.set(x, y);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} y
         * @returns {Transformable}
         */

    }, {
        key: 'setOrigin',
        value: function setOrigin(x, y) {
            this._origin.set(x, y);

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} angle
         * @returns {Transformable}
         */

    }, {
        key: 'setRotation',
        value: function setRotation(angle) {
            var rotation = angle % 360;

            this._rotation = rotation < 0 ? rotation + 360 : rotation;
            this._dirtyTransform = true;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Number} x
         * @param {Number} y
         * @returns {Transformable}
         */

    }, {
        key: 'move',
        value: function move(x, y) {
            return this.setPosition(this.x + x, this.y + y);
        }

        /**
         * @public
         * @chainable
         * @param {Number} angle
         * @returns {Transformable}
         */

    }, {
        key: 'rotate',
        value: function rotate(angle) {
            return this.setRotation(this._rotation + angle);
        }

        /**
         * @public
         * @chainable
         * @returns {Transformable}
         */

    }, {
        key: 'updateTransform',
        value: function updateTransform() {
            var transform = this._transform,
                position = this._position,
                scale = this._scale,
                origin = this._origin,
                angle = this._rotation * _const.DEG_TO_RAD,
                cos = Math.cos(angle),
                sin = Math.sin(angle),
                sxc = scale.x * cos,
                syc = scale.y * cos,
                sxs = scale.x * sin,
                sys = scale.y * sin;

            transform.a = sxc;
            transform.b = sys;
            transform.x = origin.x * -sxc - origin.y * sys + position.x;

            transform.c = -sxs;
            transform.d = syc;
            transform.y = origin.x * sxs - origin.y * syc + position.y;

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Transformable.prototype.__proto__ || Object.getPrototypeOf(Transformable.prototype), 'destroy', this).call(this);

            this._transform.destroy();
            this._transform = null;

            this._position.destroy();
            this._position = null;

            this._scale.destroy();
            this._scale = null;

            this._origin.destroy();
            this._origin = null;

            this._rotation = null;
            this._dirtyTransform = null;
        }

        /**
         * @private
         */

    }, {
        key: '_setDirty',
        value: function _setDirty() {
            this._dirtyTransform = true;
        }
    }, {
        key: 'x',
        get: function get() {
            return this._position.x;
        },
        set: function set(x) {
            this._position.x = x;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'y',
        get: function get() {
            return this._position.y;
        },
        set: function set(y) {
            this._position.y = y;
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'position',
        get: function get() {
            return this._position;
        },
        set: function set(position) {
            this._position.copy(position);
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'scale',
        get: function get() {
            return this._scale;
        },
        set: function set(scale) {
            this._scale.copy(scale);
        }

        /**
         * @public
         * @member {Vector}
         */

    }, {
        key: 'origin',
        get: function get() {
            return this._origin;
        },
        set: function set(origin) {
            this._origin.copy(origin);
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: 'rotation',
        get: function get() {
            return this._rotation;
        },
        set: function set(rotation) {
            this.setRotation(rotation);
        }

        /**
         * @public
         * @member {Matrix}
         */

    }, {
        key: 'transform',
        get: function get() {
            if (this._dirtyTransform) {
                this.updateTransform();
                this._dirtyTransform = false;
            }

            return this._transform;
        },
        set: function set(transform) {
            this._transform.copy(transform);
        }
    }]);

    return Transformable;
}(_EventEmitter3.default);

exports.default = Transformable;

/***/ }),
/* 21 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _utils = __webpack_require__(3);

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class EventEmitter
 */
var EventEmitter = function () {

    /**
     * @constructor
     */
    function EventEmitter() {
        _classCallCheck(this, EventEmitter);

        /**
         * @private
         * @member {Map<String, Object[]>}
         */
        this._events = new Map();
    }

    /**
     * @public
     * @readonly
     * @member {Map<String, Object[]>}
     */


    _createClass(EventEmitter, [{
        key: 'on',


        /**
         * @public
         * @chainable
         * @param {String} event
         * @param {Function} callback
         * @param {*} [context=this]
         * @returns {EventEmitter}
         */
        value: function on(event, callback) {
            var context = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : this;

            if (!this._events) {
                return this;
            }

            var events = this._events.get(event);

            if (!events) {
                this._events.set(event, [{
                    callback: callback,
                    context: context
                }]);
            } else {
                events.push({
                    callback: callback,
                    context: context
                });
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String} event
         * @param {Function} callback
         * @param {*} [context=this]
         * @returns {EventEmitter}
         */

    }, {
        key: 'once',
        value: function once(event, callback) {
            var _this = this;

            var context = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : this;

            var once = function once() {
                for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
                    args[_key] = arguments[_key];
                }

                _this.off(event, once, context);
                callback.call.apply(callback, [context].concat(args));
            };

            return this.on(event, once, context);
        }

        /**
         * @public
         * @chainable
         * @param {String} [event='*']
         * @param {Function} [callback]
         * @param {*} [context]
         * @returns {EventEmitter}
         */

    }, {
        key: 'off',
        value: function off() {
            var event = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '*';
            var callback = arguments[1];
            var context = arguments[2];

            if (!this._events) {
                return this;
            }

            var mapping = this._events,
                names = event === '*' ? Object.keys(mapping) : [event],
                lenNames = names.length;

            for (var i = 0; i < lenNames; i++) {
                var name = names[i],
                    events = mapping.get(name);

                /**
                 * Break for loop because only the one passed
                 * event name can be wrong / not available.
                 */
                if (!events) {
                    break;
                }

                if (!events.length) {
                    mapping.delete(name);
                    continue;
                }

                if (!callback && !context) {
                    (0, _utils.removeItems)(events, 0, events.length);
                    mapping.delete(name);
                    continue;
                }

                for (var j = events.length - 1; j >= 0; j--) {
                    if (callback && callback !== events[j].callback) {
                        continue;
                    }

                    if (context && context !== events[j].context) {
                        continue;
                    }

                    (0, _utils.removeItems)(events, j, 1);
                }

                if (!events.length) {
                    mapping.delete(name);
                }
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String} event
         * @param {...*} args
         * @returns {EventEmitter}
         */

    }, {
        key: 'trigger',
        value: function trigger(event) {
            if (!this._events) {
                return this;
            }

            var events = this._events.get(event);

            if (events) {
                for (var _len2 = arguments.length, args = Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
                    args[_key2 - 1] = arguments[_key2];
                }

                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = events[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var _event$callback;

                        var _event = _step.value;

                        (_event$callback = _event.callback).call.apply(_event$callback, [_event.context].concat(args));
                    }
                } catch (err) {
                    _didIteratorError = true;
                    _iteratorError = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion && _iterator.return) {
                            _iterator.return();
                        }
                    } finally {
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                }
            }

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            if (this._events.size) {
                var _iteratorNormalCompletion2 = true;
                var _didIteratorError2 = false;
                var _iteratorError2 = undefined;

                try {
                    for (var _iterator2 = this._events.values()[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                        var events = _step2.value;
                        var _iteratorNormalCompletion3 = true;
                        var _didIteratorError3 = false;
                        var _iteratorError3 = undefined;

                        try {
                            for (var _iterator3 = events[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                                var event = _step3.value;

                                event.callback = null;
                                event.context = null;
                            }
                        } catch (err) {
                            _didIteratorError3 = true;
                            _iteratorError3 = err;
                        } finally {
                            try {
                                if (!_iteratorNormalCompletion3 && _iterator3.return) {
                                    _iterator3.return();
                                }
                            } finally {
                                if (_didIteratorError3) {
                                    throw _iteratorError3;
                                }
                            }
                        }

                        events.length = 0;
                    }
                } catch (err) {
                    _didIteratorError2 = true;
                    _iteratorError2 = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion2 && _iterator2.return) {
                            _iterator2.return();
                        }
                    } finally {
                        if (_didIteratorError2) {
                            throw _iteratorError2;
                        }
                    }
                }
            }
            this._events.clear();
            this._events = null;
        }
    }, {
        key: 'events',
        get: function get() {
            return this._events;
        }
    }]);

    return EventEmitter;
}();

exports.default = EventEmitter;

/***/ }),
/* 22 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = {

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    webAudio: 'AudioContext' in window,

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    indexedDB: 'indexedDB' in window,

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    webGL: function () {
        var canvas = document.createElement('canvas'),
            supports = 'probablySupportsContext' in canvas ? 'probablySupportsContext' : 'supportsContext';

        if (supports in canvas) {
            return canvas[supports]('webgl') || canvas[supports]('experimental-webgl');
        }

        return 'WebGLRenderingContext' in window;
    }()
};

/***/ }),
/* 23 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _utils = __webpack_require__(3);

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Color
 */
var Color = function () {

  /**
   * @constructor
   * @param {Number} [r=0]
   * @param {Number} [g=0]
   * @param {Number} [b=0]
   * @param {Number} [a=1]
   */
  function Color() {
    var r = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
    var g = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    var b = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
    var a = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 1;

    _classCallCheck(this, Color);

    /**
     * @private
     * @member {Number}
     */
    this._r = r & 255;

    /**
     * @private
     * @member {Number}
     */
    this._g = g & 255;

    /**
     * @private
     * @member {Number}
     */
    this._b = b & 255;

    /**
     * @private
     * @member {Number}
     */
    this._a = (0, _utils.clamp)(a, 0, 1);

    /**
     * @private
     * @member {Float32Array} _array
     */
  }

  /**
   * @public
   * @member {Number}
   */


  _createClass(Color, [{
    key: 'set',


    /**
     * @public
     * @chainable
     * @param {Number} [r]
     * @param {Number} [g]
     * @param {Number} [b]
     * @param {Number} [a]
     * @returns {Color}
     */
    value: function set() {
      var r = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this._r;
      var g = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this._g;
      var b = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : this._b;
      var a = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : this._a;

      this.r = r;
      this.g = g;
      this.b = b;
      this.a = a;

      return this;
    }

    /**
     * @public
     * @returns {Object<String, Number>}
     */

  }, {
    key: 'getHsl',
    value: function getHsl() {
      var r = this.r / 255,
          g = this.g / 255,
          b = this.b / 255,
          min = Math.min(r, g, b),
          max = Math.max(r, g, b),
          d = max - min,
          l = (max + min) / 2;

      var h = 0,
          s = 0;

      if (max !== min) {
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
          case r:
            h = (g - b) / (d + (g < b ? 6 : 0));
            break;
          case g:
            h = (b - r) / (d + 2);
            break;
          case b:
            h = (r - g) / (d + 4);
            break;
        }

        h /= 6;
      }

      return {
        h: h,
        s: s,
        l: l
      };
    }

    /**
     * @public
     * @chainable
     * @param {Number} hue
     * @param {Number} saturation
     * @param {Number} lightness
     * @returns {Color}
     */

  }, {
    key: 'setHsl',
    value: function setHsl(hue, saturation, lightness) {
      var chroma = 1 - Math.abs(2 * lightness - 1) * saturation,
          huePrime = hue / 60,
          secondComponent = chroma * (1 - Math.abs(huePrime % 2 - 1)),
          lightnessAdjust = lightness - chroma / 2;

      var red = 0,
          green = 0,
          blue = 0;


      switch (huePrime | 0) {
        case 0:
          red = chroma;
          green = secondComponent;
          break;
        case 1:
          red = secondComponent;
          green = chroma;
          break;
        case 2:
          green = chroma;
          blue = secondComponent;
          break;
        case 3:
          green = secondComponent;
          blue = chroma;
          break;
        case 4:
          red = secondComponent;
          blue = chroma;
          break;
        case 5:
          red = chroma;
          blue = secondComponent;
          break;
      }

      this.r = Math.round((red + lightnessAdjust) * 255);
      this.g = Math.round((green + lightnessAdjust) * 255);
      this.b = Math.round((blue + lightnessAdjust) * 255);

      return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} percentage
     * @returns {Color}
     */

  }, {
    key: 'darken',
    value: function darken(percentage) {
      var value = Math.round(255 / 100 * percentage);

      this.r = Math.max(0, this.r - value);
      this.g = Math.max(0, this.g - value);
      this.b = Math.max(0, this.b - value);

      return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} percentage
     * @returns {Color}
     */

  }, {
    key: 'lighten',
    value: function lighten(percentage) {
      var value = Math.round(255 / 100 * percentage);

      this.r = Math.min(255, this.r + value);
      this.g = Math.min(255, this.g + value);
      this.b = Math.min(255, this.b + value);

      return this;
    }

    /**
     * @public
     * @chainable
     * @param {Color} color
     * @returns {Color}
     */

  }, {
    key: 'copy',
    value: function copy(color) {
      this._r = color.r;
      this._g = color.g;
      this._b = color.b;
      this._a = color.a;

      return this;
    }

    /**
     * @public
     * @returns {Color}
     */

  }, {
    key: 'clone',
    value: function clone() {
      return new Color(this._r, this._g, this._b, this._a);
    }

    /**
     * @public
     * @returns {Boolean}
     * @param {Color} color
     * @param {Boolean} [ignoreAlpha=false]
     */

  }, {
    key: 'equals',
    value: function equals(color) {
      var ignoreAlpha = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

      return this._r === color.r && this._g === color.g && this._b === color.b && (ignoreAlpha || this._a === color.a);
    }

    /**
     * @public
     * @param {Boolean} [normalized=false]
     * @returns {Float32Array}
     */

  }, {
    key: 'toArray',
    value: function toArray() {
      var normalized = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

      return normalized ? this.normalizedArray : this.array;
    }

    /**
     * @public
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      if (this._array) {
        this._array = null;
      }

      this._r = null;
      this._g = null;
      this._b = null;
      this._a = null;
    }
  }, {
    key: 'r',
    get: function get() {
      return this._r;
    },
    set: function set(red) {
      this._r = red & 255;
    }

    /**
     * @public
     * @member {Number}
     */

  }, {
    key: 'g',
    get: function get() {
      return this._g;
    },
    set: function set(green) {
      this._g = green & 255;
    }

    /**
     * @public
     * @member {Number}
     */

  }, {
    key: 'b',
    get: function get() {
      return this._b;
    },
    set: function set(blue) {
      this._b = blue & 255;
    }

    /**
     * @public
     * @member {Number}
     */

  }, {
    key: 'a',
    get: function get() {
      return this._a;
    },
    set: function set(alpha) {
      this._a = (0, _utils.clamp)(alpha, 0, 1);
    }

    /**
     * @public
     * @member {Number}
     */

  }, {
    key: 'rgb',
    get: function get() {
      return ((this._r & 255) << 16) + ((this._g & 255) << 8) + (this._b & 255);
    },
    set: function set(rgb) {
      this._r = rgb >> 16 & 255;
      this._g = rgb >> 8 & 255;
      this._b = rgb & 255;
    }

    /**
     * @public
     * @member {Number}
     */

  }, {
    key: 'rgba',
    get: function get() {
      return this._a && ((this._a * 255 | 0) << 24) + (this._b << 16) + (this._g << 8) + this._r >>> 0;
    },
    set: function set(rgba) {
      this._a = (rgba >> 24 & 255) / 255;
      this._r = rgba >> 16 & 255;
      this._g = rgba >> 8 & 255;
      this._b = rgba & 255;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */

  }, {
    key: 'hex',
    get: function get() {
      return (0, _utils.rgbToHex)(this._r, this._g, this._b);
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */

  }, {
    key: 'array',
    get: function get() {
      var array = this._array || (this._array = new Float32Array(4));

      array[0] = this._r;
      array[1] = this._g;
      array[2] = this._b;
      array[3] = this._a;

      return array;
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */

  }, {
    key: 'normalizedArray',
    get: function get() {
      var array = this._array || (this._array = new Float32Array(4));

      array[0] = this._r / 255;
      array[1] = this._g / 255;
      array[2] = this._b / 255;
      array[3] = this._a;

      return array;
    }
  }]);

  return Color;
}();

/**
 * @public
 * @static
 * @member {Color}
 */


exports.default = Color;
Color.AliceBlue = new Color(240, 248, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.AntiqueWhite = new Color(250, 235, 215, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Aqua = new Color(0, 255, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Aquamarine = new Color(127, 255, 212, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Azure = new Color(240, 255, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Beige = new Color(245, 245, 220, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Bisque = new Color(255, 228, 196, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Black = new Color(0, 0, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.BlanchedAlmond = new Color(255, 235, 205, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Blue = new Color(0, 0, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.BlueViolet = new Color(138, 43, 226, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Brown = new Color(165, 42, 42, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.BurlyWood = new Color(222, 184, 135, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.CadetBlue = new Color(95, 158, 160, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Chartreuse = new Color(127, 255, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Chocolate = new Color(210, 105, 30, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Coral = new Color(255, 127, 80, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.CornflowerBlue = new Color(100, 149, 237, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Cornsilk = new Color(255, 248, 220, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Crimson = new Color(220, 20, 60, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Cyan = new Color(0, 255, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkBlue = new Color(0, 0, 139, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkCyan = new Color(0, 139, 139, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkGoldenrod = new Color(184, 134, 11, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkGray = new Color(169, 169, 169, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkGreen = new Color(0, 100, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkKhaki = new Color(189, 183, 107, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkMagenta = new Color(139, 0, 139, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkOliveGreen = new Color(85, 107, 47, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkOrange = new Color(255, 140, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkOrchid = new Color(153, 50, 204, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkRed = new Color(139, 0, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkSalmon = new Color(233, 150, 122, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkSeaGreen = new Color(143, 188, 139, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkSlateBlue = new Color(72, 61, 139, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkSlateGray = new Color(47, 79, 79, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkTurquoise = new Color(0, 206, 209, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DarkViolet = new Color(148, 0, 211, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DeepPink = new Color(255, 20, 147, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DeepSkyBlue = new Color(0, 191, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DimGray = new Color(105, 105, 105, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.DodgerBlue = new Color(30, 144, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Firebrick = new Color(178, 34, 34, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.FloralWhite = new Color(255, 250, 240, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.ForestGreen = new Color(34, 139, 34, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Fuchsia = new Color(255, 0, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Gainsboro = new Color(220, 220, 220, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.GhostWhite = new Color(248, 248, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Gold = new Color(255, 215, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Goldenrod = new Color(218, 165, 32, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Gray = new Color(128, 128, 128, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Green = new Color(0, 128, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.GreenYellow = new Color(173, 255, 47, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Honeydew = new Color(240, 255, 240, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.HotPink = new Color(255, 105, 180, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.IndianRed = new Color(205, 92, 92, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Indigo = new Color(75, 0, 130, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Ivory = new Color(255, 255, 240, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Khaki = new Color(240, 230, 140, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Lavender = new Color(230, 230, 250, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LavenderBlush = new Color(255, 240, 245, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LawnGreen = new Color(124, 252, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LemonChiffon = new Color(255, 250, 205, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightBlue = new Color(173, 216, 230, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightCoral = new Color(240, 128, 128, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightCyan = new Color(224, 255, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightGoldenrodYellow = new Color(250, 250, 210, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightGray = new Color(211, 211, 211, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightGreen = new Color(144, 238, 144, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightPink = new Color(255, 182, 193, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightSalmon = new Color(255, 160, 122, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightSeaGreen = new Color(32, 178, 170, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightSkyBlue = new Color(135, 206, 250, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightSlateGray = new Color(119, 136, 153, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightSteelBlue = new Color(176, 196, 222, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LightYellow = new Color(255, 255, 224, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Lime = new Color(0, 255, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.LimeGreen = new Color(50, 205, 50, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Linen = new Color(250, 240, 230, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Magenta = new Color(255, 0, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Maroon = new Color(128, 0, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MediumAquamarine = new Color(102, 205, 170, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MediumBlue = new Color(0, 0, 205, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MediumOrchid = new Color(186, 85, 211, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MediumPurple = new Color(147, 112, 219, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MediumSeaGreen = new Color(60, 179, 113, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MediumSlateBlue = new Color(123, 104, 238, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MediumSpringGreen = new Color(0, 250, 154, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MediumTurquoise = new Color(72, 209, 204, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MediumVioletRed = new Color(199, 21, 133, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MidnightBlue = new Color(25, 25, 112, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MintCream = new Color(245, 255, 250, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.MistyRose = new Color(255, 228, 225, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Moccasin = new Color(255, 228, 181, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.NavajoWhite = new Color(255, 222, 173, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Navy = new Color(0, 0, 128, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.OldLace = new Color(253, 245, 230, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Olive = new Color(128, 128, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.OliveDrab = new Color(107, 142, 35, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Orange = new Color(255, 165, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.OrangeRed = new Color(255, 69, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Orchid = new Color(218, 112, 214, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.PaleGoldenrod = new Color(238, 232, 170, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.PaleGreen = new Color(152, 251, 152, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.PaleTurquoise = new Color(175, 238, 238, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.PaleVioletRed = new Color(219, 112, 147, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.PapayaWhip = new Color(255, 239, 213, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.PeachPuff = new Color(255, 218, 185, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Peru = new Color(205, 133, 63, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Pink = new Color(255, 192, 203, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Plum = new Color(221, 160, 221, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.PowderBlue = new Color(176, 224, 230, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Purple = new Color(128, 0, 128, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Red = new Color(255, 0, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.RosyBrown = new Color(188, 143, 143, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.RoyalBlue = new Color(65, 105, 225, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.SaddleBrown = new Color(139, 69, 19, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Salmon = new Color(250, 128, 114, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.SandyBrown = new Color(244, 164, 96, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.SeaGreen = new Color(46, 139, 87, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.SeaShell = new Color(255, 245, 238, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Sienna = new Color(160, 82, 45, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Silver = new Color(192, 192, 192, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.SkyBlue = new Color(135, 206, 235, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.SlateBlue = new Color(106, 90, 205, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.SlateGray = new Color(112, 128, 144, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Snow = new Color(255, 250, 250, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.SpringGreen = new Color(0, 255, 127, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.SteelBlue = new Color(70, 130, 180, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Tan = new Color(210, 180, 140, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Teal = new Color(0, 128, 128, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Thistle = new Color(216, 191, 216, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Tomato = new Color(255, 99, 71, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.TransparentBlack = new Color(0, 0, 0, 0);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.TransparentWhite = new Color(255, 255, 255, 0);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Turquoise = new Color(64, 224, 208, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Violet = new Color(238, 130, 238, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Wheat = new Color(245, 222, 179, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.White = new Color(255, 255, 255, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.WhiteSmoke = new Color(245, 245, 245, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.Yellow = new Color(255, 255, 0, 1);

/**
 * @public
 * @static
 * @member {Color}
 */
Color.YellowGreen = new Color(154, 205, 50, 1);

/***/ }),
/* 24 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Menu2 = __webpack_require__(1);

var _Menu3 = _interopRequireDefault(_Menu2);

var _MenuItem = __webpack_require__(2);

var _MenuItem2 = _interopRequireDefault(_MenuItem);

var _GameScene = __webpack_require__(25);

var _GameScene2 = _interopRequireDefault(_GameScene);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class NewGameMenu
 * @extends {Menu}
 */
var NewGameMenu = function (_Menu) {
    _inherits(NewGameMenu, _Menu);

    /**
     * @constructor
     * @param {Exo.Game} game
     * @param {?String} [parentMenu=null]
     */
    function NewGameMenu(game, parentMenu) {
        _classCallCheck(this, NewGameMenu);

        var _this = _possibleConstructorReturn(this, (NewGameMenu.__proto__ || Object.getPrototypeOf(NewGameMenu)).call(this, game, parentMenu));

        var canvas = game.canvas;

        /**
         * @private
         * @member {MenuItem}
         */
        _this._newGameTitle = new _MenuItem2.default('New Game:');
        _this._newGameTitle.setPosition(canvas.width / 2, canvas.height / 3);

        /**
         * @private
         * @member {MenuItem}
         */
        _this._createWorldButton = new _MenuItem2.default('Create World', _this._newGameTitle);

        /**
         * @private
         * @member {MenuItem}
         */
        _this._createCharacterButton = new _MenuItem2.default('Create Character', _this._createWorldButton);

        /**
         * @private
         * @member {MenuItem}
         */
        _this._backButton = new _MenuItem2.default('Back', _this._createCharacterButton);

        _this._addItems();
        _this._addPaths();
        _this._addActions();

        _this.setStartChild(_this._createWorldButton);
        return _this;
    }

    _createClass(NewGameMenu, [{
        key: '_addItems',
        value: function _addItems() {
            this.addChild(this._newGameTitle);
            this.addChild(this._createWorldButton);
            this.addChild(this._createCharacterButton);
            this.addChild(this._backButton);
        }
    }, {
        key: '_addPaths',
        value: function _addPaths() {
            this.addPath(this._createWorldButton, this._createCharacterButton, 'down', 'up');
            this.addPath(this._createCharacterButton, this._backButton, 'down', 'up');
            this.addPath(this._backButton, this._createWorldButton, 'down', 'up');
        }
    }, {
        key: '_addActions',
        value: function _addActions() {
            this.addAction(this._createWorldButton, this._onSelectCreateWorld.bind(this), 'select');
            this.addAction(this._createCharacterButton, this._onSelectCreateCharacter.bind(this), 'select');
            this.addAction(this._backButton, this.openPreviousMenu.bind(this), 'select');
        }
    }, {
        key: '_onSelectCreateWorld',
        value: function _onSelectCreateWorld() {
            this._game.trigger('scene:change', new _GameScene2.default());
        }
    }, {
        key: '_onSelectCreateCharacter',
        value: function _onSelectCreateCharacter() {
            this._game.trigger('scene:change', new _GameScene2.default());
        }
    }, {
        key: 'destroy',
        value: function destroy() {
            _get(NewGameMenu.prototype.__proto__ || Object.getPrototypeOf(NewGameMenu.prototype), 'destroy', this).call(this);

            this._newGameTitle = null;
            this._createWorldButton = null;
            this._createCharacterButton = null;
            this._backButton = null;
        }
    }]);

    return NewGameMenu;
}(_Menu3.default);

exports.default = NewGameMenu;

/***/ }),
/* 25 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _WorldMap = __webpack_require__(26);

var _WorldMap2 = _interopRequireDefault(_WorldMap);

var _Player = __webpack_require__(29);

var _Player2 = _interopRequireDefault(_Player);

var _Tileset = __webpack_require__(30);

var _Tileset2 = _interopRequireDefault(_Tileset);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Keyboard = Exo.Keyboard,
    Gamepad = Exo.Gamepad,
    clamp = Exo.utils.clamp;

/**
 * @class GameScene
 * @extends {Exo.Scene}
 */

var GameScene = function (_Exo$Scene) {
    _inherits(GameScene, _Exo$Scene);

    function GameScene() {
        _classCallCheck(this, GameScene);

        return _possibleConstructorReturn(this, (GameScene.__proto__ || Object.getPrototypeOf(GameScene)).apply(this, arguments));
    }

    _createClass(GameScene, [{
        key: 'init',


        /**
         * @override
         */
        value: function init() {
            var game = this.game,
                resources = game.loader.resources;

            /**
             * @private
             * @member {WorldMap}
             */
            this._worldMap = new _WorldMap2.default(new _Tileset2.default(resources.get('texture', 'game/tileset'), 32));

            /**
             * @private
             * @member {Player}
             */
            this._player = new _Player2.default(resources.get('texture', 'game/player'));
            this._player.setPosition(this._worldMap.pixelWidth / 2, this._worldMap.pixelHeight / 2);

            /**
             * @private
             * @member {Exo.View}
             */
            this._camera = new Exo.View(new Exo.Rectangle(0, 0, game.canvas.width, game.canvas.height));

            /**
             * @private
             * @member {Exo.Music}
             */
            this._backgroundMusic = resources.get('music', 'game/background');

            /**
             * @private
             * @member {Boolean}
             */
            this._paused = false;

            /**
             * @private
             * @member {Exo.Input[]}
             */
            this._inputs = [new Exo.Input([Keyboard.Escape, Gamepad.Start], {
                context: this,
                trigger: function trigger() {
                    this._paused = !this._paused;

                    if (this._paused) {
                        // show pause menu
                    } else {
                            // hide pause menu
                        }
                }
            }), new Exo.Input([Keyboard.Up, Keyboard.W, Gamepad.LeftStickUp, Gamepad.DPadUp], {
                context: this,
                active: function active(value) {
                    this._movePlayer(0, value * -1);
                }
            }), new Exo.Input([Keyboard.Down, Keyboard.S, Gamepad.LeftStickDown, Gamepad.DPadDown], {
                context: this,
                active: function active(value) {
                    this._movePlayer(0, value);
                }
            }), new Exo.Input([Keyboard.Left, Keyboard.A, Gamepad.LeftStickLeft, Gamepad.DPadLeft], {
                context: this,
                active: function active(value) {
                    this._movePlayer(value * -1, 0);
                }
            }), new Exo.Input([Keyboard.Right, Keyboard.D, Gamepad.LeftStickRight, Gamepad.DPadRight], {
                context: this,
                active: function active(value) {
                    this._movePlayer(value, 0);
                }
            }), new Exo.Input([Keyboard.Shift, Gamepad.RightTriggerTop], {
                context: this,
                start: function start() {
                    this._player.running = true;
                },
                stop: function stop() {
                    this._player.running = false;
                }
            })];

            this.game.trigger('input:add', this._inputs);

            game.trigger('media:play', this._backgroundMusic, {
                loop: true
            });

            this._updateCamera();
        }

        /**
         * @override
         */

    }, {
        key: 'update',
        value: function update(delta) {
            this._worldMap.render(this.game, this._camera);

            this.game.trigger('display:begin').trigger('display:render', this._player).trigger('display:end');
        }

        /**
         * @override
         */

    }, {
        key: 'unload',
        value: function unload() {
            this.game.trigger('input:remove', this._inputs, true);

            this._worldMap.destroy();
            this._worldMap = null;

            this._player.destroy();
            this._player = null;

            this._camera.destroy();
            this._camera = null;

            this._backgroundMusic.destroy();
            this._backgroundMusic = null;

            this._inputs.length = 0;
            this._inputs = null;
        }

        /**
         * @private
         * @param {Number} x
         * @param {Number} y
         */

    }, {
        key: '_movePlayer',
        value: function _movePlayer(x, y) {
            var player = this._player,
                worldMap = this._worldMap;

            player.move(x, y);

            player.setPosition(clamp(player.x, 0, worldMap.pixelWidth), clamp(player.y, 0, worldMap.pixelHeight));

            this._updateCamera();
        }

        /**
         * @private
         */

    }, {
        key: '_updateCamera',
        value: function _updateCamera() {
            var player = this._player,
                worldMap = this._worldMap,
                camera = this._camera,
                offsetWidth = camera.width / 2,
                offsetHeight = camera.height / 2;

            camera.setCenter(clamp(player.x, offsetWidth, worldMap.pixelWidth - offsetWidth), clamp(player.y, offsetHeight, worldMap.pixelHeight - offsetHeight));

            this.game.trigger('display:view', camera);
        }
    }]);

    return GameScene;
}(Exo.Scene);

exports.default = GameScene;

/***/ }),
/* 26 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _MapGenerator = __webpack_require__(27);

var _MapGenerator2 = _interopRequireDefault(_MapGenerator);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var clamp = Exo.utils.clamp;

/**
 * @class WorldMap
 */

var WorldMap = function () {

  /**
   * @constructor
   * @param {Tileset} tileset
   */
  function WorldMap(tileset) {
    _classCallCheck(this, WorldMap);

    /**
     * @private
     * @member {Number}
     */
    this._width = 256;

    /**
     * @private
     * @member {Number}
     */
    this._height = 256;

    /**
     * @private
     * @member {Number}
     */
    this._tileSize = 64;

    /**
     * @private
     * @member {Tileset}
     */
    this._tileset = tileset;

    /**
     * @private
     * @member {MapGenerator}
     */
    this._mapGenerator = new _MapGenerator2.default();

    /**
     * @private
     * @member {Number[]}
     */
    this._mapData = this._mapGenerator.generate(this._width, this._height);

    /**
     * @private
     * @member {Exo.Sprite}
     */
    this._tile = new Exo.Sprite(tileset.texture);
    this._tile.setSize(this._tileSize, this._tileSize);
  }

  /**
   * @public
   * @readonly
   * @member {Number}
   */


  _createClass(WorldMap, [{
    key: 'render',


    /**
     * @public
     * @param {Exo.Game} game
     * @param {Exo.View} camera
     */
    value: function render(game, camera) {
      var width = this._width,
          height = this._height,
          mapData = this._mapData,
          tileset = this._tileset,
          tileSize = this._tileSize,
          tile = this._tile,
          tilesHorizontal = camera.width / tileSize + 2 | 0,
          tilesVertical = camera.height / tileSize + 2 | 0,
          startTileX = clamp(camera.left / tileSize, 0, width - tilesHorizontal) | 0,
          startTileY = clamp(camera.top / tileSize, 0, height - tilesVertical) | 0,
          startTileIndex = startTileY * width + startTileX,
          tilesTotal = tilesHorizontal * tilesVertical;

      game.trigger('display:begin');

      for (var i = 0; i < tilesTotal; i++) {
        var x = i % tilesHorizontal | 0,
            y = i / tilesHorizontal | 0,
            index = startTileIndex + (y * width + x);

        tileset.setBlock(tile, mapData[index]);

        tile.x = (startTileX + x) * tileSize;
        tile.y = (startTileY + y) * tileSize;

        game.trigger('display:render', tile);
      }

      game.trigger('display:end');
    }
  }, {
    key: 'pixelWidth',
    get: function get() {
      return this._width * this._tileSize;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */

  }, {
    key: 'pixelHeight',
    get: function get() {
      return this._height * this._tileSize;
    }
  }]);

  return WorldMap;
}();

exports.default = WorldMap;

/***/ }),
/* 27 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _PerlinNoiseGenerator = __webpack_require__(28);

var _PerlinNoiseGenerator2 = _interopRequireDefault(_PerlinNoiseGenerator);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class MapGenerator
 */
var MapGenerator = function () {

    /**
     * @constructor
     */
    function MapGenerator() {
        _classCallCheck(this, MapGenerator);

        /**
         * @private
         * @member {PerlinNoiseGenerator}
         */
        this._noiseGenerator = new _PerlinNoiseGenerator2.default();

        /**
         * @private
         * @member {Number}
         */
        this._frequency = 1;

        /**
         * @private
         * @member {Number}
         */
        this._octaves = 16;
    }

    /**
     * @public
     * @param {Number} width
     * @param {Number} height
     * @returns {Number[]}
     */


    _createClass(MapGenerator, [{
        key: 'generate',
        value: function generate(width, height) {
            var particleMap = new Uint8Array(width * height),
                map = this._noiseGenerator.generate(width, height, this._frequency, this._octaves);

            for (var i = 0; i < ~~(width * height * 0.85); i++) {
                var choices = [];

                var x = MapGenerator.getRandomInt(15, width - 16),
                    y = MapGenerator.getRandomInt(15, height - 16),
                    choice = void 0;

                for (var j = 0; j < ~~(width * height * 0.05); j++) {
                    var index = y * width + x,
                        currentValue = particleMap[index] = Math.max(0, Math.min(255, particleMap[index] + 7));

                    choices.length = 0;

                    if (x - 1 > 0 && particleMap[index - 1] <= currentValue) {
                        choices.push({
                            x: -1,
                            y: 0
                        });
                    }

                    if (x + 1 < width - 1 && particleMap[index + 1] <= currentValue) {
                        choices.push({
                            x: 1,
                            y: 0
                        });
                    }

                    if (y - 1 > 0 && particleMap[index - width] <= currentValue) {
                        choices.push({
                            x: 0,
                            y: -1
                        });
                    }

                    if (y + 1 < height - 1 && particleMap[index + width] <= currentValue) {
                        choices.push({
                            x: 0,
                            y: 1
                        });
                    }

                    if (choices.length === 0) {
                        break;
                    }

                    choice = MapGenerator.getRandomChoice(choices);

                    x += choice.x;
                    y += choice.y;
                }
            }

            for (var _y = 0; _y < height; _y++) {
                for (var _x = 0; _x < width; _x++) {
                    var _index = _y * width + _x;

                    map[_index] *= particleMap[_index] / 255;
                }
            }

            MapGenerator.smoothen(map, width, height);

            return map;
        }

        /**
         * @public
         * @static
         * @param {Number[]} map
         * @param {Number} width
         * @param {Number} height
         */

    }], [{
        key: 'smoothen',
        value: function smoothen(map, width, height) {
            for (var y = 0; y < height; y++) {
                for (var x = 0; x < width; x++) {
                    var lowX = x - 1,
                        highX = x + 1,
                        lowY = y - 1,
                        highY = y + 1;

                    var average = 0,
                        times = 0;

                    if (lowX >= 0) {
                        average += map[y * width + lowX];
                        times++;
                    }

                    if (highX < width - 1) {
                        average += map[y * width + highX];
                        times++;
                    }

                    if (lowY >= 0) {
                        average += map[lowY * width + x];
                        times++;
                    }

                    if (highY < height - 1) {
                        average += map[highY * width + x];
                        times++;
                    }

                    if (lowX >= 0 && lowY >= 0) {
                        average += map[lowY * width + lowX];
                        times++;
                    }

                    if (highX < width && lowY >= 0) {
                        average += map[lowY * width + highX];
                        times++;
                    }

                    if (lowX >= 0 && highY < height) {
                        average += map[highY * width + lowX];
                        times++;
                    }

                    if (highX < width && highY < height) {
                        average += map[highY * width + highX];
                        times++;
                    }

                    average += map[y * width + x];
                    times++;

                    map[y * width + x] = average / times;
                }
            }
        }

        /**
         * @public
         * @static
         * @param {Number} min
         * @param {Number} max
         * @returns {Number}
         */

    }, {
        key: 'getRandomInt',
        value: function getRandomInt(min, max) {
            return (Math.random() * (max - min + 1) | 0) + min;
        }

        /**
         * @public
         * @static
         * @param {Object[]} choices
         * @returns {Object}
         */

    }, {
        key: 'getRandomChoice',
        value: function getRandomChoice(choices) {
            return choices[Math.random() * choices.length | 0];
        }
    }]);

    return MapGenerator;
}();

exports.default = MapGenerator;

/***/ }),
/* 28 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class PerlinNoiseGenerator
 */
var PerlinNoiseGenerator = function () {

    /**
     * @constructor
     */
    function PerlinNoiseGenerator() {
        _classCallCheck(this, PerlinNoiseGenerator);

        /**
         * @private
         * @member {?Float32Array}
         */
        this._noise = null;

        /**
         * @private
         * @member {Number}
         */
        this._width = 0;

        /**
         * @private
         * @member {Number}
         */
        this._height = 0;
    }

    /**
     * @public
     * @param {Number} width
     * @param {Number} height
     * @param {Number} frequency
     * @param {Number} octaves
     * @returns {Number[]}
     */


    _createClass(PerlinNoiseGenerator, [{
        key: "generate",
        value: function generate(width, height, frequency, octaves) {
            var result = [],
                length = width * height;

            if (!this._noise || width !== this._width || height !== this._height) {
                this._noise = new Float32Array(length);
                this._width = width;
                this._height = height;
            }

            for (var i = 0; i < length; i++) {
                this._noise[i] = Math.random();
            }

            for (var _i = 0; _i < length; _i++) {
                result[_i] = this.turbulence(_i % width * frequency, _i / width * frequency, octaves) | 0;
            }

            return result;
        }

        /**
         * @public
         * @param {Number} x
         * @param {Number} y
         * @param {Number} size
         * @returns {Number}
         */

    }, {
        key: "turbulence",
        value: function turbulence(x, y, size) {
            var initialSize = size;
            var value = 0;

            while (size >= 1) {
                value += this.getSmoothNoise(x / size, y / size) * size;
                size /= 2;
            }

            return 128 * value / initialSize;
        }

        /**
         * @public
         * @param {Number} x
         * @param {Number} y
         * @returns {Number}
         */

    }, {
        key: "getSmoothNoise",
        value: function getSmoothNoise(x, y) {
            var noise = this._noise,
                width = this._width,
                height = this._height,
                roundX = ~~x,
                roundY = ~~y,
                fractalX = x - roundX,
                fractalY = y - roundY,
                x1 = (roundX + width) % width,
                y1 = (roundY + height) % height,
                x2 = (x1 + width - 1) % width,
                y2 = (y1 + height - 1) % height;

            var value = fractalX * fractalY * noise[y1 * width + x1];

            value += fractalX * (1 - fractalY) * noise[y2 * width + x1];
            value += (1 - fractalX) * fractalY * noise[y1 * width + x2];
            value += (1 - fractalX) * (1 - fractalY) * noise[y2 * width + x2];

            return value;
        }
    }]);

    return PerlinNoiseGenerator;
}();

exports.default = PerlinNoiseGenerator;

/***/ }),
/* 29 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var FACE_DIRECTION = {
    UP: 0,
    RIGHT: 1,
    DOWN: 2,
    LEFT: 3
},
    playerWidth = 96,
    playerHeight = 96;

/**
 * @class Player
 * @extends {Exo.Sprite}
 */

var Player = function (_Exo$Sprite) {
    _inherits(Player, _Exo$Sprite);

    /**
     * @constructor
     * @param {Exo.Texture} texture
     */
    function Player(texture) {
        _classCallCheck(this, Player);

        /**
         * @private
         * @member {Number}
         */
        var _this = _possibleConstructorReturn(this, (Player.__proto__ || Object.getPrototypeOf(Player)).call(this, texture));

        _this._speed = 2;

        /**
         * @private
         * @member {Number}
         */
        _this._runningSpeed = 5;

        /**
         * @private
         * @member {Boolean}
         */
        _this._running = false;

        /**
         * @private
         * @member {Exo.Rectangle}
         */
        _this._frame = new Exo.Rectangle(0, 0, playerWidth, playerHeight);

        /**
         * @private
         * @member {Exo.FrameAnimation}
         */
        _this._frameAnimation = new Exo.FrameAnimation();

        _this.setOrigin(0.5, 1);
        _this.setPosition(640, 320);
        _this._setFaceDirection(FACE_DIRECTION.DOWN);
        return _this;
    }

    /**
     * @override
     */


    _createClass(Player, [{
        key: "move",
        value: function move(x, y) {
            var speed = this._running ? this._runningSpeed : this._speed,
                mag = Math.sqrt(x * x + y * y);

            this.setPosition(this.x + (mag > 1 ? x / mag : x) * speed, this.y + (mag > 1 ? y / mag : y) * speed);

            if (x > 0) {
                this._setFaceDirection(FACE_DIRECTION.RIGHT);
            } else if (x < 0) {
                this._setFaceDirection(FACE_DIRECTION.LEFT);
            }

            if (y > 0.5) {
                this._setFaceDirection(FACE_DIRECTION.DOWN);
            } else if (y < -0.5) {
                this._setFaceDirection(FACE_DIRECTION.UP);
            }
        }

        /**
         * @private
         * @param {Number} direction
         */

    }, {
        key: "_setFaceDirection",
        value: function _setFaceDirection(direction) {
            this._frame.x = direction * playerWidth;
            this._frame.y = 0;

            this.setTextureRect(this._frame);
        }
    }]);

    return Player;
}(Exo.Sprite);

exports.default = Player;

/***/ }),
/* 30 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _AutoTile = __webpack_require__(31);

var _AutoTile2 = _interopRequireDefault(_AutoTile);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Tileset
 */
var Tileset = function () {

    /**
     * @constructor
     * @param {Exo.Texture} texture
     * @param {Number} tileSize
     */
    function Tileset(texture, tileSize) {
        _classCallCheck(this, Tileset);

        /**
         * @private
         * @member {Exo.Texture}
         */
        this._texture = texture;

        /**
         * @private
         * @member {Number}
         */
        this._tileSize = tileSize;

        /**
         * @private
         * @member {Object.<String, AutoTile>}
         */
        this._tiles = {
            water: new _AutoTile2.default(5, 1, tileSize),
            sand: new _AutoTile2.default(0, 1, tileSize),
            grass: new _AutoTile2.default(0, 0, tileSize),
            forest: new _AutoTile2.default(2, 0, tileSize),
            dirt: new _AutoTile2.default(1, 0, tileSize),
            stone: new _AutoTile2.default(3, 0, tileSize)
        };

        /**
         * @private
         * @member {Number}
         */
        this._waterLevel = 70;

        /**
         * @private
         * @member {Number}
         */
        this._sandLevel = 95;

        /**
         * @private
         * @member {Number}
         */
        this._grassLevel = 130;

        /**
         * @private
         * @member {Number}
         */
        this._forestLevel = 150;

        /**
         * @private
         * @member {Number}
         */
        this._dirtLevel = 170;
    }

    /**
     * @public
     * @member {Exo.Texture}
     */


    _createClass(Tileset, [{
        key: 'setBlock',


        /**
         * @public
         * @param {Exo.Sprite} tile
         * @param {Number} level
         */
        value: function setBlock(tile, level) {
            var block = void 0,
                tint = void 0;

            if (level <= this._waterLevel) {
                block = 'water';
                tint = 255 + level - this._waterLevel;
            } else if (level <= this._sandLevel) {
                block = 'sand';
                tint = 255 - level + this._waterLevel;
            } else if (level <= this._grassLevel) {
                block = 'grass';
                tint = 255 - level + this._sandLevel;
            } else if (level <= this._forestLevel) {
                block = 'forest';
                tint = 255 - level + this._grassLevel;
            } else if (level <= this._dirtLevel) {
                block = 'dirt';
                tint = 255 - level + this._forestLevel;
            } else {
                block = 'stone';
                tint = 255 - level + this._dirtLevel;
            }

            tint = tint | 0;
            tile.tint.set(tint, tint, tint);
            if (block in this._tiles) {
                tile.setTextureRect(this._tiles[block].tileRect, true);
            }
        }
    }, {
        key: 'texture',
        get: function get() {
            return this._texture;
        }
    }]);

    return Tileset;
}();

exports.default = Tileset;

/***/ }),
/* 31 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class AutoTile
 */
var AutoTile = function () {

    /**
     * @constructor
     * @param {Number} x
     * @param {Number} y
     * @param {Number} tileSize
     */
    function AutoTile(x, y, tileSize) {
        _classCallCheck(this, AutoTile);

        /**
         * @private
         * @member {Number}
         */
        this._width = tileSize * 2;

        /**
         * @private
         * @member {Number}
         */
        this._height = tileSize * 3;

        /**
         * @private
         * @member {Number}
         */
        this._tileSize = tileSize;

        /**
         * @private
         * @member {Exo.Rectangle}
         */
        this._fullRect = new Exo.Rectangle(x * this._width, y * this._height, this._width, this._height);

        /**
         * @private
         * @member {Exo.Rectangle}
         */
        this._tileRect = new Exo.Rectangle(this._fullRect.x + tileSize * 0.5, this._fullRect.y + tileSize * 1.5, tileSize, tileSize);
    }

    /**
     * @public
     * @member {Number}
     */


    _createClass(AutoTile, [{
        key: "width",
        get: function get() {
            return this._width;
        },
        set: function set(value) {
            this._width = value;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: "height",
        get: function get() {
            return this._height;
        },
        set: function set(value) {
            this._height = value;
        }

        /**
         * @public
         * @member {Number}
         */

    }, {
        key: "tileSize",
        get: function get() {
            return this._tileSize;
        },
        set: function set(value) {
            this._tileSize = value;
        }

        /**
         * @public
         * @member {Exo.Rectangle}
         */

    }, {
        key: "fullRect",
        get: function get() {
            return this._fullRect;
        },
        set: function set(value) {
            this._fullRect.copy(value);
        }

        /**
         * @public
         * @member {Exo.Rectangle}
         */

    }, {
        key: "tileRect",
        get: function get() {
            return this._tileRect;
        },
        set: function set(value) {
            this._tileRect.copy(value);
        }
    }]);

    return AutoTile;
}();

exports.default = AutoTile;

/***/ }),
/* 32 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Menu2 = __webpack_require__(1);

var _Menu3 = _interopRequireDefault(_Menu2);

var _MenuItem = __webpack_require__(2);

var _MenuItem2 = _interopRequireDefault(_MenuItem);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class LoadGameMenu
 * @extends {Menu}
 */
var LoadGameMenu = function (_Menu) {
    _inherits(LoadGameMenu, _Menu);

    /**
     * @constructor
     * @param {Exo.Game} game
     * @param {String} parentMenu
     */
    function LoadGameMenu(game, parentMenu) {
        _classCallCheck(this, LoadGameMenu);

        var _this = _possibleConstructorReturn(this, (LoadGameMenu.__proto__ || Object.getPrototypeOf(LoadGameMenu)).call(this, game, parentMenu));

        var canvas = game.canvas;

        /**
         * @private
         * @member {MenuItem}
         */
        _this._LoadGameTitle = new _MenuItem2.default('Load Game:');
        _this._LoadGameTitle.setPosition(canvas.width / 2, canvas.height / 3);

        /**
         * @private
         * @member {MenuItem}
         */
        _this._loadWorldButton = new _MenuItem2.default('Load World', _this._LoadGameTitle);

        /**
         * @private
         * @member {MenuItem}
         */
        _this._backButton = new _MenuItem2.default('Back', _this._loadWorldButton);

        _this._addItems();
        _this._addPaths();
        _this._addActions();

        _this.setStartChild(_this._loadWorldButton);
        return _this;
    }

    _createClass(LoadGameMenu, [{
        key: '_addItems',
        value: function _addItems() {
            this.addChild(this._LoadGameTitle);
            this.addChild(this._loadWorldButton);
            this.addChild(this._backButton);
        }
    }, {
        key: '_addPaths',
        value: function _addPaths() {
            this.addPath(this._loadWorldButton, this._backButton, 'down', 'up');
            this.addPath(this._backButton, this._loadWorldButton, 'down', 'up');
        }
    }, {
        key: '_addActions',
        value: function _addActions() {
            this.addAction(this._loadWorldButton, this._onSelectLoadWorld.bind(this), 'select');
            this.addAction(this._backButton, this.openPreviousMenu.bind(this), 'select');
        }
    }, {
        key: '_onSelectLoadWorld',
        value: function _onSelectLoadWorld() {
            this._game.setCurrentScene('game');
        }
    }, {
        key: 'destroy',
        value: function destroy() {
            _get(LoadGameMenu.prototype.__proto__ || Object.getPrototypeOf(LoadGameMenu.prototype), 'destroy', this).call(this);

            this._LoadGameTitle = null;
            this._loadWorldButton = null;
            this._backButton = null;
        }
    }]);

    return LoadGameMenu;
}(_Menu3.default);

exports.default = LoadGameMenu;

/***/ }),
/* 33 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Menu2 = __webpack_require__(1);

var _Menu3 = _interopRequireDefault(_Menu2);

var _MenuItem = __webpack_require__(2);

var _MenuItem2 = _interopRequireDefault(_MenuItem);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class SettingsMenu
 * @extends {Menu}
 */
var SettingsMenu = function (_Menu) {
    _inherits(SettingsMenu, _Menu);

    /**
     * @constructor
     * @param {Exo.Game} game
     * @param {String} previousMenu
     */
    function SettingsMenu(game, previousMenu) {
        _classCallCheck(this, SettingsMenu);

        var _this = _possibleConstructorReturn(this, (SettingsMenu.__proto__ || Object.getPrototypeOf(SettingsMenu)).call(this, game, previousMenu));

        var canvas = game.canvas,
            mediaManager = game.mediaManager;

        /**
         * @private
         * @member {MenuItem}
         */
        _this._settingsTitle = new _MenuItem2.default('Settings:');
        _this._settingsTitle.setPosition(canvas.width / 2, canvas.height / 3);

        /**
         * @private
         * @member {MenuItem}
         */
        _this._masterVolumeButton = new _MenuItem2.default('Master Volume: ' + (mediaManager.masterVolume * 100 | 0) + '%', _this._settingsTitle);

        /**
         * @private
         * @member {MenuItem}
         */
        _this._musicVolumeButton = new _MenuItem2.default('Music Volume: ' + (mediaManager.musicVolume * 100 | 0) + '%', _this._masterVolumeButton);

        /**
         * @private
         * @member {MenuItem}
         */
        _this._soundsVolumeButton = new _MenuItem2.default('', _this._musicVolumeButton);new _MenuItem2.default('Sound Volume: ' + (mediaManager.soundVolume * 100 | 0) + '%', _this._musicVolumeButton);

        /**
         * @private
         * @member {MenuItem}
         */
        _this._backButton = new _MenuItem2.default('Back', _this._soundsVolumeButton);

        /**
         * @private
         * @member {Function}
         */
        _this._onOptionLeftHandler = _this._onOptionLeft.bind(_this);

        /**
         * @private
         * @member {Function}
         */
        _this._onOptionRightHandler = _this._onOptionRight.bind(_this);

        /**
         * @private
         * @member {Number}
         */
        _this._volumeStep = 0.05;

        _this._addItems();
        _this._addPaths();
        _this._addActions();

        _this.setStartChild(_this._musicVolumeButton);
        return _this;
    }

    /**
     * @override
     */


    _createClass(SettingsMenu, [{
        key: 'destroy',
        value: function destroy() {
            _get(SettingsMenu.prototype.__proto__ || Object.getPrototypeOf(SettingsMenu.prototype), 'destroy', this).call(this);

            this._onOptionLeftHandler = null;
            this._onOptionRightHandler = null;

            this._settingsTitle = null;
            this._masterVolumeButton = null;
            this._musicVolumeButton = null;
            this._soundsVolumeButton = null;
            this._backButton = null;
        }

        /**
         * @private
         */

    }, {
        key: '_addItems',
        value: function _addItems() {
            this.addChild(this._settingsTitle);
            this.addChild(this._masterVolumeButton);
            this.addChild(this._musicVolumeButton);
            this.addChild(this._soundsVolumeButton);
            this.addChild(this._backButton);
        }

        /**
         * @private
         */

    }, {
        key: '_addPaths',
        value: function _addPaths() {
            this.addPath(this._masterVolumeButton, this._musicVolumeButton, 'down', 'up');
            this.addPath(this._musicVolumeButton, this._soundsVolumeButton, 'down', 'up');
            this.addPath(this._soundsVolumeButton, this._backButton, 'down', 'up');
            this.addPath(this._backButton, this._masterVolumeButton, 'down', 'up');
        }

        /**
         * @private
         */

    }, {
        key: '_addActions',
        value: function _addActions() {
            this.addAction(this._masterVolumeButton, this._onOptionLeftHandler, 'left');
            this.addAction(this._masterVolumeButton, this._onOptionRightHandler, 'right');
            this.addAction(this._musicVolumeButton, this._onOptionLeftHandler, 'left');
            this.addAction(this._musicVolumeButton, this._onOptionRightHandler, 'right');
            this.addAction(this._soundsVolumeButton, this._onOptionLeftHandler, 'left');
            this.addAction(this._soundsVolumeButton, this._onOptionRightHandler, 'right');
            this.addAction(this._backButton, this.openPreviousMenu.bind(this), 'select');
        }

        /**
         * @private
         * @param {MenuAction} action
         */

    }, {
        key: '_onOptionLeft',
        value: function _onOptionLeft(action) {
            var mediaManager = this._game.mediaManager;

            switch (action.item) {
                case this._masterVolumeButton:
                    mediaManager.masterVolume -= this._volumeStep;
                    break;
                case this._musicVolumeButton:
                    mediaManager.musicVolume -= this._volumeStep;
                    break;
                case this._soundsVolumeButton:
                    mediaManager.soundVolume -= this._volumeStep;
                    break;
            }

            this._updateButtons();
        }

        /**
         * @private
         * @param {MenuAction} action
         */

    }, {
        key: '_onOptionRight',
        value: function _onOptionRight(action) {
            var mediaManager = this._game.mediaManager;

            switch (action.item) {
                case this._masterVolumeButton:
                    mediaManager.masterVolume += this._volumeStep;
                    break;
                case this._musicVolumeButton:
                    mediaManager.musicVolume += this._volumeStep;
                    break;
                case this._soundsVolumeButton:
                    mediaManager.soundVolume += this._volumeStep;
                    break;
            }

            this._updateButtons();
        }
    }, {
        key: '_updateButtons',
        value: function _updateButtons() {
            var mediaManager = this._game.mediaManager;

            this._masterVolumeButton.text = 'Master Volume: ' + (mediaManager.musicVolume * 100 | 0) + '%';
            this._musicVolumeButton.text = 'Music Volume: ' + (mediaManager.musicVolume * 100 | 0) + '%';
            this._soundsVolumeButton.text = 'Sound Volume: ' + (mediaManager.soundVolume * 100 | 0) + '%';
        }
    }]);

    return SettingsMenu;
}(_Menu3.default);

exports.default = SettingsMenu;

/***/ })
/******/ ]);
//# sourceMappingURL=game.build.js.map