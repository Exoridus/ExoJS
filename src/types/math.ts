export const Tau = Math.PI * 2;

export const RadiansPerDegree = Math.PI / 180;

export const DegreesPerRadian = 180 / Math.PI;

export const enum VoronoiRegion {
    Left = -1,
    Middle = 0,
    Right = 1,
}

export const trimRotation = (degrees: number): number => {
    const rotation = degrees % 360;

    return rotation < 0 ? rotation + 360 : rotation;
};