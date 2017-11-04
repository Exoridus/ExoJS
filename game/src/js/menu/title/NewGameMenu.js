import Menu from '../Menu';
import MenuItem from '../MenuItem';
import GameScene from '../../scene/GameScene';

/**
 * @class NewGameMenu
 * @extends {Menu}
 */
export default class NewGameMenu extends Menu {

    /**
     * @constructor
     * @param {Application} app
     * @param {?String} [parentMenu=null]
     */
    constructor(app, parentMenu) {
        super(app, parentMenu);

        const canvas = app.canvas,
            centerX = canvas.width / 2,
            offsetY = 50;

        /**
         * @private
         * @member {MenuItem}
         */
        this._newGameTitle = new MenuItem('New Game:');
        this._newGameTitle.setPosition(centerX, canvas.height / 3);

        /**
         * @private
         * @member {MenuItem}
         */
        this._createWorldButton = new MenuItem('Create World');
        this._createWorldButton.setPosition(centerX, this._newGameTitle.bottom + offsetY);

        /**
         * @private
         * @member {MenuItem}
         */
        this._createCharacterButton = new MenuItem('Create Character');
        this._createCharacterButton.setPosition(centerX, this._createWorldButton.bottom + offsetY);

        /**
         * @private
         * @member {MenuItem}
         */
        this._backButton = new MenuItem('Back');
        this._backButton.setPosition(centerX, this._createCharacterButton.bottom + offsetY);

        this._addItems();
        this._addPaths();
        this._addActions();

        this.setStartChild(this._createWorldButton);
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._newGameTitle = null;
        this._createWorldButton = null;
        this._createCharacterButton = null;
        this._backButton = null;
    }

    _addItems() {
        this.addChild(this._newGameTitle)
            .addChild(this._createWorldButton)
            .addChild(this._createCharacterButton)
            .addChild(this._backButton);
    }

    _addPaths() {
        this.addPath(this._createWorldButton, this._createCharacterButton, 'down', 'up')
            .addPath(this._createCharacterButton, this._backButton, 'down', 'up')
            .addPath(this._backButton, this._createWorldButton, 'down', 'up');
    }

    _addActions() {
        this.addAction(this._createWorldButton, this._onSelectCreateWorld.bind(this), 'select')
            .addAction(this._createCharacterButton, this._onSelectCreateCharacter.bind(this), 'select')
            .addAction(this._backButton, this.openPreviousMenu.bind(this), 'select');
    }

    _onSelectCreateWorld() {
        this._app.trigger('scene:change', new GameScene());
    }

    _onSelectCreateCharacter() {
        this._app.trigger('scene:change', new GameScene());
    }
}
