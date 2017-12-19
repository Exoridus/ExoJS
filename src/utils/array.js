/**
 * @public
 * @constant
 * @type {Function}
 * @param {Array} array
 * @param {Number} startIndex
 * @param {Number} amount
 */
const removeArrayItems = (array, startIndex, amount) => {
    if (startIndex >= array.length || amount <= 0) {
        return;
    }

    const length = array.length,
        removeCount = (startIndex + amount > length) ? (length - startIndex) : amount,
        newLen = (length - removeCount);

    for (let i = startIndex; i < newLen; i++) {
        array[i] = array[i + removeCount];
    }

    array.length = newLen;
};

/**
 * @namespace Exo
 */
export {
    removeArrayItems,
};
