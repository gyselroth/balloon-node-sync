/**
 * Custom errors thrown for invalid configuration
 *
 * @param {string} message - error message
 * @param {string} [code] - error code. Default: `E_BLN_CONFIG_ERROR`
 */
module.exports = function BlnConfigError(message, code) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.code = code || 'E_BLN_CONFIG_ERROR';
};

require('util').inherits(module.exports, Error);
