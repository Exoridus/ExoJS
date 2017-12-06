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


$(function () {
    var app = new Exo.Application({
        resourcePath: 'assets/',
        clearColor: new Exo.Color(66, 66, 66),
        width: 800,
        height: 600
    }),
        stats = new Stats(),
        $container = $('.main-canvas'),
        $navigation = $('.navigation-list'),
        activeScript = null,
        resetApp = function resetApp() {
        app.renderManager.setClearColor(app.config.clearColor).clear();
    },
        loadExample = function loadExample(name) {
        app.stop();

        if (activeScript) {
            activeScript.parentNode.removeChild(activeScript);
            resetApp();
        }

        activeScript = document.createElement('script');
        activeScript.type = 'text/javascript', activeScript.async = true, activeScript.src = 'src/js/examples/' + name + '.js?no-cache=' + Date.now(), document.body.appendChild(activeScript);
    },
        getStats = function getStats() {
        var style = stats.dom.style;

        style.position = 'absolute';
        style.top = '0';
        style.left = '0';

        return stats.dom;
    };

    $container.append(app.canvas);
    $container.append(getStats());

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
    window.addEventListener('hashchange', function () {
        loadExample(location.hash.slice(1));
    }, false);

    if (location.hash) {
        loadExample(location.hash.slice(1));
    } else {
        location.hash = 'sprite';
    }

    app.loader.loadItem({
        type: 'json',
        name: 'examples',
        path: 'json/examples.json'
    }).then(function (entries) {
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
            for (var _iterator = entries[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                var entry = _step.value;

                $navigation.append($('<div>', {
                    'class': 'navigation-item sub-header',
                    'html': entry.title
                }));

                var _iteratorNormalCompletion2 = true;
                var _didIteratorError2 = false;
                var _iteratorError2 = undefined;

                try {
                    for (var _iterator2 = entry.examples[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                        var example = _step2.value;

                        $navigation.append($('<a>', {
                            'class': 'navigation-item',
                            'href': '#' + example.path,
                            'html': example.title
                        }));
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
    });
});

/***/ })
/******/ ]);
//# sourceMappingURL=examples.build.js.map