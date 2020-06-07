import { Vector } from 'math/Vector';
import { Size } from 'math/Size';
import { Flags } from 'math/Flags';

export enum PointerStateFlag {
    none = 0,
    over = 1 << 0,
    leave = 1 << 1,
    down = 1 << 2,
    move = 1 << 3,
    up = 1 << 4,
    cancel = 1 << 5,
}

export enum PointerState {
    unknown,
    insideCanvas,
    outsideCanvas,
    pressed,
    moving,
    released,
    cancelled,
}

export class Pointer {
    public readonly id: number;
    public readonly type: string;
    public readonly position: Vector;
    public readonly startPos: Vector = new Vector(-1, -1);
    public readonly size: Size;
    public readonly tilt: Vector;
    public readonly stateFlags: Flags<PointerStateFlag> = new Flags<PointerStateFlag>();
    private _canvas: HTMLCanvasElement | null;
    private _buttons: number;
    private _pressure: number;
    private _rotation: number;
    private _currentState: PointerState = PointerState.unknown;

    public constructor(event: PointerEvent, canvas: HTMLCanvasElement) {
        const { pointerId, pointerType, clientX, clientY, width, height, tiltX, tiltY, buttons, pressure, twist } = event;
        const { left, top } = canvas.getBoundingClientRect();

        this._canvas = canvas;
        this.id = pointerId;
        this.type = pointerType;
        this.position = new Vector(clientX - left, clientY - top);
        this.size = new Size(width, height);
        this.tilt = new Vector(tiltX, tiltY);
        this._buttons = buttons;
        this._pressure = pressure;
        this._rotation = twist;

        this.stateFlags.push(PointerStateFlag.over);
    }

    public get x(): number {
        return this.position.x;
    }

    public get y(): number {
        return this.position.y;
    }

    public get width(): number {
        return this.size.width;
    }

    public get height(): number {
        return this.size.height;
    }

    public get buttons(): number {
        return this._buttons;
    }

    public get pressure(): number {
        return this._pressure;
    }

    public get rotation(): number {
        return this._rotation;
    }

    public get currentState(): PointerState {
        return this._currentState;
    }

    public handleEnter(event: PointerEvent): void {
        this.handleEvent(event);
        this._currentState = PointerState.insideCanvas;
    }

    public handleLeave(event: PointerEvent): void {
        this.handleEvent(event);
        this.stateFlags.push(PointerStateFlag.leave);
        this._currentState = PointerState.outsideCanvas;
    }

    public handlePress(event: PointerEvent): void {
        this.handleEvent(event);
        this.startPos.copy(this.position);
        this.stateFlags.push(PointerStateFlag.down);
        this._currentState = PointerState.pressed;
    }

    public handleMove(event: PointerEvent): void {
        this.handleEvent(event);
        this.stateFlags.push(PointerStateFlag.move);
        this._currentState = PointerState.moving;
    }

    public handleRelease(event: PointerEvent): void {
        this.handleEvent(event);
        this.stateFlags.push(PointerStateFlag.up);
        this._currentState = PointerState.released;
    }

    public handleCancel(event: PointerEvent): void {
        this.handleEvent(event);
        this.stateFlags.push(PointerStateFlag.cancel);
        this._currentState = PointerState.cancelled;
    }

    public destroy(): void {
        this.position.destroy();
        this.startPos.destroy();
        this.size.destroy();
        this.tilt.destroy();
        this._canvas = null;
    }

    private handleEvent(event: PointerEvent): this {
        const { clientX, clientY, width, height, tiltX, tiltY, buttons, pressure, twist } = event;
        const { left, top } = this._canvas!.getBoundingClientRect();

        this.position.set(clientX - left, clientY - top);
        this.size.set(width, height);
        this.tilt.set(tiltX, tiltY);
        this._buttons = buttons;
        this._pressure = pressure;
        this._rotation = twist;

        return this;
    }
}
