export const Tau = Math.PI * 2;

export const RadiansPerDegree = Math.PI / 180;

export const DegreesPerRadian = 180 / Math.PI;

export const VoronoiRegion = {
    LEFT: -1,
    MIDDLE: 0,
    RIGHT: 1,
};

export const trimRotation = (degrees: number): number => {
    const rotation = degrees % 360;

    return rotation < 0 ? rotation + 360 : rotation;
};