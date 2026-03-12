import { ChannelSize, ChannelOffset } from 'types/input';
import { Flags } from 'math/Flags';
import { stopEvent } from 'utils/core';
import { Vector } from 'math/Vector';
import { Pointer, PointerState, PointerStateFlag } from './Pointer';
import { Gamepad } from 'input/Gamepad';
import { Signal } from 'core/Signal';
import { getDistance } from 'utils/math';
import type { GamepadMapping, GamepadMappingResolver } from './GamepadMapping';
import type { Input } from './Input';
import type { Application } from 'core/Application';

enum InputManagerFlags {
    NONE = 0,
    KEY_DOWN = 1 << 0,
    KEY_UP = 1 << 1,
    MOUSE_WHEEL = 1 << 2,
    POINTER_UPDATE = 1 << 3,
}

export class InputManager {

    private _canvas: HTMLCanvasElement;
    private _channels: Float32Array = new Float32Array(ChannelSize.container);
    private _inputs: Set<Input> = new Set();
    private _pointers: Record<number, Pointer> = {};
    private _gamepads: Array<Gamepad> = [];
    private _gamepadsByIndex: Map<number, Gamepad> = new Map();
    private _gamepadSlotsActive: Uint8Array = new Uint8Array(ChannelSize.category / ChannelSize.gamepad);
    private _wheelOffset: Vector = new Vector();
    private _flags: Flags<InputManagerFlags> = new Flags<InputManagerFlags>();
    private _channelsPressed: Array<number> = [];
    private _channelsReleased: Array<number> = [];
    private _canvasFocused: boolean;
    private _pointerDistanceThreshold: number;
    private _gamepadMappingResolver: GamepadMappingResolver;

    private readonly _keyDownHandler: (event: KeyboardEvent) => void = this._handleKeyDown.bind(this);
    private readonly _keyUpHandler: (event: KeyboardEvent) => void = this._handleKeyUp.bind(this);
    private readonly _canvasFocusHandler: () => void = this._handleCanvasFocus.bind(this);
    private readonly _canvasBlurHandler: () => void = this._handleCanvasBlur.bind(this);
    private readonly _windowBlurHandler: () => void = this._handleWindowBlur.bind(this);
    private readonly _mouseWheelHandler: (event: WheelEvent) => void = this._handleMouseWheel.bind(this);
    private readonly _pointerOverHandler: (event: PointerEvent) => void = this._handlePointerOver.bind(this);
    private readonly _pointerLeaveHandler: (event: PointerEvent) => void = this._handlePointerLeave.bind(this);
    private readonly _pointerDownHandler: (event: PointerEvent) => void = this._handlePointerDown.bind(this);
    private readonly _pointerMoveHandler: (event: PointerEvent) => void = this._handlePointerMove.bind(this);
    private readonly _pointerUpHandler: (event: PointerEvent) => void = this._handlePointerUp.bind(this);
    private readonly _pointerCancelHandler: (event: PointerEvent) => void = this._handlePointerCancel.bind(this);

    public readonly onPointerEnter = new Signal<[Pointer]>();
    public readonly onPointerLeave = new Signal<[Pointer]>();
    public readonly onPointerDown = new Signal<[Pointer]>();
    public readonly onPointerMove = new Signal<[Pointer]>();
    public readonly onPointerUp = new Signal<[Pointer]>();
    public readonly onPointerTap = new Signal<[Pointer]>();
    public readonly onPointerSwipe = new Signal<[Pointer]>();
    public readonly onPointerCancel = new Signal<[Pointer]>();
    public readonly onMouseWheel = new Signal<[Vector]>();
    public readonly onKeyDown = new Signal<[number]>();
    public readonly onKeyUp = new Signal<[number]>();
    public readonly onGamepadConnected = new Signal<[Gamepad, Array<Gamepad>]>();
    public readonly onGamepadDisconnected = new Signal<[Gamepad, Array<Gamepad>]>();
    public readonly onGamepadUpdated = new Signal<[Gamepad, Array<Gamepad>]>();

    public constructor(app: Application) {
        const { gamepadMapping, pointerDistanceThreshold } = app.options;

        this._canvas = app.canvas;
        this._canvasFocused = document.activeElement === this._canvas;
        this._pointerDistanceThreshold = pointerDistanceThreshold;
        this._gamepadMappingResolver = typeof gamepadMapping === 'function'
            ? gamepadMapping
            : (): GamepadMapping => gamepadMapping;

        this._addEventListeners();
    }

    public get pointersInCanvas(): boolean {
        return Object.values(this._pointers).some(pointer => (
            pointer.currentState !== PointerState.outsideCanvas &&
            pointer.currentState !== PointerState.cancelled
        ));
    }

    public get canvasFocused(): boolean {
        return this._canvasFocused;
    }

    public get gamepads(): Array<Gamepad> {
        return this._gamepads;
    }

    public getGamepad(index: number): Gamepad | null {
        return this._gamepadsByIndex.get(index) ?? null;
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

        if (this._flags.value !== InputManagerFlags.NONE) {
            this._updateEvents();
        }

        return this;
    }

    public destroy(): void {
        this._removeEventListeners();

        for (const pointer of Object.values(this._pointers)) {
            pointer.destroy();
        }

        for (const gamepad of this._gamepads) {
            gamepad.destroy();
        }

        this._inputs.clear();
        this._gamepadsByIndex.clear();
        this._gamepads.length = 0;
        this._channelsPressed.length = 0;
        this._channelsReleased.length = 0;
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

    private _handleKeyDown(event: KeyboardEvent): void {
        const channel = (ChannelOffset.keyboard + event.keyCode);

        this._channels[channel] = 1;
        this._channelsPressed.push(channel);
        this._flags.push(InputManagerFlags.KEY_DOWN);
    }

    private _handleKeyUp(event: KeyboardEvent): void {
        const channel = (ChannelOffset.keyboard + event.keyCode);

        this._channels[channel] = 0;
        this._channelsReleased.push(channel);
        this._flags.push(InputManagerFlags.KEY_UP);
    }

    private _handlePointerOver(event: PointerEvent): void {
        this._pointers[event.pointerId] = new Pointer(event, this._canvas);
        this._flags.push(InputManagerFlags.POINTER_UPDATE);
    }

    private _handlePointerLeave(event: PointerEvent): void {
        this._pointers[event.pointerId].handleLeave(event);
        this._flags.push(InputManagerFlags.POINTER_UPDATE);
    }

    private _handlePointerDown(event: PointerEvent): void {
        this._canvas.focus();
        this._canvasFocused = true;
        this._pointers[event.pointerId].handlePress(event);
        this._flags.push(InputManagerFlags.POINTER_UPDATE);

        event.preventDefault();
    }

    private _handlePointerMove(event: PointerEvent): void {
        this._pointers[event.pointerId].handleMove(event);
        this._flags.push(InputManagerFlags.POINTER_UPDATE);
    }

    private _handlePointerUp(event: PointerEvent): void {
        this._pointers[event.pointerId].handleRelease(event);
        this._flags.push(InputManagerFlags.POINTER_UPDATE);

        event.preventDefault();
    }

    private _handlePointerCancel(event: PointerEvent): void {
        this._pointers[event.pointerId].handleCancel(event);
        this._flags.push(InputManagerFlags.POINTER_UPDATE);
    }

    private _handleMouseWheel(event: WheelEvent): void {
        this._wheelOffset.set(event.deltaX, event.deltaY);
        this._flags.push(InputManagerFlags.MOUSE_WHEEL);

        if (this._canvasFocused) {
            event.preventDefault();
        }
    }

    private _handleCanvasFocus(): void {
        this._canvasFocused = true;
    }

    private _handleCanvasBlur(): void {
        this._canvasFocused = false;
    }

    private _handleWindowBlur(): void {
        this._canvasFocused = false;
    }

    private _addEventListeners(): void {
        const canvas = this._canvas;
        const activeWindow = window;
        const activeListenerOption = { capture: true, passive: false };
        const passiveListenerOption = { capture: true, passive: true };

        activeWindow.addEventListener('keydown', this._keyDownHandler, true);
        activeWindow.addEventListener('keyup', this._keyUpHandler, true);
        activeWindow.addEventListener('blur', this._windowBlurHandler, true);
        canvas.addEventListener('focus', this._canvasFocusHandler, true);
        canvas.addEventListener('blur', this._canvasBlurHandler, true);
        canvas.addEventListener('wheel', this._mouseWheelHandler, activeListenerOption);
        canvas.addEventListener('pointerover', this._pointerOverHandler, passiveListenerOption); // Cancellable
        canvas.addEventListener('pointerleave', this._pointerLeaveHandler, passiveListenerOption);
        canvas.addEventListener('pointerdown', this._pointerDownHandler, activeListenerOption); // Cancellable
        canvas.addEventListener('pointermove', this._pointerMoveHandler, passiveListenerOption); // Cancellable
        canvas.addEventListener('pointerup', this._pointerUpHandler, activeListenerOption); // Cancellable
        canvas.addEventListener('pointercancel', this._pointerCancelHandler, passiveListenerOption);
        canvas.addEventListener('contextmenu', stopEvent, activeListenerOption); // Cancellable
        canvas.addEventListener('selectstart', stopEvent, activeListenerOption); // Cancellable
    }

    private _removeEventListeners(): void {
        const canvas = this._canvas;
        const keyEventTarget = window;
        const activeListenerOption = { capture: true, passive: false };
        const passiveListenerOption = { capture: true, passive: true };

        keyEventTarget.removeEventListener('keydown', this._keyDownHandler, true);
        keyEventTarget.removeEventListener('keyup', this._keyUpHandler, true);
        keyEventTarget.removeEventListener('blur', this._windowBlurHandler, true);
        canvas.removeEventListener('focus', this._canvasFocusHandler, true);
        canvas.removeEventListener('blur', this._canvasBlurHandler, true);
        canvas.removeEventListener('wheel', this._mouseWheelHandler, activeListenerOption);
        canvas.removeEventListener('pointerover', this._pointerOverHandler, passiveListenerOption);
        canvas.removeEventListener('pointerleave', this._pointerLeaveHandler, passiveListenerOption);
        canvas.removeEventListener('pointerdown', this._pointerDownHandler, activeListenerOption);
        canvas.removeEventListener('pointermove', this._pointerMoveHandler, passiveListenerOption);
        canvas.removeEventListener('pointerup', this._pointerUpHandler, activeListenerOption);
        canvas.removeEventListener('pointercancel', this._pointerCancelHandler, passiveListenerOption);
        canvas.removeEventListener('contextmenu', stopEvent, activeListenerOption);
        canvas.removeEventListener('selectstart', stopEvent, activeListenerOption);
    }

    private _updateGamepads(): this {
        const activeGamepads = window.navigator.getGamepads();
        const gamepadSlotsActive = this._gamepadSlotsActive;

        gamepadSlotsActive.fill(0);

        for (const activeGamepad of activeGamepads) {
            if (!activeGamepad) {
                continue;
            }

            const activeIndex = activeGamepad.index;

            if (activeIndex < 0 || activeIndex >= gamepadSlotsActive.length) {
                continue;
            }

            gamepadSlotsActive[activeIndex] = 1;

            let gamepad = this._gamepadsByIndex.get(activeIndex);

            if (!gamepad) {
                gamepad = new Gamepad(activeGamepad, this._channels, this._gamepadMappingResolver);
                this._gamepadsByIndex.set(activeIndex, gamepad);
                this._insertGamepadByIndex(gamepad);
                this.onGamepadConnected.dispatch(gamepad, this._gamepads);
            } else {
                gamepad.connect(activeGamepad);
            }

            gamepad.update();
            this.onGamepadUpdated.dispatch(gamepad, this._gamepads);
        }

        for (let i = this._gamepads.length - 1; i >= 0; i--) {
            const gamepad = this._gamepads[i];

            if (gamepadSlotsActive[gamepad.index] === 0) {
                gamepad.disconnect();
                this._gamepads.splice(i, 1);
                this._gamepadsByIndex.delete(gamepad.index);
                this.onGamepadDisconnected.dispatch(gamepad, this._gamepads);
                gamepad.destroy();
            }
        }

        return this;
    }

    private _insertGamepadByIndex(gamepad: Gamepad): void {
        let insertIndex = 0;

        while (insertIndex < this._gamepads.length && this._gamepads[insertIndex].index < gamepad.index) {
            insertIndex += 1;
        }

        this._gamepads.splice(insertIndex, 0, gamepad);
    }

    private _updateEvents(): this {
        if (this._flags.pop(InputManagerFlags.KEY_DOWN)) {
            for (const channel of this._channelsPressed) {
                this.onKeyDown.dispatch(channel);
            }

            this._channelsPressed.length = 0;
        }

        if (this._flags.pop(InputManagerFlags.KEY_UP)) {
            for (const channel of this._channelsReleased) {
                this.onKeyUp.dispatch(channel);
            }

            this._channelsReleased.length = 0;
        }

        if (this._flags.pop(InputManagerFlags.MOUSE_WHEEL)) {
            this.onMouseWheel.dispatch(this._wheelOffset);
            this._wheelOffset.set(0, 0);
        }

        if (this._flags.pop(InputManagerFlags.POINTER_UPDATE)) {
            this._updatePointerEvents();
        }

        return this;
    }

    private _updatePointerEvents(): void {
        for (const pointer of Object.values(this._pointers)) {
            const { stateFlags } = pointer;

            if (stateFlags.value === PointerStateFlag.none) {
                continue;
            }

            if (stateFlags.pop(PointerStateFlag.over)) {
                this.onPointerEnter.dispatch(pointer);
            }

            if (stateFlags.pop(PointerStateFlag.down)) {
                this.onPointerDown.dispatch(pointer);
            }

            if (stateFlags.pop(PointerStateFlag.move)) {
                this.onPointerMove.dispatch(pointer);
            }

            if (stateFlags.pop(PointerStateFlag.up)) {
                const { x: startX, y: startY } = pointer.startPos;

                this.onPointerUp.dispatch(pointer);

                if (startX >= 0 && startY >= 0) {
                    if (getDistance(startX, startY, pointer.x, pointer.y) < this._pointerDistanceThreshold) {
                        this.onPointerTap.dispatch(pointer);
                    } else {
                        this.onPointerSwipe.dispatch(pointer);
                    }
                }

                pointer.startPos.set(-1, -1);
            }

            if (stateFlags.pop(PointerStateFlag.cancel)) {
                this.onPointerCancel.dispatch(pointer);
            }

            if (stateFlags.pop(PointerStateFlag.leave)) {
                this.onPointerLeave.dispatch(pointer);
                delete this._pointers[pointer.id];
            }
        }
    }
}
