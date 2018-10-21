/**
 * Custom errors thrown while generating delta
 *
 * @param {string} message - error message
 * @param {string} [code] - error code. Default: `E_BLN_DELTA_FAILED`
 */
module.exports = function BlnDeltaError(message, code) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.code = code || 'E_BLN_DELTA_FAILED';
};

require('util').inherits(module.exports, Error);
