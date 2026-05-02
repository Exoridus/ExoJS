import { Flags } from '@/math/Flags';
import { Vector } from '@/math/Vector';
import { Signal } from '@/core/Signal';
import { getDistance } from '@/math/utils';
import { stopEvent } from '@/core/utils';
import { ChannelOffset, ChannelSize, maxPointers } from '@/input/types';

import { Gamepad } from './Gamepad';
import { Pointer, PointerState, PointerStateFlag } from './Pointer';
import { GestureRecognizer } from './GestureRecognizer';
import { builtInGamepadDefinitions, resolveGamepadDefinition } from './GamepadDefinitions';

import type { Application } from '@/core/Application';
import type { GamepadDefinition, BrowserGamepad } from './GamepadDefinitions';
import type { Input } from './Input';

enum InputManagerFlag {
    None = 0,
    KeyDown = 1 << 0,
    KeyUp = 1 << 1,
    MouseWheel = 1 << 2,
    PointerUpdate = 1 << 3,
}

export class InputManager {
    private readonly canvas: HTMLCanvasElement;
    private readonly channels: Float32Array = new Float32Array(ChannelSize.Container);
    private readonly inputs = new Set<Input>();
    private readonly pointers: Record<number, Pointer> = {};
    private readonly gamepadsValue: Array<Gamepad> = [];
    private readonly gamepadsByIndex = new Map<number, Gamepad>();
    private readonly gamepadSlotsActive = new Uint8Array(ChannelSize.Category / ChannelSize.Gamepad);
    private readonly wheelOffset = new Vector();
    private readonly flags = new Flags<InputManagerFlag>();
    private readonly channelsPressed: Array<number> = [];
    private readonly channelsReleased: Array<number> = [];
    private readonly gamepadDefinitions: Array<GamepadDefinition>;

    // Slot allocation for unified pointer tracking (mouse / touch / pen).
    private readonly pointerSlots = new Map<number, number>(); // pointerId → slotIndex
    private readonly freeSlots: Array<number> = Array.from({ length: maxPointers }, (_, i) => i);

    private readonly gestureRecognizer: GestureRecognizer;

    private canvasFocusedValue: boolean;
    private pointerDistanceThreshold: number;

    private readonly keyDownHandler = this.handleKeyDown.bind(this);
    private readonly keyUpHandler = this.handleKeyUp.bind(this);
    private readonly canvasFocusHandler = this.handleCanvasFocus.bind(this);
    private readonly canvasBlurHandler = this.handleCanvasBlur.bind(this);
    private readonly windowBlurHandler = this.handleWindowBlur.bind(this);
    private readonly mouseWheelHandler = this.handleMouseWheel.bind(this);
    private readonly pointerOverHandler = this.handlePointerOver.bind(this);
    private readonly pointerLeaveHandler = this.handlePointerLeave.bind(this);
    private readonly pointerDownHandler = this.handlePointerDown.bind(this);
    private readonly pointerMoveHandler = this.handlePointerMove.bind(this);
    private readonly pointerUpHandler = this.handlePointerUp.bind(this);
    private readonly pointerCancelHandler = this.handlePointerCancel.bind(this);

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

    /** Fires on every two-touch-pointer move where the distance between them changed. `scale` > 1 = spreading, < 1 = pinching. */
    public readonly onPinch = new Signal<[scale: number, center: Vector]>();
    /** Fires on every two-touch-pointer move where the angle between them changed. `angleDelta` is in radians. */
    public readonly onRotate = new Signal<[angleDelta: number, center: Vector]>();
    /** Fires when a pointer has been held without significant movement for ≥ 500 ms. */
    public readonly onLongPress = new Signal<[pointer: Pointer]>();

    public constructor(app: Application) {
        const { gamepadDefinitions = [], pointerDistanceThreshold } = app.options;

        this.canvas = app.canvas;
        this.canvasFocusedValue = document.activeElement === this.canvas;
        this.pointerDistanceThreshold = pointerDistanceThreshold;
        this.gamepadDefinitions = [...gamepadDefinitions, ...builtInGamepadDefinitions];

        // Disable the browser's default pan/zoom/double-tap-zoom on touch devices so
        // pointer events reach the canvas without being swallowed by the browser's
        // native touch gestures.
        this.canvas.style.touchAction = 'none';

        this.gestureRecognizer = new GestureRecognizer(
            pointerDistanceThreshold,
            this.onPinch,
            this.onRotate,
            this.onLongPress,
        );

        this.addEventListeners();
    }

    public get pointersInCanvas(): boolean {
        return Object.values(this.pointers).some((pointer) => (
            pointer.currentState !== PointerState.OutsideCanvas
            && pointer.currentState !== PointerState.Cancelled
        ));
    }

    public get canvasFocused(): boolean {
        return this.canvasFocusedValue;
    }

    public get gamepads(): Array<Gamepad> {
        return this.gamepadsValue;
    }

    public getGamepad(index: number): Gamepad | null {
        return this.gamepadsByIndex.get(index) ?? null;
    }

    public add(inputs: Input | Array<Input>): this {
        if (Array.isArray(inputs)) {
            inputs.forEach((input) => this.add(input));

            return this;
        }

        this.inputs.add(inputs);

        return this;
    }

    public remove(inputs: Input | Array<Input>): this {
        if (Array.isArray(inputs)) {
            inputs.forEach((input) => this.remove(input));

            return this;
        }

        this.inputs.delete(inputs);

        return this;
    }

    public clear(destroyInputs = false): this {
        if (destroyInputs) {
            for (const input of this.inputs) {
                input.destroy();
            }
        }

        this.inputs.clear();

        return this;
    }

    public update(): this {
        this.updateGamepads();

        for (const input of this.inputs) {
            input.update(this.channels);
        }

        if (this.flags.value !== InputManagerFlag.None) {
            this.updateEvents();
        }

        return this;
    }

    public destroy(): void {
        this.removeEventListeners();
        this.gestureRecognizer.destroy();

        for (const pointer of Object.values(this.pointers)) {
            pointer.destroy();
        }

        for (const gamepad of this.gamepadsValue) {
            gamepad.destroy();
        }

        this.inputs.clear();
        this.gamepadsByIndex.clear();
        this.gamepadsValue.length = 0;
        this.channelsPressed.length = 0;
        this.channelsReleased.length = 0;
        this.pointerSlots.clear();
        this.freeSlots.length = 0;
        this.wheelOffset.destroy();
        this.flags.destroy();

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
        this.onPinch.destroy();
        this.onRotate.destroy();
        this.onLongPress.destroy();
    }

    private _assignSlot(pointerId: number): number | null {
        if (this.pointerSlots.has(pointerId)) {
            return this.pointerSlots.get(pointerId)!;
        }

        if (this.freeSlots.length === 0) {
            return null; // All 16 slots occupied — silently drop.
        }

        const slot = this.freeSlots.shift()!;

        this.pointerSlots.set(pointerId, slot);

        return slot;
    }

    private _releaseSlot(pointerId: number): void {
        const slot = this.pointerSlots.get(pointerId);

        if (slot !== undefined) {
            this.pointerSlots.delete(pointerId);
            // Push to the front so slot 0 is recovered first, keeping allocation predictable.
            this.freeSlots.unshift(slot);
        }
    }

    private handleKeyDown(event: KeyboardEvent): void {
        // Game-engine convention: keys only register while the canvas
        // owns focus. Otherwise typing into adjacent <input> fields would
        // also drive game state, which is never what users want.
        if (!this.canvasFocusedValue) {
            return;
        }

        const channel = ChannelOffset.Keyboard + event.keyCode;

        this.channels[channel] = 1;
        this.channelsPressed.push(channel);
        this.flags.push(InputManagerFlag.KeyDown);

        // Consume the event: stop default browser actions (page scroll on
        // arrow/space, find-as-you-type on /, etc.) and stop propagation
        // so other listeners on the page don't double-handle.
        stopEvent(event);
    }

    private handleKeyUp(event: KeyboardEvent): void {
        if (!this.canvasFocusedValue) {
            return;
        }

        const channel = ChannelOffset.Keyboard + event.keyCode;

        this.channels[channel] = 0;
        this.channelsReleased.push(channel);
        this.flags.push(InputManagerFlag.KeyUp);

        stopEvent(event);
    }

    private handlePointerOver(event: PointerEvent): void {
        const slot = this._assignSlot(event.pointerId);

        if (slot === null) {
            return; // 17th+ simultaneous pointer — silently drop.
        }

        this.pointers[event.pointerId] = new Pointer(event, this.canvas, this.channels, slot);
        this.flags.push(InputManagerFlag.PointerUpdate);
    }

    private handlePointerLeave(event: PointerEvent): void {
        const pointer = this.pointers[event.pointerId];

        if (!pointer) {
            return;
        }

        pointer.handleLeave(event);
        this.gestureRecognizer.onPointerLeave(pointer);
        this._releaseSlot(event.pointerId);
        this.flags.push(InputManagerFlag.PointerUpdate);
    }

    private handlePointerDown(event: PointerEvent): void {
        this.canvas.focus();
        this.canvasFocusedValue = true;

        const pointer = this.pointers[event.pointerId];

        if (!pointer) {
            return;
        }

        pointer.handlePress(event);
        this.gestureRecognizer.onPointerDown(pointer);
        this.flags.push(InputManagerFlag.PointerUpdate);

        // preventDefault stops native drag / text-selection;
        // stopImmediatePropagation prevents bubbling to host-page click
        // handlers so an embedded canvas doesn't accidentally trigger UI
        // outside its bounds.
        stopEvent(event);
    }

    private handlePointerMove(event: PointerEvent): void {
        const pointer = this.pointers[event.pointerId];

        if (!pointer) {
            return;
        }

        pointer.handleMove(event);
        this.gestureRecognizer.onPointerMove(pointer, this.pointerDistanceThreshold);
        this.flags.push(InputManagerFlag.PointerUpdate);
    }

    private handlePointerUp(event: PointerEvent): void {
        const pointer = this.pointers[event.pointerId];

        if (!pointer) {
            return;
        }

        pointer.handleRelease(event);
        this.gestureRecognizer.onPointerUp(pointer);
        this.flags.push(InputManagerFlag.PointerUpdate);

        stopEvent(event);
    }

    private handlePointerCancel(event: PointerEvent): void {
        const pointer = this.pointers[event.pointerId];

        if (!pointer) {
            return;
        }

        pointer.handleCancel(event);
        this.gestureRecognizer.onPointerCancel(pointer);
        this._releaseSlot(event.pointerId);
        this.flags.push(InputManagerFlag.PointerUpdate);
    }

    private handleMouseWheel(event: WheelEvent): void {
        if (!this.canvasFocusedValue) {
            return;
        }

        this.wheelOffset.set(event.deltaX, event.deltaY);
        this.flags.push(InputManagerFlag.MouseWheel);

        stopEvent(event);
    }

    private handleCanvasFocus(): void {
        this.canvasFocusedValue = true;
    }

    private handleCanvasBlur(): void {
        this.canvasFocusedValue = false;
        this.releaseAllKeyboardChannels();
    }

    private handleWindowBlur(): void {
        this.canvasFocusedValue = false;
        this.releaseAllKeyboardChannels();
    }

    /**
     * Force every currently-held keyboard channel back to zero and emit
     * onKeyUp for each. Called on canvas/window blur so keys held when
     * focus leaves don't stay stuck "down" forever — without this, a user
     * who alt-tabs while pressing W would have W register as held until
     * they manually release while focus is back.
     */
    private releaseAllKeyboardChannels(): void {
        for (let offset = 0; offset < ChannelSize.Category; offset++) {
            const channel = ChannelOffset.Keyboard + offset;

            if (this.channels[channel] !== 0) {
                this.channels[channel] = 0;
                this.channelsReleased.push(channel);
                this.flags.push(InputManagerFlag.KeyUp);
            }
        }
    }

    private addEventListeners(): void {
        const activeWindow = window;
        const activeListenerOption = { capture: true, passive: false };
        const passiveListenerOption = { capture: true, passive: true };

        activeWindow.addEventListener('keydown', this.keyDownHandler, true);
        activeWindow.addEventListener('keyup', this.keyUpHandler, true);
        activeWindow.addEventListener('blur', this.windowBlurHandler, true);
        this.canvas.addEventListener('focus', this.canvasFocusHandler, true);
        this.canvas.addEventListener('blur', this.canvasBlurHandler, true);
        this.canvas.addEventListener('wheel', this.mouseWheelHandler, activeListenerOption);
        this.canvas.addEventListener('pointerover', this.pointerOverHandler, passiveListenerOption);
        this.canvas.addEventListener('pointerleave', this.pointerLeaveHandler, passiveListenerOption);
        this.canvas.addEventListener('pointerdown', this.pointerDownHandler, activeListenerOption);
        this.canvas.addEventListener('pointermove', this.pointerMoveHandler, passiveListenerOption);
        this.canvas.addEventListener('pointerup', this.pointerUpHandler, activeListenerOption);
        this.canvas.addEventListener('pointercancel', this.pointerCancelHandler, passiveListenerOption);
        this.canvas.addEventListener('contextmenu', stopEvent, activeListenerOption);
        this.canvas.addEventListener('selectstart', stopEvent, activeListenerOption);
    }

    private removeEventListeners(): void {
        const activeListenerOption = { capture: true, passive: false };
        const passiveListenerOption = { capture: true, passive: true };

        window.removeEventListener('keydown', this.keyDownHandler, true);
        window.removeEventListener('keyup', this.keyUpHandler, true);
        window.removeEventListener('blur', this.windowBlurHandler, true);
        this.canvas.removeEventListener('focus', this.canvasFocusHandler, true);
        this.canvas.removeEventListener('blur', this.canvasBlurHandler, true);
        this.canvas.removeEventListener('wheel', this.mouseWheelHandler, activeListenerOption);
        this.canvas.removeEventListener('pointerover', this.pointerOverHandler, passiveListenerOption);
        this.canvas.removeEventListener('pointerleave', this.pointerLeaveHandler, passiveListenerOption);
        this.canvas.removeEventListener('pointerdown', this.pointerDownHandler, activeListenerOption);
        this.canvas.removeEventListener('pointermove', this.pointerMoveHandler, passiveListenerOption);
        this.canvas.removeEventListener('pointerup', this.pointerUpHandler, activeListenerOption);
        this.canvas.removeEventListener('pointercancel', this.pointerCancelHandler, passiveListenerOption);
        this.canvas.removeEventListener('contextmenu', stopEvent, activeListenerOption);
        this.canvas.removeEventListener('selectstart', stopEvent, activeListenerOption);
    }

    private updateGamepads(): this {
        const activeGamepads = window.navigator.getGamepads();

        this.gamepadSlotsActive.fill(0);

        for (const activeGamepad of activeGamepads) {
            if (!activeGamepad) {
                continue;
            }

            const activeIndex = activeGamepad.index;

            if (activeIndex < 0 || activeIndex >= this.gamepadSlotsActive.length) {
                continue;
            }

            this.gamepadSlotsActive[activeIndex] = 1;

            let gamepad = this.gamepadsByIndex.get(activeIndex);

            if (!gamepad) {
                const definition = resolveGamepadDefinition(activeGamepad, this.gamepadDefinitions);

                gamepad = new Gamepad(activeGamepad, this.channels, definition);
                this.gamepadsByIndex.set(activeIndex, gamepad);
                this.insertGamepadByIndex(gamepad);
                this.onGamepadConnected.dispatch(gamepad, this.gamepadsValue);
            } else {
                gamepad.connect(activeGamepad);
            }

            gamepad.update();
            this.onGamepadUpdated.dispatch(gamepad, this.gamepadsValue);
        }

        for (let index = this.gamepadsValue.length - 1; index >= 0; index -= 1) {
            const gamepad = this.gamepadsValue[index];

            if (this.gamepadSlotsActive[gamepad.index] === 0) {
                gamepad.disconnect();
                this.gamepadsValue.splice(index, 1);
                this.gamepadsByIndex.delete(gamepad.index);
                this.onGamepadDisconnected.dispatch(gamepad, this.gamepadsValue);
                gamepad.destroy();
            }
        }

        return this;
    }

    private insertGamepadByIndex(gamepad: Gamepad): void {
        let insertIndex = 0;

        while (insertIndex < this.gamepadsValue.length && this.gamepadsValue[insertIndex].index < gamepad.index) {
            insertIndex += 1;
        }

        this.gamepadsValue.splice(insertIndex, 0, gamepad);
    }

    private updateEvents(): this {
        if (this.flags.pop(InputManagerFlag.KeyDown)) {
            for (const channel of this.channelsPressed) {
                this.onKeyDown.dispatch(channel);
            }

            this.channelsPressed.length = 0;
        }

        if (this.flags.pop(InputManagerFlag.KeyUp)) {
            for (const channel of this.channelsReleased) {
                this.onKeyUp.dispatch(channel);
            }

            this.channelsReleased.length = 0;
        }

        if (this.flags.pop(InputManagerFlag.MouseWheel)) {
            this.onMouseWheel.dispatch(this.wheelOffset);
            this.wheelOffset.set(0, 0);
        }

        if (this.flags.pop(InputManagerFlag.PointerUpdate)) {
            this.updatePointerEvents();
        }

        return this;
    }

    private updatePointerEvents(): void {
        for (const pointer of Object.values(this.pointers)) {
            const { stateFlags } = pointer;

            if (stateFlags.value === PointerStateFlag.None) {
                continue;
            }

            if (stateFlags.pop(PointerStateFlag.Over)) {
                this.onPointerEnter.dispatch(pointer);
            }

            if (stateFlags.pop(PointerStateFlag.Down)) {
                this.onPointerDown.dispatch(pointer);
            }

            if (stateFlags.pop(PointerStateFlag.Move)) {
                this.onPointerMove.dispatch(pointer);
            }

            if (stateFlags.pop(PointerStateFlag.Up)) {
                const { x: startX, y: startY } = pointer.startPos;

                this.onPointerUp.dispatch(pointer);

                if (startX >= 0 && startY >= 0) {
                    if (getDistance(startX, startY, pointer.x, pointer.y) < this.pointerDistanceThreshold) {
                        this.onPointerTap.dispatch(pointer);
                    } else {
                        this.onPointerSwipe.dispatch(pointer);
                    }
                }

                pointer.startPos.set(-1, -1);
            }

            if (stateFlags.pop(PointerStateFlag.Cancel)) {
                this.onPointerCancel.dispatch(pointer);
            }

            if (stateFlags.pop(PointerStateFlag.Leave)) {
                this.onPointerLeave.dispatch(pointer);
                delete this.pointers[pointer.id];
            }
        }
    }
}
