var path = require('path');

var async = require('async');

var fsWrap = require('../fs-wrap.js');
var queueErrorDb = require('./queue-error-db.js');
var syncDb = require('../sync-db.js');
var utility = require('../utility.js');
var logger = require('../logger.js');

function handleError(err, task, callback) {
  logger.error('REMOTEQUEUEHANDLER: Task had error, rescheduling it for retry', {task, err});
  queueErrorDb.insert({err, task, origin: 'remote'}, callback);
}

function rename(node, newName, newParentNode, callback) {
  var oldPath = utility.joinPath(node.parent, node.name);

  node.name = newName;

  if(newParentNode !== undefined) {
    if(newParentNode === null) {
      //special case root
      node.remoteParent = '';
      node.localParent = null;
      node.parent = '/';
    } else {
      node.remoteParent = newParentNode.remoteId;
      node.localParent = newParentNode._id;
      node.parent = utility.joinPath(newParentNode.parent, newParentNode.name);
    }
  }

  var newPath = utility.joinPath(node.parent, node.name);

  try {
    fsWrap.renameSync(oldPath, newPath);
  } catch(err) {
    return handleError(err, task, callback);
  }

  var stat = fsWrap.lstatSync(newPath);

  node.mtime = stat.mtime;

  syncDb.update(node._id, node, callback);
}

module.exports = function(actionQueue, transferQueue) {
  var remoteActionHandler = {
    create: function(task, done) {
      if(task.node.directory === true) {
        syncDb.findByLocalId(task.node._id, (err, node) => {
          if(err) return done(err);

          var dirPath = utility.joinPath(node.parent, node.name);

          fsWrap.mkdir(dirPath, (err) => {
            //if err.code === 'EEXIST' the directory can be merged
            if(err && err.code !== 'EEXIST') {
              return handleError(err, task, done);
            }

            var stat = fsWrap.lstatSync(dirPath);

            node.remoteId = node.remoteActions.create.remoteId;
            node.ino = stat.ino;
            node.ctime = stat.ctime;
            node.mtime = stat.mtime;
            node.size = stat.size;

            syncDb.update(node._id, node, done);
          });
        });
      } else {
        transferQueue.push({action: 'download', node: task.node});
        process.nextTick(done);
      }
    },

    renamemove: function(task, done) {
      syncDb.findByLocalId(task.node._id, (err, node) => {
        if(err) return done(err);

        var rActions = node.remoteActions;

        var newName = node.name;

        if(rActions.rename) {
          newName = rActions.rename.remoteName;
        }

        if(rActions.move) {
          if(rActions.move.remoteParent === '') {
            //special case move to root directory
            rename(node, newName, null, done);
          } else {
            syncDb.findByRemoteId(rActions.move.remoteParent, (err, dbNode) => {
              if(dbNode) {
                rename(node, newName, dbNode, done);
              } else {
                //parent does not yet exist, reschedule after all directory create
                actionQueue.push('remote', task, 6);
                done();
              }
            });
          }
        } else {
          rename(node, newName, undefined, done);
        }
      });
    },

    remove: function(task, done) {
      syncDb.findByLocalId(task.node._id, (err, node) => {
        if(err) return done(err);

        var rActions = node.remoteActions;

        var filename = utility.joinPath(node.parent, node.name);

        try {
          if(node.directory === true) {
            fsWrap.rmdirRecursiveSync(filename);
          } else {
            fsWrap.unlinkSync(filename);
          }
        } catch(err) {
          return handleError(err, task, done);
        }

        syncDb.delete(node._id, done);
      });
    }
  }

  return remoteActionHandler;
}
