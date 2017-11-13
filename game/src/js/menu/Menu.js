import { Container } from 'exojs';
import MenuPath from './MenuPath';
import MenuAction from './MenuAction';

/**
 * @class Menu
 * @extends {Container}
 */
export default class Menu extends Container {

    /**
     * @constructor
     * @param {Application} app
     * @param {String} [previousMenu=null]
     */
    constructor(app, previousMenu = null) {
        super();

        /**
         * @public
         * @member {Application}
         */
        this._app = app;

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
     * @chainable
     * @param {MenuItem} child
     * @returns {Menu}
     */
    setStartChild(child) {
        this._startChild = child;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {MenuItem} child
     * @returns {Menu}
     */
    setActiveChild(child) {
        if (this._activeChild) {
            this._activeChild.reset();
        }

        this._activeChild = child;
        child.activate();

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {MenuItem} fromChild
     * @param {MenuItem} toChild
     * @param {String} fromToDirection
     * @param {String} [toFromDirection]
     * @returns {Menu}
     */
    addPath(fromChild, toChild, fromToDirection, toFromDirection) {
        this._paths.push(new MenuPath(fromChild, toChild, fromToDirection));

        if (toFromDirection) {
            this._paths.push(new MenuPath(toChild, fromChild, toFromDirection));
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {MenuItem} child
     * @param {Function} action
     * @param {String} [input=select]
     * @returns {Menu}
     */
    addAction(child, action, input) {
        this._actions.push(new MenuAction(child, action, input || 'select'));

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Menu}
     */
    activate() {
        return this.setActiveChild(this._startChild);
    }

    /**
     * @public
     * @chainable
     * @param {Time} delta
     * @returns {Menu}
     */
    update(delta) {
        if (this._activeChild) {
            this._activeChild.update(delta);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Menu}
     */
    reset() {
        if (this._activeChild) {
            this._activeChild.reset();
            this._activeChild = null;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} input
     * @returns {Menu}
     */
    updateInput(input) {
        if (this._activeChild) {
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

        return this;
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
     */
    destroy() {
        super.destroy();

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
        this._app = null;
    }
}
