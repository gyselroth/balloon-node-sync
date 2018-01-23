var async = require('async');

var config = require('../config.js');
var blnApi = require('../bln-api.js');
var fsWrap = require('../fs-wrap.js');
var logger = require('../logger.js');
var queueErrorDb = require('./queue-error-db.js');
var syncDb = require('../sync-db.js');
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

  var transferHandler = {
    downloadFile: function(task, done) {
      syncDb.findByLocalId(task.node._id, (err, node) => {
        var filePath = utility.joinPath(node.parent, node.name);

        blnApi.downloadFile(node.remoteActions.create.remoteId, node.remoteActions.create.version, node, (err) => {
          if(err) {
            switch(err.code) {
              case 'E_BLN_API_DOWNLOAD_ABORTED':
                logger.info('TRANSFERQUEUE: ' + err.message, err.code);
                return done(null);
              break;
              case 'E_BLN_API_REQUEST_UNAUTHORIZED':
                logger.info('TRANSFERQUEUE: ' + err.message, err.code);
                throw err;

                return done(null);
              break;
              default:
                logger.error('TRANSFERQUEUE: Task had error, rescheduling it for retry', {task, err});
                return queueErrorDb.insert({err, task, origin: 'remote'}, done);
              break;
            }
          }

          var stat = fsWrap.lstatSync(filePath);

          node.ino = stat.ino;
          node.ctime = stat.ctime;
          node.mtime = stat.mtime;
          node.size = stat.size;
          node.remoteId = node.remoteActions.create.remoteId;
          node.hash = node.remoteActions.create.hash;
          node.version = node.remoteActions.create.version;

          syncDb.update(node._id, node, done);
        });
      });
    },

    uploadFile: function(task, done) {
      syncDb.findByLocalId(task.node._id, (err, node) => {
        if(err) return done(err);

        blnApi.uploadFile(node, (err, result) => {
          if(err) {
            switch(err.code) {
              case 'E_BLN_API_UPLOAD_ABORTED':
              case 'E_BLN_API_UPLOAD_SRC_NOTEXISTS':
                logger.info('TRANSFERQUEUE: ' + err.message, err.code);
                return done(null);
              break;
              case 'E_BLN_API_REQUEST_NODE_ALREADY_EXISTS':
                logger.warning('TRANSFERQUEUE: ' + err.message, err.code);

                return conflictHandler.renameConflictNode(node, (err) => {
                  if(err) throw(err);

                  return done(null);
                });
              break;
              case 'E_BLN_API_REQUEST_NODE_READ_ONLY':
              case 'E_BLN_API_REQUEST_READ_ONLY_SHARE':
                logger.info('TRANSFERQUEUE: ' + err.message, err.code);
                return readonlyConflictHandler.handleUploadConflict(node, (err) => {
                  if(err) throw err;

                  return done(null);
                });
              break;
              case 'E_BLN_API_REQUEST_UNAUTHORIZED':
                logger.info('TRANSFERQUEUE: ' + err.message, err.code);
                throw err;

                return done(null);
              break;
              default:
                logger.error('TRANSFERQUEUE: ' + err.message, err.code);
                return queueErrorDb.insert({err, task, origin: 'local'}, done);
              break;
            }
          }

          blnApi.getAttributes(node, ['hash', 'version', 'id'], (err, attributes) => {
            if(err) {
              switch(err.code) {
                case 'E_BLN_API_REQUEST_UNAUTHORIZED':
                  logger.info('TRANSFERQUEUE: ' + err.message, err.code);
                  throw err;

                  return done(null);
                break;
                default:
                  logger.error('TRANSFERQUEUE: ' + err.message, err.code);
                  return done(null);
                break;
              }

            }

            node.remoteId = attributes.id;
            node.version = attributes.version;
            node.hash = attributes.hash;

            var stat = fsWrap.lstatSync(utility.joinPath(node.parent, node.name));

            node.ctime = stat.ctime;
            node.mtime = stat.mtime;
            node.size = stat.size;

            syncDb.update(node._id, node, done);
          });
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
