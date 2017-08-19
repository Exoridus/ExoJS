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
/******/ 	return __webpack_require__(__webpack_require__.s = 0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _GameScene = __webpack_require__(1);

var _GameScene2 = _interopRequireDefault(_GameScene);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

window.addEventListener('load', function () {
    var game = new Exo.Game({
        basePath: 'assets/',
        canvasParent: document.body,
        width: 800,
        height: 600,
        clearColor: Exo.Color.White
    });

    game.start(new _GameScene2.default());
}, false);

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

/* global Exo, Stats */

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
        value: function load(loader) {
            var _this2 = this;

            loader.add('texture', 'bunny', 'image/bunny.png').load().then(function () {
                return _this2.game.trigger('scene:start');
            });
        }
    }, {
        key: 'init',
        value: function init() {
            var _this3 = this;

            var game = this.game,
                canvas = game.canvas;

            this.bunnies = [];
            this.bunnyTexture = game.loader.resources.get('texture', 'bunny');

            this.startAmount = 10;
            this.addAmount = 50;

            this.maxX = canvas.width;
            this.maxY = canvas.height;

            this.addInput = new Exo.Input([Exo.Keyboard.Space, Exo.Mouse.LeftButton, Exo.Gamepad.FaceButtonBottom]);

            this.addInput.on('active', function () {
                _this3.createBunnies(_this3.addAmount);
            });

            game.trigger('input:add', this.addInput);

            this.initStats();
            this.createBunnies(this.startAmount);
        }
    }, {
        key: 'initStats',
        value: function initStats() {
            this.stats = new Stats();

            this.counter = document.createElement('div');
            this.counter.className = 'counter';
            this.counter.innerHTML = '0 BUNNIES';

            document.body.appendChild(this.stats.domElement);
            document.body.appendChild(this.counter);
        }
    }, {
        key: 'createBunnies',
        value: function createBunnies(amount) {
            for (var i = 0; i < amount; i++) {
                var bunny = new Exo.Sprite(this.bunnyTexture);

                bunny.speedX = Math.random() * 10;
                bunny.speedY = Math.random() * 10;

                this.bunnies.push(bunny);
            }

            this.counter.innerHTML = this.bunnies.length + ' BUNNIES';
        }
    }, {
        key: 'update',
        value: function update() {
            var stats = this.stats,
                game = this.game,
                bunnies = this.bunnies,
                len = bunnies.length,
                maxX = this.maxX,
                maxY = this.maxY;

            stats.begin();
            game.trigger('display:begin');

            for (var i = 0; i < len; i++) {
                var bunny = bunnies[i];

                bunny.speedY += 0.75;
                bunny.move(bunny.speedX, bunny.speedY);

                if (bunny.x + bunny.width > maxX) {
                    bunny.speedX *= -1;
                    bunny.x = maxX - bunny.width;
                } else if (bunny.x < 0) {
                    bunny.speedX *= -1;
                    bunny.x = 0;
                }

                if (bunny.y + bunny.height > maxY) {
                    bunny.speedY *= -0.85;
                    bunny.y = maxY - bunny.height;

                    if (Math.random() > 0.5) {
                        bunny.speedY -= Math.random() * 6;
                    }
                } else if (bunny.y < 0) {
                    bunny.speedY *= -1;
                    bunny.y = 0;
                }

                game.trigger('display:render', bunny);
            }

            game.trigger('display:end');
            stats.end();
        }
    }]);

    return GameScene;
}(Exo.Scene);

exports.default = GameScene;

/***/ })
/******/ ]);
//# sourceMappingURL=benchmark.build.js.map