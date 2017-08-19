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
/******/ 	return __webpack_require__(__webpack_require__.s = 2);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _MenuPath = __webpack_require__(8);

var _MenuPath2 = _interopRequireDefault(_MenuPath);

var _MenuAction = __webpack_require__(9);

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
         * @member {MenuItem|null}
         */
        _this._startChild = null;

        /**
         * @public
         * @member {MenuItem|null}
         */
        _this._activeChild = null;

        /**
         * @public
         * @member {String|null}
         */
        _this._previousMenu = previousMenu;
        return _this;
    }

    /**
     * @public
     * @member {String}
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
/* 1 */
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
   * @param {MenuItem} [previousItem=null]
   */
  function MenuItem(text) {
    var previousItem = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

    _classCallCheck(this, MenuItem);

    /**
     * @private
     * @member {Number}
     */
    var _this = _possibleConstructorReturn(this, (MenuItem.__proto__ || Object.getPrototypeOf(MenuItem)).call(this, text, {
      color: 'white',
      fontSize: 45,
      fontFamily: 'AndyBold',
      outlineColor: 'black',
      outlineWidth: 5
    }, Exo.ScaleModes.Linear));

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
      this._ticker += delta.asSeconds();
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
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _LauncherScene = __webpack_require__(3);

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

    game.loader.requestQuery = '?no-cache=' + Date.now();
    // game.loader.database = new Exo.Database('game', 1);

    WebFont.load({
        classes: false,
        custom: {
            families: ['AndyBold']
        },
        active: function active() {
            game.start(new _LauncherScene2.default());
        }
    });
}, false); /* global WebFont */

/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _TitleScene = __webpack_require__(4);

var _TitleScene2 = _interopRequireDefault(_TitleScene);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Keyboard = Exo.Keyboard,
    Gamepad = Exo.Gamepad,
    degreesToRadians = Exo.Utils.degreesToRadians;

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

            loader.on('progress', function (resource, index, length) {
                _this2._renderProgress(index / length * 100);
            }).addList('image', {
                'title/logo': 'image/title/logo.png',
                'game/tileset': 'image/game/tileset.png'
            }).addList('texture', {
                'title/background': 'image/title/background.jpg',
                'game/player': 'image/game/player.png'
            }).addList('music', {
                'title/background': 'audio/title/background.ogg',
                'game/background': 'audio/game/background.ogg'
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
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _TitleMenuManager = __webpack_require__(5);

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
    key: 'load',


    /**
     * @override
     */
    value: function load(loader) {
      var _this2 = this;

      loader.add('image', 'title/logo', 'image/title/logo.png').add('texture', 'title/background', 'image/title/background.jpg').add('music', 'title/background', 'audio/title/background.ogg').load().then(function () {
        return _this2.game.trigger('scene:start');
      });
    }

    /**
     * @override
     */

  }, {
    key: 'init',
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
      this._titleBackground = new Exo.Sprite(resources.get('texture', 'title/background'));

      /**
       * @private
       * @member {Exo.Music}
       */
      this._titleMusic = resources.get('music', 'title/background');

      this.game.trigger('audio:play', this._titleMusic, {
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
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _MenuManager2 = __webpack_require__(6);

var _MenuManager3 = _interopRequireDefault(_MenuManager2);

var _MainMenu = __webpack_require__(7);

var _MainMenu2 = _interopRequireDefault(_MainMenu);

var _NewGameMenu = __webpack_require__(11);

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
/* 6 */
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
         * @member {Map<String, Menu>}
         */
        this._menus = new Map();

        /**
         * @private
         * @member {Menu|null}
         */
        this._currentMenu = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._enabled = false;

        /**
         * @private
         * @member {Exo.Input}
         */
        this._upInput = new Exo.Input([Keyboard.Up, Gamepad.DPadUp, Gamepad.LeftStickUp]);

        this._upInput.on('start', this.onInputUp, this);

        /**
         * @private
         * @member {Exo.Input}
         */
        this._downInput = new Exo.Input([Keyboard.Down, Gamepad.LeftStickDown, Gamepad.DPadDown]);

        this._downInput.on('start', this.onInputDown, this);

        /**
         * @private
         * @member {Exo.Input}
         */
        this._leftInput = new Exo.Input([Keyboard.Left, Gamepad.LeftStickLeft, Gamepad.DPadLeft]);

        this._leftInput.on('start', this.onInputLeft, this);

        /**
         * @private
         * @member {Exo.Input}
         */
        this._rightInput = new Exo.Input([Keyboard.Right, Gamepad.LeftStickRight, Gamepad.DPadRight]);

        this._rightInput.on('start', this.onInputRight, this);

        /**
         * @private
         * @member {Exo.Input}
         */
        this._selectInput = new Exo.Input([Keyboard.Enter, Gamepad.FaceButtonBottom]);

        this._selectInput.on('start', this.onInputSelect, this);

        /**
         * @private
         * @member {Exo.Input}
         */
        this._backInput = new Exo.Input([Keyboard.Backspace, Gamepad.FaceButtonRight]);

        this._backInput.on('start', this.onInputBack, this);
    }

    /**
     * @private
     */


    _createClass(MenuManager, [{
        key: 'onInputUp',
        value: function onInputUp() {
            if (this._currentMenu) {
                this._currentMenu.onInputUp();
            }
        }

        /**
         * @private
         */

    }, {
        key: 'onInputDown',
        value: function onInputDown() {
            if (this._currentMenu) {
                this._currentMenu.onInputDown();
            }
        }

        /**
         * @private
         */

    }, {
        key: 'onInputLeft',
        value: function onInputLeft() {
            if (this._currentMenu) {
                this._currentMenu.onInputLeft();
            }
        }

        /**
         * @private
         */

    }, {
        key: 'onInputRight',
        value: function onInputRight() {
            if (this._currentMenu) {
                this._currentMenu.onInputRight();
            }
        }

        /**
         * @private
         */

    }, {
        key: 'onInputSelect',
        value: function onInputSelect() {
            if (this._currentMenu) {
                this._currentMenu.onInputSelect();
            }
        }

        /**
         * @private
         */

    }, {
        key: 'onInputBack',
        value: function onInputBack() {
            if (this._currentMenu) {
                this._currentMenu.onInputBack();
            }
        }

        /**
         * @public
         * @param {String} startMenu
         */

    }, {
        key: 'enable',
        value: function enable(startMenu) {
            if (this._enabled) {
                return;
            }

            this._enabled = true;

            this._game.trigger('input:add', [this._upInput, this._downInput, this._leftInput, this._rightInput, this._selectInput, this._backInput]);

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

            this._game.trigger('input:remove', [this._upInput, this._downInput, this._leftInput, this._rightInput, this._selectInput, this._backInput]);

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
         * @param {Exo.DisplayManager} diplayManager
         * @param {Exo.Transform} worldTransform
         */

    }, {
        key: 'draw',
        value: function draw(diplayManager, worldTransform) {
            if (this._currentMenu) {
                this._currentMenu.draw(diplayManager, worldTransform);
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

            this._upInput.destroy();
            this._upInput = null;

            this._downInput.destroy();
            this._downInput = null;

            this._leftInput.destroy();
            this._leftInput = null;

            this._rightInput.destroy();
            this._rightInput = null;

            this._selectInput.destroy();
            this._selectInput = null;

            this._backInput.destroy();
            this._backInput = null;

            this._currentMenu = null;
            this._game = null;
        }
    }]);

    return MenuManager;
}();

exports.default = MenuManager;

/***/ }),
/* 7 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Menu2 = __webpack_require__(0);

var _Menu3 = _interopRequireDefault(_Menu2);

var _MenuItem = __webpack_require__(1);

var _MenuItem2 = _interopRequireDefault(_MenuItem);

var _VersionText = __webpack_require__(10);

var _VersionText2 = _interopRequireDefault(_VersionText);

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
    _this._gameLogo = new Exo.Sprite(new Exo.Texture(resources.get('image', 'title/logo'), Exo.ScaleModes.Linear));
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

      this._ticker += delta.asSeconds();
      this._gameLogo.rotation = Math.sin(this._ticker * Math.PI / 2) * 10;
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
/* 8 */
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
/* 9 */
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
/* 10 */
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
            color: 'white',
            fontSie: 25,
            fontFamily: 'AndyBold',
            outlineColor: 'black',
            outlineWidth: 3
        }, Exo.ScaleModes.Linear));

        _this.setOrigin(1, 1);
        _this.setPosition(viewportWidth - 10, viewportHeight);
        return _this;
    }

    return VersionText;
}(Exo.Text);

exports.default = VersionText;

/***/ }),
/* 11 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Menu2 = __webpack_require__(0);

var _Menu3 = _interopRequireDefault(_Menu2);

var _MenuItem = __webpack_require__(1);

var _MenuItem2 = _interopRequireDefault(_MenuItem);

var _GameScene = __webpack_require__(12);

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
     * @param {String|null} [parentMenu=null]
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
/* 12 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

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

var Keyboard = Exo.Keyboard,
    Gamepad = Exo.Gamepad,
    clamp = Exo.Utils.clamp;

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
        key: 'load',


        /**
         * @override
         */
        value: function load(loader) {
            var _this2 = this;

            loader.add('image', 'game/tileset', 'images/game/tileset.png').addList('texture', {
                'game/player': 'images/game/player.png'
            }).addList('music', {
                'game/background': 'audio/game/background.ogg'
            }).load().then(function () {
                return _this2.game.trigger('scene:start');
            });
        }

        /**
         * @override
         */

    }, {
        key: 'init',
        value: function init() {
            var game = this.game,
                resources = game.loader.resources;

            /**
             * @private
             * @member {WorldMap}
             */
            this._worldMap = new _WorldMap2.default(new _Tileset2.default(resources.get('image', 'game/tileset'), 32));

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

            game.trigger('audio:play', this._backgroundMusic, {
                loop: true
            });

            this._initInputs();
            this._updateCamera();
        }

        /**
         * @override
         */

    }, {
        key: 'update',
        value: function update(delta) {
            this._worldMap.draw(this.game, this._camera);

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
         */

    }, {
        key: '_toggleMenu',
        value: function _toggleMenu() {
            this._paused = !this._paused;

            if (this._paused) {
                // show pause menu
            } else {
                    // hide pause menu
                }
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

            this.game.trigger('view:update', camera);
        }

        /**
         * @private
         */

    }, {
        key: '_initInputs',
        value: function _initInputs() {
            var _this3 = this;

            var toggleMenuInput = new Exo.Input([Keyboard.Escape, Gamepad.Start]),
                moveUpInput = new Exo.Input([Keyboard.Up, Keyboard.W, Gamepad.LeftStickUp, Gamepad.DPadUp]),
                moveDownInput = new Exo.Input([Keyboard.Down, Keyboard.S, Gamepad.LeftStickDown, Gamepad.DPadDown]),
                moveLeftInput = new Exo.Input([Keyboard.Left, Keyboard.A, Gamepad.LeftStickLeft, Gamepad.DPadLeft]),
                moveRightInput = new Exo.Input([Keyboard.Right, Keyboard.D, Gamepad.LeftStickRight, Gamepad.DPadRight]),
                runningInput = new Exo.Input([Keyboard.Shift, Gamepad.RightTriggerTop]);

            toggleMenuInput.on('trigger', this._toggleMenu, this);

            moveUpInput.on('active', function (value) {
                _this3._movePlayer(0, value * -1);
            });

            moveDownInput.on('active', function (value) {
                _this3._movePlayer(0, value);
            });

            moveLeftInput.on('active', function (value) {
                _this3._movePlayer(value * -1, 0);
            });

            moveRightInput.on('active', function (value) {
                _this3._movePlayer(value, 0);
            });

            runningInput.on('start', function () {
                _this3._player.running = true;
            }).on('stop', function () {
                _this3._player.running = false;
            });

            this._inputs = [toggleMenuInput, moveUpInput, moveDownInput, moveLeftInput, moveRightInput, runningInput];

            this.game.trigger('input:add', this._inputs);
        }
    }]);

    return GameScene;
}(Exo.Scene);

exports.default = GameScene;

/***/ }),
/* 13 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _MapGenerator = __webpack_require__(14);

var _MapGenerator2 = _interopRequireDefault(_MapGenerator);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var clamp = Exo.Utils.clamp;

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
    this._tile = new Exo.Sprite(tileset);
    this._tile.setSize(this._tileSize, this._tileSize);
  }

  /**
   * @public
   * @readonly
   * @member {Number}
   */


  _createClass(WorldMap, [{
    key: 'draw',


    /**
     * @public
     * @param {Exo.Game} game
     * @param {Exo.View} camera
     */
    value: function draw(game, camera) {
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
         * @member {Float32Array|null}
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

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @class Tileset
 * @extends {Exo.Texture}
 */
var Tileset = function (_Exo$Texture) {
    _inherits(Tileset, _Exo$Texture);

    /**
     * @constructor
     * @param {HTMLImageElement} tileset
     * @param {Number} tileSize
     */
    function Tileset(tileset, tileSize) {
        _classCallCheck(this, Tileset);

        /**
         * @private
         * @member {Number}
         */
        var _this = _possibleConstructorReturn(this, (Tileset.__proto__ || Object.getPrototypeOf(Tileset)).call(this, tileset));

        _this._tileSize = tileSize;

        /**
         * @private
         * @member {Object<String, AutoTile>}
         */
        _this._tiles = {
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
        _this._waterLevel = 70;

        /**
         * @private
         * @member {Number}
         */
        _this._sandLevel = 95;

        /**
         * @private
         * @member {Number}
         */
        _this._grassLevel = 130;

        /**
         * @private
         * @member {Number}
         */
        _this._forestLevel = 150;

        /**
         * @private
         * @member {Number}
         */
        _this._dirtLevel = 170;
        return _this;
    }

    /**
     * @public
     * @param {Exo.String} tile
     * @param {Number} level
     */


    _createClass(Tileset, [{
        key: 'setBlock',
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
            tile.setTextureRect(this._tiles[block].tileRect, true);
        }
    }]);

    return Tileset;
}(Exo.Texture);

exports.default = Tileset;

/***/ }),
/* 18 */
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
/* 19 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Menu2 = __webpack_require__(0);

var _Menu3 = _interopRequireDefault(_Menu2);

var _MenuItem = __webpack_require__(1);

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
/* 20 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _Menu2 = __webpack_require__(0);

var _Menu3 = _interopRequireDefault(_Menu2);

var _MenuItem = __webpack_require__(1);

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

    var canvas = game.canvas;

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
    _this._musicVolumeButton = new _MenuItem2.default('Music Volume: ' + (game.audioManager.musicVolume * 100 | 0) + '%', _this._settingsTitle);

    /**
     * @private
     * @member {MenuItem}
     */
    _this._soundsVolumeButton = new _MenuItem2.default('Sound Volume: ' + (game.audioManager.soundVolume * 100 | 0) + '%', _this._musicVolumeButton);

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
      this.addPath(this._musicVolumeButton, this._soundsVolumeButton, 'down', 'up');
      this.addPath(this._soundsVolumeButton, this._backButton, 'down', 'up');
      this.addPath(this._backButton, this._musicVolumeButton, 'down', 'up');
    }

    /**
     * @private
     */

  }, {
    key: '_addActions',
    value: function _addActions() {
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
      var activeButton = action.item;

      if (activeButton === this._musicVolumeButton) {
        this._addMusicVolume(this._volumeStep * -1);
      } else if (activeButton === this._soundsVolumeButton) {
        this._addSoundVolume(this._volumeStep * -1);
      }
    }

    /**
     * @private
     * @param {MenuAction} action
     */

  }, {
    key: '_onOptionRight',
    value: function _onOptionRight(action) {
      var activeButton = action.item;

      if (activeButton === this._musicVolumeButton) {
        this._addMusicVolume(this._volumeStep);
      } else if (activeButton === this._soundsVolumeButton) {
        this._addSoundVolume(this._volumeStep);
      }
    }

    /**
     * @private
     * @param {Number} volume
     */

  }, {
    key: '_addMusicVolume',
    value: function _addMusicVolume(volume) {
      var audioManager = this._game.audioManager;

      audioManager.musicVolume += volume;

      this._musicVolumeButton.text = 'Music Volume: ' + (audioManager.musicVolume * 100 | 0) + '%';
    }

    /**
     * @private
     * @param {Number} volume
     */

  }, {
    key: '_addSoundVolume',
    value: function _addSoundVolume(volume) {
      var audioManager = this._game.audioManager;

      audioManager.soundVolume += volume;

      this._soundsVolumeButton.text = 'Sound Volume: ' + (audioManager.soundVolume * 100 | 0) + '%';
    }
  }]);

  return SettingsMenu;
}(_Menu3.default);

exports.default = SettingsMenu;

/***/ })
/******/ ]);
//# sourceMappingURL=game.build.js.map