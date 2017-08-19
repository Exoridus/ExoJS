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

        const canvas = game.canvas;

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
        this._musicVolumeButton = new MenuItem(
            `Music Volume: ${(game.audioManager.musicVolume * 100 | 0)}%`,
            this._settingsTitle
        );

        /**
         * @private
         * @member {MenuItem}
         */
        this._soundsVolumeButton = new MenuItem(
            `Sound Volume: ${(game.audioManager.soundVolume * 100 | 0)}%`,
            this._musicVolumeButton
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
        this._musicVolumeButton = null;
        this._soundsVolumeButton = null;
        this._backButton = null;
    }

    /**
     * @private
     */
    _addItems() {
        this.addChild(this._settingsTitle);
        this.addChild(this._musicVolumeButton);
        this.addChild(this._soundsVolumeButton);
        this.addChild(this._backButton);
    }

    /**
     * @private
     */
    _addPaths() {
        this.addPath(this._musicVolumeButton, this._soundsVolumeButton, 'down', 'up');
        this.addPath(this._soundsVolumeButton, this._backButton, 'down', 'up');
        this.addPath(this._backButton, this._musicVolumeButton, 'down', 'up');
    }

    /**
     * @private
     */
    _addActions() {
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
        const activeButton = action.item;

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
    _onOptionRight(action) {
        const activeButton = action.item;

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
    _addMusicVolume(volume) {
        const audioManager = this._game.audioManager;

        audioManager.musicVolume += volume;

        this._musicVolumeButton.text = `Music Volume: ${(audioManager.musicVolume * 100 | 0)}%`;
    }

    /**
     * @private
     * @param {Number} volume
     */
    _addSoundVolume(volume) {
        const audioManager = this._game.audioManager;

        audioManager.soundVolume += volume;

        this._soundsVolumeButton.text = `Sound Volume: ${(audioManager.soundVolume * 100 | 0)}%`;
    }
}
