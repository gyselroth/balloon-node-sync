const inherits = require('util').inherits;
const EventEmitter = require('events').EventEmitter;

const async = require('async');

const config = require('./lib/config.js');
const logger = require('./lib/logger.js');
const LocalWatcherFactory = require('./lib/watcher/local-factory.js');
const RemoteWatcherFactory = require('./lib/watcher/remote-factory.js');

function SyncFactory($config, $logger) {
  logger.info('initializing watcher', {category: 'sync.watcher'});

  if (!(this instanceof SyncFactory)) return new SyncFactory();

  config.setAll($config);
  logger.setLogger($logger);

  //TODO pixtron - validate configuration

  this.paused = true;
  this.localChangesCached = false;

  this._initializeLocalWatcher();
  this._initializeRemoteWatcher();

  EventEmitter.call(this);
}

inherits(SyncFactory, EventEmitter);

module.exports = function($config, $logger) {
  return new SyncFactory($config, $logger);
};

SyncFactory.prototype.start = function() {
  this.localWatcher.once('started', () => {
    this.emit('started');
  });

  this.localWatcher.start();
}

SyncFactory.prototype.stop = function() {
  logger.info('stoping watcher', {category: 'sync.watcher', paused: this.paused});

  async.parallel([
    (cb) => {
      this.localWatcher.once('stoped', () => {
        this.localChangesCached = false;
        cb(null);
      });

      this.localWatcher.stop();
    },
    (cb) => {
      this.remoteWatcher.once('stoped', () => {
        cb(null);
      });

      this.remoteWatcher.stop();
    }
  ], () => {
    this.paused = false;

    this.emit('stoped');
  });

}

SyncFactory.prototype.pause = function() {
  logger.info('pausing watcher', {category: 'sync.watcher', paused: this.paused});
  this.paused = true;

  this.remoteWatcher.once('stoped', () => {
    this.emit('paused');
  });

  this.remoteWatcher.stop();
}

SyncFactory.prototype.resume = function() {
  logger.info('resuming watcher', {category: 'sync.watcher', paused: this.paused, localChangesCached: this.localChangesCached});

  this.paused = false;

  if(this.localChangesCached === true) {
    this.emit('resumed');
    this.emit('changed');
    this.localChangesCached = false;
  } else {
    this.remoteWatcher.once('started', () => {
      this.emit('resumed');
    });

    this.remoteWatcher.start();
  }
}

SyncFactory.prototype._initializeLocalWatcher = function() {
  if(!this.localWatcher) this.localWatcher = new LocalWatcherFactory();

  this.localWatcher.on('changes', (changes) => {
    logger.debug('local watcher emmited changes', {category: 'sync.watcher', changes, paused: this.paused});

    if(this.paused) {
      this.localChangesCached = true;
    } else {
      this.emit('changed', 'local');
      this.localChangesCached = false;
    }
  });

  this.localWatcher.on('error', (err) => {
    // TODO pixtron - handle errors
    throw err;
  });
}

SyncFactory.prototype._initializeRemoteWatcher = function() {
  if(!this.remoteWatcher) this.remoteWatcher = new RemoteWatcherFactory();

  this.remoteWatcher.on('changes', (changes) => {
    logger.debug('remote watcher emmited changes', {category: 'sync.watcher', changes, paused: this.paused})

    if(this.paused === false) {
      this.emit('changed', 'remote');
    }
  });

  this.remoteWatcher.on('error', (err) => {
    // TODO pixtron - handle errors
    throw err;
  });
}
