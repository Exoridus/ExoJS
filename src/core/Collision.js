/**
 * @class Collision
 * @memberof Exo
 */
export default class Collision {

    /**
     * @public
     * @param {Exo.Circle} circleA
     * @param {Exo.Circle} circleB
     * @returns {Boolean}
     */
    static checkCircles(circleA, circleB) {
        const x = circleA.x - circleB.x,
            y = circleA.y - circleB.y;

        return Math.sqrt((x * x) + (y * y)) < (circleA.radius + circleB.radius);
    }

    /**
     * @public
     * @param {Exo.Rectangle} rectangleA
     * @param {Exo.Rectangle} rectangleB
     * @returns {Boolean}
     */
    static checkRectangles(rectangleA, rectangleB) {
        return false;
    }
}
