export type EasingFunction = (t: number) => number;

const bounceOutFn = (t: number): number => {
    const n1 = 7.5625;
    const d1 = 2.75;

    if (t < 1 / d1) {
        return n1 * t * t;
    } else if (t < 2 / d1) {
        return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
        return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
        return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
};

/**
 * Standard Robert Penner easing functions as static methods.
 * Each function accepts a normalized time `t` in [0, 1] and returns a value
 * that equals 0 at t=0 and 1 at t=1 (overshoot functions like back/elastic
 * may exceed that range between the endpoints).
 *
 * Usage: `Ease.cubicOut`, `Ease.bounceIn`, etc.
 *
 * Note: only scalar numeric properties are supported in v1. Vector, Color, and
 * Matrix interpolation are out of scope.
 */
export class Ease {
    public static readonly linear: EasingFunction = (t: number): number => t;

    public static readonly quadIn: EasingFunction = (t: number): number => t * t;
    public static readonly quadOut: EasingFunction = (t: number): number => t * (2 - t);
    public static readonly quadInOut: EasingFunction = (t: number): number =>
        t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    public static readonly cubicIn: EasingFunction = (t: number): number => t * t * t;
    public static readonly cubicOut: EasingFunction = (t: number): number => (--t) * t * t + 1;
    public static readonly cubicInOut: EasingFunction = (t: number): number =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    public static readonly quartIn: EasingFunction = (t: number): number => t * t * t * t;
    public static readonly quartOut: EasingFunction = (t: number): number => 1 - (--t) * t * t * t;
    public static readonly quartInOut: EasingFunction = (t: number): number =>
        t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;

    public static readonly quintIn: EasingFunction = (t: number): number => t * t * t * t * t;
    public static readonly quintOut: EasingFunction = (t: number): number => 1 + (--t) * t * t * t * t;
    public static readonly quintInOut: EasingFunction = (t: number): number =>
        t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;

    public static readonly sineIn: EasingFunction = (t: number): number =>
        1 - Math.cos((t * Math.PI) / 2);
    public static readonly sineOut: EasingFunction = (t: number): number =>
        Math.sin((t * Math.PI) / 2);
    public static readonly sineInOut: EasingFunction = (t: number): number =>
        -(Math.cos(Math.PI * t) - 1) / 2;

    public static readonly expoIn: EasingFunction = (t: number): number =>
        t === 0 ? 0 : Math.pow(2, 10 * t - 10);
    public static readonly expoOut: EasingFunction = (t: number): number =>
        t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    public static readonly expoInOut: EasingFunction = (t: number): number => {
        if (t === 0) return 0;
        if (t === 1) return 1;

        return t < 0.5
            ? Math.pow(2, 20 * t - 10) / 2
            : (2 - Math.pow(2, -20 * t + 10)) / 2;
    };

    public static readonly circIn: EasingFunction = (t: number): number =>
        1 - Math.sqrt(1 - Math.pow(t, 2));
    public static readonly circOut: EasingFunction = (t: number): number =>
        Math.sqrt(1 - Math.pow(t - 1, 2));
    public static readonly circInOut: EasingFunction = (t: number): number =>
        t < 0.5
            ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
            : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;

    public static readonly backIn: EasingFunction = (t: number): number => {
        const c1 = 1.70158;
        const c3 = c1 + 1;

        return c3 * t * t * t - c1 * t * t;
    };
    public static readonly backOut: EasingFunction = (t: number): number => {
        const c1 = 1.70158;
        const c3 = c1 + 1;

        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    };
    public static readonly backInOut: EasingFunction = (t: number): number => {
        const c1 = 1.70158;
        const c2 = c1 * 1.525;

        return t < 0.5
            ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
            : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (2 * t - 2) + c2) + 2) / 2;
    };

    public static readonly bounceOut: EasingFunction = bounceOutFn;
    public static readonly bounceIn: EasingFunction = (t: number): number =>
        1 - bounceOutFn(1 - t);
    public static readonly bounceInOut: EasingFunction = (t: number): number =>
        t < 0.5
            ? (1 - bounceOutFn(1 - 2 * t)) / 2
            : (1 + bounceOutFn(2 * t - 1)) / 2;

    public static readonly elasticIn: EasingFunction = (t: number): number => {
        if (t === 0) return 0;
        if (t === 1) return 1;
        const c4 = (2 * Math.PI) / 3;

        return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
    };
    public static readonly elasticOut: EasingFunction = (t: number): number => {
        if (t === 0) return 0;
        if (t === 1) return 1;
        const c4 = (2 * Math.PI) / 3;

        return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    };
    public static readonly elasticInOut: EasingFunction = (t: number): number => {
        if (t === 0) return 0;
        if (t === 1) return 1;
        const c5 = (2 * Math.PI) / 4.5;

        return t < 0.5
            ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
            : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
    };
}
