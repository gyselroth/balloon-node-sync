var fs = require('fs');

var async = require('async');

var config = require('./config.js');

var blnApi = require('./bln-api.js');
var fsWrap = require('./fs-wrap.js');
var ignoreDb = require('./ignore-db.js');
var logger = require('./logger.js');
var syncDb = require('./sync-db.js');
var utility = require('./utility.js');



var selective = {
  /**
   * Gets all currently ignored remote id's as an array and passes it to the callback
   *
   * @param {Function} callback - callback function
   * @returns {void}
   */
  getIgnoredRemoteIds: function(callback) {
    ignoreDb.getIgnoredRemoteIds(callback);
  },

  /**
   * Updates ignore db with currently ignored remote id's
   *
   * @param {Object} differeence - Object with changed nodes in a tree like structure
   * @param {Function} callback - callback function
   * @returns {void}
   */
  updateIgnoredNodes: function(difference, callback) {
    const instanceDirPath = config.get('instanceDir');
    const self = this;

    this.updateIgnoreDb(err => {
      if(err) return callback(err);

      const rootNode = difference['#'];

      if(!rootNode || !rootNode.children || rootNode.children.length === 0) {
        //if rootNode is not present or has no children, there are no changes

        logger.info('updateSelectiveSync ended without changes', {catgory: 'sync.selective', err});
        if(err) return callback(err);

        return callback(null);
      }

      return updateChildren(rootNode.children, err => {
        logger.info('updateSelectiveSync ended', {catgory: 'sync.selective', err});
        if(err) return callback(err);

        callback(null);
      });

      function updateChildren(nodes, updateCb) {
        async.map(nodes, (id, cb) => {
          const  node = difference[id];

          if(node.state.selected === false) {
            //node has been unignored
            ignoreNode(node, done);
          } else if(node.state.selected === true && node.origState.selected === false) {
            unignoreNode(node, done)
          } else {
            //nothing to do for this node
            done();
          }

          function done(err, result) {
            if(err) return cb(err);

            if(node.state.selected === true && (node.state.undetermined === true || node.origState.undetermined === true) && node.children && node.children.length) {
              process.nextTick(() => {
                updateChildren(node.children, cb);
              });
            } else {
              cb();
            }
          }
        }, updateCb);
      }

      function ignoreNode(node, ignoreCb) {
        async.parallel([
          (cb) => {
            logger.debug('adding node to ignore db', {category: 'sync.selective', node});

            ignoreDb.add({remoteId: node.id, path: node.path}, cb);
          },
          (cb) => {
            logger.debug('removeing ignored node from fs', {category: 'sync.selective', node});

            //if syncDb does not exist, it will be a fresh sync anyway
            if(syncDb.collectionExists(instanceDirPath) === false) return cb();

            syncDb.findByRemoteId(node.id, (err, syncedNode) => {
              if(err) return cb(err);
              if(!syncedNode) return cb(null);


              self.removeIgnoredNode(syncedNode, cb);
            });
          },
        ], ignoreCb);
      }

      function unignoreNode(node, unignoreCb) {
        async.parallel([
          (cb) => {
            logger.debug('addign unignored node to syncDb', {category: 'sync.selective', node});

            //if syncDb does not exist, it will be a fresh sync anyway do not add anything
            if(syncDb.collectionExists(instanceDirPath) === false) return cb();

            blnApi.getAttributesByIds(node.id, ['name', 'parent', 'path', 'id'], (err, remoteNodes) => {
              if(err) return cb(err);

              async.each(remoteNodes, (remoteNode, cbEach) => {
                syncDb.findByRemoteId(remoteNode.id, (err, syncedNode) => {
                  if(err) return cbEach(err);

                  if(syncedNode) {
                    syncedNode.downloadOriginal = true;
                    syncedNode.remoteId = remoteNode.id;

                    syncDb.update(syncedNode._id, syncedNode, cbEach);
                  } else {
                    var node = {
                      name: remoteNode.name,
                      ino: null,
                      size: 0,
                      mtime: null,
                      ctime: null,
                      parent: '/' + remoteNode.path.split('/').slice(1, -1).join('/'),
                      remoteId: remoteNode.id,
                      remoteParent: remoteNode.parent,
                      localParent: null,
                      downloadOriginal: true,
                      directory: true
                    };

                    syncDb.create(node, cbEach);
                  }
                });
              }, cb);
            });
          },
          (cb) => {
            logger.info('removing unignored node from ignoreDb', {category: 'sync.selective', node});

            ignoreDb.remove({remoteId: node.id}, {multi: false}, cb);
          }
        ], unignoreCb);
      }
    });
  },

  /**
   * Updates remote paths of all ignored nodes
   *
   * @param {Function} callback - callback function
   * @returns {void}
   */
  updateIgnoreDb: function(callback) {
    ignoreDb.getIgnoredRemoteIds((err, ignoredRemoteIds) => {
      if(err) return callback(err);

      blnApi.getAttributesByIds(ignoredRemoteIds, ['path', 'id'], (err, remoteNodes) => {
        if(err) return callback(err);

        ignoreDb.updateRemotePaths(remoteNodes, callback);
      });
    });
  },

  /**
   * Removes an ignored node localy
   *
   * @param {Object} syncedNode - node to remove (representation as in syncDb)
   * @param {Function} callback - callback function
   * @returns {void}
   */
  removeIgnoredNode: function(syncedNode, callback) {
    function unlinkNode(nodePath, syncedNode, unlinkCb) {
      async.parallel([
        (cb) => {
          if(syncedNode.directory) {
            fsWrap.rmdir(nodePath, cb);
          } else {
            fsWrap.unlink(nodePath, cb);
          }
        },
        (cb) => {
          removeFromDb(syncedNode, cb);
        }
      ], unlinkCb);
    }

    function removeFromDb(syncedNode, removeCb) {
      const $or = [];

      $or.push({$and: [{name: syncedNode.name, parent: syncedNode.parent}]});

      if(syncedNode._id) {
        $or.push({_id: syncedNode._id})
      }

      syncDb.getDb().remove({$or}, removeCb);
    }

    const pathCollection = utility.joinPath(syncedNode.parent, syncedNode.name);

    if(fsWrap.existsSync(pathCollection)) {
      fsWrap.readdir(pathCollection, (err, nodes) => {
        if(err) return callback(err);

        async.each(nodes, (name, cb) => {
          var nodePath = utility.joinPath(pathCollection, name);

          if(utility.isExcludeFile(name)) {
            logger.info('removing file matching exclude pattern', {category: 'sync.selective', nodePath});
            return fsWrap.unlink(nodePath, cb);
          }

          if(utility.hasInvalidChars(name)) {
            logger.info('ignoring file because filename contains invalid chars', {category: 'sync.selective', nodePath});
            return cb(null);
          }

          try {
            var stat = fsWrap.lstatSync(nodePath);
          } catch(e) {
            logger.error('Got lstat error', {category: 'sync.selective', nodePath, code: e.code});
            return cb(e);
          }

          if(stat.isSymbolicLink()) {
            logger.info('Removing symlink', {category: 'sync.selective', nodePath});
            return fsWrap.unlink(nodePath, cb);
          }

          syncDb.findByIno(stat.ino, (err, syncedChildNode) => {
            //do not delete localy created nodes which are not synced
            if(!syncedChildNode) return removeFromDb({name: name, parent: pathCollection}, cb);

            if(fsWrap.nodeContentChanged(stat, syncedChildNode, nodePath)) {
              return removeFromDb(syncedChildNode, cb);
            }

            if(stat.isDirectory()) {
              //recurse into directories
              process.nextTick(() => {
                this.removeIgnoredNode(syncedChildNode, cb);
              });
            } else {
              //remove node from FS
              unlinkNode(nodePath, syncedChildNode, cb);
            }
          });
        }, err => {
          if(err) return callback(err);
          if(syncedNode.directory === false) return callback(null);

          fsWrap.readdir(pathCollection, (err, files) => {
            if(files.length > 0) {
              return removeFromDb(syncedNode, callback);
            }

            //remove collection if it is empty
            unlinkNode(pathCollection, syncedNode, callback);
          });
        });
      });
    } else {
      return removeFromDb(syncedNode, callback);
    }
  }
};

module.exports = selective;
