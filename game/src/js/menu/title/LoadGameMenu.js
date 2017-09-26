import Menu from '../Menu';
import MenuItem from '../MenuItem';

/**
 * @class LoadGameMenu
 * @extends {Menu}
 */
export default class LoadGameMenu extends Menu {

    /**
     * @constructor
     * @param {Application} app
     * @param {String} parentMenu
     */
    constructor(app, parentMenu) {
        super(app, parentMenu);

        const canvas = app.canvas;

        /**
         * @private
         * @member {MenuItem}
         */
        this._LoadGameTitle = new MenuItem('Load Game:');
        this._LoadGameTitle.setPosition(canvas.width / 2, canvas.height / 3);

        /**
         * @private
         * @member {MenuItem}
         */
        this._loadWorldButton = new MenuItem('Load World', this._LoadGameTitle);

        /**
         * @private
         * @member {MenuItem}
         */
        this._backButton = new MenuItem('Back', this._loadWorldButton);

        this._addItems();
        this._addPaths();
        this._addActions();

        this.setStartChild(this._loadWorldButton);
    }

    _addItems() {
        this.addChild(this._LoadGameTitle);
        this.addChild(this._loadWorldButton);
        this.addChild(this._backButton);
    }

    _addPaths() {
        this.addPath(this._loadWorldButton, this._backButton, 'down', 'up');
        this.addPath(this._backButton, this._loadWorldButton, 'down', 'up');
    }

    _addActions() {
        this.addAction(this._loadWorldButton, this._onSelectLoadWorld.bind(this), 'select');
        this.addAction(this._backButton, this.openPreviousMenu.bind(this), 'select');
    }

    _onSelectLoadWorld() {
        this._app.trigger('scene:change', 'game');
    }

    destroy() {
        super.destroy();

        this._LoadGameTitle = null;
        this._loadWorldButton = null;
        this._backButton = null;
    }
}
