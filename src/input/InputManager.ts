import { CHANNEL_RANGE, CHANNEL_OFFSET } from 'const/input';
import { Flags } from 'math/Flags';
import { stopEvent } from 'utils/core';
import { Vector } from 'math/Vector';
import { Pointer } from './Pointer';
import { GamepadProvider } from './GamepadProvider';
import { Signal } from 'core/Signal';
import { getDistance } from 'utils/math';
import { Input } from './Input';
import { activeListenerOption, passiveListenerOption } from "const/core";
import { Application } from "core/Application";

enum InputManagerFlags {
    NONE = 0,
    KEY_DOWN = 1 << 0,
    KEY_UP = 1 << 1,
    POINTER_ENTER = 1 << 2,
    POINTER_LEAVE = 1 << 3,
    POINTER_MOVE = 1 << 4,
    POINTER_DOWN = 1 << 5,
    POINTER_UP = 1 << 6,
    POINTER_CANCEL = 1 << 7,
    MOUSE_WHEEL = 1 << 8,
}

type PointerMapping = { [pointerId: number]: Pointer };

export class InputManager {

    private _app: Application;
    private _channels: Float32Array = new Float32Array(CHANNEL_RANGE.GLOBAL);
    private _inputs: Set<Input> = new Set();
    private _pointers: PointerMapping = {};
    private _gamepads: Array<GamepadProvider> = [
        new GamepadProvider(0, this._channels),
        new GamepadProvider(1, this._channels),
        new GamepadProvider(2, this._channels),
        new GamepadProvider(3, this._channels),
    ];
    private _wheelOffset: Vector = new Vector();
    private _flags: Flags<InputManagerFlags> = new Flags<InputManagerFlags>();

    private _channelsPressed: Array<number> = [];
    private _channelsReleased: Array<number> = [];

    private _pointersEntered: Array<Pointer> = [];
    private _pointersLeft: Array<Pointer> = [];
    private _pointersPressed: Array<Pointer> = [];
    private _pointersMoved: Array<Pointer> = [];
    private _pointersReleased: Array<Pointer> = [];
    private _pointersCancelled: Array<Pointer> = [];

    private readonly _keyDownHandler: (event: KeyboardEvent) => void = this._keyDown.bind(this);
    private readonly _keyUpHandler: (event: KeyboardEvent) => void = this._keyUp.bind(this);
    private readonly _mouseWheelHandler: (event: WheelEvent) => void = this._mouseWheel.bind(this);
    private readonly _pointerEnterHandler: (event: PointerEvent) => void = this._pointerEnter.bind(this);
    private readonly _pointerLeaveHandler: (event: PointerEvent) => void = this._pointerLeave.bind(this);
    private readonly _pointerDownHandler: (event: PointerEvent) => void = this._pointerDown.bind(this);
    private readonly _pointerMoveHandler: (event: PointerEvent) => void = this._pointerMove.bind(this);
    private readonly _pointerUpHandler: (event: PointerEvent) => void = this._pointerUp.bind(this);
    private readonly _pointerCancelHandler: (event: PointerEvent) => void = this._pointerCancel.bind(this);

    public readonly onPointerEnter = new Signal();
    public readonly onPointerLeave = new Signal();
    public readonly onPointerDown = new Signal();
    public readonly onPointerMove = new Signal();
    public readonly onPointerUp = new Signal();
    public readonly onPointerTap = new Signal();
    public readonly onPointerSwipe = new Signal();
    public readonly onPointerCancel = new Signal();
    public readonly onMouseWheel = new Signal();
    public readonly onKeyDown = new Signal();
    public readonly onKeyUp = new Signal();
    public readonly onGamepadConnected = new Signal();
    public readonly onGamepadDisconnected = new Signal();
    public readonly onGamepadUpdated = new Signal();

    constructor(app: Application) {

        this._app = app;

        const canvas = app.canvas;
        const realWindow = window.parent || window;

        realWindow.addEventListener('keydown', this._keyDownHandler, true);
        realWindow.addEventListener('keyup', this._keyUpHandler, true);
        canvas.addEventListener('wheel', this._mouseWheelHandler, activeListenerOption);
        canvas.addEventListener('pointerover', this._pointerEnterHandler, passiveListenerOption);
        canvas.addEventListener('pointerleave', this._pointerLeaveHandler, passiveListenerOption);
        canvas.addEventListener('pointerdown', this._pointerDownHandler, activeListenerOption);
        canvas.addEventListener('pointermove', this._pointerMoveHandler, passiveListenerOption);
        canvas.addEventListener('pointerup', this._pointerUpHandler, activeListenerOption);
        canvas.addEventListener('pointercancel', this._pointerCancelHandler, passiveListenerOption);
        canvas.addEventListener('contextmenu', stopEvent, activeListenerOption);
        canvas.addEventListener('selectstart', stopEvent, activeListenerOption);
    }

    public get channels(): Float32Array {
        return this._channels;
    }

    public get pointers(): PointerMapping {
        return this._pointers;
    }

    public get gamepads(): Array<GamepadProvider> {
        return this._gamepads;
    }

    public add(inputs: Input | Array<Input>): this {
        if (Array.isArray(inputs)) {
            inputs.forEach(this.add, this);

            return this;
        }

        this._inputs.add(inputs);

        return this;
    }

    public remove(inputs: Input | Array<Input>): this {
        if (Array.isArray(inputs)) {
            inputs.forEach(this.remove, this);

            return this;
        }

        this._inputs.delete(inputs);

        return this;
    }

    public clear(destroyInputs = false): this {
        if (destroyInputs) {
            for (const input of this._inputs) {
                input.destroy();
            }
        }

        this._inputs.clear();

        return this;
    }

    public update(): this {
        this._updateGamepads();

        for (const input of this._inputs) {
            input.update(this._channels);
        }

        this._updateEvents();

        for (const pointer of Object.values(this._pointers)) {
            pointer.updateEvents();
        }

        return this;
    }

    public destroy(): void {
        const canvas = this._app.canvas;
        const realWindow = window.parent || window;

        realWindow.removeEventListener('keydown', this._keyDownHandler, true);
        realWindow.removeEventListener('keyup', this._keyUpHandler, true);
        canvas.removeEventListener('wheel', this._mouseWheelHandler, activeListenerOption);
        canvas.removeEventListener('pointerover', this._pointerEnterHandler, passiveListenerOption);
        canvas.removeEventListener('pointerleave', this._pointerLeaveHandler, passiveListenerOption);
        canvas.removeEventListener('pointerdown', this._pointerDownHandler, activeListenerOption);
        canvas.removeEventListener('pointermove', this._pointerMoveHandler, passiveListenerOption);
        canvas.removeEventListener('pointerup', this._pointerUpHandler, activeListenerOption);
        canvas.removeEventListener('pointercancel', this._pointerCancelHandler, passiveListenerOption);
        canvas.removeEventListener('contextmenu', stopEvent, activeListenerOption);
        canvas.removeEventListener('selectstart', stopEvent, activeListenerOption);

        for (const pointer of Object.values(this._pointers)) {
            pointer.destroy();
        }

        for (const gamepad of this._gamepads) {
            gamepad.destroy();
        }

        this._inputs.clear();
        this._channelsPressed.length = 0;
        this._channelsReleased.length = 0;
        this._pointersEntered.length = 0;
        this._pointersLeft.length = 0;
        this._pointersPressed.length = 0;
        this._pointersMoved.length = 0;
        this._pointersReleased.length = 0;
        this._pointersCancelled.length = 0;
        this._wheelOffset.destroy();
        this._flags.destroy();

        this.onPointerEnter.destroy();
        this.onPointerLeave.destroy();
        this.onPointerDown.destroy();
        this.onPointerMove.destroy();
        this.onPointerUp.destroy();
        this.onPointerTap.destroy();
        this.onPointerSwipe.destroy();
        this.onPointerCancel.destroy();
        this.onMouseWheel.destroy();
        this.onKeyDown.destroy();
        this.onKeyUp.destroy();
        this.onGamepadConnected.destroy();
        this.onGamepadDisconnected.destroy();
        this.onGamepadUpdated.destroy();
    }

    private _keyDown(event: KeyboardEvent): void {
        const channel = (CHANNEL_OFFSET.KEYBOARD + event.keyCode);

        this._channels[channel] = 1;
        this._channelsPressed.push(channel);
        this._flags.add(InputManagerFlags.KEY_DOWN);
    }

    private _keyUp(event: KeyboardEvent): void {
        const channel = (CHANNEL_OFFSET.KEYBOARD + event.keyCode);

        this._channels[channel] = 0;
        this._channelsReleased.push(channel);
        this._flags.add(InputManagerFlags.KEY_UP);
    }

    private _pointerEnter(event: PointerEvent): void {
        const pointer = new Pointer(event);

        this._pointers[pointer.id] = pointer;
        this._pointersEntered.push(pointer);
        this._flags.add(InputManagerFlags.POINTER_ENTER);
    }

    private _pointerLeave(event: PointerEvent): void {
        const pointer = this._pointers[event.pointerId].update(event);

        delete this._pointers[pointer.id];
        this._pointersLeft.push(pointer);
        this._flags.add(InputManagerFlags.POINTER_LEAVE);
    }

    private _pointerDown(event: PointerEvent): void {
        const pointer = this._pointers[event.pointerId].update(event);

        pointer.startPos.copy(pointer.position);
        this._pointersPressed.push(pointer);
        this._flags.add(InputManagerFlags.POINTER_DOWN);

        event.preventDefault();
    }

    private _pointerMove(event: PointerEvent): void {
        const pointer = this._pointers[event.pointerId].update(event);

        this._pointersMoved.push(pointer);
        this._flags.add(InputManagerFlags.POINTER_MOVE);
    }

    private _pointerUp(event: PointerEvent): void {
        const pointer = this._pointers[event.pointerId].update(event);

        this._pointersReleased.push(pointer);
        this._flags.add(InputManagerFlags.POINTER_UP);

        event.preventDefault();
    }

    private _pointerCancel(event: PointerEvent): void {
        const pointer = this._pointers[event.pointerId].update(event);

        this._pointersCancelled.push(pointer);
        this._flags.add(InputManagerFlags.POINTER_CANCEL);
    }

    private _mouseWheel(event: WheelEvent): void {
        this._wheelOffset.set(event.deltaX, event.deltaY);
        this._flags.add(InputManagerFlags.MOUSE_WHEEL);
    }

    private _updateGamepads(): this {
        const activeGamepads = window.navigator.getGamepads();

        for (const gamepad of this._gamepads) {
            const activeGamepad = activeGamepads[gamepad.index];

            if (!!activeGamepad !== gamepad.connected) {
                if (activeGamepad) {
                    this.onGamepadConnected.dispatch(gamepad.connect(activeGamepad), this._gamepads);
                } else {
                    this.onGamepadDisconnected.dispatch(gamepad.disconnect(), this._gamepads);
                }
            }

            gamepad.update();

            this.onGamepadUpdated.dispatch(gamepad, this._gamepads);
        }

        return this;
    }

    private _updateEvents(): this {
        if (!this._flags.value) {
            return this;
        }

        if (this._flags.has(InputManagerFlags.KEY_DOWN)) {
            while (this._channelsPressed.length > 0) {
                this.onKeyDown.dispatch(this._channelsPressed.pop());
            }

            this._flags.remove(InputManagerFlags.KEY_DOWN);
        }

        if (this._flags.has(InputManagerFlags.KEY_UP)) {
            while (this._channelsReleased.length > 0) {
                this.onKeyUp.dispatch(this._channelsReleased.pop());
            }

            this._flags.remove(InputManagerFlags.KEY_UP);
        }

        if (this._flags.has(InputManagerFlags.POINTER_ENTER)) {
            while (this._pointersEntered.length > 0) {
                this.onPointerEnter.dispatch(this._pointersEntered.pop());
            }

            this._flags.remove(InputManagerFlags.POINTER_ENTER);
        }

        if (this._flags.has(InputManagerFlags.POINTER_LEAVE)) {
            while (this._pointersLeft.length > 0) {
                this.onPointerLeave.dispatch(this._pointersLeft.pop());
            }

            this._flags.remove(InputManagerFlags.POINTER_LEAVE);
        }

        if (this._flags.has(InputManagerFlags.POINTER_DOWN)) {
            while (this._pointersPressed.length > 0) {
                this.onPointerDown.dispatch(this._pointersPressed.pop());
            }

            this._flags.remove(InputManagerFlags.POINTER_DOWN);
        }

        if (this._flags.has(InputManagerFlags.POINTER_MOVE)) {
            while (this._pointersMoved.length > 0) {
                this.onPointerMove.dispatch(this._pointersMoved.pop());
            }

            this._flags.remove(InputManagerFlags.POINTER_MOVE);
        }

        if (this._flags.has(InputManagerFlags.POINTER_UP)) {
            while (this._pointersReleased.length > 0) {
                const pointer = this._pointersReleased.pop()!;
                const { x: startX, y: startY } = pointer.startPos;

                this.onPointerUp.dispatch(pointer);

                if (startX > 0 && startY > 0) {
                    if (getDistance(startX, startY, pointer.x, pointer.y) < 10) {
                        this.onPointerTap.dispatch(pointer);
                    } else {
                        this.onPointerSwipe.dispatch(pointer);
                    }
                }

                pointer.startPos.set(-1, -1);
            }

            this._flags.remove(InputManagerFlags.POINTER_UP);
        }

        if (this._flags.has(InputManagerFlags.POINTER_CANCEL)) {
            while (this._pointersCancelled.length > 0) {
                this.onPointerCancel.dispatch(this._pointersCancelled.pop());
            }

            this._flags.remove(InputManagerFlags.POINTER_CANCEL);
        }

        if (this._flags.has(InputManagerFlags.MOUSE_WHEEL)) {
            this.onMouseWheel.dispatch(this._wheelOffset);
            this._wheelOffset.set(0, 0);

            this._flags.remove(InputManagerFlags.MOUSE_WHEEL);
        }

        return this;
    }
}
