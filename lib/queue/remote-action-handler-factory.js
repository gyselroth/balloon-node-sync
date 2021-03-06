var path = require('path');

var async = require('async');

var fsWrap = require('../fs-wrap.js');
var queueErrorDb = require('./queue-error-db.js');
var syncDb = require('../sync-db.js');
var utility = require('../utility.js');
var logger = require('../logger.js');

function handleError(err, task, callback) {
  const errorMessage = `${err.message} for '${utility.joinPath(task.node.parent, task.node.name)}'`;
  logger.error(errorMessage, {category: 'remote-action-handler', code: err.code});
  queueErrorDb.insert({err, task, origin: 'remote'}, callback);
}

function rename(node, newName, newParentNode, task, callback) {
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
            rename(node, newName, null, task, done);
          } else {
            syncDb.findByRemoteId(rActions.move.remoteParent, (err, dbNode) => {
              if(dbNode) {
                rename(node, newName, dbNode, task, done);
              } else {
                if(task.priority === 6 )  {
                  //parent does still not exist, log error
                  var errorMessage = `Trying to move node '${newName}' to an inexistent parent node`;
                  logger.error(errorMessage, {category: 'sync.queue.remoteActionHandler', node, newName});
                  return done();
                }

                //parent does not yet exist, reschedule after all directory create
                actionQueue.push('remote', task, 6);
                done();
              }
            });
          }
        } else {
          rename(node, newName, undefined, task, done);
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
