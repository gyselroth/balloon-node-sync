var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

function SyncEvents() {
  if (!(this instanceof SyncEvents)) return new SyncEvents();

  EventEmitter.call(this);
}

inherits(SyncEvents, EventEmitter);

SyncEvents.prototype.destroy = function() {
  delete syncEvents;
}

function define(name, value) {
  Object.defineProperty(module.exports, name, {
    value: value,
    enumerable: true
  });
}

define('STOP', 'stop');

var syncEvent;

module.exports = function() {
  if(!syncEvent) {
    syncEvent = new SyncEvents();
  }
  
  return syncEvent;
};
