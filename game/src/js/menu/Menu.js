import MenuPath from './MenuPath';
import MenuAction from './MenuAction';

/**
 * @class Menu
 * @extends {Exo.Container}
 */
export default class Menu extends Exo.Container {

    /**
     * @constructor
     * @param {Exo.Game} game
     * @param {String} [previousMenu=null]
     */
    constructor(game, previousMenu = null) {
        super();

        /**
         * @public
         * @member {Exo.Game}
         */
        this._game = game;

        /**
         * @public
         * @member {MenuPath[]}
         */
        this._paths = [];

        /**
         * @public
         * @member {MenuAction[]}
         */
        this._actions = [];

        /**
         * @public
         * @member {?MenuItem}
         */
        this._startChild = null;

        /**
         * @public
         * @member {?MenuItem}
         */
        this._activeChild = null;

        /**
         * @public
         * @member {?String}
         */
        this._previousMenu = previousMenu;
    }

    /**
     * @public
     * @member {?String}
     */
    get previousMenu() {
        return this._previousMenu;
    }

    set previousMenu(value) {
        this._previousMenu = value || null;
    }

    /**
     * @public
     * @param {MenuItem} child
     */
    setStartChild(child) {
        this._startChild = child;
    }

    /**
     * @public
     * @param {MenuItem} child
     */
    setActiveChild(child) {
        if (this._activeChild) {
            this._activeChild.reset();
        }

        this._activeChild = child;
        child.activate();
    }

    /**
     * @public
     * @param {MenuItem} fromChild
     * @param {MenuItem} toChild
     * @param {String} fromToDirection
     * @param {String} [toFromDirection]
     */
    addPath(fromChild, toChild, fromToDirection, toFromDirection) {
        this._paths.push(new MenuPath(fromChild, toChild, fromToDirection));

        if (toFromDirection) {
            this._paths.push(new MenuPath(toChild, fromChild, toFromDirection));
        }
    }

    /**
     * @public
     * @param {MenuItem} child
     * @param {Function} action
     * @param {String} [input=select]
     */
    addAction(child, action, input) {
        this._actions.push(new MenuAction(child, action, input || 'select'));
    }

    /**
     * @public
     */
    activate() {
        this.setActiveChild(this._startChild);
    }

    /**
     * @public
     * @param {Exo.Time} delta
     */
    update(delta) {
        if (this._activeChild) {
            this._activeChild.update(delta);
        }
    }

    /**
     * @public
     */
    reset() {
        if (this._activeChild) {
            this._activeChild.reset();
            this._activeChild = null;
        }
    }

    /**
     * @public
     * @param {String} input
     */
    updateInput(input) {
        if (!this._activeChild) {
            return;
        }

        for (let i = 0, len = this._paths.length; i < len; i++) {
            const path = this._paths[i];

            if (path.fromItem === this._activeChild && path.input === input) {
                this.setActiveChild(path.toItem);

                break;
            }
        }

        for (let i = 0, len = this._actions.length; i < len; i++) {
            const action = this._actions[i];

            if (action.item === this._activeChild && action.input === input) {
                action.action(action);

                break;
            }
        }
    }

    /**
     * @public
     */
    onInputUp() {
        this.updateInput('up');
    }

    /**
     * @public
     */
    onInputDown() {
        this.updateInput('down');
    }

    /**
     * @public
     */
    onInputLeft() {
        this.updateInput('left');
    }

    /**
     * @public
     */
    onInputRight() {
        this.updateInput('right');
    }

    /**
     * @public
     */
    onInputSelect() {
        this.updateInput('select');
    }

    /**
     * @public
     */
    onInputBack() {
        this.openPreviousMenu();
    }

    /**
     * @public
     * @param {String} menu
     */
    openMenu(menu) {
        this.trigger('openMenu', menu);
    }

    /**
     * @public
     */
    openPreviousMenu() {
        this.trigger('openPreviousMenu');
    }

    /**
     * @public
     * @param {Boolean} [destroyChildren=true]
     */
    destroy(destroyChildren) {
        super.destroy(destroyChildren !== false);

        this._paths.forEach((path) => {
            path.destroy();
        });

        this._actions.forEach((action) => {
            action.destroy();
        });

        this._paths.length = 0;
        this._paths = null;

        this._actions.length = 0;
        this._actions = null;

        this._previousMenu = null;
        this._startChild = null;
        this._activeChild = null;
        this._game = null;
    }
}
