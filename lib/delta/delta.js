var async = require('async');

var blnApi = require('../bln-api.js');
var fsWrap = require('../fs-wrap.js');
var logger = require('../logger.js');
var localDelta = require('./local-delta.js');
var remoteDelta = require('./remote-delta.js');
var syncDb = require('../sync-db.js');
var utility = require('../utility.js');

function applyGroupedDelta(groupedDelta, callback) {
  var createdCandidates = [];

  async.eachSeries(groupedDelta, (node, cb) => {

    if(node.actions.create && utility.isExcludeFile(utility.getNameFromPath(node.actions.create.path))) {
      //do not process files which match exclude pattern.
      return cb(null);
    }

    syncDb.findByRemoteId(node.id, (err, oldLocalNode) => {
      if(err) return cbDeltaActions(err);

      if(node.actions.create && node.actions.delete) delete node.actions.delete;

      if(!oldLocalNode) {
        //node localy not found by remote id -> process later to avoid conflicts
        //nodes which don't have a create action can be ignored (deleted nodes not present localy)
        if(node.actions.create) createdCandidates.push(node);
        cb(null);
      } else {
        applyDeltaActions(node, oldLocalNode, (err, syncedNode) => {
          applyDeltaActionsCb(err, syncedNode, cb);
        });
      }
    });
  }, (err, results) => {
    if(err) return callback(err);
    async.eachSeries(createdCandidates, (node, cb) => {
      applyDeltaActions(node, undefined, (err, syncedNode) => {
        applyDeltaActionsCb(err, syncedNode, cb);
      });
    }, callback);
  });
}

function updateNode(node, cb) {
  syncDb.update(node._id, node, (err, result) => {
    if(err) return cb(err);

    cb(null, node);
  });
}

function applyDeltaActions(node, oldLocalNode, cb) {
  var newParentPath;
  var actions = node.actions;
  var id = node.id;

  if(actions.create) newParentPath = utility.getParentFromPath(actions.create.path);

  if(oldLocalNode && actions.create) {

    var name = utility.getNameFromPath(actions.create.path);

    oldLocalNode.remoteActions = {};

    if(oldLocalNode.remoteParent !== actions.create.parent) {
      oldLocalNode.remoteActions.move = {
        remoteId: id,
        remoteParent: actions.create.parent,
        parent: newParentPath,
        actionInitialized: new Date()
      };
    }

    if(
      (utility.namesAreEqual(name, oldLocalNode.name) === false)
      &&
      (
        (!oldLocalNode.localActions || ! oldLocalNode.localActions.rename)
        ||
        (utility.namesAreEqual(name, oldLocalNode.localActions.rename.oldName) === false)
      )
    ) {
      //if name is not equal to old node name,
      //and the local node has not been renamed
      //or the old local name is not equal to the current remote name
      //node has to be renamed localy

      oldLocalNode.remoteActions.rename = {
        remoteId: id,
        remoteName: name,
        parent: newParentPath,
        actionInitialized: new Date()
      };
    }

    if(node.directory === false && (oldLocalNode.hash !== node.hash || oldLocalNode.version+'' !== node.version+'')) {
      oldLocalNode.remoteActions.create = {
        hash: node.hash,
        version: node.version,
        remoteId: id,
        remoteParent: actions.create.parent,
        parent: newParentPath,
        size: node.size,
        actionInitialized: new Date()
      };
    }


    if(node.directory && oldLocalNode.downloadOriginal) {
      oldLocalNode.remoteActions.create = {
        remoteId: id,
        remoteParent: actions.create.parent,
        parent: newParentPath,
        size: node.size,
        actionInitialized: new Date()
      };

      delete oldLocalNode.downloadOriginal;
    }

    updateNode(oldLocalNode, cb);

  } else if(oldLocalNode && actions.delete) {
    oldLocalNode.remoteActions = {delete: {actionInitialized: new Date()}};

    updateNode(oldLocalNode, cb);
  } else if(!oldLocalNode && actions.create) {

    syncDb.findByPath(actions.create.path, (err, localNode) => {
      if(err) return cb(err);

      if(
        localNode
          &&
        (!localNode.remoteActions || localNode.remoteActions.delete)
          &&
        (!localNode.localActions || !localNode.localActions.delete))
      {
        localNode.remoteActions = {create: {
          hash: node.hash,
          version: node.version,
          remoteId: id,
          remoteParent: actions.create.parent,
          size: node.size,
          parent: newParentPath,
          actionInitialized: new Date()
        }};

        if(node.directory && (!localNode.localActions || !localNode.localActions.create)) {
          localNode.remoteActions.delete = true;
        } else if(localNode.remoteActions.delete) {
          delete localNode.remoteActions.delete;
        }

        updateNode(localNode, cb);
      } else {
        syncDb.findByRemoteId(actions.create.parent, (err, syncedNode) => {
          if(syncedNode) {
            var parent = utility.joinPath(syncedNode.parent, syncedNode.name);
          } else {
            var parent = utility.getParentFromPath(actions.create.path)
          }

          var newNode = {
            name: utility.getNameFromPath(actions.create.path),
            parent: parent,
            directory: node.directory,
            remoteParent: actions.create.parent,
            remoteActions: {create: {
              hash: node.hash,
              version: node.version,
              remoteId: id,
              remoteParent: actions.create.parent,
              parent: newParentPath,
              size: node.size,
              actionInitialized: new Date()
            }}
          }

          syncDb.create(newNode, cb);
        });
      }
    });
  } else {
    //no local entry and neither delete, rename, move or create: ignore
    cb(null);
  }
}

function applyDeltaActionsCb(err, syncedNode, callback) {
  if(err) return callback(err);
  if(!syncedNode) return callback(null);

  async.series([
    (cb) => {
      if(syncedNode.directory === true) {
        resolveDirectoryConflicts(syncedNode, cb);
      } else {
        resolveFileConflicts(syncedNode, cb);
      }
    },
    (cb) => {
      findLocalConflict(syncedNode, cb);
    }
  ], (err, res) => {
    if(err) return callback(err);

    callback(null);
  });
}

function resolveDirectoryConflicts(node, callback) {
  var rActions = node.remoteActions;
  var lActions = node.localActions;

  if(rActions && lActions) {
    if(rActions.create && lActions.create) {
      //on both sides created, we just need to add remoteId and remoteParent
      node.remoteId = rActions.create.remoteId;
      node.remoteParent = rActions.create.remoteParent;

      delete node.remoteActions;
      delete node.localActions;
    }

    //both sides renamed, remote wins
    if(rActions.rename && lActions.rename) delete lActions.rename;

    //both sides moved, remote wins
    if(rActions.move && lActions.move) delete lActions.move;

    if(rActions.create && lActions.delete) delete lActions.delete;

    if(rActions.delete && lActions.create) delete rActions.delete;

    return syncDb.update(node._id, node, (err, updatedNode) => {
      return callback(null);
    });
  }

  return callback(null);
}

function resolveFileConflicts(node, callback) {
  var rActions = node.remoteActions;
  var lActions = node.localActions;

  if(!rActions || !lActions) {
    //only one side changed, no conflicts
    return callback(null);
  }

  if(rActions.create && lActions.create) {
    //on both sides created or updated
    var currentLocalPath = utility.joinPath(node.parent, node.name);
    var localHash = fsWrap.md5FileSync(currentLocalPath);
    var stat = fsWrap.lstatSync(currentLocalPath);

    if(rActions.create.hash && rActions.create.hash === localHash && rActions.create.size === stat.size) {
      delete node.remoteActions;
      delete node.localActions;

      node.hash = localHash;
      node.version = rActions.create.version;
      node.size = stat.size;
      node.mtime = stat.mtime;
      node.ctime = stat.ctime;

      node.remoteId = rActions.create.remoteId;
      node.remoteParent = rActions.create.remoteParent;

      return syncDb.update(node._id, node, callback);
    } else if(!rActions.delete) {

      //if remote path changed upload local version as new version on old path
      var remoteNode;
      return async.series([
        (cb) => {
          //create remote localy
          var name = rActions.rename ? rActions.rename.remoteName : node.name;
          var parent = rActions.move ? rActions.move.parent : node.parent;
          var remoteParent = rActions.move ? rActions.move.remoteParent : rActions.create.remoteParent;

          var newNode = {
            name: name,
            parent: parent,
            directory: node.directory,
            remoteId: node.remoteId,
            remoteParent: remoteParent,
            remoteActions: {create: rActions.create}
          }

          syncDb.create(newNode, (err, createdNode) => {
            remoteNode = createdNode;
            cb(err);
          });
        },
        (cb) => {
          delete node.remoteActions;
          delete node.remoteParent;
          delete node.remoteId;
          delete node.hash;
          delete node.version;

          syncDb.update(node._id, node, cb);
        },
        (cb) => {
          applyDeltaActionsCb(null, remoteNode, cb);
        }
      ], callback);
    }
  }

  if(rActions.delete && lActions.delete) {
    //on both sides deleted
    return syncDb.delete(node._id, (err) => {
      return callback(null);
    });
  }

  return callback(null);
}

function findLocalConflict(node, callback) {
  var rActions = node.remoteActions;

  if(rActions && (rActions.create || rActions.rename || rActions.move)) {
    var name = rActions.rename ? rActions.rename.remoteName : node.name;
    var parent = rActions.move ? rActions.move.parent : node.parent;

    //check if target localy exists (for example an other node moved or renamed to the target path)
    var targetPath = utility.joinPath(parent, name);

    if(fsWrap.existsSync(targetPath)) {
      var targetStat = fsWrap.lstatSync(targetPath);

      //if the target has the same ino as the processed one no further actions needed
      if(targetStat.ino === node.ino) return callback(null);

      return syncDb.findByIno(targetStat.ino, (err, syncedNode) => {
        if(err) {
          logger.error('DELTA: database error:', {err});
          throw (err);
        }

        if(!syncedNode) {
          logger.error('DELTA: node not found in database even if it should exists:', {targetPath, targetStat});
          throw (new Error('Target node \' ' + targetPath + ' \' with ino \'' + targetStat.ino + '\' not found in db'));
        }

        if(syncedNode.remoteActions && (syncedNode.remoteActions.rename || syncedNode.remoteActions.move || syncedNode.remoteActions.delete)) {
          return callback(null);
        }

        if(node.directory === true) {
          mergeDirectories(node, syncedNode, callback);
        } else {
          renameConflictFile(parent, targetPath, name, node, syncedNode, callback);
        }
      });
    }
  }

  callback(null);
}

function mergeDirectories(srcNode, destNode, callback) {
  var oldPath = utility.joinPath(srcNode.parent, srcNode.name);
  var newPath = utility.joinPath(destNode.parent, destNode.name);

  var srcRemoteId = srcNode.remoteId;
  var destRemoteId = destNode.remoteId;

  var destLocalActions = destNode.localActions;
  var destParentName = destNode.name;
  var destParentParent = destNode.parent;
  var oldDestParent;

  if(destLocalActions.rename) {
    destParentName = destLocalActions.rename.oldName;
  }

  if(destLocalActions.move) {
    destParentParent = destLocalActions.move.oldParent;
  }

  oldDestParent = utility.joinPath(destParentParent, destParentName);

  async.parallel([
    (cb) => {
      //set new remoteParent for destChildren
      syncDb.processChildren(destNode._id, (childNode, processCb) => {

        if(destRemoteId) {
          childNode.localActions = childNode.localActions || {};
          childNode.localActions.move = {oldParent: oldDestParent, actionInitialized: new Date()};
          childNode.parent = newPath;
        }

        childNode.remoteParent = srcRemoteId;
        syncDb.update(childNode._id, childNode, processCb);
      }, cb);
    },
    (cb) => {
      //move children of node to syncedNode localy
      syncDb.processChildren(srcNode._id, (childNode, processCb) => {
        //if childNode was moved localy no need to move it remotely
        if(childNode.localActions && childNode.localActions.move) return processCb(null);

        var srcPath = utility.joinPath(oldPath, childNode.name);
        var destPath = utility.joinPath(newPath, childNode.name);

        async.series([
          (cb) => {
            //avoid conflicts with already present nodes in destNode
            if(fsWrap.existsSync(destPath)) {
              syncDb.findByPath(destPath, (err, conflictingNode) => {
                if(err) {
                  throw(err);
                  return;
                }

                if(!conflictingNode) {
                  logger.error('DELTA: node not found in database even if it should exists:', {destPath});
                  throw (new Error('Dest node \' ' + destPath + ' \' not found in db'));
                  return;
                }

                if(conflictingNode.remoteActions && (conflictingNode.remoteActions.rename || conflictingNode.remoteActions.move || conflictingNode.remoteActions.delete)) {
                  return callback(null);
                }

                renameConflictFile(newPath, destPath, childNode.name, childNode, conflictingNode, cb);
              });
            } else {
              cb(null);
            }
          },
          (cb) => {
            var destPath = utility.joinPath(newPath, childNode.name);
            fsWrap.renameSync(srcPath, destPath);

            childNode.parent = newPath;
            childNode.localParent = destNode._id;

            syncDb.update(childNode._id, childNode, cb);
          }
        ], processCb);
      }, cb);
    },
    (cb) => {
      var newNode;
      srcNode.remoteId = destRemoteId;

      if(srcNode.remoteActions && srcNode.remoteActions.create) {
        //created remotely, no remote actions to execute localy as it will be deleted remotely anyway and is not yet present localy
        delete srcNode.remoteActions
      } else {
        //switch remoteId of srcNode delete it localy
        srcNode.remoteActions = {delete: {actionInitialized: new Date()}};
      }

      if(destNode.localActions && destNode.localActions.create) {
        //localy created no actions to execute remotely
        delete srcNode.localActions;
      } else {
        //destNode was not localy created, needs to be deleted remotely
        newNode = {
          name: destParentName,
          parent: destParentParent,
          directory: true,
          remoteId: srcNode.remoteId,
          remoteParent: srcNode.remoteParent,
          localParent: srcNode.localParent,
          localActions: {delete: {actionInitialized: new Date()}}
        };
      }

      async.parallel([
        (dbCb) => {
          if(newNode) {
            syncDb.create(newNode, dbCb);
            return;
          }
          dbCb(null);
        },
        (dbCb) => {
          syncDb.update(srcNode._id, srcNode, dbCb);
        }
      ], cb);
    },
    (cb) => {
      destNode.remoteId = srcRemoteId;
      delete destNode.localActions;
      syncDb.update(destNode._id, destNode, cb);
    }
  ], (err, results) => {
    callback(err);
  });
}

function renameConflictFile(newPath, targetPath, name, node, conflictingNode, callback) {
  var newLocalName = utility.renameConflictFile(newPath, name);

  try {
    fsWrap.renameSync(targetPath, utility.joinPath(newPath, newLocalName));
  } catch(err) {
    return renameRemoteNode(node, name, callback);
  }

  conflictingNode.name = newLocalName;

  conflictingNode.localActions = conflictingNode.localActions || {};

  if(!conflictingNode.localActions.create) {
    //if the node was just localy created and not localy renamed, no need to rename it
    conflictingNode.localActions.rename = {immediate: false, actionInitialized: new Date(), oldName: name};
  }

  return syncDb.update(conflictingNode._id, conflictingNode, callback);
}

function renameRemoteNode(node, name, callback) {
  var rActions = node.remoteActions || {};

  var newLocalName = utility.renameConflictFileRemote(name);
  var oldLocalName = node.name;

  var newLocalPath = utility.joinPath(node.parent, newLocalName);
  var oldLocalPath = utility.joinPath(node.parent, oldLocalName);

  if(!rActions.create && fsWrap.existsSync(oldLocalPath)) {
    try {
      fsWrap.renameSync(oldLocalPath, newLocalPath);
    } catch(err) {
      throw(err);
      return;
    }
  }

  node.name = newLocalName;
  node.localActions = node.localActions || {};

  var remoteId = node.remoteId || node.remoteActions.create.remoteId;

  return blnApi.renameNode({remoteId, name: node.name}, (err) => {
    if(err) {
      throw(err);
      return;
    }

    if(rActions.rename) {
      delete node.remoteActions.rename;
    }

    syncDb.update(node._id, node, callback);
  });
}


var delta = {
  getDelta: function(dirPath, lastCursor, callback) {
    async.parallel([
      (cb) => {
        localDelta.getDelta(dirPath, cb);
      },
      (cb) => {
        remoteDelta.getDelta(lastCursor, cb);
      }
    ], (err, results) => {
      if(err) return callback(err);

      var currentRemoteCursor = results[1];

      applyGroupedDelta(remoteDelta.getGroupedDelta(), (err) => {
        if(err) return callback(err);

        callback(null, currentRemoteCursor);
      });
    });
  }
}

module.exports = delta;
