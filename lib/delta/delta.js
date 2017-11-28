var async = require('async');

var blnApi = require('../bln-api.js');
var fsWrap = require('../fs-wrap.js');
var logger = require('../logger.js');
var localDelta = require('./local-delta.js');
var remoteDelta = require('./remote-delta.js');
var syncDb = require('../sync-db.js');
var utility = require('../utility.js');

/**
 * Applies grouped remote delta to database
 *
 * @see ./remote-delta.js groupDelta
 * @param {Object} groupedDelta - grouped remote delta
 * @param {Function} callback - callback function
 * @returns {void} - no return value
 */
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
          resolveConflicts(err, syncedNode, cb);
        });
      }
    });
  }, (err, results) => {
    if(err) return callback(err);
    async.eachSeries(createdCandidates, (node, cb) => {
      applyDeltaActions(node, undefined, (err, syncedNode) => {
        resolveConflicts(err, syncedNode, cb);
      });
    }, callback);
  });
}

/**
 * Updates a node in the database
 *
 * @param {Object} node - database node to update
 * @param {Function} callback - callback function
 * @returns {void} - no return value
 */
function updateNode(node, callback) {
  syncDb.update(node._id, node, (err, result) => {
    if(err) return callback(err);

    callback(null, node);
  });
}

/**
 * Applies the actions from a grouped node
 *
 * @see ./remote-delta.js groupDelta
 * @param {Object} node - single grouped node
 * @param {Object|undefined} oldLocalNode - corresponding node from database (if found)
 * @param {Function} callback - callback function
 * @returns {void} - no return value
 */
function applyDeltaActions(node, oldLocalNode, callback) {
  var newParentPath;
  var actions = node.actions;
  var id = node.id;

  if(actions.create) newParentPath = utility.getParentFromPath(actions.create.path);

  if(oldLocalNode && actions.create) {

    var name = utility.getNameFromPath(actions.create.path);

    oldLocalNode.remoteActions = {};

    if(oldLocalNode.remoteParent !== actions.create.parent) {
      //old remoteParent and current parent are different, node has been moved remotely
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
      //and (the node has not been renamed localy or the old local name is not equal to the current remote name)
      //node has been renamed remotely

      oldLocalNode.remoteActions.rename = {
        remoteId: id,
        remoteName: name,
        parent: newParentPath,
        actionInitialized: new Date()
      };
    }

    if(node.directory === false && (oldLocalNode.hash !== node.hash || oldLocalNode.version+'' !== node.version+'')) {
      //file content has changed remotely
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
      //collection has to be restored from remote
      oldLocalNode.remoteActions.create = {
        remoteId: id,
        remoteParent: actions.create.parent,
        parent: newParentPath,
        size: node.size,
        actionInitialized: new Date()
      };

      delete oldLocalNode.downloadOriginal;
    }

    updateNode(oldLocalNode, callback);

  } else if(oldLocalNode && actions.delete) {
    //node exists localy and has been deleted remotely
    oldLocalNode.remoteActions = {delete: {actionInitialized: new Date()}};

    updateNode(oldLocalNode, callback);
  } else if(!oldLocalNode && actions.create) {
    //node does not yet exist localy, it is a new node

    syncDb.findByPath(actions.create.path, (err, localNode) => {
      if(err) return callback(err);

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

        updateNode(localNode, callback);
      } else {
        syncDb.findByRemoteId(actions.create.parent, (err, syncedNode) => {
          if(syncedNode) {
            //if parent is found localy, get current local parent path,
            //as it might have changed localy (rename, move)
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

          syncDb.create(newNode, callback);
        });
      }
    });
  } else {
    //no local entry and neither delete, rename, move or create: ignore
    callback(null);
  }
}

/**
 * Resolves conflicts after remote delta actions have been applied
 *
 * @param {Object|null} err - error object
 * @param {Object} snycedNode - node with applied actions from database
 * @param {Function} callback - callback function
 * @returns {void} - no return value
 */
function resolveConflicts(err, syncedNode, callback) {
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

/**
 * Resolves conflicts for a directory node
 *
 * @param {Object} node - node with applied actions from database
 * @param {Function} callback - callback function
 * @returns {void} - no return value
 */
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

    //if remotely created and localy deleted node should be created localy
    if(rActions.create && lActions.delete) delete lActions.delete;

    //if localy created and remotely deleted node should be created remotely
    if(rActions.delete && lActions.create) delete rActions.delete;

    return syncDb.update(node._id, node, (err, updatedNode) => {
      return callback(null);
    });
  }

  return callback(null);
}

/**
 * Resolves conflicts for a file node
 *
 * @param {Object} node - node with applied actions from database
 * @param {Function} callback - callback function
 * @returns {void} - no return value
 */
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
          //as a new node has been created conflict resolution has to be executed for the new node
          resolveConflicts(null, remoteNode, cb);
        }
      ], callback);
    }
  }

  if(rActions.delete && lActions.delete) {
    //on both sides deleted, just remove it from db
    return syncDb.delete(node._id, (err) => {
      return callback(null);
    });
  }

  return callback(null);
}

/**
 * find and resolves local conflicts.
 * eg: node A has been moved remotely to same path as node B has been moved localy
 *
 * @param {Object} node - node with applied actions from database
 * @param {Function} callback - callback function
 * @returns {void} - no return value
 */
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

        if(
          node.directory === true
          &&
          syncedNode.remoteId
          && (
            !syncedNode.localActions || (!syncedNode.localActions.rename && !syncedNode.localActions.move)
          )
        ) {
          // syncedNode was already synced and was not localy moved or renamed. must have been remotely deleted.
          syncedNode.remoteActions = {delete: true};
          syncedNode.localActions = {};
          syncedNode.localActions.create = {immediate: false, actionInitialized: new Date()};
        }

        renameConflictNode(parent, targetPath, name, node, syncedNode, callback);
      });
    }
  }

  callback(null);
}

/**
 * renames a conflict file
 *
 * @param {string} newParent - new parent of the file
 * @param {Object} oldPath - old path of the file
 * @param {string} name - current name of the file
 * @param {Object} node - node A from database
 * @param {Object} conflictingNode - node B conflicting with node A from database
 * @param {Function} callback - callback function
 * @returns {void} - no return value
 */
function renameConflictNode(newParent, oldPath, name, node, conflictingNode, callback) {
  var newLocalName = utility.renameConflictNode(newParent, name);

  try {
    fsWrap.renameSync(oldPath, utility.joinPath(newParent, newLocalName));
  } catch(err) {
    return renameRemoteNode(node, name, callback);
  }

  conflictingNode.name = newLocalName;

  conflictingNode.localActions = conflictingNode.localActions || {};

  if(!conflictingNode.localActions.create && !conflictingNode.localActions.rename) {
    //rename the node if not localy created or localy renamed (always keep original local rename actions)
    conflictingNode.localActions.rename = {immediate: false, actionInitialized: new Date(), oldName: name};
  }

  return syncDb.update(conflictingNode._id, conflictingNode, callback);
}

/**
 * renames a conflicting node remotely
 *
 * @param {Object} node - node A from database
 * @param {string} name - current name of the file
 * @param {Function} callback - callback function
 * @returns {void} - no return value
 */
function renameRemoteNode(node, name, callback) {
  var rActions = node.remoteActions || {};

  var newLocalName = utility.renameConflictNodeRemote(name);
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

  /**
   * gets the remote and local delta and merges it
   *
   * @param {string} dirPath - path to the root directory
   * @param {string} lastCursor - last cursor or undefined if cursor has been reset
   * @param {Function} callback - callback function
   * @returns {void} - no return value
   */
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
