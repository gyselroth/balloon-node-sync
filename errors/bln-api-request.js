module.exports = function BlnApiRequestError(message, code) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.code = code || 'E_BLN_API_REQUEST_UNDEFINED_ERROR';
};

require('util').inherits(module.exports, Error);
