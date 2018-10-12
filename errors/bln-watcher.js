/**
 * Custom errors for watcher
 *
 * @param {string} message - error message
 * @param {string} [code] - error code. Default: `E_BLN_WATCHER_ERROR`
 */
module.exports = function BlnWatcherError(message, code) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.code = code || 'E_BLN_WATCHER_ERROR';
};

require('util').inherits(module.exports, Error);
