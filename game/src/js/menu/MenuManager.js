import { KEYBOARD, GAMEPAD, Input } from 'exojs';

/**
 * @class MenuManager
 */
export default class MenuManager {

    /**
     * @constructor
     * @param {Application} app
     */
    constructor(app) {

        /**
         * @private
         * @member {Application}
         */
        this._app = app;

        /**
         * @private
         * @member {Map.<String, Menu>}
         */
        this._menus = new Map();

        /**
         * @private
         * @member {?Menu}
         */
        this._currentMenu = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._active = false;

        /**
         * @private
         * @member {Input[]}
         */
        this._inputs = [
            new Input([
                KEYBOARD.Up,
                GAMEPAD.DPadUp,
                GAMEPAD.LeftStickUp,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputUp();
                    }
                },
            }),
            new Input([
                KEYBOARD.Down,
                GAMEPAD.LeftStickDown,
                GAMEPAD.DPadDown,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputDown();
                    }
                },
            }),
            new Input([
                KEYBOARD.Left,
                GAMEPAD.LeftStickLeft,
                GAMEPAD.DPadLeft,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputLeft();
                    }
                },
            }),
            new Input([
                KEYBOARD.Right,
                GAMEPAD.LeftStickRight,
                GAMEPAD.DPadRight,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputRight();
                    }
                },
            }),
            new Input([
                KEYBOARD.Enter,
                GAMEPAD.FaceBottom,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputSelect();
                    }
                },
            }),
            new Input([
                KEYBOARD.Backspace,
                GAMEPAD.FaceRight,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputBack();
                    }
                },
            }),
        ];
    }

    /**
     * @public
     * @member {Boolean}
     */
    get active() {
        return this._active;
    }

    set active(active) {
        this._active = active;
    }

    /**
     * @public
     * @chainable
     * @param {String} startMenu
     * @returns {MenuManager}
     */
    enable(startMenu) {
        if (!this._active) {
            this._active = true;
            this._app.inputManager.add(this._inputs);

            this.openMenu(startMenu);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {MenuManager}
     */
    disable() {
        if (this._active) {
            this._active = false;
            this._app.inputManager.remove(this._inputs);

            if (this._currentMenu) {
                this._currentMenu.reset();
                this._currentMenu = null;
            }
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} name
     * @param {Menu} menu
     * @param {String} [previousMenu=null]
     * @returns {MenuManager}
     */
    addMenu(name, menu, previousMenu) {
        if (previousMenu) {
            menu.previousMenu = previousMenu;
        }

        this._menus.set(name, menu);

        menu.on('openMenu', this.openMenu, this);
        menu.on('openPreviousMenu', this.openPreviousMenu, this);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} name
     * @returns {MenuManager}
     */
    openMenu(name) {
        if (this._currentMenu) {
            this._currentMenu.reset();
        }

        this._currentMenu = this._menus.get(name) || null;

        if (this._currentMenu) {
            this._currentMenu.activate();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {MenuManager}
     */
    openPreviousMenu() {
        const currentMenu = this._currentMenu;

        if (currentMenu && currentMenu.previousMenu) {
            this.openMenu(currentMenu.previousMenu);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Time} delta
     * @returns {MenuManager}
     */
    update(delta) {
        if (this._currentMenu) {
            this._currentMenu.update(delta);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {RenderManager} renderManager
     * @returns {MenuManager}
     */
    render(renderManager) {
        if (this._currentMenu) {
            this._currentMenu.render(renderManager);
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        if (this._active) {
            this.disable();
        }

        this._menus.forEach((menu) => {
            menu.destroy();
        });

        this._menus.clear();
        this._menus = null;

        this._currentMenu = null;
        this._app = null;
    }
}
