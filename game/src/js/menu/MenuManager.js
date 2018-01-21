import { KEYBOARD, GAMEPAD, Input } from 'exojs';
import MenuItem from './MenuItem';

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
        this._enabled = false;

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
                onStart() {
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
                onStart() {
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
                onStart() {
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
                onStart() {
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
                onStart() {
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
                onStart() {
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
    get enabled() {
        return this._enabled;
    }

    set enabled(enabled) {
        this._enabled = enabled;
    }

    /**
     * @public
     * @chainable
     * @param {String} startMenu
     * @returns {MenuManager}
     */
    enable(startMenu) {
        if (!this._enabled) {
            this._enabled = true;
            this._app.inputManager.add(this._inputs);
            this._app.inputManager.onPointerMove.add(this._onPointerMove, this);
            this._app.inputManager.onPointerTap.add(this._onPointerTap, this);

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
        if (this._enabled) {
            this._enabled = false;
            this._app.inputManager.remove(this._inputs);
            this._app.inputManager.onPointerMove.remove(this._onPointerMove, this);
            this._app.inputManager.onPointerTap.remove(this._onPointerTap, this);

            if (this._currentMenu) {
                this._currentMenu.disable();
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

        menu.onOpenMenu.add(this.openMenu, this);
        menu.onOpenPrevMenu.add(this.openPreviousMenu, this);

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
            this._currentMenu.disable();
        }

        this._currentMenu = this._menus.get(name) || null;

        if (this._currentMenu) {
            this._currentMenu.enable();
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
        this._app.onPointerMove.remove(this._onPointerMove, this);
        this._app.onPointerTap.remove(this._onPointerTap, this);

        if (this._enabled) {
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

    /**
     * @private
     * @param {Pointer} pointer
     */
    _onPointerMove(pointer) {
        if (this._currentMenu) {
            const child = this._currentMenu.getPointerChild(pointer);

            if (child) {
                this._currentMenu.setActiveChild(child);
                this._app.renderManager.setCursor('pointer');
            } else {
                this._app.renderManager.setCursor('default');
            }
        }
    }

    /**
     * @private
     * @param {Pointer} pointer
     */
    _onPointerTap(pointer) {
        if (this._currentMenu) {
            const child = this._currentMenu.getPointerChild(pointer);

            if (child) {
                this._currentMenu.setActiveChild(child);
                this._currentMenu.updateInput('select');
            }
        }
    }
}
