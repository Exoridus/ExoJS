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
        canvasParent: document.body
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

var random = Exo.Utils.random;

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

      loader.add('texture', 'particle', 'image/particle.png').load().then(function () {
        return _this2.game.trigger('scene:start');
      });
    }
  }, {
    key: 'init',
    value: function init() {
      var _this3 = this;

      /**
       * @private
       * @member {Exo.Texture}
       */
      this.texture = this.game.loader.resources.get('texture', 'particle');

      /**
       * @private
       * @member {Exo.Color}
       */
      this.color = new Exo.Color();

      /**
       * @private
       * @member {Exo.Vector}
       */
      this.velocity = new Exo.Vector();

      /**
       * @private
       * @member {Exo.ParticleEmitter}
       */
      this.emitter = new Exo.ParticleEmitter(this.texture);
      this.emitter.emissionRate = 30;
      this.emitter.particleLifeTime = new Exo.Time(5, Exo.Time.Seconds);
      this.emitter.addModifier(new Exo.TorqueModifier(100));
      this.emitter.addModifier(new Exo.ForceModifier(new Exo.Vector(0, 100)));

      this.game.on('mouse:move', function (mouse) {
        _this3.emitter.particlePosition.set(mouse.x - _this3.texture.width / 2, mouse.y - _this3.texture.height / 2);
      });
    }

    /**
     * @param {Exo.Time} delta
     */

  }, {
    key: 'update',
    value: function update(delta) {
      this.emitter.particleColor = this.color.set(random(0, 255), random(0, 255), random(0, 255), random(0, 1));
      this.emitter.particleVelocity = this.velocity.set(random(-100, 100), random(-100, 0));
      this.emitter.update(delta);

      this.game.trigger('display:begin').trigger('display:render', this.emitter).trigger('display:end');
    }
  }]);

  return GameScene;
}(Exo.Scene);

exports.default = GameScene;

/***/ })
/******/ ]);
//# sourceMappingURL=particles.build.js.map