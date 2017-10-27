import TitleScene from './TitleScene';

/**
 * @class LauncherScene
 * @extends {Scene}
 */
export default class LauncherScene extends Exo.Scene {

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

        loader.on('progress', (length, index, resource) => this._renderProgress(index / length * 100))
            .addList('texture', {
                'title/logo': 'image/title/logo.png',
                'title/background': 'image/title/background.jpg',
                'game/tileset': 'image/game/tileset.png',
                'game/player': 'image/game/player.png',
            })
            .addList('music', {
                'title/background': 'audio/title/background.ogg',
                'game/background': 'audio/game/background.ogg',
            })
            .addItem('font', 'menu', 'font/AndyBold/AndyBold.woff2', {
                family: 'AndyBold'
            })
            .load()
            .then(() => this.app.trigger('scene:start'));

        this._renderProgress(0);
    }

    /**
     * @override
     */
    init() {

        /**
         * @private
         * @member {Function}
         */
        this._openTitleHandler = this._openTitle.bind(this);

        /**
         * @private
         * @member {Input}
         */
        this._playInput = new Exo.Input([
            Exo.KEYBOARD.Enter,
            Exo.GAMEPAD.Start,
            Exo.GAMEPAD.FaceBottom,
        ]);

        this._playInput.on('trigger', this._openTitleHandler);

        this._$indicator.addClass('finished');
        this._$indicatorText.html('PLAY');
        this._$indicatorText.on('click', this._openTitleHandler);

        this.app.trigger('input:add', this._playInput);
    }

    /**
     * @override
     */
    unload() {
        this.app.trigger('input:remove', this._playInput);
        this._$indicatorText.off('click', this._openTitleHandler);

        this._playInput.destroy();
        this._playInput = null;

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
            Exo.utils.degreesToRadians(offsetAngle),
            Exo.utils.degreesToRadians((percentage * 3.6) + offsetAngle),
            true,
        );
        context.clip();
        context.clearRect(0, 0, width, height);
    }

    /**
     * @private
     */
    _openTitle() {
        this.app.trigger('scene:change', new TitleScene());
    }
}
