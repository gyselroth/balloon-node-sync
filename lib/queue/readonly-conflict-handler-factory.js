var async = require('async');

var blnApi = require('../bln-api.js');
var fsWrap = require('../fs-wrap.js');
var syncDb = require('../sync-db.js');
var utility = require('../utility.js');

var readonlyConflictHandlerFactory = function(actionQueue, transferQueue) {
  var readonlyConflictHandler = {
    findReadonlyNode: function(node, callback) {
      var nodePath = utility.joinPath(node.parent, node.name);
      var readonlyNodeFound = false;
      var childrenArr = nodePath.split('/');
      var parentArr = [];

      //if nodePath starts with a leading / remove empty entry
      if(childrenArr[0] === '') childrenArr.shift();

      async.doWhilst(
        (cb) => {
          var currentChild = childrenArr.shift();

          var currentNode = {
            name: currentChild,
            parent: '/' + parentArr.join('/')
          }

          parentArr.push(currentChild);

          blnApi.getAttributes(currentNode, ['share', 'access', 'readonly', 'id'], (err, result) => {
            if(err) return cb(err);

            if(result.readonly === true || (result.share !== false && result.access === 'r')) {
              readonlyNodeFound = true;
              cb(null, result.id);
            } else {
              cb(null, null);
            }
          });
        },
        function() {
          return readonlyNodeFound === false && childrenArr.length !== 0;
        },
        (err, readonlyNodeId) => {
          if(err) return callback(err);

          if(readonlyNodeId === null) return callback(null, null);

          syncDb.findByRemoteId(readonlyNodeId, callback);
        }
      );
    },

    handleUploadConflict: function(node, callback) {
      var _self = this;

      this.findReadonlyNode(node, function(err, readonlyNode) {
        if(err || readonlyNode === null) return callback(err, null);

        if(readonlyNode._id === node._id) {
          //the file itself is readonly
          return _self.renameLocalFileDownloadOriginal(node, callback);
        } else {
          return _self.moveNodeToConflictCollection(readonlyNode, node, callback);
        }
      });
    },

    handleCollectionCreateConflict: function(node, callback) {
      this.findReadonlyNode(node, (err, readonlyNode) => {
        if(err || readonlyNode === null) return callback(err, null);

        var query = {$or: [{
          'localActions.move': {$exists: true}
        }, {
          'localActions.rename': {$exists: true}
        }]};

        syncDb.queryChildrenByPath(utility.joinPath(node.parent, node.name), query, (err, children) => {
          if(err) return callback(err);

          async.each(children, (child, cb) => {
            if(child.id === node._id) return cb(null);

            // reset name and parent of all children which have been moved or renamed in the collection
            // if the child is not allowed to be renamed or moved (readonly or was in a readonly share)
            // it should be restored on next sync with correct name and path
            child = this.revertLocalRenameMove(child);
            syncDb.update(child._id, child, cb);
          }, (err) => {
            if(err) callback(err);

            return this.moveNodeToConflictCollection(readonlyNode, node, callback);
          });
        });
      });
    },

    handleDeleteConflict: function(node, callback) {
      if(node.directory === false) {
        this.downloadOriginalFile(node, false, callback);
      } else {
        syncDb.deleteChildren(node._id, (err) => {
          if(err) return callback(err);

          this.downloadOriginalCollection(node, callback);
        });
      }
    },

    handleRenamemoveConflict: function(node, callback) {
      var currentPath = utility.joinPath(node.parent, node.name);

      node = this.revertLocalRenameMove(node);

      var oldPath = utility.joinPath(node.parent, node.name);

      if(!fsWrap.existsSync(node.parent)) {
        async.series([
          (cb) => {
            try {
              fsWrap.unlinkSync(currentPath, oldPath);
            } catch(err) {
              cb(err);
            }

            cb(null);
          },
          (cb) => {
            syncDb.remove(node._id, cb);
          }
        ], callback);
      } else {
        async.series([
          (cb) => {
            fsWrap.rename(currentPath, oldPath, cb);
          },
          (cb) => {
            syncDb.update(node._id, node, cb);
          }
        ], callback);
      }
    },

    renameLocalFileDownloadOriginal: function(node, callback) {
      var originalNode = Object.assign({}, node);

      var srcName = node.name;
      var srcPath = utility.joinPath(node.parent, srcName);

      var newName = utility.renameConflictNode(node.parent, srcName);
      var destPath = utility.joinPath(node.parent, newName);

      try {
        fsWrap.renameSync(srcPath, destPath);
      } catch(err) {
        return callback(err);
      }

      async.parallel([
        (cb) => {
          delete node.remoteId;
          delete node.version;
          delete node.hash;

          node.name = newName;

          transferQueue.push({action: 'upload', node: node});

          syncDb.update(node._id, node, cb);
        },
        (cb) => {
          this.downloadOriginalFile(originalNode, true, cb);
        }
      ], callback);
    },

    moveNodeToConflictCollection: function(readonlyNode, node, callback) {
      //for now the structure is only created localy, therefore the conflict is
      //only resolved after a subsequent sync loop.
      async.waterfall([
        (cb) => {
          this.createConflictCollection(readonlyNode, node, cb);
        },
        (newParentPath, cb) => {
          var oldPath = utility.joinPath(node.parent, node.name);
          var newPath;

          var filenameParts = utility.getFileNameParts(node.name);

          var filename = filenameParts.name;
          var extension = (filenameParts.ext !== '' ? '.' + filenameParts.ext : '');
          var i = 0;

          while(true) {
            var newName = filename + (i > 0 ? `-${i}` : '') + extension;
            newPath = utility.joinPath(newParentPath, newName);

            if(!fsWrap.existsSync(newPath)) break;

            i++;
          }

          if(node.directory) {
            //if node is a directory, we need to remove all other queued tasks for children of this directory;
            actionQueue.remove((testData) => {
              var testNode = (testData.data && testData.data.node) ? testData.data.node : undefined;

              if(!testNode) return false;

              var regex = new RegExp('^' + oldPath + '(\/.*|)$');

              return regex.test(testNode.parent);
            });
          }

          fsWrap.rename(oldPath, newPath, cb);
        },
        (cb) => {
          syncDb.delete(node._id, cb);
        }
      ], (err, res) => {
        if(err) return callback(err);

        if(node.directory === false && node.remoteId) {
          this.downloadOriginalFile(node, true, callback);
        } else {
          callback(null);
        }
      });
    },

    createConflictCollection: function(readonlyNode, node, callback) {
      var newReadonlyName = utility.renameReadonlyConflictCollection(readonlyNode.name);
      var nodePathArr = node.parent.split('/').filter(el => {return el.length > 0}).slice(1);
      nodePathArr.unshift(newReadonlyName);

      var newPath = '/' + nodePathArr.join('/');

      fsWrap.mkdirp(newPath, (err) => {
        if(err) return callback(err);

        callback(null, newPath);
      });
    },

    downloadOriginalFile: function(node, create, callback) {

      //TODO pixtron - what happens if sync is paused, how do we know that we still have to download this node?
      if(create) {
        var newNode = {
          name: node.name,
          parent: node.parent,
          directory: node.directory,
          remoteParent: node.remoteParent,
          remoteId: node.remoteId,
          remoteActions: {create: {
            hash: node.hash,
            version: node.version,
            remoteId: node.remoteId,
            remoteParent: node.remoteParent,
            parent: node.parent,
            actionInitialized: new Date()
          }}
        }

        syncDb.create(newNode, (err, createdNode) => {
          if(err) return callback(err);

          transferQueue.push({action: 'download', node: createdNode});
          callback(null);
        });
      } else {
        node.remoteActions = node.remoteActions || {};
        node.remoteActions.create = {
          hash: node.hash,
          version: node.version,
          remoteId: node.remoteId,
          remoteParent: node.remoteParent,
          parent: node.parent,
          actionInitialized: new Date()
        };

        syncDb.update(node._id, node, (err) => {
          if(err) return callback(err);

          transferQueue.push({action: 'download', node});
          callback(null);
        });
      }
    },

    downloadOriginalCollection: function(node, callback) {
      node.downloadOriginal = true;
      syncDb.update(node._id, node, callback);
    },

    revertLocalRenameMove: function(node) {
      var lActions = node.localActions;

      if(lActions.rename) {
        node.name = lActions.rename.oldName;
      }

      if(lActions.move) {
        node.parent = lActions.move.oldParent;
      }

      return node;
    }
  }

  return readonlyConflictHandler;
}

module.exports = readonlyConflictHandlerFactory;
