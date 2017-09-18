import Shape from './Shape';
import { SHAPE } from '../../const';

/**
 * @class Polygon
 * @extends {Shape}
 */
export default class Polygon extends Shape {

    /**
     * @constructor
     * @param {Vector[]} vectors=[]
     */
    constructor(vectors = []) {
        super();

        /**
         * @private
         * @member {Vector[]}
         */
        this._vectors = vectors;
    }

    /**
     * @override
     */
    get type() {
        return SHAPE.POLYGON;
    }

    /**
     * @public
     * @readonly
     * @member {Vector[]}
     */
    get vectors() {
        return this._vectors;
    }

    /**
     * @override
     */
    set(newVectors) {
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
        const array = this._array || (this._array = new Float32Array(this._vectors.length * 2)),
            vectors = this._vectors,
            len = vectors.length;

        for (let i = 0, j = 0; i < len; i++, j += 2) {
            array[j] = vectors[i].x;
            array[j + 1] = vectors[i].y;
        }

        return array;
    }

    /**
     * @override
     */
    contains(shape) {
        const vectors = this._vectors,
            length = vectors.length,
            x = shape.x,
            y = shape.y;

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
