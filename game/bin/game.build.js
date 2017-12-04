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
/******/ 	return __webpack_require__(__webpack_require__.s = 4);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports) {

module.exports = Exo;

/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _exojs = __webpack_require__(0);

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class MenuItem
 * @extends Text
 */
var MenuItem = function (_Text) {
  _inherits(MenuItem, _Text);

  /**
   * @constructor
   * @param {String} text
   * @param {Object} [style]
   */
  function MenuItem(text) {
    var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
        _ref$fill = _ref.fill,
        fill = _ref$fill === undefined ? 'white' : _ref$fill,
        _ref$fontSize = _ref.fontSize,
        fontSize = _ref$fontSize === undefined ? 45 : _ref$fontSize,
        _ref$fontFamily = _ref.fontFamily,
        fontFamily = _ref$fontFamily === undefined ? 'AndyBold' : _ref$fontFamily,
        _ref$stroke = _ref.stroke,
        stroke = _ref$stroke === undefined ? 'black' : _ref$stroke,
        _ref$strokeThickness = _ref.strokeThickness,
        strokeThickness = _ref$strokeThickness === undefined ? 5 : _ref$strokeThickness;

    _classCallCheck(this, MenuItem);

    /**
     * @private
     * @member {Number}
     */
    var _this = _possibleConstructorReturn(this, (MenuItem.__proto__ || Object.getPrototypeOf(MenuItem)).call(this, text, { fill: fill, fontSize: fontSize, fontFamily: fontFamily, stroke: stroke, strokeThickness: strokeThickness }));

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
    return _this;
  }

  /**
   * @public
   */


  _createClass(MenuItem, [{
    key: 'activate',
    value: function activate() {
      this.setTint(_exojs.Color.Yellow);
      this._ticker = 0;
    }

    /**
     * @public
     * @param {Time} delta
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
      this.setTint(_exojs.Color.White);
      this.setScale(1);
      this._ticker = 0;
    }
  }]);

  return MenuItem;
}(_exojs.Text);

exports.default = MenuItem;

/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _exojs = __webpack_require__(0);

var _MenuPath = __webpack_require__(10);

var _MenuPath2 = _interopRequireDefault(_MenuPath);

var _MenuAction = __webpack_require__(11);

var _MenuAction2 = _interopRequireDefault(_MenuAction);

var _MenuItem = __webpack_require__(1);

var _MenuItem2 = _interopRequireDefault(_MenuItem);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Menu
 * @extends Container
 */
var Menu = function (_Container) {
    _inherits(Menu, _Container);

    /**
     * @constructor
     * @param {Application} app
     * @param {String} [previousMenu=null]
     */
    function Menu(app) {
        var previousMenu = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

        _classCallCheck(this, Menu);

        /**
         * @public
         * @member {Application}
         */
        var _this = _possibleConstructorReturn(this, (Menu.__proto__ || Object.getPrototypeOf(Menu)).call(this));

        _this._app = app;

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
         * @chainable
         * @param {MenuItem} child
         * @returns {Menu}
         */
        value: function setStartChild(child) {
            this._startChild = child;

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {MenuItem} child
         * @returns {Menu}
         */

    }, {
        key: 'setActiveChild',
        value: function setActiveChild(child) {
            if (child !== this._activeChild) {
                if (this._activeChild) {
                    this._activeChild.reset();
                }

                this._activeChild = child || null;

                if (this._activeChild) {
                    this._activeChild.activate();
                }
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {MenuItem} fromChild
         * @param {MenuItem} toChild
         * @param {String} fromToDirection
         * @param {String} [toFromDirection]
         * @returns {Menu}
         */

    }, {
        key: 'addPath',
        value: function addPath(fromChild, toChild, fromToDirection, toFromDirection) {
            this._paths.push(new _MenuPath2.default(fromChild, toChild, fromToDirection));

            if (toFromDirection) {
                this._paths.push(new _MenuPath2.default(toChild, fromChild, toFromDirection));
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {MenuItem} child
         * @param {Function} action
         * @param {String} [input=select]
         * @returns {Menu}
         */

    }, {
        key: 'addAction',
        value: function addAction(child, action, input) {
            this._actions.push(new _MenuAction2.default(child, action, input || 'select'));

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {Menu}
         */

    }, {
        key: 'enable',
        value: function enable() {
            return this.setActiveChild(this._startChild);
        }

        /**
         * @public
         * @chainable
         * @returns {Menu}
         */

    }, {
        key: 'disable',
        value: function disable() {
            if (this._activeChild) {
                this._activeChild.reset();
                this._activeChild = null;
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Time} delta
         * @returns {Menu}
         */

    }, {
        key: 'update',
        value: function update(delta) {
            if (this._activeChild) {
                this._activeChild.update(delta);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String} input
         * @returns {Menu}
         */

    }, {
        key: 'updateInput',
        value: function updateInput(input) {
            if (this._activeChild) {
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

            return this;
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
         * @param {Pointer} pointer
         * @returns {MenuItem}
         */

    }, {
        key: 'getPointerChild',
        value: function getPointerChild(pointer) {
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this.children[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var child = _step.value;

                    if (!(child instanceof _MenuItem2.default)) {
                        continue;
                    }

                    if (child.contains(pointer.x, pointer.y)) {
                        return child;
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

            return null;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Menu.prototype.__proto__ || Object.getPrototypeOf(Menu.prototype), 'destroy', this).call(this);

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
            this._app = null;
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
}(_exojs.Container);

exports.default = Menu;

/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _exojs = __webpack_require__(0);

var _WorldMap = __webpack_require__(13);

var _WorldMap2 = _interopRequireDefault(_WorldMap);

var _Player = __webpack_require__(16);

var _Player2 = _interopRequireDefault(_Player);

var _Tileset = __webpack_require__(17);

var _Tileset2 = _interopRequireDefault(_Tileset);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class GameScene
 * @extends Scene
 */
var GameScene = function (_Scene) {
    _inherits(GameScene, _Scene);

    function GameScene() {
        _classCallCheck(this, GameScene);

        return _possibleConstructorReturn(this, (GameScene.__proto__ || Object.getPrototypeOf(GameScene)).apply(this, arguments));
    }

    _createClass(GameScene, [{
        key: 'init',


        /**
         * @override
         */
        value: function init(resources) {
            var canvas = this.app.canvas;

            /**
             * @private
             * @member {WorldMap}
             */
            this._worldMap = new _WorldMap2.default(new _Tileset2.default(resources.get('texture', 'game/tileset'), 32));

            /**
             * @private
             * @member {Player}
             */
            this._player = new _Player2.default(this.app, {
                spawnPoint: new _exojs.Vector(this._worldMap.width / 2, this._worldMap.height / 2),
                worldBounds: this._worldMap.bounds
            });

            /**
             * @private
             * @member {View}
             */
            this._camera = new _exojs.View(0, 0, canvas.width, canvas.height);

            /**
             * @private
             * @member {Boolean}
             */
            this._paused = false;

            /**
             * @private
             * @member {Music}
             */
            this._backgroundMusic = resources.get('music', 'overworld');
            this._backgroundMusic.play({ loop: true });

            this._addEvents();
            this._addInputs();
            this._updateCamera();
        }

        /**
         * @override
         */

    }, {
        key: 'update',
        value: function update(delta) {
            if (!this._paused) {
                this._player.update(delta);
                this._worldMap.update(delta);
            }
        }

        /**
         * @override
         */

    }, {
        key: 'draw',
        value: function draw(renderManager) {
            renderManager.clear().draw(this._worldMap).draw(this._player).display();
        }

        /**
         * @override
         */

    }, {
        key: 'unload',
        value: function unload() {
            this._removeEvents();
            this._removeInputs();

            this._worldMap.destroy();
            this._worldMap = null;

            this._player.destroy();
            this._player = null;

            this._camera.destroy();
            this._camera = null;

            this._backgroundMusic.destroy();
            this._backgroundMusic = null;

            this._paused = null;
        }

        /**
         * @private
         */

    }, {
        key: '_updateCamera',
        value: function _updateCamera() {
            var renderManager = this.app.renderManager,
                x = this._player.x,
                y = this._player.y - this._player.height / 2,
                maxX = this._worldMap.width,
                maxY = this._worldMap.height,
                centerX = this._camera.width / 2,
                centerY = this._camera.height / 2;

            renderManager.renderTarget.setView(this._camera.setCenter(_exojs.utils.clamp(x, centerX, maxX - centerX), _exojs.utils.clamp(y, centerY, maxY - centerY)));
        }

        /**
         * @private
         */

    }, {
        key: '_pauseGame',
        value: function _pauseGame() {
            if (!this._paused) {
                this._paused = true;
                this._backgroundMusic.pause();
                this._openMenu();
            }

            return this;
        }

        /**
         * @private
         */

    }, {
        key: '_resumeGame',
        value: function _resumeGame() {
            if (this._paused) {
                this._paused = false;
                this._backgroundMusic.play();
                this._closeMenu();
            }

            return this;
        }

        /**
         * @private
         */

    }, {
        key: '_openMenu',
        value: function _openMenu() {}

        /**
         * @private
         */

    }, {
        key: '_closeMenu',
        value: function _closeMenu() {}

        /**
         * @private
         */

    }, {
        key: '_addEvents',
        value: function _addEvents() {
            this._player.on('move', this._updateCamera, this);
        }

        /**
         * @private
         */

    }, {
        key: '_removeEvents',
        value: function _removeEvents() {
            this._player.off('move', this._updateCamera, this);
        }

        /**
         * @private
         */

    }, {
        key: '_addInputs',
        value: function _addInputs() {

            /**
             * @private
             * @member {Input}
             */
            this._toggleMenuInput = new _exojs.Input([_exojs.KEYBOARD.Escape, _exojs.GAMEPAD.Start], {
                context: this,
                trigger: function trigger() {
                    if (this._paused) {
                        this._resumeGame();
                    } else {
                        this._pauseGame();
                    }
                }
            });

            this.app.inputManager.add(this._toggleMenuInput);
        }

        /**
         * @private
         */

    }, {
        key: '_removeInputs',
        value: function _removeInputs() {
            this.app.inputManager.remove(this._toggleMenuInput);

            this._toggleMenuInput.destroy();
            this._toggleMenuInput = null;
        }
    }]);

    return GameScene;
}(_exojs.Scene);

exports.default = GameScene;

/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _exojs = __webpack_require__(0);

var _LauncherScene = __webpack_require__(5);

var _LauncherScene2 = _interopRequireDefault(_LauncherScene);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

window.addEventListener('load', function () {
    var app = new _exojs.Application({
        resourcePath: 'assets/',
        width: 1280,
        height: 720,
        canvas: document.querySelector('#game-canvas'),
        database: new _exojs.Database('game', 3)
    });

    app.loader.cache = 'no-cache';

    app.start(new _LauncherScene2.default());

    window.app = app;
}, false);

/***/ }),
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _exojs = __webpack_require__(0);

var _TitleScene = __webpack_require__(6);

var _TitleScene2 = _interopRequireDefault(_TitleScene);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class LauncherScene
 * @extends Scene
 */
var LauncherScene = function (_Scene) {
    _inherits(LauncherScene, _Scene);

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
            });

            loader.add('texture', {
                'title/logo': 'image/title/logo.png',
                'title/background': 'image/title/background.jpg'
            }, {
                scaleMode: _exojs.SCALE_MODES.LINEAR
            });

            loader.add('texture', {
                'game/tileset': 'image/game/tileset.png',
                'game/player': 'image/game/player.png'
            }, {
                scaleMode: _exojs.SCALE_MODES.NEAREST
            });

            loader.add('music', {
                'title': 'audio/title.ogg',
                'overworld': 'audio/overworld.ogg'
            });

            loader.addItem('font', 'menu', 'font/AndyBold/AndyBold.woff2', {
                family: 'AndyBold'
            });

            this._renderProgress(0);
        }

        /**
         * @override
         */

    }, {
        key: 'init',
        value: function init(resources) {

            /**
             * @private
             * @member {Function}
             */
            this._openTitleHandler = this._openTitle.bind(this);

            this._$indicator.addClass('finished');
            this._$indicatorText.html('PLAY');
            this._$indicatorText.on('click', this._openTitleHandler);

            this.app.inputManager.add(new _exojs.Input([_exojs.KEYBOARD.Enter, _exojs.GAMEPAD.Start, _exojs.GAMEPAD.FaceBottom], {
                context: this,
                trigger: this._openTitleHandler
            }));
        }

        /**
         * @override
         */

    }, {
        key: 'unload',
        value: function unload() {
            this.app.inputManager.clear(true);
            this._$indicatorText.off('click', this._openTitleHandler);

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
            context.arc(centerX, centerY, radius, _exojs.utils.degreesToRadians(offsetAngle), _exojs.utils.degreesToRadians(percentage * 3.6 + offsetAngle), true);
            context.clip();
            context.clearRect(0, 0, width, height);
        }

        /**
         * @private
         */

    }, {
        key: '_openTitle',
        value: function _openTitle() {
            this.app.sceneManager.setScene(new _TitleScene2.default());
        }
    }]);

    return LauncherScene;
}(_exojs.Scene);

exports.default = LauncherScene;

/***/ }),
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _exojs = __webpack_require__(0);

var _TitleMenuManager = __webpack_require__(7);

var _TitleMenuManager2 = _interopRequireDefault(_TitleMenuManager);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class TitleScene
 * @extends Scene
 */
var TitleScene = function (_Scene) {
  _inherits(TitleScene, _Scene);

  function TitleScene() {
    _classCallCheck(this, TitleScene);

    return _possibleConstructorReturn(this, (TitleScene.__proto__ || Object.getPrototypeOf(TitleScene)).apply(this, arguments));
  }

  _createClass(TitleScene, [{
    key: 'init',


    /**
     * @param {ResourceContainer} resources
     */
    value: function init(resources) {

      /**
       * @private
       * @member {TitleMenuManager}
       */
      this._menuManager = new _TitleMenuManager2.default(this.app);
      this._menuManager.enable('main');

      /**
       * @private
       * @member {Sprite}
       */
      this._background = new _exojs.Sprite(resources.get('texture', 'title/background'));

      /**
       * @private
       * @member {Music}
       */
      this._titleMusic = resources.get('music', 'title');
      this._titleMusic.play({ loop: true });
    }

    /**
     * @override
     */

  }, {
    key: 'update',
    value: function update(delta) {
      this._menuManager.update(delta);
    }

    /**
     * @override
     */

  }, {
    key: 'draw',
    value: function draw(renderManager) {
      renderManager.clear().draw(this._background).draw(this._menuManager).display();
    }

    /**
     * @override
     */

  }, {
    key: 'unload',
    value: function unload() {
      this._menuManager.destroy();
      this._menuManager = null;

      this._background.destroy();
      this._background = null;

      this._titleMusic.destroy();
      this._titleMusic = null;
    }
  }]);

  return TitleScene;
}(_exojs.Scene);

exports.default = TitleScene;

/***/ }),
/* 7 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _MenuManager2 = __webpack_require__(8);

var _MenuManager3 = _interopRequireDefault(_MenuManager2);

var _MainMenu = __webpack_require__(9);

var _MainMenu2 = _interopRequireDefault(_MainMenu);

var _NewGameMenu = __webpack_require__(12);

var _NewGameMenu2 = _interopRequireDefault(_NewGameMenu);

var _LoadGameMenu = __webpack_require__(19);

var _LoadGameMenu2 = _interopRequireDefault(_LoadGameMenu);

var _SettingsMenu = __webpack_require__(20);

var _SettingsMenu2 = _interopRequireDefault(_SettingsMenu);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class TitleMenuManager
 * @extends MenuManager
 */
var TitleMenuManager = function (_MenuManager) {
  _inherits(TitleMenuManager, _MenuManager);

  /**
   * @constructor
   * @param {Application} app
   */
  function TitleMenuManager(app) {
    _classCallCheck(this, TitleMenuManager);

    var _this = _possibleConstructorReturn(this, (TitleMenuManager.__proto__ || Object.getPrototypeOf(TitleMenuManager)).call(this, app));

    _this.addMenu('main', new _MainMenu2.default(app)).addMenu('newGame', new _NewGameMenu2.default(app, 'main')).addMenu('loadGame', new _LoadGameMenu2.default(app, 'main')).addMenu('settings', new _SettingsMenu2.default(app, 'main'));
    return _this;
  }

  return TitleMenuManager;
}(_MenuManager3.default);

exports.default = TitleMenuManager;

/***/ }),
/* 8 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _exojs = __webpack_require__(0);

var _MenuItem = __webpack_require__(1);

var _MenuItem2 = _interopRequireDefault(_MenuItem);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class MenuManager
 */
var MenuManager = function () {

    /**
     * @constructor
     * @param {Application} app
     */
    function MenuManager(app) {
        _classCallCheck(this, MenuManager);

        /**
         * @private
         * @member {Application}
         */
        this._app = app;

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
        this._active = false;

        /**
         * @private
         * @member {Input[]}
         */
        this._inputs = [new _exojs.Input([_exojs.KEYBOARD.Up, _exojs.GAMEPAD.DPadUp, _exojs.GAMEPAD.LeftStickUp], {
            context: this,
            start: function start() {
                if (this._currentMenu) {
                    this._currentMenu.onInputUp();
                }
            }
        }), new _exojs.Input([_exojs.KEYBOARD.Down, _exojs.GAMEPAD.LeftStickDown, _exojs.GAMEPAD.DPadDown], {
            context: this,
            start: function start() {
                if (this._currentMenu) {
                    this._currentMenu.onInputDown();
                }
            }
        }), new _exojs.Input([_exojs.KEYBOARD.Left, _exojs.GAMEPAD.LeftStickLeft, _exojs.GAMEPAD.DPadLeft], {
            context: this,
            start: function start() {
                if (this._currentMenu) {
                    this._currentMenu.onInputLeft();
                }
            }
        }), new _exojs.Input([_exojs.KEYBOARD.Right, _exojs.GAMEPAD.LeftStickRight, _exojs.GAMEPAD.DPadRight], {
            context: this,
            start: function start() {
                if (this._currentMenu) {
                    this._currentMenu.onInputRight();
                }
            }
        }), new _exojs.Input([_exojs.KEYBOARD.Enter, _exojs.GAMEPAD.FaceBottom], {
            context: this,
            start: function start() {
                if (this._currentMenu) {
                    this._currentMenu.onInputSelect();
                }
            }
        }), new _exojs.Input([_exojs.KEYBOARD.Backspace, _exojs.GAMEPAD.FaceRight], {
            context: this,
            start: function start() {
                if (this._currentMenu) {
                    this._currentMenu.onInputBack();
                }
            }
        })];

        app.on('pointer:move', this._onPointerMove, this);
        app.on('pointer:tap', this._onPointerTap, this);
    }

    /**
     * @public
     * @member {Boolean}
     */


    _createClass(MenuManager, [{
        key: 'enable',


        /**
         * @public
         * @chainable
         * @param {String} startMenu
         * @returns {MenuManager}
         */
        value: function enable(startMenu) {
            if (!this._active) {
                this._active = true;
                this._app.inputManager.add(this._inputs);

                this.openMenu(startMenu);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {MenuManager}
         */

    }, {
        key: 'disable',
        value: function disable() {
            if (this._active) {
                this._active = false;
                this._app.inputManager.remove(this._inputs);

                if (this._currentMenu) {
                    this._currentMenu.disable();
                    this._currentMenu = null;
                }
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String} name
         * @param {Menu} menu
         * @param {String} [previousMenu=null]
         * @returns {MenuManager}
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

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {String} name
         * @returns {MenuManager}
         */

    }, {
        key: 'openMenu',
        value: function openMenu(name) {
            if (this._currentMenu) {
                this._currentMenu.disable();
            }

            this._currentMenu = this._menus.get(name) || null;

            if (this._currentMenu) {
                this._currentMenu.enable();
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @returns {MenuManager}
         */

    }, {
        key: 'openPreviousMenu',
        value: function openPreviousMenu() {
            var currentMenu = this._currentMenu;

            if (currentMenu && currentMenu.previousMenu) {
                this.openMenu(currentMenu.previousMenu);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {Time} delta
         * @returns {MenuManager}
         */

    }, {
        key: 'update',
        value: function update(delta) {
            if (this._currentMenu) {
                this._currentMenu.update(delta);
            }

            return this;
        }

        /**
         * @public
         * @chainable
         * @param {RenderManager} renderManager
         * @returns {MenuManager}
         */

    }, {
        key: 'render',
        value: function render(renderManager) {
            if (this._currentMenu) {
                this._currentMenu.render(renderManager);
            }

            return this;
        }

        /**
         * @public
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._app.off('pointer:move', this._onPointerMove, this);
            this._app.off('pointer:tap', this._onPointerTap, this);

            if (this._active) {
                this.disable();
            }

            this._menus.forEach(function (menu) {
                menu.destroy();
            });

            this._menus.clear();
            this._menus = null;

            this._currentMenu = null;
            this._app = null;
        }

        /**
         * @private
         * @param {Pointer} pointer
         */

    }, {
        key: '_onPointerMove',
        value: function _onPointerMove(pointer) {
            if (this._currentMenu) {
                var child = this._currentMenu.getPointerChild(pointer);

                if (child) {
                    this._currentMenu.setActiveChild(child);
                    this._app.setCursor('pointer');
                } else {
                    this._app.setCursor('default');
                }
            }
        }

        /**
         * @private
         * @param {Pointer} pointer
         */

    }, {
        key: '_onPointerTap',
        value: function _onPointerTap(pointer) {
            if (this._currentMenu) {
                var child = this._currentMenu.getPointerChild(pointer);

                if (child) {
                    this._currentMenu.setActiveChild(child);
                    this._currentMenu.updateInput('select');
                }
            }
        }
    }, {
        key: 'active',
        get: function get() {
            return this._active;
        },
        set: function set(active) {
            this._active = active;
        }
    }]);

    return MenuManager;
}();

exports.default = MenuManager;

/***/ }),
/* 9 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _exojs = __webpack_require__(0);

var _Menu2 = __webpack_require__(2);

var _Menu3 = _interopRequireDefault(_Menu2);

var _MenuItem = __webpack_require__(1);

var _MenuItem2 = _interopRequireDefault(_MenuItem);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class MainMenu
 * @extends Menu
 */
var MainMenu = function (_Menu) {
    _inherits(MainMenu, _Menu);

    /**
     * @constructor
     * @param {Application} app
     * @param {String} parentMenu
     */
    function MainMenu(app) {
        var parentMenu = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

        _classCallCheck(this, MainMenu);

        var _this = _possibleConstructorReturn(this, (MainMenu.__proto__ || Object.getPrototypeOf(MainMenu)).call(this, app, parentMenu));

        var canvas = app.canvas,
            resources = app.loader.resources,
            centerX = canvas.width / 2,
            offsetY = 50;

        /**
         * @private
         * @member {Sprite}
         */
        _this._gameLogo = new _exojs.Sprite(resources.get('texture', 'title/logo'));
        _this._gameLogo.setOrigin(0.5, 0.8);
        _this._gameLogo.setPosition(centerX, 50 + _this._gameLogo.height * 0.8);

        /**
         * @private
         * @member {MenuItem}
         */
        _this._newGameButton = new _MenuItem2.default('New Game');
        _this._newGameButton.setPosition(centerX, _this._gameLogo.bottom + offsetY);

        /**
         * @private
         * @member {MenuItem}
         */
        _this._loadGameButton = new _MenuItem2.default('Load Game');
        _this._loadGameButton.setPosition(centerX, _this._newGameButton.bottom + offsetY);

        /**
         * @private
         * @member {MenuItem}
         */
        _this._settingsButton = new _MenuItem2.default('Settings');
        _this._settingsButton.setPosition(centerX, _this._loadGameButton.bottom + offsetY);

        /**
         * @private
         * @member {MenuItem}
         */
        _this._versionText = new _MenuItem2.default('Ver. 0.0.1', { fontSize: 25, strokeThickness: 3 });
        _this._versionText.setPosition(canvas.width - 10, canvas.height);
        _this._versionText.setOrigin(1, 1);

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
            this._gameLogo.rotation = Math.sin(this._ticker * Math.PI / 2) * -5;
        }

        /**
         * @override
         */

    }, {
        key: 'disable',
        value: function disable() {
            if (this._activeChild) {
                this._activeChild.reset();
            }

            this._ticker = 0;
            this._gameLogo.rotation = 0;
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

        /**
         * @private
         */

    }, {
        key: '_addItems',
        value: function _addItems() {
            return this.addChild(this._gameLogo).addChild(this._newGameButton).addChild(this._loadGameButton).addChild(this._settingsButton).addChild(this._versionText);
        }

        /**
         * @private
         */

    }, {
        key: '_addPaths',
        value: function _addPaths() {
            return this.addPath(this._newGameButton, this._loadGameButton, 'down', 'up').addPath(this._loadGameButton, this._settingsButton, 'down', 'up').addPath(this._settingsButton, this._newGameButton, 'down', 'up');
        }

        /**
         * @private
         * @chaibale
         */

    }, {
        key: '_addActions',
        value: function _addActions() {
            return this.addAction(this._newGameButton, this.openMenu.bind(this, 'newGame'), 'select').addAction(this._loadGameButton, this.openMenu.bind(this, 'loadGame'), 'select').addAction(this._settingsButton, this.openMenu.bind(this, 'settings'), 'select');
        }
    }]);

    return MainMenu;
}(_Menu3.default);

exports.default = MainMenu;

/***/ }),
/* 10 */
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
/* 11 */
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
/* 12 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Menu2 = __webpack_require__(2);

var _Menu3 = _interopRequireDefault(_Menu2);

var _MenuItem = __webpack_require__(1);

var _MenuItem2 = _interopRequireDefault(_MenuItem);

var _GameScene = __webpack_require__(3);

var _GameScene2 = _interopRequireDefault(_GameScene);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class NewGameMenu
 * @extends Menu
 */
var NewGameMenu = function (_Menu) {
    _inherits(NewGameMenu, _Menu);

    /**
     * @constructor
     * @param {Application} app
     * @param {?String} [parentMenu=null]
     */
    function NewGameMenu(app, parentMenu) {
        _classCallCheck(this, NewGameMenu);

        var _this = _possibleConstructorReturn(this, (NewGameMenu.__proto__ || Object.getPrototypeOf(NewGameMenu)).call(this, app, parentMenu));

        var canvas = app.canvas,
            centerX = canvas.width / 2,
            offsetY = 50;

        /**
         * @private
         * @member {MenuItem}
         */
        _this._newGameTitle = new _MenuItem2.default('New Game:');
        _this._newGameTitle.setPosition(centerX, canvas.height / 3);

        /**
         * @private
         * @member {MenuItem}
         */
        _this._createWorldButton = new _MenuItem2.default('Create World');
        _this._createWorldButton.setPosition(centerX, _this._newGameTitle.bottom + offsetY);

        /**
         * @private
         * @member {MenuItem}
         */
        _this._createCharacterButton = new _MenuItem2.default('Create Character');
        _this._createCharacterButton.setPosition(centerX, _this._createWorldButton.bottom + offsetY);

        /**
         * @private
         * @member {MenuItem}
         */
        _this._backButton = new _MenuItem2.default('Back');
        _this._backButton.setPosition(centerX, _this._createCharacterButton.bottom + offsetY);

        _this._addItems();
        _this._addPaths();
        _this._addActions();

        _this.setStartChild(_this._createWorldButton);
        return _this;
    }

    /**
     * @override
     */


    _createClass(NewGameMenu, [{
        key: 'destroy',
        value: function destroy() {
            _get(NewGameMenu.prototype.__proto__ || Object.getPrototypeOf(NewGameMenu.prototype), 'destroy', this).call(this);

            this._newGameTitle = null;
            this._createWorldButton = null;
            this._createCharacterButton = null;
            this._backButton = null;
        }
    }, {
        key: '_addItems',
        value: function _addItems() {
            this.addChild(this._newGameTitle).addChild(this._createWorldButton).addChild(this._createCharacterButton).addChild(this._backButton);
        }
    }, {
        key: '_addPaths',
        value: function _addPaths() {
            this.addPath(this._createWorldButton, this._createCharacterButton, 'down', 'up').addPath(this._createCharacterButton, this._backButton, 'down', 'up').addPath(this._backButton, this._createWorldButton, 'down', 'up');
        }
    }, {
        key: '_addActions',
        value: function _addActions() {
            this.addAction(this._createWorldButton, this._onSelectCreateWorld.bind(this), 'select').addAction(this._createCharacterButton, this._onSelectCreateCharacter.bind(this), 'select').addAction(this._backButton, this.openPreviousMenu.bind(this), 'select');
        }
    }, {
        key: '_onSelectCreateWorld',
        value: function _onSelectCreateWorld() {
            this._app.sceneManager.setScene(new _GameScene2.default());
        }
    }, {
        key: '_onSelectCreateCharacter',
        value: function _onSelectCreateCharacter() {
            this._app.sceneManager.setScene(new _GameScene2.default());
        }
    }]);

    return NewGameMenu;
}(_Menu3.default);

exports.default = NewGameMenu;

/***/ }),
/* 13 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _exojs = __webpack_require__(0);

var _MapGenerator = __webpack_require__(14);

var _MapGenerator2 = _interopRequireDefault(_MapGenerator);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

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
     * @member {Tileset}
     */
    this._tileset = tileset;

    /**
     * @private
     * @member {Size}
     */
    this._tileSize = new _exojs.Size(64, 64);

    /**
     * @private
     * @member {Vector}
     */
    this._tileCount = new _exojs.Vector(256, 256);

    /**
     * @private
     * @member {Sprite}
     */
    this._tile = new _exojs.Sprite(tileset.texture);
    this._tile.width = this._tileSize.width;
    this._tile.height = this._tileSize.height;

    /**
     * @private
     * @member {MapGenerator}
     */
    this._mapGenerator = new _MapGenerator2.default();

    /**
     * @private
     * @member {Number[]}
     */
    this._mapData = this._mapGenerator.generate(this._tileCount.x, this._tileCount.y);

    /**
     * @private
     * @member {Rectangle}
     */
    this._bounds = new _exojs.Rectangle(0, 0, this._tileCount.x * this._tileSize.width, this._tileCount.y * this._tileSize.height);
  }

  /**
   * @public
   * @readonly
   * @member {Number}
   */


  _createClass(WorldMap, [{
    key: 'update',


    /**
     * @public
     * @param {Time} delta
     */
    value: function update(delta) {}

    /**
     * @public
     * @param {RenderManager} renderManager
     */

  }, {
    key: 'render',
    value: function render(renderManager) {
      var camera = renderManager.renderTarget.view,
          viewport = camera.getBounds(),
          mapData = this._mapData,
          tile = this._tile,
          tileset = this._tileset,
          tilesX = this._tileCount.x,
          tilesY = this._tileCount.y,
          tileWidth = this._tileSize.width,
          tileHeight = this._tileSize.height,
          tilesHorizontal = viewport.width / tileWidth + 2 | 0,
          tilesVertical = viewport.height / tileHeight + 2 | 0,
          startTileX = _exojs.utils.clamp(viewport.x / tileWidth, 0, tilesX - tilesHorizontal) | 0,
          startTileY = _exojs.utils.clamp(viewport.y / tileHeight, 0, tilesY - tilesVertical) | 0,
          startTileIndex = startTileY * tilesX + startTileX,
          tilesTotal = tilesHorizontal * tilesVertical;

      for (var i = 0; i < tilesTotal; i++) {
        var x = i % tilesHorizontal | 0,
            y = i / tilesHorizontal | 0,
            index = startTileIndex + (y * tilesX + x);

        tileset.setBlock(tile, mapData[index]);

        tile.x = (startTileX + x) * tileWidth;
        tile.y = (startTileY + y) * tileHeight;

        tile.render(renderManager);
      }
    }
  }, {
    key: 'bounds',
    get: function get() {
      return this._bounds;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */

  }, {
    key: 'width',
    get: function get() {
      return this._bounds.width;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */

  }, {
    key: 'height',
    get: function get() {
      return this._bounds.height;
    }
  }]);

  return WorldMap;
}();

exports.default = WorldMap;

/***/ }),
/* 14 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _PerlinNoiseGenerator = __webpack_require__(15);

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
/* 15 */
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
/* 16 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _exojs = __webpack_require__(0);

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var

/**
 * @inner
 * @member {Object<String, Number>}
 */
DIRECTION = {
    UP: 0,
    RIGHT: 1,
    DOWN: 2,
    LEFT: 3
};

/**
 * @class Player
 * @extends Sprite
 */

var Player = function (_Sprite) {
    _inherits(Player, _Sprite);

    /**
     * @constructor
     * @param {Application} app
     * @param {Object} options
     * @param {Vector} options.spawnPoint
     * @param {Rectangle} options.worldBounds
     */
    function Player(app, _ref) {
        var _ref$spawnPoint = _ref.spawnPoint,
            spawnPoint = _ref$spawnPoint === undefined ? new _exojs.Vector() : _ref$spawnPoint,
            _ref$worldBounds = _ref.worldBounds,
            worldBounds = _ref$worldBounds === undefined ? new _exojs.Rectangle() : _ref$worldBounds;

        _classCallCheck(this, Player);

        /**
         * @private
         * @member {Application}
         */
        var _this = _possibleConstructorReturn(this, (Player.__proto__ || Object.getPrototypeOf(Player)).call(this, app.loader.resources.get('texture', 'game/player')));

        _this._app = app;

        /**
         * @private
         * @member {Rectangle}
         */
        _this._worldBounds = worldBounds.clone();

        /**
         * @private
         * @member {Vector}
         */
        _this._spawnPoint = spawnPoint.clone();

        /**
         * @private
         * @member {Boolean}
         */
        _this._moving = false;

        /**
         * @private
         * @member {Number}
         */
        _this._direction = DIRECTION.DOWN;

        /**
         * @private
         * @member {Vector}
         */
        _this._velocity = new _exojs.Vector();

        /**
         * @private
         * @member {Size}
         */
        _this._frameSize = new _exojs.Size(96, 96);

        /**
         * @private
         * @member {Number}
         */
        _this._frameIndex = 0;

        /**
         * @private
         * @member {Number}
         */
        _this._frameCount = 8;

        /**
         * @private
         * @member {Timer}
         */
        _this._frameTimer = new _exojs.Timer(false, 100);

        /**
         * @private
         * @member {Boolean}
         */
        _this._frameChanged = false;

        /**
         * @private
         * @member {Rectangle}
         */
        _this._frame = new _exojs.Rectangle(_this._direction * _this._frameSize.width, _this._frameIndex * _this._frameSize.height, _this._frameSize.width, _this._frameSize.height);

        /**
         * @private
         * @member {Number}
         */
        _this._walkingSpeed = 192;

        /**
         * @private
         * @member {Number}
         */
        _this._runningSpeed = 256;

        /**
         * @private
         * @member {Number}
         */
        _this._speed = _this._walkingSpeed;

        _this._addInputs();
        _this._updateFrame();
        _this.setOrigin(0.5, 1);
        _this.setPosition(_this._spawnPoint.x, _this._spawnPoint.y);
        return _this;
    }

    /**
     * @public
     * @param {Time} delta
     */


    _createClass(Player, [{
        key: 'update',
        value: function update(delta) {
            this._updatePosition(delta);

            if (this._frameChanged) {
                this._updateFrame();
                this._frameChanged = false;
            }

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'setPosition',
        value: function setPosition(x, y) {
            this.position.set(_exojs.utils.clamp(x, this._worldBounds.left, this._worldBounds.right), _exojs.utils.clamp(y, this._worldBounds.top, this._worldBounds.bottom));

            return this;
        }

        /**
         * @override
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            _get(Player.prototype.__proto__ || Object.getPrototypeOf(Player.prototype), 'destroy', this).call(this);

            this._removeInputs();

            this._worldBounds.destroy();
            this._worldBounds = null;

            this._spawnPoint.destroy();
            this._spawnPoint = null;

            this._frameSize.destroy();
            this._frameSize = null;

            this._frame.destroy();
            this._frame = null;

            this._frameTimer.destroy();
            this._frameTimer = null;

            this._frameIndex = null;
            this._frameCount = null;
            this._direction = null;
            this._moving = null;
            this._speed = null;
            this._app = null;
        }

        /**
         * @private
         * @param {Number} direction
         */

    }, {
        key: '_setDirection',
        value: function _setDirection(direction) {
            if (this._direction !== direction) {
                this._direction = direction;
                this._frameChanged = true;
            }

            return this;
        }

        /**
         * @private
         */

    }, {
        key: '_updateDirection',
        value: function _updateDirection() {
            var _velocity = this._velocity,
                x = _velocity.x,
                y = _velocity.y;


            if (x > 0) {
                this._setDirection(DIRECTION.RIGHT);
            } else if (x < 0) {
                this._setDirection(DIRECTION.LEFT);
            }

            if (y > 0.5) {
                this._setDirection(DIRECTION.DOWN);
            } else if (y < -0.5) {
                this._setDirection(DIRECTION.UP);
            }

            return this;
        }

        /**
         * @private
         */

    }, {
        key: '_updateFrameIndex',
        value: function _updateFrameIndex() {
            if (this._moving && this._frameTimer.expired) {
                this._frameTimer.restart();
                this._setFrameIndex(this._frameIndex + 1);
            }

            return this;
        }

        /**
         * @private
         * @param {Number} index
         */

    }, {
        key: '_setFrameIndex',
        value: function _setFrameIndex(index) {
            var frameIndex = index % this._frameCount;

            if (this._frameIndex !== frameIndex) {
                this._frameIndex = frameIndex;
                this._frameChanged = true;
            }

            return this;
        }

        /**
         * @private
         * @param {Time} delta
         */

    }, {
        key: '_updatePosition',
        value: function _updatePosition(delta) {
            var mag = this._velocity.magnitude;

            if (mag > 0) {
                var distance = this._speed * delta.seconds,
                    velX = this._velocity.x,
                    velY = this._velocity.y,
                    offsetX = (mag > 1 ? velX / mag : velX) * distance,
                    offsetY = (mag > 1 ? velY / mag : velY) * distance;

                this.move(offsetX, offsetY);
                this._updateDirection();

                if (!this._moving) {
                    this._moving = true;
                    this._frameTimer.restart();
                    this._setFrameIndex(1);
                }

                this.trigger('move', this.x, this.y, this);
            } else if (this._moving) {
                this._moving = false;
                this._frameTimer.stop();
                this._setFrameIndex(0);
            }

            this._updateFrameIndex();
            this._velocity.set(0, 0);

            return this;
        }

        /**
         * @private
         */

    }, {
        key: '_updateFrame',
        value: function _updateFrame() {
            this.setTextureFrame(this._frame.setPosition(this._direction * this._frameSize.width, this._frameIndex * this._frameSize.height));

            return this;
        }

        /**
         * @private
         */

    }, {
        key: '_addInputs',
        value: function _addInputs() {
            this._moveUpInput = new _exojs.Input([_exojs.KEYBOARD.Up, _exojs.KEYBOARD.W, _exojs.GAMEPAD.LeftStickUp, _exojs.GAMEPAD.DPadUp], {
                context: this,
                active: function active(value) {
                    this._velocity.add(0, value * -1);
                }
            });

            this._moveDownInput = new _exojs.Input([_exojs.KEYBOARD.Down, _exojs.KEYBOARD.S, _exojs.GAMEPAD.LeftStickDown, _exojs.GAMEPAD.DPadDown], {
                context: this,
                active: function active(value) {
                    this._velocity.add(0, value);
                }
            });

            this._moveLeftInput = new _exojs.Input([_exojs.KEYBOARD.Left, _exojs.KEYBOARD.A, _exojs.GAMEPAD.LeftStickLeft, _exojs.GAMEPAD.DPadLeft], {
                context: this,
                active: function active(value) {
                    this._velocity.add(value * -1, 0);
                }
            });

            this._moveRightInput = new _exojs.Input([_exojs.KEYBOARD.Right, _exojs.KEYBOARD.D, _exojs.GAMEPAD.LeftStickRight, _exojs.GAMEPAD.DPadRight], {
                context: this,
                active: function active(value) {
                    this._velocity.add(value, 0);
                }
            });

            this._toggleRunInput = new _exojs.Input([_exojs.KEYBOARD.Shift, _exojs.GAMEPAD.FaceLeft], {
                context: this,
                start: function start() {
                    this._speed = this._runningSpeed;
                },
                stop: function stop() {
                    this._speed = this._walkingSpeed;
                }
            });

            this._app.inputManager.add([this._moveUpInput, this._moveDownInput, this._moveLeftInput, this._moveRightInput, this._toggleRunInput]);
        }

        /**
         * @private
         */

    }, {
        key: '_removeInputs',
        value: function _removeInputs() {
            this.app.inputManager.remove([this._moveUpInput, this._moveDownInput, this._moveLeftInput, this._moveRightInput, this._toggleRunInput]);

            this._moveUpInput.destroy();
            this._moveUpInput = null;

            this._moveDownInput.destroy();
            this._moveDownInput = null;

            this._moveLeftInput.destroy();
            this._moveLeftInput = null;

            this._moveRightInput.destroy();
            this._moveRightInput = null;

            this._toggleRunInput.destroy();
            this._toggleRunInput = null;
        }
    }]);

    return Player;
}(_exojs.Sprite);

exports.default = Player;

/***/ }),
/* 17 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _AutoTile = __webpack_require__(18);

var _AutoTile2 = _interopRequireDefault(_AutoTile);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * @class Tileset
 */
var Tileset = function () {

    /**
     * @constructor
     * @param {Texture} texture
     * @param {Number} tileSize
     */
    function Tileset(texture, tileSize) {
        _classCallCheck(this, Tileset);

        /**
         * @private
         * @member {Texture}
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
     * @member {Texture}
     */


    _createClass(Tileset, [{
        key: 'setBlock',


        /**
         * @public
         * @param {Sprite} tile
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
                tile.setTextureFrame(this._tiles[block].tileRect, false);
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
/* 18 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _exojs = __webpack_require__(0);

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
         * @member {Rectangle}
         */
        this._fullRect = new _exojs.Rectangle(x * this._width, y * this._height, this._width, this._height);

        /**
         * @private
         * @member {Rectangle}
         */
        this._tileRect = new _exojs.Rectangle(this._fullRect.x + tileSize * 0.5, this._fullRect.y + tileSize * 1.5, tileSize, tileSize);
    }

    /**
     * @public
     * @member {Number}
     */


    _createClass(AutoTile, [{
        key: 'width',
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
        key: 'height',
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
        key: 'tileSize',
        get: function get() {
            return this._tileSize;
        },
        set: function set(value) {
            this._tileSize = value;
        }

        /**
         * @public
         * @member {Rectangle}
         */

    }, {
        key: 'fullRect',
        get: function get() {
            return this._fullRect;
        },
        set: function set(value) {
            this._fullRect.copy(value);
        }

        /**
         * @public
         * @member {Rectangle}
         */

    }, {
        key: 'tileRect',
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
/* 19 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Menu2 = __webpack_require__(2);

var _Menu3 = _interopRequireDefault(_Menu2);

var _MenuItem = __webpack_require__(1);

var _MenuItem2 = _interopRequireDefault(_MenuItem);

var _GameScene = __webpack_require__(3);

var _GameScene2 = _interopRequireDefault(_GameScene);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class LoadGameMenu
 * @extends Menu
 */
var LoadGameMenu = function (_Menu) {
    _inherits(LoadGameMenu, _Menu);

    /**
     * @constructor
     * @param {Application} app
     * @param {String} parentMenu
     */
    function LoadGameMenu(app, parentMenu) {
        _classCallCheck(this, LoadGameMenu);

        var _this = _possibleConstructorReturn(this, (LoadGameMenu.__proto__ || Object.getPrototypeOf(LoadGameMenu)).call(this, app, parentMenu));

        var canvas = app.canvas,
            centerX = canvas.width / 2,
            offsetY = 50;

        /**
         * @private
         * @member {MenuItem}
         */
        _this._LoadGameTitle = new _MenuItem2.default('Load Game:');
        _this._LoadGameTitle.setPosition(centerX, canvas.height / 3);

        /**
         * @private
         * @member {MenuItem}
         */
        _this._loadWorldButton = new _MenuItem2.default('Load World');
        _this._loadWorldButton.setPosition(centerX, _this._LoadGameTitle.bottom + offsetY);

        /**
         * @private
         * @member {MenuItem}
         */
        _this._backButton = new _MenuItem2.default('Back');
        _this._backButton.setPosition(centerX, _this._loadWorldButton.bottom + offsetY);

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
            this._app.sceneManager.setScene(new _GameScene2.default());
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
/* 20 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Menu2 = __webpack_require__(2);

var _Menu3 = _interopRequireDefault(_Menu2);

var _MenuItem = __webpack_require__(1);

var _MenuItem2 = _interopRequireDefault(_MenuItem);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class SettingsMenu
 * @extends Menu
 */
var SettingsMenu = function (_Menu) {
  _inherits(SettingsMenu, _Menu);

  /**
   * @constructor
   * @param {Application} app
   * @param {String} previousMenu
   */
  function SettingsMenu(app, previousMenu) {
    _classCallCheck(this, SettingsMenu);

    var _this = _possibleConstructorReturn(this, (SettingsMenu.__proto__ || Object.getPrototypeOf(SettingsMenu)).call(this, app, previousMenu));

    var canvas = app.canvas,
        centerX = canvas.width / 2,
        offsetY = 50;

    /**
     * @private
     * @member {MenuItem}
     */
    _this._settingsTitle = new _MenuItem2.default('Settings:');
    _this._settingsTitle.setPosition(centerX, canvas.height / 3);

    /**
     * @private
     * @member {MenuItem}
     */
    _this._masterVolumeButton = new _MenuItem2.default('Master Volume: 100%');
    _this._masterVolumeButton.setPosition(centerX, _this._settingsTitle.bottom + offsetY);

    /**
     * @private
     * @member {MenuItem}
     */
    _this._musicVolumeButton = new _MenuItem2.default('Music Volume: 100%');
    _this._musicVolumeButton.setPosition(centerX, _this._masterVolumeButton.bottom + offsetY);

    /**
     * @private
     * @member {MenuItem}
     */
    _this._soundsVolumeButton = new _MenuItem2.default('Sound Volume: 100%');
    _this._soundsVolumeButton.setPosition(centerX, _this._musicVolumeButton.bottom + offsetY);

    /**
     * @private
     * @member {MenuItem}
     */
    _this._backButton = new _MenuItem2.default('Back');
    _this._backButton.setPosition(centerX, _this._soundsVolumeButton.bottom + offsetY);

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
      return this.addChild(this._settingsTitle).addChild(this._masterVolumeButton).addChild(this._musicVolumeButton).addChild(this._soundsVolumeButton).addChild(this._backButton);
    }

    /**
     * @private
     */

  }, {
    key: '_addPaths',
    value: function _addPaths() {
      return this.addPath(this._masterVolumeButton, this._musicVolumeButton, 'down', 'up').addPath(this._musicVolumeButton, this._soundsVolumeButton, 'down', 'up').addPath(this._soundsVolumeButton, this._backButton, 'down', 'up').addPath(this._backButton, this._masterVolumeButton, 'down', 'up');
    }

    /**
     * @private
     */

  }, {
    key: '_addActions',
    value: function _addActions() {
      return this.addAction(this._masterVolumeButton, this._onOptionLeftHandler, 'left').addAction(this._masterVolumeButton, this._onOptionRightHandler, 'right').addAction(this._musicVolumeButton, this._onOptionLeftHandler, 'left').addAction(this._musicVolumeButton, this._onOptionRightHandler, 'right').addAction(this._soundsVolumeButton, this._onOptionLeftHandler, 'left').addAction(this._soundsVolumeButton, this._onOptionRightHandler, 'right').addAction(this._backButton, this.openPreviousMenu.bind(this), 'select');
    }

    /**
     * @private
     * @param {MenuAction} action
     */

  }, {
    key: '_onOptionLeft',
    value: function _onOptionLeft(action) {}

    /**
     * @private
     * @param {MenuAction} action
     */

  }, {
    key: '_onOptionRight',
    value: function _onOptionRight(action) {}
  }]);

  return SettingsMenu;
}(_Menu3.default);

exports.default = SettingsMenu;

/***/ })
/******/ ]);
//# sourceMappingURL=game.build.js.map