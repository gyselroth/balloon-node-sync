const inherits = require('util').inherits;
const EventEmitter = require('events').EventEmitter;

const async = require('async');
const nsfw = require('nsfw');

const config = require('../config.js');
const fsWrap = require('../fs-wrap.js');
const ignoreDb = require('../ignore-db.js');
const logger = require('../logger.js');
const utility = require('../utility.js');

var BlnWatcherError = require('../../errors/bln-watcher.js');

const STATE_INITIAL = 0;
const STATE_STARTING = 1;
const STATE_STARTED = 2;
const STATE_STOPING = 3;
const STATE_STOPREQUESTED = 4;

function LocalWatcherFactory() {
  if (!(this instanceof LocalWatcherFactory)) return new LocalWatcherFactory();


  this.state = STATE_INITIAL;

  EventEmitter.call(this);
}

inherits(LocalWatcherFactory, EventEmitter);

module.exports = function() {
  return new LocalWatcherFactory();
};


LocalWatcherFactory.prototype.start = function() {
  this.nfswWatcher;

  this.state = STATE_STARTING;

  nsfw(config.get('balloonDir'), (changes) => {
    async.filter(changes, (change, callback) => {
      const fileName = change.action === 3 ? change.newFile : change.file;
      const directory = utility.getPathFromFsPath(change.directory);
      const nodePath = utility.joinPath(directory, fileName);

      if(nodePath === config.get('balloonDir')) {
        logger.debug('ignoring change because it is ballonDir itself which changed', {category: 'sync.watcher.local', change});
        return callback(null, false);
      }

      if(utility.isExcludeFile(fileName)) {
        logger.debug('ignoring change because filename matching exclude pattern', {category: 'sync.watcher.local', change});
        return callback(null, false);
      }

      if(utility.hasInvalidChars(fileName)) {
        logger.debug('ignoring change because filename has invalid chars', {category: 'sync.watcher.local', change});
        return callback(null, false);
      }

      if(change.action !== 1) {
        // do not try to get stat on deleted nodes
        try {
          var stat = fsWrap.lstatSync(nodePath);
        } catch(e) {
          logger.error('got lstat error on node', {category: 'sync.watcher.local', nodePath, change, code: e.code});
          return callback(null, true);
        }

        if(stat.isSymbolicLink()) {
          logger.debug('ignoring change because node is a symbolic link', {category: 'sync.watcher.local', change});
          return callback(null, false);
        }
      }

      ignoreDb.isIgnoredNode({path: nodePath}, (err, isIgnored) => {
        if(isIgnored) {
          logger.debug('ignoring change because file is at ignored path', {category: 'sync.watcher.local', nodePath, change});

          return callback(null, false);
        }

        return callback(null, true);
      });
    }, (err, changes) => {
      if(changes.length > 0) this.emit('changes', changes);
    });
  },
  {
    debounceMS: 1000,
    errorCallback: (error) => {
      var err;

      switch(error) {
        case 'Service shutdown unexpectedly':
          err = new BlnWatcherError('Local watcher shutdown unexpectedly', 'E_BLN_LOCAL_WATCHER_SHUTDOWN');
        break;
        default:
          err = new BlnWatcherError('Unexpected error in local watcher', 'E_BLN_LOCAL_WATCHER_UNEXPECTED');
      }

      this.emit('error', err);
    }
  })
  .then((watcher) => {
    logger.debug('nfswWatcher created, starting to watch fs', {category: 'sync.watcher.local'});

    this.nfswWatcher = watcher;
    return watcher.start();
  })
  .then(() => {
    logger.debug('nfswWatcher started', {category: 'sync.watcher.local', state: this.state});

    if(this.state === STATE_STOPREQUESTED) {
      this._stop();
    } else {
      this.state = STATE_STARTED;
      this.emit('started');
    }
  });
}

LocalWatcherFactory.prototype.stop = function() {
  logger.debug('local watcher stop requested', {category: 'sync.watcher.local', state: this.state});

  switch(this.state) {
    case STATE_STARTING:
      this.state = STATE_STOPREQUESTED;
    break;
    case STATE_INITIAL:
      this.emit('stoped');
    break;
    case STATE_STOPING:
    case STATE_STOPREQUESTED:
      //Nothing to do here. stop will be emited later on anyway
    break;
    default:
      this._stop();
    break;
  }
}

LocalWatcherFactory.prototype._stop = function() {
  this.state = STATE_STOPING;

  logger.debug('nfswWatcher stop requested', {category: 'sync.watcher.local'});

  this.nfswWatcher.stop().then(() => {
    logger.debug('nfswWatcher stopped', {category: 'sync.watcher.local'});

    this.state = STATE_INITIAL;
    this.emit('stoped');
  });
}
