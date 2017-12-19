/**
 * @public
 * @constant
 * @type {Function}
 * @param {Event} event
 */
const stopEvent = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
};

/**
 * @namespace Exo
 */
export {
    stopEvent,
};
