import Menu from '../Menu';
import MenuItem from '../MenuItem';

/**
 * @class SettingsMenu
 * @extends {Menu}
 */
export default class SettingsMenu extends Menu {

    /**
     * @constructor
     * @param {Exo.Game} game
     * @param {String} previousMenu
     */
    constructor(game, previousMenu) {
        super(game, previousMenu);

        const canvas = game.canvas,
            mediaManager = game.mediaManager;

        /**
         * @private
         * @member {MenuItem}
         */
        this._settingsTitle = new MenuItem('Settings:');
        this._settingsTitle.setPosition(canvas.width / 2, canvas.height / 3);

        /**
         * @private
         * @member {MenuItem}
         */
        this._masterVolumeButton = new MenuItem(
            `Master Volume: ${(mediaManager.masterVolume * 100 | 0)}%`,
            this._settingsTitle
        );

        /**
         * @private
         * @member {MenuItem}
         */
        this._musicVolumeButton = new MenuItem(
            `Music Volume: ${(mediaManager.musicVolume * 100 | 0)}%`,
            this._masterVolumeButton
        );

        /**
         * @private
         * @member {MenuItem}
         */
        this._soundsVolumeButton = new MenuItem('', this._musicVolumeButton);new MenuItem(
            `Sound Volume: ${(mediaManager.soundVolume * 100 | 0)}%`,
            this._musicVolumeButton,
        );

        /**
         * @private
         * @member {MenuItem}
         */
        this._backButton = new MenuItem('Back', this._soundsVolumeButton);

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
        this.addChild(this._settingsTitle);
        this.addChild(this._masterVolumeButton);
        this.addChild(this._musicVolumeButton);
        this.addChild(this._soundsVolumeButton);
        this.addChild(this._backButton);
    }

    /**
     * @private
     */
    _addPaths() {
        this.addPath(this._masterVolumeButton, this._musicVolumeButton, 'down', 'up');
        this.addPath(this._musicVolumeButton, this._soundsVolumeButton, 'down', 'up');
        this.addPath(this._soundsVolumeButton, this._backButton, 'down', 'up');
        this.addPath(this._backButton, this._masterVolumeButton, 'down', 'up');
    }

    /**
     * @private
     */
    _addActions() {
        this.addAction(this._masterVolumeButton, this._onOptionLeftHandler, 'left');
        this.addAction(this._masterVolumeButton, this._onOptionRightHandler, 'right');
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
    _onOptionLeft(action) {
        const mediaManager = this._game.mediaManager;

        switch (action.item) {
            case this._masterVolumeButton:
                mediaManager.masterVolume -= this._volumeStep;
                break;
            case this._musicVolumeButton:
                mediaManager.musicVolume -= this._volumeStep;
                break;
            case this._soundsVolumeButton:
                mediaManager.soundVolume -= this._volumeStep;
                break;
        }

        this._updateButtons();
    }

    /**
     * @private
     * @param {MenuAction} action
     */
    _onOptionRight(action) {
        const mediaManager = this._game.mediaManager;

        switch (action.item) {
            case this._masterVolumeButton:
                mediaManager.masterVolume += this._volumeStep;
                break;
            case this._musicVolumeButton:
                mediaManager.musicVolume += this._volumeStep;
                break;
            case this._soundsVolumeButton:
                mediaManager.soundVolume += this._volumeStep;
                break;
        }

        this._updateButtons();
    }

    _updateButtons() {
        const mediaManager = this._game.mediaManager;

        this._masterVolumeButton.text = `Master Volume: ${(mediaManager.musicVolume * 100 | 0)}%`;
        this._musicVolumeButton.text = `Music Volume: ${(mediaManager.musicVolume * 100 | 0)}%`;
        this._soundsVolumeButton.text = `Sound Volume: ${(mediaManager.soundVolume * 100 | 0)}%`;
    }
}
