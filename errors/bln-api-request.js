/**
 * Custom errors thrown from bln-api-request
 *
 * @param {string} message - error message
 * @param {string} [code] - error code. Default: `E_BLN_API_REQUEST_UNDEFINED_ERROR`
 */
module.exports = function BlnApiRequestError(message, code) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.code = code || 'E_BLN_API_REQUEST_UNDEFINED_ERROR';
};

require('util').inherits(module.exports, Error);
