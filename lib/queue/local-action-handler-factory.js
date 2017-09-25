var path = require('path');

var async = require('async');

var fsWrap = require('../fs-wrap.js');
var blnApi = require('../bln-api.js');
var queueErrorDb = require('./queue-error-db.js');
var syncDb = require('../sync-db.js');
var utility = require('../utility.js');
var logger = require('../logger.js');


var conflictHandlerFactory = require('./conflict-handler-factory.js');
var readonlyConflictHandlerFactory = require('./readonly-conflict-handler-factory.js');

module.exports = function(actionQueue, transferQueue) {
  var conflictHandler = conflictHandlerFactory(actionQueue, transferQueue);
  var readonlyConflictHandler = readonlyConflictHandlerFactory(actionQueue, transferQueue);

  function handleError(err, task, addToErrorQueue, callback) {
    logger.error('LOCALQUEUEHANDLER: ' + err.message, err.code);

    if(addToErrorQueue) {
      logger.info('LOCALQUEUEHANDLER: rescheduling task with error', task);

      return queueErrorDb.insert({err, task, origin: 'local'}, callback);
    } else {
      return callback();
    }
  }

  var localActionHandler = {
    create: function(task, done) {
      if(task.node.directory === true) {
        syncDb.findByLocalId(task.node._id, (err, node) => {
          blnApi.createCollection(node, (err, remoteId) => {
            if(err) {
              switch(err.code) {
                case 'E_BLN_API_REQUEST_NODE_READ_ONLY':
                case 'E_BLN_API_REQUEST_READ_ONLY_SHARE':
                  logger.warning('LOCALQUEUEHANDLER: ' + err.message, err.code);

                  readonlyConflictHandler.handleCollectionCreateConflict(node, (err) => {
                    if(err) throw err;

                    return done(null);
                  });
                break;
                case 'E_BLN_API_REQUEST_UNAUTHORIZED':
                  throw err;
                  handleError(err, task, false, done);
                break;
                default:
                  handleError(err, task, false, done);
                break;
              }
              return;
            }

            node.remoteId = remoteId;

            var stat = fsWrap.lstatSync(utility.joinPath(node.parent, node.name));

            node.ctime = stat.ctime;
            node.mtime = stat.mtime;
            node.size = stat.size;

            syncDb.update(node._id, node, done);
          });
        });
      } else {
        transferQueue.push({action: 'upload', node: task.node});
        process.nextTick(done);
      }
    },

    renamemove: function(task, done) {
      syncDb.findByLocalId(task.node._id, (err, node) => {
        var lActions = node.localActions;

        async.series([
          (cb) => {
            if(!lActions.rename) return cb(null);

            blnApi.renameNode(node, (err) => {
              if(err) return cb(err);

              delete lActions.rename;
              cb(null);
            });
          },
          (cb) => {
            if(!lActions.move) return cb(null);

            blnApi.moveNode(node, (err) => {
              if(err) return cb(err);

              delete lActions.move;
              cb(null);
            });
          }
        ], (err, result) => {
          if(err) {
            switch(err.code) {
              case 'E_BLN_API_REQUEST_DEST_NOT_FOUND':
                if(task.priority < 26) {
                  //parent does not yet exist, reschedule after all directory create actions
                  logger.info('LOCALQUEUEHANDLER: Destination path not found rescheduling task', task);
                  actionQueue.push('local', task, 26);
                  done(null);
                } else {
                  handleError(err, task, true, done);
                }
              break;
              case 'E_BLN_API_REQUEST_UNAUTHORIZED':
                throw err;
                handleError(err, task, false, done);
              break;
              case 'E_BLN_API_REQUEST_NODE_ALREADY_EXISTS':
                logger.warning('LOCALQUEUEHANDLER: ' + err.message, err.code);

                conflictHandler.renameConflictNode(node, (err) => {
                  if(err) throw(err);

                  return done(null);
                });
              break;
              case 'E_BLN_API_REQUEST_READ_ONLY_SHARE':
                logger.warning('LOCALQUEUEHANDLER: ' + err.message, err.code);

                readonlyConflictHandler.handleRenamemoveConflict(node, (err) => {
                  if(err) throw err;

                  return done(null);
                });
              break;
              default:
                handleError(err, task, true, done);
              break;
            }

            return;
          }

          var nodePath = utility.joinPath(node.parent, node.name);
          if(fsWrap.existsSync(nodePath)) {
            var stat = fsWrap.lstatSync(nodePath);

            node.ctime = stat.ctime;
            node.mtime = stat.mtime;
          }

          syncDb.update(node._id, node, done);
        });
      });
    },

    remove: function(task, done) {
      var node = task.node;

      if(node.remoteId) {
        return blnApi.deleteNode(node, (err) => {
          if(err) {
            switch(err.code) {
              case 'E_BLN_API_REQUEST_NODE_READ_ONLY':
              case 'E_BLN_API_REQUEST_READ_ONLY_SHARE':
                logger.warning('LOCALQUEUEHANDLER: ' + err.message, err.code);

                readonlyConflictHandler.handleDeleteConflict(node, (err) => {
                  if(err) throw err;

                  return done(null);
                });
              break;
              case 'E_BLN_API_REQUEST_UNAUTHORIZED':
                throw err;
                handleError(err, task, false, done);
              break;
              default:
                handleError(err, task, false, done);
              break;
            }
            return;
          }

          syncDb.delete(node._id, done);
        });
      }

      return done();
    }
  }

  return localActionHandler;
}
