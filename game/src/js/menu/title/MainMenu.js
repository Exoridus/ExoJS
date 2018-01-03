import { Sprite } from 'exojs';
import Menu from '../Menu';
import MenuItem from '../MenuItem';

/**
 * @class MainMenu
 * @extends Menu
 */
export default class MainMenu extends Menu {

    /**
     * @constructor
     * @param {Application} app
     * @param {String} parentMenu
     */
    constructor(app, parentMenu = null) {
        super(app, parentMenu);

        const canvas = app.canvas,
            resources = app.loader.resources,
            centerX = canvas.width / 2,
            offsetY = 50;

        /**
         * @private
         * @member {Sprite}
         */
        this._gameLogo = new Sprite(resources.get('texture', 'title/logo'));
        this._gameLogo.setAnchor(0.5, 0.8);
        this._gameLogo.setPosition(centerX, 50 + (this._gameLogo.height * 0.8));

        /**
         * @private
         * @member {MenuItem}
         */
        this._newGameButton = new MenuItem('New Game');
        this._newGameButton.setPosition(centerX, this._gameLogo.bottom + offsetY);

        /**
         * @private
         * @member {MenuItem}
         */
        this._loadGameButton = new MenuItem('Load Game');
        this._loadGameButton.setPosition(centerX, this._newGameButton.bottom + offsetY);

        /**
         * @private
         * @member {MenuItem}
         */
        this._settingsButton = new MenuItem('Settings');
        this._settingsButton.setPosition(centerX, this._loadGameButton.bottom + offsetY);

        /**
         * @private
         * @member {MenuItem}
         */
        this._versionText = new MenuItem('Ver. 0.0.1', { fontSize: 25, strokeThickness: 3 });
        this._versionText.setPosition(canvas.width - 10, canvas.height);
        this._versionText.setAnchor(1, 1);

        /**
         * @private
         * @member {Number}
         */
        this._ticker = 0;

        this._addItems();
        this._addPaths();
        this._addActions();

        this.setStartChild(this._newGameButton);
    }

    /**
     * @override
     */
    update(delta) {
        if (this._activeChild) {
            this._activeChild.update(delta);
        }

        this._ticker += delta.seconds;
        this._gameLogo.rotation = Math.sin(this._ticker * Math.PI / 2) * -5;
    }

    /**
     * @override
     */
    disable() {
        if (this._activeChild) {
            this._activeChild.reset();
        }

        this._ticker = 0;
        this._gameLogo.rotation = 0;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._gameLogo = null;
        this._versionText = null;
        this._newGameButton = null;
        this._loadGameButton = null;
        this._settingsButton = null;
    }

    /**
     * @private
     */
    _addItems() {
        return this
            .addChild(this._gameLogo)
            .addChild(this._newGameButton)
            .addChild(this._loadGameButton)
            .addChild(this._settingsButton)
            .addChild(this._versionText);
    }

    /**
     * @private
     */
    _addPaths() {
        return this
            .addPath(this._newGameButton, this._loadGameButton, 'down', 'up')
            .addPath(this._loadGameButton, this._settingsButton, 'down', 'up')
            .addPath(this._settingsButton, this._newGameButton, 'down', 'up');
    }

    /**
     * @private
     * @chaibale
     */
    _addActions() {
        return this
            .addAction(this._newGameButton, this.openMenu.bind(this, 'newGame'), 'select')
            .addAction(this._loadGameButton, this.openMenu.bind(this, 'loadGame'), 'select')
            .addAction(this._settingsButton, this.openMenu.bind(this, 'settings'), 'select');
    }
}
