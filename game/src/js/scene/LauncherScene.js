import { KEYBOARD, GAMEPAD, SCALE_MODES, utils, Scene, Input } from 'exojs';
import TitleScene from './TitleScene';

/**
 * @class LauncherScene
 * @extends Scene
 */
export default class LauncherScene extends Scene {

    /**
     * @override
     */
    load(loader) {

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

        loader.on('progress', (length, index, resource) => this._renderProgress(index / length * 100));

        loader.add('texture', {
            'title/logo': 'image/title/logo.png',
            'title/background': 'image/title/background.jpg',
        }, {
            scaleMode: SCALE_MODES.LINEAR,
        });

        loader.add('texture', {
            'game/tileset': 'image/game/tileset.png',
            'game/player': 'image/game/player.png',
        }, {
            scaleMode: SCALE_MODES.NEAREST,
        });

        loader.add('music', {
            title: 'audio/title.ogg',
            overworld: 'audio/overworld.ogg',
        });

        loader.add('font', {
            menu: 'font/AndyBold/AndyBold.woff2',
        }, {
            family: 'AndyBold',
        });

        this._renderProgress(0);
    }

    /**
     * @override
     */
    init(resources) {

        /**
         * @private
         * @member {Function}
         */
        this._openTitleHandler = this._openTitle.bind(this);

        this._$indicator.addClass('finished');
        this._$indicatorText.html('PLAY');
        this._$indicatorText.on('click', this._openTitleHandler);

        this.app.inputManager.add(new Input([
            KEYBOARD.Enter,
            GAMEPAD.Start,
            GAMEPAD.FaceBottom,
        ], {
            context: this,
            trigger: this._openTitleHandler
        }));
    }

    /**
     * @override
     */
    unload() {
        this.app.inputManager.clear(true);
        this._$indicatorText.off('click', this._openTitleHandler);

        this._openTitleHandler = null;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

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
    _renderProgress(percentage) {
        const context = this._indicatorContext,
            canvas = this._indicatorCanvas,
            width = canvas.width,
            height = canvas.height,
            centerX = (width / 2) | 0,
            centerY = (height / 2) | 0,
            radius = ((centerX + centerY) / 2) | 0,
            offsetAngle = 270;

        this._$indicatorText.html(`${(percentage | 0)}%`);

        context.drawImage(this._indicatorProgress, 0, 0, width, height);
        context.beginPath();
        context.moveTo(centerX, centerY);
        context.arc(
            centerX,
            centerY,
            radius,
            utils.degreesToRadians(offsetAngle),
            utils.degreesToRadians((percentage * 3.6) + offsetAngle),
            true,
        );
        context.clip();
        context.clearRect(0, 0, width, height);
    }

    /**
     * @private
     */
    _openTitle() {
        this.app.sceneManager.setScene(new TitleScene());
    }
}
