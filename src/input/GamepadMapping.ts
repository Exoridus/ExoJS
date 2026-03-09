import { GamepadControl } from './GamepadControl';
import type { IGamepadControlOptions } from './GamepadControl';
import type { GamepadChannel } from './Gamepad';

export type BrowserGamepad = NonNullable<ReturnType<Navigator['getGamepads']>[number]>;
export type GamepadMappingResolver = (gamepad: BrowserGamepad) => GamepadMapping;
export type GamepadControlDefinition = readonly [number, GamepadChannel, IGamepadControlOptions?];

export class GamepadMapping {

    private readonly _buttons: Array<GamepadControl>;
    private readonly _axes: Array<GamepadControl>;

    public constructor(buttons: Array<GamepadControl>, axes: Array<GamepadControl>) {
        this._buttons = buttons;
        this._axes = axes;
    }

    public get buttons(): Array<GamepadControl> {
        return this._buttons;
    }

    public get axes(): Array<GamepadControl> {
        return this._axes;
    }

    public setButtons(buttons: Array<GamepadControl>): this {
        this.clearButtons();
        this._buttons.push(...buttons);

        return this;
    }

    public clearButtons(): this {
        for (const button of this._buttons) {
            button.destroy();
        }

        this._buttons.length = 0;

        return this;
    }

    public setAxes(axes: Array<GamepadControl>): this {
        this.clearAxes();
        this._axes.push(...axes);

        return this;
    }

    public clearAxes(): this {
        for (const axis of this._axes) {
            axis.destroy();
        }

        this._axes.length = 0;

        return this;
    }

    public clearControls(): this {
        this.clearButtons();
        this.clearAxes();

        return this;
    }

    public destroy(): void {
        this.clearControls();
    }

    public static createControls(definitions: Array<GamepadControlDefinition>): Array<GamepadControl> {
        return definitions.map(([index, channel, options]) => new GamepadControl(index, channel, options));
    }
}
