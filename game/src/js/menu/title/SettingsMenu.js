import Menu from '../Menu';
import MenuItem from '../MenuItem';

/**
 * @class SettingsMenu
 * @extends Menu
 */
export default class SettingsMenu extends Menu {

    /**
     * @constructor
     * @param {Application} app
     * @param {String} previousMenu
     */
    constructor(app, previousMenu) {
        super(app, previousMenu);

        const canvas = app.canvas,
            centerX = canvas.width / 2,
            offsetY = 50;

        /**
         * @private
         * @member {MenuItem}
         */
        this._settingsTitle = new MenuItem('Settings:');
        this._settingsTitle.setPosition(centerX, canvas.height / 3);

        /**
         * @private
         * @member {MenuItem}
         */
        this._masterVolumeButton = new MenuItem(`Master Volume: 100%`);
        this._masterVolumeButton.setPosition(centerX, this._settingsTitle.bottom + offsetY);

        /**
         * @private
         * @member {MenuItem}
         */
        this._musicVolumeButton = new MenuItem(`Music Volume: 100%`);
        this._musicVolumeButton.setPosition(centerX, this._masterVolumeButton.bottom + offsetY);

        /**
         * @private
         * @member {MenuItem}
         */
        this._soundsVolumeButton = new MenuItem(`Sound Volume: 100%`);
        this._soundsVolumeButton.setPosition(centerX, this._musicVolumeButton.bottom + offsetY);

        /**
         * @private
         * @member {MenuItem}
         */
        this._backButton = new MenuItem('Back');
        this._backButton.setPosition(centerX, this._soundsVolumeButton.bottom + offsetY);

        /**
         * @private
         * @member {Function}
         */
        this._onOptionLeftHandler = this._onOptionLeft.bind(this);

        /**
         * @private
         * @member {Function}
         */
        this._onOptionRightHandler = this._onOptionRight.bind(this);

        /**
         * @private
         * @member {Number}
         */
        this._volumeStep = 0.05;

        this._addItems();
        this._addPaths();
        this._addActions();

        this.setStartChild(this._musicVolumeButton);
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

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
    _addItems() {
        return this
            .addChild(this._settingsTitle)
            .addChild(this._masterVolumeButton)
            .addChild(this._musicVolumeButton)
            .addChild(this._soundsVolumeButton)
            .addChild(this._backButton);
    }

    /**
     * @private
     */
    _addPaths() {
        return this
            .addPath(this._masterVolumeButton, this._musicVolumeButton, 'down', 'up')
            .addPath(this._musicVolumeButton, this._soundsVolumeButton, 'down', 'up')
            .addPath(this._soundsVolumeButton, this._backButton, 'down', 'up')
            .addPath(this._backButton, this._masterVolumeButton, 'down', 'up');
    }

    /**
     * @private
     */
    _addActions() {
        return this
            .addAction(this._masterVolumeButton, this._onOptionLeftHandler, 'left')
            .addAction(this._masterVolumeButton, this._onOptionRightHandler, 'right')
            .addAction(this._musicVolumeButton, this._onOptionLeftHandler, 'left')
            .addAction(this._musicVolumeButton, this._onOptionRightHandler, 'right')
            .addAction(this._soundsVolumeButton, this._onOptionLeftHandler, 'left')
            .addAction(this._soundsVolumeButton, this._onOptionRightHandler, 'right')
            .addAction(this._backButton, this.openPreviousMenu.bind(this), 'select');
    }

    /**
     * @private
     * @param {MenuAction} action
     */
    _onOptionLeft(action) {

    }

    /**
     * @private
     * @param {MenuAction} action
     */
    _onOptionRight(action) {

    }
}
