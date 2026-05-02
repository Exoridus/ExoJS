export type { EasingFunction } from './Easing';

export enum TweenState {
    Idle = 'idle',
    Active = 'active',
    Paused = 'paused',
    Complete = 'complete',
    Stopped = 'stopped',
}

export type TweenLifecycleCallback = () => void;
export type TweenUpdateCallback = (progress: number) => void;
