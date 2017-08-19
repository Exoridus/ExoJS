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
        canvas: document.querySelector('#background'),
        width: window.innerWidth,
        height: window.innerHeight
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

            loader.add('music', 'example', 'audio/example.ogg').load().then(function () {
                return _this2.game.trigger('scene:start');
            });
        }
    }, {
        key: 'init',
        value: function init() {
            var _this3 = this;

            var game = this.game;

            /**
             * @private
             * @member {Exo.Music}
             */
            this._music = game.loader.resources.get('music', 'example');

            /**
             * @private
             * @member {Exo.AudioAnalyser}
             */
            this._analyser = new Exo.AudioAnalyser(game.audioManager);

            /**
             * @private
             * @member {HTMLCanvasElement}
             */
            this._canvas = document.querySelector('#foreground');

            /**
             * @private
             * @member {CanvasRenderingContext2D}
             */
            this._context = this._canvas.getContext('2d');

            /**
             * @private
             * @member {Exo.Color}
             */
            this._flashColor = new Exo.Color();

            /**
             * @private
             * @member {Exo.Time}
             */
            this._time = new Exo.Time();

            /**
             * @private
             * @member {CanvasRenderingContext2D}
             */
            this._toggleInput = new Exo.Input([Exo.Keyboard.Space]);

            this._toggleInput.on('trigger', function () {
                _this3._music.toggle();
            });

            window.addEventListener('resize', this.updateCanvas.bind(this));

            this.updateCanvas();

            game.trigger('input:add', this._toggleInput).trigger('audio:play', this._music, {
                loop: true
            });
        }

        /**
         * @param {Exo.Time} delta
         */

    }, {
        key: 'update',
        value: function update(delta) {
            if (this._music.paused) {
                return;
            }

            var canvas = this._canvas,
                context = this._context,
                freqData = this._analyser.getFrequencyData(),
                timeDomain = this._analyser.getTimeDomainData(),
                time = this._time.add(delta).asSeconds(),
                width = canvas.width,
                height = canvas.height,
                length = freqData.length,
                barWidth = Math.ceil(width / length),
                redModifier = Math.cos(time) * 0.5 + 0.5,
                greenModifier = Math.sin(time) * 0.5 + 0.5;

            var r = 0,
                g = 0,
                b = 0;


            for (var i = 0; i < length; i++) {
                switch (i / (length / 3) | 0) {
                    case 0:
                        r += freqData[i] * redModifier;
                        break;
                    case 1:
                        g += freqData[i] * greenModifier;
                        break;
                    case 2:
                        b += freqData[i];
                        break;
                }
            }

            this.game.trigger('display:clear', this._flashColor.set(r / length, g / length, b / length));
            context.clearRect(0, 0, width, height);

            context.beginPath();

            for (var _i = 0; _i < length; _i++) {
                var barHeight = height * freqData[_i] / 255,
                    lineHeight = height * timeDomain[_i] / 255,
                    offsetX = _i * barWidth | 0;

                context.fillRect(offsetX, height / 2 - barHeight / 2 | 0, barWidth, barHeight | 0);
                context.lineTo(offsetX, height * 0.75 - lineHeight / 2 | 0);
            }

            context.stroke();
        }
    }, {
        key: 'updateCanvas',
        value: function updateCanvas() {
            var canvas = this._canvas,
                context = this._context,
                width = window.innerWidth,
                height = window.innerHeight,
                effectHeight = height * 0.75 | 0,
                gradient = context.createLinearGradient(0, 0, 0, effectHeight);

            gradient.addColorStop(0, '#f70');
            gradient.addColorStop(0.5, '#f30');
            gradient.addColorStop(1, '#f70');

            this.game.trigger('display:resize', width, height);

            canvas.width = width;
            canvas.height = effectHeight;

            context.fillStyle = gradient;
            context.strokeStyle = '#fff';
            context.lineWidth = 4;
            context.lineCap = 'round';
            context.lineJoin = 'round';
        }
    }]);

    return GameScene;
}(Exo.Scene);

exports.default = GameScene;

/***/ })
/******/ ]);
//# sourceMappingURL=audio.build.js.map