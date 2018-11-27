var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

function BlnApiProgress() {
  if (!(this instanceof BlnApiProgress)) return new BlnApiProgress();

  EventEmitter.call(this);
}

inherits(BlnApiProgress, EventEmitter);

module.exports = BlnApiProgress;
