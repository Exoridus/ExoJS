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


window.addEventListener('load', function () {
    var activeScript = null;

    var container = document.querySelector('.canvas-container'),
        stats = new Stats(),
        app = new Exo.Application({
        resourcePath: 'assets/',
        width: 800,
        height: 600
    }),
        loadExample = function loadExample() {
        app.stop();

        if (activeScript) {
            activeScript.parentNode.removeChild(activeScript);
        }

        activeScript = document.createElement('script');
        activeScript.type = 'text/javascript', activeScript.async = true, activeScript.src = 'src/js/examples/' + location.hash.slice(1) + '.js?no-cache=' + Date.now(), document.body.appendChild(activeScript);
    },
        getStats = function getStats() {
        var style = stats.dom.style;

        style.position = 'absolute';
        style.top = '0';
        style.left = '0';

        return stats.dom;
    };

    container.appendChild(app.canvas);
    container.appendChild(getStats());

    app.on('start', function () {
        return stats.begin();
    });
    app.on('update', function () {
        return stats.update();
    });
    app.on('stop', function () {
        return stats.end();
    });

    window.app = app;
    window.addEventListener('hashchange', loadExample, false);

    if (location.hash) {
        loadExample();
    } else {
        location.hash = 'sprite';
    }
});

/***/ })
/******/ ]);
//# sourceMappingURL=examples.build.js.map