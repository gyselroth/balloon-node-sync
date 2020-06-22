var async = require('async');

var fsWrap = require('../fs-wrap.js');
var syncDb = require('../sync-db.js');
var utility = require('../utility.js');
var logger = require('../logger.js');
var ignoreDb = require('../ignore-db.js');
var BlnDeltaError = require('../../errors/bln-delta.js');

/**
 * Creates a node in the database
 *
 * @param {string} name - name of the node
 * @param {string} parent - parent path of the node
 * @param {Object} stat - fs.lstat result for the node
 * @param {string} parentNodeId - local parent id
 * @param {Function} callback - callback function
 * @returns {void} - no return value
 */
function createNode(name, parent, stat, parentNodeId, callback) {
  if(utility.hasInvalidChars(name)) {
    logger.info('Ignoring file \'' + name + '\' because filename contains invalid chars');
    return callback(undefined);
  }

  var newNode = {
    directory: stat.isDirectory(),
    name: name,
    parent: parent,
    localActions: {create: {immediate: false, actionInitialized: new Date()}},
    localParent: parentNodeId,
    ino: stat.ino
  }

  syncDb.create(newNode, (err, createdNode) => {
    callback(createdNode._id, undefined);
  });
}

/**
 * Sets the local action to delete for a given node
 *
 * @param {Object} node - node from database
 * @param {Function} callback - callback function
 * @returns {void} - no return value
 */
function deleteNode(node, immediate, callback) {
  node.localActions = {delete: {
    remoteId: node.remoteId,
    actionInitialized: new Date(),
    immediate
  }};

  syncDb.update(node._id, node, callback);
}

var localDelta = {
  /**
   * Scans the given directory for new, changed and deleted nodes.
   * Sets the necessary localActions in the database.
   *
   * @param {string} dirPath - root directory to get delta for
   * @param {Function} callback - callback function
   * @returns {void} - no return value
   */
  getDelta: function(dirPath, callback) {
    logger.info('getDelta start', {category: 'sync-local-delta'});

    async.series([
      (cb) => {
        logger.debug('findDeletedNodes start', {category: 'sync-local-delta'});

        this.findDeletedNodes(cb)
      },
      (cb) => {
        logger.debug('findChanges start', {category: 'sync-local-delta'});

        this.findChanges(dirPath, undefined, null, cb);
      },
      (cb) => {
        logger.debug('resolveConflicts start', {category: 'sync-local-delta'});

        this.resolveConflicts(cb);
      }
    ], (err, resuls) => {
      logger.info('getDelta end', {category: 'sync-local-delta'});

      return callback(null);
    });
  },

  /**
   * Recursively scans the given directory for new and changed nodes.
   * Sets the necessary localActions in the database.
   * Paths found in ignoreDb are ignored
   *
   * @param {string} dirPath - root directory to get delta for
   * @param {string|undefined} oldDirPath - path of this directory after the last sync. undefined for root node
   * @param {string|null} parentNodeId - the id of the parent node. null for root node
   * @param {Function} callback - callback function
   * @returns {void} - no return value
   */
  findChanges: function(dirPath, oldDirPath, parentNodeId, callback) {
    fsWrap.readdir(dirPath, (err, nodes) => {
      //if it is not possible to read dir abort sync
      if(err) {
        logger.warning('Error while reading dir', {category: 'sync-local-delta', dirPath, err});
        throw new BlnDeltaError(err.message);
      }

      async.eachSeries(nodes, (node, cb) => {
        var nodePath = utility.joinPath(dirPath, node);

        try {
          var stat = fsWrap.lstatSync(nodePath);
        } catch(e) {
          logger.warning('findChanges got lstat error on node', {category: 'sync-local-delta', nodePath, code: e.code});
          throw new BlnDeltaError(e.message);
        }

        if(utility.isExcludeFile(node)) {
          logger.info('LOCAL DELTA: ignoring file \'' + nodePath + '\' matching exclude pattern');
          return cb(null);
        }

        if(utility.hasInvalidChars(node)) {
          logger.info('LOCAL DELTA: ignoring file \'' + node + '\' because filename contains invalid chars');
          return cb(undefined);
        }

        if(stat.isSymbolicLink()) {
          logger.info('LOCAL DELTA: ignoring symlink \'' + nodePath + '\'');
          return cb(null);
        }

        syncDb.findByIno(stat.ino, (err, syncedNode) => {
          if(stat.isDirectory()) {
            let query = {path: nodePath};

            if(syncedNode && syncedNode.remoteId) {
              query.remoteId = syncedNode.remoteId;
            }

            ignoreDb.isIgnoredNode(query, (err, isIgnored) => {
              if(err) return cb(err);

              if(isIgnored) {
                logger.info('ignoring directory \'' + nodePath + '\' because it is ignored by ignoredNodes', {category: 'sync-local-delta'});

                return cb(null);
              }

              this.analyzeNodeForChanges(node, dirPath, oldDirPath, parentNodeId, stat, syncedNode, cb);
            });
          } else {
            this.analyzeNodeForChanges(node, dirPath, oldDirPath, parentNodeId, stat, syncedNode, cb);
          }
        });
      }, callback);
    });
  },

  /**
   * Analyzes a node for changes (rename, move, content changed)
   *
   * @param {Object} name - name of the current node
   * @param {string} dirPath - parent directory of curent node
   * @param {string|undefined} oldDirPath - parent path of this node after the last sync. undefined for root node
   * @param {string|null} parentNodeId - the id of the parent node. null for root node
   * @param {Object} stat - fs.lstst for curent node
   * @param {Function} callback - callback function
   * @returns {void} - no return value
   */
  analyzeNodeForChanges: function(name, dirPath, oldDirPath, parentNodeId, stat, syncedNode, callback) {
    var nodePath = utility.joinPath(dirPath, name);
    var done = (id, oldNodePath) => {
      if(stat.isDirectory() === true) {
        process.nextTick(() => {
          this.findChanges(nodePath, oldNodePath, id, callback);
        });
      } else {
        return callback(null);
      }
    }

    if(!syncedNode) {
      //not found by ino -> created
      return createNode(name, dirPath, stat, parentNodeId, done);
    } else if(syncedNode.localActions && syncedNode.localActions.delete) {
      syncDb.findByPath(nodePath, (err, syncedNodeByPath) => {
        this.detectNodeChanges(name, dirPath, oldDirPath, stat, syncedNode, nodePath, (err, syncedNode, oldNodePath) => {
          if(err) return callback(err);

          if(syncedNodeByPath && syncedNode.ino !== syncedNodeByPath.ino) {
            delete syncedNode.localActions.delete;
            syncedNodeByPath.localActions = syncedNodeByPath.localActions || {delete: {remoteId: node.remoteId, actionInitialized: new Date()}};
            syncedNodeByPath.localActions.delete.immediate = true;

            async.parallel([
              (cbUpdate) => {
                syncDb.update(syncedNodeByPath._id, syncedNodeByPath, cbUpdate);
              },
              (cbUpdate) => {
                syncDb.update(syncedNode._id, syncedNode, cbUpdate);
              }
            ], (err) => {
              done(syncedNode._id, oldNodePath);
            });
          } else {
            delete syncedNode.localActions.delete;
            syncDb.update(syncedNode._id, syncedNode, (err) => {
              done(syncedNode._id, oldNodePath);
            });
          }
        });
      });
    } else {
      this.detectNodeChanges(name, dirPath, oldDirPath, stat, syncedNode, nodePath, (err, syncedNode, oldNodePath) => {
        if(err) return callback(err);

        done(syncedNode._id, oldNodePath);
      });
    }
  },

  /**
   * Detects changes for a certain nod (rename, move, content changed)
   * Sets the necessary localActions in the database.
   *
   * @param {Object} name - name of the current node
   * @param {string} dirPath - parent directory of curent node
   * @param {string|undefined} oldDirPath - parent path of this node after the last sync. undefined for root node
   * @param {Object} stat - fs.lstst for curent node
   * @param {Object} syncedNode - current db representation of node
   * @param {Function} callback - callback function
   * @returns {void} - no return value
   */
  detectNodeChanges: function(name, dirPath, oldDirPath, stat, syncedNode, nodePath, callback) {
    var contentChanged = fsWrap.nodeContentChanged(stat, syncedNode, nodePath);
    var oldNodePath = utility.joinPath(syncedNode.parent, syncedNode.name);

    syncedNode.localActions = syncedNode.localActions || {};

    if(utility.namesAreEqual(syncedNode.name, name) === false) {
      //node has been renamed
      syncedNode.localActions.rename = {oldName: syncedNode.name, actionInitialized: new Date()};
      syncedNode.name = name;
    }

    if(syncedNode.parent !== dirPath && syncedNode.parent !== oldDirPath) {
      //node has been moved
      syncedNode.localActions.move = {oldParent: syncedNode.parent, actionInitialized: new Date()};
      syncedNode.parent = dirPath;
    }

    if(contentChanged) {
      syncedNode.localActions.create = {immediate: false, actionInitialized: new Date()};
    }

    if(Object.keys(syncedNode.localActions).length === 0) {
      delete syncedNode.localActions;
    } else if(Object.keys(syncedNode.localActions).length > 1 && syncedNode.localActions.delete) {
      delete syncedNode.localActions.delete;
    }

    syncDb.update(syncedNode._id, syncedNode, (err, affected) => {
      if(err) return callback(err);
      callback(null, syncedNode, oldNodePath);
    });
  },

  /**
   * Scans the database and checks for deleted nodes.
   * Sets the necessary localActions in the database.
   *
   * @param {Function} callback - callback function
   * @returns {void} - no return value
   */
  findDeletedNodes: function(callback) {
    //process first all directories and then all files.
    async.mapSeries(['getDirectories', 'getFiles'], (nodeSource, cbMap) => {
      syncDb[nodeSource]((err, nodes) => {
        async.eachSeries(nodes, (node, cb) => {

          // If a node has to be redownloaded do not delete it remotely
          // See: https://github.com/gyselroth/balloon-node-sync/issues/17
          if(node.downloadOriginal) return cb();

          var nodePath = utility.joinPath(node.parent, node.name);

          let ignoreQuery = {path: nodePath};

          if(node && node.remoteId) {
            ignoreQuery.remoteId = node.remoteId;
          }

          ignoreDb.isIgnoredNode(ignoreQuery, (err, isIgnored) => {
            if(err) return cb(err);

            if(isIgnored) {
              logger.info('findDeletedNodes ignoring directory \'' + nodePath + '\' because it is ignored by ignoredNodes', {category: 'sync-local-delta'});

              return syncDb.remove(node._id, cb);
            }

            process.nextTick(() => {
              var nodePath = utility.joinPath(node.parent, node.name);

              if(fsWrap.existsSync(nodePath) === false) {
                //Node doesn't exist localy -> delete it remotely
                deleteNode(node, false, cb);
              } else {
                try {
                  var stat = fsWrap.lstatSync(nodePath);
                } catch(e) {
                  logger.warning('findDeletedNodes got lstat error on node', {category: 'sync-local-delta', nodePath, code: e.code});
                  throw new BlnDeltaError(e.message);
                }

                if(stat.ino === node.ino) {
                  //node still exists at given path
                  return cb();
                } else {
                  deleteNode(node, true, cb);
                }
              }
            });
          });
        }, cbMap);
      });
    }, callback);
  },

  /**
   * Scans the database and checks for conflicts (eg. delete & recrate).
   * Sets the necessary localActions in the database and removes duplicate nodes.
   *
   * @param {Function} callback - callback function
   * @returns {void} - no return value
   */
  resolveConflicts: function(callback) {
    //process first all directories and then all files.
    async.mapSeries(['getDirectories', 'getFiles'], (nodeSource, cbMap) => {
      syncDb[nodeSource]((err, nodes) => {
        async.eachSeries(nodes, (node, cb) => {
          if(node.localActions && node.localActions.create) {
            var nodePath = utility.joinPath(node.parent, node.name);

            syncDb.findByPath(nodePath, (err, syncedNode) => {
              try {
                var stat = fsWrap.lstatSync(nodePath);
              } catch(e) {
                logger.warning('resolveConflicts got lstat error on node', {category: 'sync-local-delta', nodePath, code: e.code});
                throw new BlnDeltaError(e.message);
              }

              //deleted and recreated at same path
              if(syncedNode.localActions && syncedNode.localActions.delete) {
                syncedNode.ino = stat.ino;

                delete syncedNode.localActions.delete;

                if(syncedNode.directory) {
                  syncedNode.ctime = stat.ctime;
                  syncedNode.mtime = stat.mtime;
                  syncedNode.size = stat.size;
                } else {
                  syncedNode.localActions.create = node.localActions.create;
                }

                async.parallel([
                  (cbParallel) => {
                    syncDb.update(syncedNode._id, syncedNode, cbParallel);
                  },
                  (cbParallel) => {
                    syncDb.remove(node._id, cbParallel);
                  }
                ], cb);
              } else {
                cb(null);
              }
            });
          } else {
            cb(null);
          }
        }, cbMap);
      });
    }, callback);
  }
};

module.exports = localDelta;
