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

var syncEvent;

module.exports = function() {
  if(!syncEvent) {
    syncEvent = new SyncEvents();

    syncEvent.STOP = 'stop';
    syncEvent.TRANSFER_QUEUE_EVENT = 'transfer_queue_event';
    syncEvent.TRANSFER_QUEUE_PROGRESS = 'transfer_queue_progress';
  }

  return syncEvent;
};
