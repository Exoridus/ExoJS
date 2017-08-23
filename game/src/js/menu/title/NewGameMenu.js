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
     * @param {Exo.Game} game
     * @param {?String} [parentMenu=null]
     */
    constructor(game, parentMenu) {
        super(game, parentMenu);

        const canvas = game.canvas;

        /**
         * @private
         * @member {MenuItem}
         */
        this._newGameTitle = new MenuItem('New Game:');
        this._newGameTitle.setPosition(canvas.width / 2, canvas.height / 3);

        /**
         * @private
         * @member {MenuItem}
         */
        this._createWorldButton = new MenuItem('Create World', this._newGameTitle);

        /**
         * @private
         * @member {MenuItem}
         */
        this._createCharacterButton = new MenuItem('Create Character', this._createWorldButton);

        /**
         * @private
         * @member {MenuItem}
         */
        this._backButton = new MenuItem('Back', this._createCharacterButton);

        this._addItems();
        this._addPaths();
        this._addActions();

        this.setStartChild(this._createWorldButton);
    }

    _addItems() {
        this.addChild(this._newGameTitle);
        this.addChild(this._createWorldButton);
        this.addChild(this._createCharacterButton);
        this.addChild(this._backButton);
    }

    _addPaths() {
        this.addPath(this._createWorldButton, this._createCharacterButton, 'down', 'up');
        this.addPath(this._createCharacterButton, this._backButton, 'down', 'up');
        this.addPath(this._backButton, this._createWorldButton, 'down', 'up');
    }

    _addActions() {
        this.addAction(this._createWorldButton, this._onSelectCreateWorld.bind(this), 'select');
        this.addAction(this._createCharacterButton, this._onSelectCreateCharacter.bind(this), 'select');
        this.addAction(this._backButton, this.openPreviousMenu.bind(this), 'select');
    }

    _onSelectCreateWorld() {
        this._game.trigger('scene:change', new GameScene());
    }

    _onSelectCreateCharacter() {
        this._game.trigger('scene:change', new GameScene());
    }

    destroy() {
        super.destroy();

        this._newGameTitle = null;
        this._createWorldButton = null;
        this._createCharacterButton = null;
        this._backButton = null;
    }
}
