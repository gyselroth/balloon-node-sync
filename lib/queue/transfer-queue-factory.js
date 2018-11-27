var async = require('async');
var uuid4 = require('uuid4');

var config = require('../config.js');
var blnApi = require('../bln-api.js');
var fsWrap = require('../fs-wrap.js');
var logger = require('../logger.js');
var queueErrorDb = require('./queue-error-db.js');
var syncDb = require('../sync-db.js');
var syncEvents = require('../sync-events.js')();
var utility = require('../utility.js');

var conflictHandlerFactory = require('./conflict-handler-factory.js');
var readonlyConflictHandlerFactory = require('./readonly-conflict-handler-factory.js');

module.exports = function(actionQueue) {
  var exposedQueue = {};

  var queue = async.queue(function(task, callback) {
    switch(task.action) {
      case 'download':
        transferHandler.downloadFile(task, callback);
      break;
      case 'upload':
        transferHandler.uploadFile(task, callback);
      break;
    }
  }, config.get('maxConcurentConnections') || 3);

  var conflictHandler = conflictHandlerFactory(actionQueue, exposedQueue);
  var readonlyConflictHandler = readonlyConflictHandlerFactory(actionQueue, exposedQueue);

  function emitStateEvent(task, subtype, info) {
    syncEvents.emit(syncEvents.TRANSFER_QUEUE_EVENT, {
      id: task.id,
      type: task.action,
      subtype: subtype,
      name: task.node.name,
      parent: task.node.parent,
      info: info,
    });
  }

  function emitProgressEvent(task, percent) {
    syncEvents.emit(syncEvents.TRANSFER_QUEUE_PROGRESS, {
      id: task.id,
      percent: percent
    });
  }

  var transferHandler = {
    downloadFile: function(task, done) {
      syncDb.findByLocalId(task.node._id, (err, node) => {
        if(err || node === undefined) {
          return queueErrorDb.insert({err, task, origin: 'remote'}, done);
        }

        var filePath = utility.joinPath(node.parent, node.name);

        emitStateEvent(task, 'started');
        var progress = blnApi.downloadFile(node.remoteActions.create.remoteId, node.remoteActions.create.version, node, (err) => {
          if(err) {
            switch(err.code) {
              case 'E_BLN_API_DOWNLOAD_ABORTED':
                logger.info('filedownload failed: aborted', {category: 'transfer-queue', message: err.message, code: err.code});
                emitStateEvent(task, 'aborted');
                return done(null);
              break;
              case 'E_BLN_API_REQUEST_UNAUTHORIZED':
                logger.info('filedownload failed: unauthorized', {category: 'transfer-queue', message: err.message, code: err.code});
                emitStateEvent(task, 'aborted');
                throw err;

                return done(null);
              break;
              default:
                logger.error('filedownload failed', {category: 'transfer-queue', message: err.message, code: err.code});
                emitStateEvent(task, 'error', err);
                return queueErrorDb.insert({err, task, origin: 'remote'}, done);
              break;
            }
          }

          var stat = fsWrap.lstatSync(filePath);
          emitStateEvent(task, 'finished');

          node.ino = stat.ino;
          node.ctime = stat.ctime;
          node.mtime = stat.mtime;
          node.size = stat.size;
          node.remoteId = node.remoteActions.create.remoteId;
          node.hash = node.remoteActions.create.hash;
          node.version = node.remoteActions.create.version;

          if(node.parent === '/') {
            node.remoteParent = '';
            node.localParent = null;

            syncDb.update(node._id, node, done);
          } else {
            syncDb.findByPath(node.parent, (err, parentNode) => {
              node.remoteParent = parentNode.remoteId;
              node.localParent = parentNode._id;

              syncDb.update(node._id, node, done);
            });
          }
        });

        progress.on('progress', (percent) => {
          emitProgressEvent(task, percent);
        });
      });
    },

    uploadFile: function(task, done) {
      syncDb.findByLocalId(task.node._id, (err, node) => {
        if(err) return done(err);

        emitStateEvent(task, 'started');
        var progress = blnApi.uploadFile(node, (err, result) => {
          if(err) {
            switch(err.code) {
              case 'E_BLN_API_UPLOAD_ABORTED':
              case 'E_BLN_API_UPLOAD_SRC_NOTEXISTS':
                logger.info('Fileupload failed: aborted', {category: 'transfer-queue', message: err.message, code: err.code});
                emitStateEvent(task, 'aborted');

                return done(null);
              break;
              case 'E_BLN_API_REQUEST_NODE_ALREADY_EXISTS':
                logger.info('Fileupload failed: already exists', {category: 'transfer-queue', message: err.message, code: err.code});
                emitStateEvent(task, 'aborted');

                return conflictHandler.renameConflictNode(node, (err) => {
                  if(err) throw(err);

                  return done(null);
                });
              break;
              case 'E_BLN_API_REQUEST_NODE_READ_ONLY':
              case 'E_BLN_API_REQUEST_READ_ONLY_SHARE':
                logger.info('Fileupload failed: readonly', {category: 'transfer-queue', message: err.message, code: err.code});
                emitStateEvent(task, 'aborted');
                return readonlyConflictHandler.handleUploadConflict(node, (err) => {
                  if(err) throw err;

                  return done(null);
                });
              break;
              case 'E_BLN_API_REQUEST_UNAUTHORIZED':
                logger.info('Fileupload failed: unauthorized', {category: 'transfer-queue', message: err.message, code: err.code});
                emitStateEvent(task, 'aborted');
                throw err;

                return done(null);
              break;
              default:
                logger.error('Fileupload failed', {category: 'transfer-queue', message: err.message, code: err.code});
                emitStateEvent(task, 'error', err);
                return queueErrorDb.insert({err, task, origin: 'local'}, done);
              break;
            }
          }

          emitStateEvent(task, 'finished');
          blnApi.getAttributes(node, ['hash', 'version', 'id'], (err, attributes) => {
            if(err) {
              switch(err.code) {
                case 'E_BLN_API_REQUEST_UNAUTHORIZED':
                  logger.info('getAttributes failed: unauthorized', {category: 'transfer-queue', message: err.message, code: err.code});
                  throw err;

                  return done(null);
                break;
                default:
                  logger.error('getAttributes failed: unauthorized', {category: 'transfer-queue', message: err.message, code: err.code});
                  return done(null);
                break;
              }

            }

            try {
              var stat = fsWrap.lstatSync(utility.joinPath(node.parent, node.name));

              node.ctime = stat.ctime;
              node.mtime = stat.mtime;
              node.size = stat.size;
            } catch (e) {
              logger.warning('Got lstat error after upload', {category: 'transfer-queue', message: e.message, code: e.code});
              //node has been renamed, moved or deleted --> will be handled in next sync
            }

            node.remoteId = attributes.id;
            node.version = attributes.version;
            node.hash = attributes.hash;

            if(node.parent === '/') {
              node.remoteParent = '';
              node.localParent = null;

              syncDb.update(node._id, node, done);
            } else {
              syncDb.findByPath(node.parent, (err, parentNode) => {
                node.remoteParent = parentNode.remoteId;
                node.localParent = parentNode._id;

                syncDb.update(node._id, node, done);
              });
            }
          });
        });

        progress.on('progress', (percent) => {
          emitProgressEvent(task, percent);
        });
      });
    }
  }

  function mightFinish() {
    if(exposedQueue.finished() && exposedQueue.stopedCallback) {
      exposedQueue.stopedCallback();
      delete exposedQueue.stopedCallback;
    }
  }

  exposedQueue.pause = queue.pause;

  exposedQueue.remove = queue.remove;

  exposedQueue.resume = queue.resume;

  exposedQueue.idle = queue.idle;

  exposedQueue.push = function(task) {
    task.id = uuid4();

    emitStateEvent(task, 'queued');

    if(!task.created) task.created = new Date();

    queue.push(task, () => {
      mightFinish();
    });
  }

  exposedQueue.finished = function() {
    return queue.running() === 0 && queue.idle();
  }

  exposedQueue.stop = function(callback) {
    this.stopedCallback = callback;
    queue.kill();

    mightFinish();
  }

  queue.drain = function() {
    if(exposedQueue.drain) exposedQueue.drain();
  }

  return exposedQueue;
}
