import { Container, Signal } from 'exojs';
import MenuPath from './MenuPath';
import MenuAction from './MenuAction';
import MenuItem from './MenuItem';

/**
 * @class Menu
 * @extends Container
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

        /**
         * @private
         * @member {Signal}
         */
        this._onOpenMenu = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onOpenPrevMenu = new Signal();
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
     * @readonly
     * @member {Signal}
     */
    get onOpenMenu() {
        return this._onOpenMenu;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onOpenPrevMenu() {
        return this._onOpenPrevMenu;
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
        if ((child !== this._activeChild)) {
            if (this._activeChild) {
                this._activeChild.reset();
            }

            this._activeChild = child || null;

            if (this._activeChild) {
                this._activeChild.activate();
            }
        }

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
    enable() {
        return this.setActiveChild(this._startChild);
    }

    /**
     * @public
     * @chainable
     * @returns {Menu}
     */
    disable() {
        if (this._activeChild) {
            this._activeChild.reset();
            this._activeChild = null;
        }

        return this;
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
        this._onOpenMenu.dispatch(menu);
    }

    /**
     * @public
     */
    openPreviousMenu() {
        this._onOpenPrevMenu.dispatch(this._previousMenu);
    }

    /**
     * @public
     * @param {Pointer} pointer
     * @returns {MenuItem}
     */
    getPointerChild(pointer) {
        for (const child of this.children) {
            if (!(child instanceof MenuItem)) {
                continue;
            }

            if (child.contains(pointer.x, pointer.y)) {
                return child;
            }
        }

        return null;
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

        this._onOpenMenu.destroy();
        this._onOpenMenu = null;

        this._onOpenPrevMenu.destroy();
        this._onOpenPrevMenu = null;

        this._previousMenu = null;
        this._startChild = null;
        this._activeChild = null;
        this._app = null;
    }
}
