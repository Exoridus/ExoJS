/**
 * @param {?number=} x The x position.
 * @param {?number=} y The y position.
 * @constructor
 */
function Vector(x, y) {
    this.x = x || 0;
    this.y = y || 0;
}

/**
 * @param {Vector} other The other Vector.
 * @return {Vector} This for chaining.
 */
Vector.prototype.copy = function (other) {
    this.x = other.x;
    this.y = other.y;

    return this;
};

/**
 * @return {Vector} The new cloned vector
 */
Vector.prototype.clone = function () {
    return new Vector(this.x, this.y);
};

/**
 * @return {Vector} This for chaining.
 */
Vector.prototype.perp = function () {
    var x = this.x;

    this.x = this.y;
    this.y = -x;

    return this;
};

/**
 * @param {number} angle The angle to rotate (in radians)
 * @return {Vector} This for chaining.
 */
Vector.prototype.rotate = function (angle) {
    var x = this.x;
    var y = this.y;

    this.x = x * Math.cos(angle) - y * Math.sin(angle);
    this.y = x * Math.sin(angle) + y * Math.cos(angle);

    return this;
};

/**
 * @return {Vector} This for chaining.
 */
Vector.prototype.reverse = function () {
    this.x = -this.x;
    this.y = -this.y;

    return this;
};

/**
 * @return {Vector} This for chaining.
 */
Vector.prototype.normalize = function () {
    var d = this.len();

    if (d > 0) {
        this.x = this.x / d;
        this.y = this.y / d;
    }

    return this;
};

/**
 * @param {Vector} other The other Vector.
 * @return {Vector} This for chaining.
 */
Vector.prototype.add = function (other) {
    this.x += other.x;
    this.y += other.y;

    return this;
};

/**
 * @param {Vector} other The other Vector.
 * @return {Vector} This for chaiing.
 */
Vector.prototype.sub = function (other) {
    this.x -= other.x;
    this.y -= other.y;

    return this;
};

/**
 * @param {number} x The scaling factor in the x direction.
 * @param {?number=} y The scaling factor in the y direction.  If this
 *   is not specified, the x scaling factor will be used.
 * @return {Vector} This for chaining.
 */
Vector.prototype.scale = function (x, y) {
    this.x *= x;
    this.y *= y || x;

    return this;
};

/**
 * @param {Vector}  other The vector to dot this one against.
 * @return {number} The dot product.
 */
Vector.prototype.dot = function (other) {
    return this.x * other.x + this.y * other.y;
};

/**
 * @return {number} The length^2 of this vector.
 */
Vector.prototype.len2 = function () {
    return this.dot(this);
};

/**
 * @return {number} The length of this vector.
 */
Vector.prototype.len = function () {
    return Math.sqrt(this.len2());
};

/**
 * @param {Vector=} pos A vector representing the position of the center of the circle
 * @param {?number=} r The radius of the circle
 * @constructor
 */
function Circle(pos, r) {
    this.pos = pos || new Vector();
    this.r = r || 0;
}

/**
 * @param {Vector=} pos A vector representing the origin of the polygon. (all other
 *   points are relative to this one)
 * @param {Array.<Vector>=} points An array of vectors representing the points in the polygon,
 *   in counter-clockwise order.
 * @constructor
 */
function Polygon(pos, points) {
    this.pos = pos || new Vector();
    this.angle = 0;
    this.offset = new Vector();
    this.setPoints(points || []);
}

/**
 * @param {Array.<Vector>=} points An array of vectors representing the points in the polygon,
 *   in counter-clockwise order.
 * @return {Polygon} This for chaining.
 */
Polygon.prototype.setPoints = function (points) {
    var lengthChanged = !this.points || this.points.length !== points.length;

    if (lengthChanged) {
        var i;
        var calcPoints = this.calcPoints = [];
        var edges = this.edges = [];
        var normals = this.normals = [];
        // Allocate the vector arrays for the calculated properties
        for (i = 0; i < points.length; i++) {
            calcPoints.push(new Vector());
            edges.push(new Vector());
            normals.push(new Vector());
        }
    }

    this.points = points;
    this._recalc();

    return this;
};

/**
 * @param {number} angle The current rotation angle (in radians).
 * @return {Polygon} This for chaining.
 */
Polygon.prototype.setAngle = function (angle) {
    this.angle = angle;
    this._recalc();

    return this;
};

/**
 * @param {Vector} offset The new offset vector.
 * @return {Polygon} This for chaining.
 */
Polygon.prototype.setOffset = function (offset) {
    this.offset = offset;
    this._recalc();

    return this;
};

/**
 * @param {number} angle The angle to rotate (in radians)
 * @return {Polygon} This for chaining.
 */
Polygon.prototype.rotate = function (angle) {
    var points = this.points;
    var len = points.length;

    for (var i = 0; i < len; i++) {
        points[i].rotate(angle);
    }

    this._recalc();

    return this;
};

/**
 * @param {number} x The horizontal amount to translate.
 * @param {number} y The vertical amount to translate.
 * @return {Polygon} This for chaining.
 */
Polygon.prototype.translate = function (x, y) {
    var points = this.points;
    var len = points.length;

    for (var i = 0; i < len; i++) {
        points[i].x += x;
        points[i].y += y;
    }

    this._recalc();

    return this;
};

/**
 * @return {Polygon} This for chaining.
 */
Polygon.prototype._recalc = function () {
    // Calculated points - this is what is used for underlying collisions and takes into account
    // the angle/offset set on the polygon.
    var calcPoints = this.calcPoints;
    // The edges here are the direction of the `n`th edge of the polygon, relative to
    // the `n`th point. If you want to draw a given edge from the edge value, you must
    // first translate to the position of the starting point.
    var edges = this.edges;
    // The normals here are the direction of the normal for the `n`th edge of the polygon, relative
    // to the position of the `n`th point. If you want to draw an edge normal, you must first
    // translate to the position of the starting point.
    var normals = this.normals;
    // Copy the original points array and apply the offset/angle
    var points = this.points;
    var offset = this.offset;
    var angle = this.angle;
    var len = points.length;
    var i;

    for (i = 0; i < len; i++) {
        var calcPoint = calcPoints[i].copy(points[i]);

        calcPoint.x += offset.x;
        calcPoint.y += offset.y;

        if (angle !== 0) {
            calcPoint.rotate(angle);
        }
    }
    // Calculate the edges/normals
    for (i = 0; i < len; i++) {
        var p1 = calcPoints[i];
        var p2 = i < len - 1 ? calcPoints[i + 1] : calcPoints[0];

        var e = edges[i]
            .copy(p2)
            .sub(p1);

        normals[i]
            .copy(e)
            .perp()
            .normalize();
    }

    return this;
};

/**
 * @return {Polygon} The AABB
 */
Polygon.prototype.getAABB = function () {
    var points = this.calcPoints;
    var len = points.length;
    var xMin = points[0].x;
    var yMin = points[0].y;
    var xMax = points[0].x;
    var yMax = points[0].y;

    for (var i = 1; i < len; i++) {
        var point = points[i];

        if (point.x < xMin) {
            xMin = point.x;
        }
        else if (point.x > xMax) {
            xMax = point.x;
        }

        if (point.y < yMin) {
            yMin = point.y;
        }
        else if (point.y > yMax) {
            yMax = point.y;
        }
    }

    return new Box(this.pos.clone()
        .add(new Vector(xMin, yMin)), xMax - xMin, yMax - yMin).toPolygon();
};

/**
 * @param {Vector=} pos A vector representing the bottom-left of the box (i.e. the smallest x and smallest y value).
 * @param {?number=} w The width of the box.
 * @param {?number=} h The height of the box.
 * @constructor
 */
function Box(pos, w, h) {
    this.pos = pos || new Vector();
    this.w = w || 0;
    this.h = h || 0;
}

/**
 * @return {Polygon} A new Polygon that represents this box.
 */
Box.prototype.toPolygon = function () {
    var pos = this.pos;
    var w = this.w;
    var h = this.h;

    return new Polygon(new Vector(pos.x, pos.y), [
        new Vector(),
        new Vector(w, 0),
        new Vector(w, h),
        new Vector(0, h),
    ]);
};

/**
 * @constructor
 */
function Response() {
    this.a = null;
    this.b = null;
    this.overlapN = new Vector();
    this.overlapV = new Vector();
    this.clear();
}

/**
 * @return {Response} This for chaining
 */
Response.prototype.clear = function () {
    this.aInB = true;
    this.bInA = true;
    this.overlap = Number.MAX_VALUE;

    return this;
};

/**
 * @type {Array.<Vector>}
 */
var T_VECTORS = [];

for (var i = 0; i < 10; i++) {
    T_VECTORS.push(new Vector());
}

/**
 * @type {Array.<Array.<number>>}
 */
var T_ARRAYS = [];

for (var i = 0; i < 5; i++) {
    T_ARRAYS.push([]);
}

/**
 * @type {Response}
 */
var T_RESPONSE = new Response();

/**
 * @type {Polygon}
 */
var TEST_POINT = new Box(new Vector(), 0.000001, 0.000001).toPolygon();

// ## Helper Functions

/**
 * @param {Array.<Vector>} points The points to flatten.
 * @param {Vector} normal The unit vector axis to flatten on.
 * @param {Array.<number>} result An array.  After calling this function,
 *   result[0] will be the minimum value,
 *   result[1] will be the maximum value.
 */
function flattenPointsOn(points, normal, result) {
    var min = Number.MAX_VALUE;
    var max = -Number.MAX_VALUE;
    var len = points.length;
    for (var i = 0; i < len; i++) {
        // The magnitude of the projection of the point onto the normal
        var dot = points[i].dot(normal);
        if (dot < min) {
            min = dot;
        }
        if (dot > max) {
            max = dot;
        }
    }
    result[0] = min;
    result[1] = max;
}

// Check whether two convex polygons are separated by the specified
// axis (must be a unit vector).
/**
 * @param {Vector} aPos The position of the first polygon.
 * @param {Vector} bPos The position of the second polygon.
 * @param {Array.<Vector>} aPoints The points in the first polygon.
 * @param {Array.<Vector>} bPoints The points in the second polygon.
 * @param {Vector} axis The axis (unit sized) to test against.  The points of both polygons
 *   will be projected onto this axis.
 * @param {Response=} response A Response object (optional) which will be populated
 *   if the axis is not a separating axis.
 * @return {boolean} true if it is a separating axis, false otherwise.  If false,
 *   and a response is passed in, information about how much overlap and
 *   the direction of the overlap will be populated.
 */
function isSeparatingAxis(aPos, bPos, aPoints, bPoints, axis, response) {
    var rangeA = T_ARRAYS.pop();
    var rangeB = T_ARRAYS.pop();
    // The magnitude of the offset between the two polygons
    var offsetV = T_VECTORS.pop()
        .copy(bPos)
        .sub(aPos);
    var projectedOffset = offsetV.dot(axis);
    // Project the polygons onto the axis.
    flattenPointsOn(aPoints, axis, rangeA);
    flattenPointsOn(bPoints, axis, rangeB);
    // Move B's range to its position relative to A.
    rangeB[0] += projectedOffset;
    rangeB[1] += projectedOffset;
    // Check if there is a gap. If there is, this is a separating axis and we can stop
    if (rangeA[0] > rangeB[1] || rangeB[0] > rangeA[1]) {
        T_VECTORS.push(offsetV);
        T_ARRAYS.push(rangeA);
        T_ARRAYS.push(rangeB);

        return true;
    }
    // This is not a separating axis. If we're calculating a response, calculate the overlap.
    if (response) {
        var overlap = 0;
        // A starts further left than B
        if (rangeA[0] < rangeB[0]) {
            response.aInB = false;
            // A ends before B does. We have to pull A out of B
            if (rangeA[1] < rangeB[1]) {
                overlap = rangeA[1] - rangeB[0];
                response.bInA = false;
                // B is fully inside A.  Pick the shortest way out.
            } else {
                var option1 = rangeA[1] - rangeB[0];
                var option2 = rangeB[1] - rangeA[0];
                overlap = option1 < option2 ? option1 : -option2;
            }
            // B starts further left than A
        } else {
            response.bInA = false;
            // B ends before A ends. We have to push A out of B
            if (rangeA[1] > rangeB[1]) {
                overlap = rangeA[0] - rangeB[1];
                response.aInB = false;
                // A is fully inside B.  Pick the shortest way out.
            } else {
                var option1 = rangeA[1] - rangeB[0];
                var option2 = rangeB[1] - rangeA[0];
                overlap = option1 < option2 ? option1 : -option2;
            }
        }

        // If this is the smallest amount of overlap we've seen so far, set it as the minimum overlap.
        var absOverlap = Math.abs(overlap);

        if (absOverlap < response.overlap) {
            response.overlap = absOverlap;
            response.overlapN.copy(axis);
            if (overlap < 0) {
                response.overlapN.reverse();
            }
        }
    }

    T_VECTORS.push(offsetV);
    T_ARRAYS.push(rangeA);
    T_ARRAYS.push(rangeB);

    return false;
}

// Calculates which Voronoi region a point is on a line segment.
// It is assumed that both the line and the point are relative to `(0,0)`
//
//            |       (0)      |
//     (-1)  [S]--------------[E]  (1)
//            |       (0)      |
/**
 * @param {Vector} line The line segment.
 * @param {Vector} point The point.
 * @return  {number} LEFT_VORONOI_REGION (-1) if it is the left region,
 *          MIDDLE_VORONOI_REGION (0) if it is the middle region,
 *          RIGHT_VORONOI_REGION (1) if it is the right region.
 */
function voronoiRegion(line, point) {
    var len2 = line.len2();
    var dp = point.dot(line);
    // If the point is beyond the start of the line, it is in the
    // left voronoi region.
    if (dp < 0) {
        return LEFT_VORONOI_REGION;
    }
    // If the point is beyond the end of the line, it is in the
    // right voronoi region.
    else if (dp > len2) {
        return RIGHT_VORONOI_REGION;
    }
    // Otherwise, it's in the middle one.
    else {
        return MIDDLE_VORONOI_REGION;
    }
}

// Constants for Voronoi regions
/**
 * @const
 */
var LEFT_VORONOI_REGION = -1;

/**
 * @const
 */
var MIDDLE_VORONOI_REGION = 0;

/**
 * @const
 */
var RIGHT_VORONOI_REGION = 1;

// ## Collision Tests

// Check if a point is inside a circle.
/**
 * @param {Vector} p The point to test.
 * @param {Circle} c The circle to test.
 * @return {boolean} true if the point is inside the circle, false if it is not.
 */
function pointInCircle(p, c) {
    var differenceV = T_VECTORS
        .pop()
        .copy(p)
        .sub(c.pos);

    var radiusSq = c.r * c.r;
    var distanceSq = differenceV.len2();

    T_VECTORS.push(differenceV);
    // If the distance between is smaller than the radius then the point is inside the circle.
    return distanceSq <= radiusSq;
}

// Check if a point is inside a convex polygon.
/**
 * @param {Vector} p The point to test.
 * @param {Polygon} poly The polygon to test.
 * @return {boolean} true if the point is inside the polygon, false if it is not.
 */
function pointInPolygon(p, poly) {
    TEST_POINT.pos.copy(p);
    T_RESPONSE.clear();

    var result = testPolygonPolygon(TEST_POINT, poly, T_RESPONSE);

    if (result) {
        result = T_RESPONSE.aInB;
    }

    return result;
}

// Check if two circles collide.
/**
 * @param {Circle} a The first circle.
 * @param {Circle} b The second circle.
 * @param {Response=} response Response object (optional) that will be populated if
 *   the circles intersect.
 * @return {boolean} true if the circles intersect, false if they don't.
 */
function testCircleCircle(a, b, response) {
    // Check if the distance between the centers of the two
    // circles is greater than their combined radius.
    var differenceV = T_VECTORS
        .pop()
        .copy(b.pos)
        .sub(a.pos);

    var totalRadius = a.r + b.r;
    var totalRadiusSq = totalRadius * totalRadius;
    var distanceSq = differenceV.len2();
    // If the distance is bigger than the combined radius, they don't intersect.
    if (distanceSq > totalRadiusSq) {
        T_VECTORS.push(differenceV);

        return false;
    }
    // They intersect.  If we're calculating a response, calculate the overlap.
    if (response) {
        var dist = Math.sqrt(distanceSq);
        response.a = a;
        response.b = b;
        response.overlap = totalRadius - dist;
        response.overlapN.copy(differenceV.normalize());
        response.overlapV.copy(differenceV)
            .scale(response.overlap);
        response.aInB = a.r <= b.r && dist <= b.r - a.r;
        response.bInA = b.r <= a.r && dist <= a.r - b.r;
    }

    T_VECTORS.push(differenceV);

    return true;
}

// Check if a polygon and a circle collide.
/**
 * @param {Polygon} polygon The polygon.
 * @param {Circle} circle The circle.
 * @param {Response=} response Response object (optional) that will be populated if
 *   they interset.
 * @return {boolean} true if they intersect, false if they don't.
 */
function testPolygonCircle(polygon, circle, response) {
    // Get the position of the circle relative to the polygon.
    var circlePos = T_VECTORS
        .pop()
        .copy(circle.pos)
        .sub(polygon.pos);
    var radius = circle.r;
    var radius2 = radius * radius;
    var points = polygon.calcPoints;
    var len = points.length;
    var edge = T_VECTORS.pop();
    var point = T_VECTORS.pop();

    // For each edge in the polygon:
    for (var i = 0; i < len; i++) {
        var next = i === len - 1 ? 0 : i + 1;
        var prev = i === 0 ? len - 1 : i - 1;
        var overlap = 0;
        var overlapN = null;

        // Get the edge.
        edge.copy(polygon.edges[i]);
        // Calculate the center of the circle relative to the starting point of the edge.
        point.copy(circlePos)
            .sub(points[i]);

        // If the distance between the center of the circle and the point
        // is bigger than the radius, the polygon is definitely not fully in
        // the circle.
        if (response && point.len2() > radius2) {
            response.aInB = false;
        }

        // Calculate which Voronoi region the center of the circle is in.
        var region = voronoiRegion(edge, point);
        // If it's the left region:
        if (region === LEFT_VORONOI_REGION) {
            // We need to make sure we're in the RIGHT_VORONOI_REGION of the previous edge.
            edge.copy(polygon.edges[prev]);
            // Calculate the center of the circle relative the starting point of the previous edge
            var point2 = T_VECTORS
                .pop()
                .copy(circlePos)
                .sub(points[prev]);
            region = voronoiRegion(edge, point2);
            if (region === RIGHT_VORONOI_REGION) {
                // It's in the region we want.  Check if the circle intersects the point.
                var dist = point.len();
                if (dist > radius) {
                    // No intersection
                    T_VECTORS.push(circlePos);
                    T_VECTORS.push(edge);
                    T_VECTORS.push(point);
                    T_VECTORS.push(point2);
                    return false;
                } else if (response) {
                    // It intersects, calculate the overlap.
                    response.bInA = false;
                    overlapN = point.normalize();
                    overlap = radius - dist;
                }
            }
            T_VECTORS.push(point2);
            // If it's the right region:
        } else if (region === RIGHT_VORONOI_REGION) {
            // We need to make sure we're in the left region on the next edge
            edge.copy(polygon.edges[next]);
            // Calculate the center of the circle relative to the starting point of the next edge.
            point.copy(circlePos)
                .sub(points[next]);
            region = voronoiRegion(edge, point);
            if (region === LEFT_VORONOI_REGION) {
                // It's in the region we want.  Check if the circle intersects the point.
                var dist = point.len();
                if (dist > radius) {
                    // No intersection
                    T_VECTORS.push(circlePos);
                    T_VECTORS.push(edge);
                    T_VECTORS.push(point);
                    return false;
                } else if (response) {
                    // It intersects, calculate the overlap.
                    response.bInA = false;
                    overlapN = point.normalize();
                    overlap = radius - dist;
                }
            }
            // Otherwise, it's the middle region:
        } else {
            // Need to check if the circle is intersecting the edge,
            // Change the edge into its "edge normal".
            var normal = edge
                .perp()
                .normalize();
            // Find the perpendicular distance between the center of the
            // circle and the edge.
            var dist = point.dot(normal);
            var distAbs = Math.abs(dist);
            // If the circle is on the outside of the edge, there is no intersection.
            if (dist > 0 && distAbs > radius) {
                // No intersection
                T_VECTORS.push(circlePos);
                T_VECTORS.push(normal);
                T_VECTORS.push(point);
                return false;
            } else if (response) {
                // It intersects, calculate the overlap.
                overlapN = normal;
                overlap = radius - dist;
                // If the center of the circle is on the outside of the edge, or part of the
                // circle is on the outside, the circle is not fully inside the polygon.
                if (dist >= 0 || overlap < 2 * radius) {
                    response.bInA = false;
                }
            }
        }

        // If this is the smallest overlap we've seen, keep it.
        // (overlapN may be null if the circle was in the wrong Voronoi region).
        if (overlapN && response && Math.abs(overlap) < Math.abs(response.overlap)) {
            response.overlap = overlap;
            response.overlapN.copy(overlapN);
        }
    }

    // Calculate the final overlap vector - based on the smallest overlap.
    if (response) {
        response.a = polygon;
        response.b = circle;
        response.overlapV
            .copy(response.overlapN)
            .scale(response.overlap);
    }

    T_VECTORS.push(circlePos);
    T_VECTORS.push(edge);
    T_VECTORS.push(point);

    return true;
}

/**
 * @param {Polygon} a The first polygon.
 * @param {Polygon} b The second polygon.
 * @param {Response=} response Response object (optional) that will be populated if
 *   they interset.
 * @return {boolean} true if they intersect, false if they don't.
 */
function testPolygonPolygon(a, b, response) {
    var aPoints = a.calcPoints;
    var aLen = aPoints.length;
    var bPoints = b.calcPoints;
    var bLen = bPoints.length;

    // If any of the edge normals of A is a separating axis, no intersection.
    for (var i = 0; i < aLen; i++) {
        if (isSeparatingAxis(a.pos, b.pos, aPoints, bPoints, a.normals[i], response)) {
            return false;
        }
    }

    // If any of the edge normals of B is a separating axis, no intersection.
    for (var i = 0; i < bLen; i++) {
        if (isSeparatingAxis(a.pos, b.pos, aPoints, bPoints, b.normals[i], response)) {
            return false;
        }
    }

    // Since none of the edge normals of A or B are a separating axis, there is an intersection
    // and we've already calculated the smallest overlap (in isSeparatingAxis).  Calculate the
    // final overlap vector.
    if (response) {
        response.a = a;
        response.b = b;
        response.overlapV.copy(response.overlapN)
            .scale(response.overlap);
    }

    return true;
}

export {
    Vector,
    Circle,
    Polygon,
    Box,
    Response,
    isSeparatingAxis,
    pointInCircle,
    pointInPolygon,
    testCircleCircle,
    testPolygonCircle,
    testPolygonPolygon,
};
