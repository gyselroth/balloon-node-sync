var fs = require('fs');
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

var logger = require('./logger.js');
var utility = require('./utility.js');


function UploadWatcher(file) {
  if (!(this instanceof UploadWatcher)) return new UploadWatcher();

  this.file = utility.getNodeFsPath(file);
  this.watcher = null;

  EventEmitter.call(this);
}

inherits(UploadWatcher, EventEmitter);

UploadWatcher.prototype.start = function() {
  this.watcher = fs.watch(this.file, this._watchListener.bind(this));
  //use this watchFile to get regular change events when large files are being written
  fs.watchFile(this.file, this._watchFilelistener.bind(this));
  this.emit('started');
}

UploadWatcher.prototype.stop = function() {
  if(this.watcher) this.watcher.close();
  fs.unwatchFile(this.file, this._watchFilelistener);
  this.emit('stoped');
}

UploadWatcher.prototype._watchListener = function(eventType, file) {
  this.emit('changed');
  this.stop();
}

UploadWatcher.prototype._watchFilelistener = function(current, previous) {
  if(
    current.ino === 0 //file has been deleted
    ||
    (
      current.mtimeMs !== previous.mtimeMs
      ||
      current.size !== previous.size
      ||
      current.ino !== previous.ino
    ) // file has been changed
  ) {
    logger.debug('File changed during upload', {
      category: 'upload-watcher',
      file: this.file,
      current: {
        mtimeMs: current.mtimeMs,
        size: current.size,
        ino: current.ino,
      },
      previous: {
        mtimeMs: previous.mtimeMs,
        size: previous.size,
        ino: previous.ino,
      }
    });

    this.emit('changed');
    this.stop();
  }
}

module.exports = UploadWatcher;
