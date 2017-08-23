import Shape from './Shape';
import {SHAPE} from '../const';

/**
 * @class Polygon
 * @implements {Exo.Shape}
 * @memberof Exo
 */
export default class Polygon extends Shape {

    /**
     * @constructor
     * @param {...Exo.Vector} vectors
     */
    constructor(...vectors) {
        super();

        /**
         * @private
         * @member {Exo.Vector[]}
         */
        this._vectors = vectors;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get type() {
        return SHAPE.POLYGON;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Vector[]}
     */
    get vectors() {
        return this._vectors;
    }

    /**
     * @override
     */
    set(...newVectors) {
        const vectors = this._vectors,
            oldLen = vectors.length,
            newLen = newVectors.length;

        if (oldLen > newLen) {
            vectors.length = newLen;
        } else if (newLen > oldLen) {
            for (let i = oldLen; i < newLen; i++) {
                vectors.push(newVectors[i].clone());
            }
        }

        for (let i = 0; i < oldLen; i++) {
            vectors[i].copy(newVectors[i]);
        }
    }

    /**
     * @override
     */
    copy(polygon) {
        this.set(polygon.vectors);
    }

    /**
     * @override
     */
    clone() {
        return new Polygon(this._vectors.map((vector) => vector.clone()));
    }

    /**
     * @override
     */
    toArray() {
        const array = [];

        this._vectors.forEach((vector) => {
            array.push(vector.x);
            array.push(vector.y);
        });

        return array;
    }

    /**
     * @override
     */
    contains(x, y) {
        const vectors = this._vectors,
            length = vectors.length;

        let inside = false;

        for (let i = 0, j = length - 1; i < length; j = i++) {
            const a = vectors[i],
                b = vectors[j];

            if (((a.y > y) !== (b.y > y)) && (x < ((b.x - a.x) * ((y - a.y) / (b.y - a.y))) + a.x)) {
                inside = !inside;
            }
        }

        return inside;
    }
}
