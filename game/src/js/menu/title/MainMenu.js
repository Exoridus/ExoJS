import Menu from '../Menu';
import MenuItem from '../MenuItem';
import VersionText from './VersionText';

/**
 * @class MainMenu
 * @extends {Menu}
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
            resources = app.loader.resources;

        /**
         * @private
         * @member {Sprite}
         */
        this._gameLogo = new Exo.Sprite(resources.get('texture', 'title/logo'));
        this._gameLogo.setOrigin(this._gameLogo.width / 2, this._gameLogo.height * 0.8);
        this._gameLogo.setPosition(canvas.width / 2, 50 + (this._gameLogo.height * 0.8));

        /**
         * @private
         * @member {MenuItem}
         */
        this._newGameButton = new MenuItem('New Game');
        this._newGameButton.setPosition(canvas.width / 2, canvas.height / 2);

        /**
         * @private
         * @member {MenuItem}
         */
        this._loadGameButton = new MenuItem('Load Game', this._newGameButton);

        /**
         * @private
         * @member {MenuItem}
         */
        this._settingsButton = new MenuItem('Settings', this._loadGameButton);

        /**
         * @private
         * @member {VersionText}
         */
        this._versionText = new VersionText('Ver. 0.0.1', canvas.width, canvas.height);

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
        this._gameLogo.rotation = Math.sin(this._ticker * Math.PI / 2) * -10;
    }

    /**
     * @override
     */
    reset() {
        if (this._activeChild) {
            this._activeChild.reset();
        }

        this._ticker = 0;
        this._gameLogo.rotation = 0;
    }

    _addItems() {
        this.addChild(this._gameLogo);
        this.addChild(this._versionText);
        this.addChild(this._newGameButton);
        this.addChild(this._loadGameButton);
        this.addChild(this._settingsButton);
    }

    _addPaths() {
        this.addPath(this._newGameButton, this._loadGameButton, 'down', 'up');
        this.addPath(this._loadGameButton, this._settingsButton, 'down', 'up');
        this.addPath(this._settingsButton, this._newGameButton, 'down', 'up');
    }

    _addActions() {
        this.addAction(this._newGameButton, this.openMenu.bind(this, 'newGame'), 'select');
        this.addAction(this._loadGameButton, this.openMenu.bind(this, 'loadGame'), 'select');
        this.addAction(this._settingsButton, this.openMenu.bind(this, 'settings'), 'select');
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
}
