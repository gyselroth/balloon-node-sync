const inherits = require('util').inherits;
const EventEmitter = require('events').EventEmitter;

const blnApi = require('../bln-api.js');
const config = require('../config.js');
const lastCursor = require('../last-cursor.js');
const logger = require('../logger.js');

const STATE_INITIAL = 0;
const STATE_STARTED = 1;
const STATE_STOPED = 2;

function RemoteWatcherFactory() {
  if (!(this instanceof RemoteWatcherFactory)) return new RemoteWatcherFactory();

  this.state = STATE_INITIAL;

  EventEmitter.call(this);
}

inherits(RemoteWatcherFactory, EventEmitter);

module.exports = function() {
  return new RemoteWatcherFactory();
};


RemoteWatcherFactory.prototype.start = function() {
  this.state = STATE_STARTED;

  if(this.pollIntervall) {
    clearInterval(this.pollIntervall);
    this.pollIntervall = undefined;
  }

  this.pollIntervall = setInterval(() => {
    blnApi.nodeDelta({limit: 1, cursor: lastCursor.read()}, (err, data) => {
      if(err) {
        logger.error('Recievieng node delta had error', {category: 'sync.watcher.remote', err});
        this.emit('error', err);
        return;
      }

      if(this.state !== STATE_STARTED) {
        logger.debug('Not processing delta as watcher is paused or stoped', {category: 'sync.watcher.remote', state: this.state, data});
        return;
      }

      logger.debug('Got remote delta', {category: 'sync.watcher.remote', data});

      if(data.nodes && data.nodes.length > 0) {
        //TODO pixtron - respect ignoreNodes
        this.emit('changes', data.nodes);
      }
    });
  }, 5 * 1000);

  this.emit('started');
}

RemoteWatcherFactory.prototype.stop = function() {
  this.state = STATE_STOPED;

  if(this.pollIntervall) {
    clearInterval(this.pollIntervall);
    this.pollIntervall = undefined;
  }

  this.emit('stoped');
}
