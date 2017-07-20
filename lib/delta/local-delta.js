var fs = require('fs');
var path = require('path');

var async = require('async');

var fsWrap = require('../fs-wrap.js');
var syncDb = require('../sync-db.js');
var utility = require('../utility.js');
var logger = require('../logger.js');

function createNode(name, parent, stat, parentNodeId, cb) {
  if(utility.hasInvalidChars(name)) {
    logger.info('Ignoring file \'' + name + '\' because filename contains invalid chars');
    return cb(undefined);
  }

  var newNode = {
    directory: stat.isDirectory(),
    name: name,
    parent: parent,
    localActions: {create: {immediate: false, actionInitialized: new Date()}},
    localParent: parentNodeId,
    ino: stat.ino,
    mtime: stat.mtime,
    ctime: stat.ctime,
    size: stat.size
  }

  syncDb.create(newNode, (err, createdNode) => {
    cb(createdNode._id);
  });
}

function deleteNode(node, cb) {
  node.localActions = {delete: {
    remoteId: node.remoteId,
    actionInitialized: new Date()
  }};

  syncDb.update(node._id, node, (err, updatedNode) => {
    cb(null);
  });
}

var localDelta = {
  getDelta: function(dirPath, callback) {
    async.series([
      (cb) => {
        this.findChanges(dirPath, undefined, null, cb)
      },
      (cb) => {
        this.findDeletedNodes(cb)
      }
    ], (err, resuls) => {
      return callback(null);
    });
  },

  findChanges: function(dirPath, oldDirPath, parentNodeId, callback) {
    var _self = this;

    fsWrap.readdir(dirPath, (err, nodes) => {
      //if it is not possible to read delta abort sync
      if(err) throw err;

      async.each(nodes, (node, cb) => {
        var nodePath = utility.joinPath(dirPath, node);
        var oldNodePath;
        var stat = fsWrap.lstatSync(nodePath)

        if(utility.isExcludeFile(node)) {
          logger.info('LOCAL DELTA: ignoring file \'' + nodePath + '\' matching exclude pattern');
          return cb(null);
        }

        if(utility.hasInvalidChars(node)) {
          logger.info('Ignoring file \'' + name + '\' because filename contains invalid chars');
          return cb(undefined);
        }

        if(stat.isSymbolicLink()) {
          logger.info('LOCAL DELTA: ignoring symlink \'' + nodePath + '\'');
          return cb(null);
        }

        syncDb.findByIno(stat.ino, (err, syncedNode) => {
          if(!syncedNode) {
            return createNode(node, dirPath, stat, parentNodeId, done);
          } else {
            //Not found by path but by ino -> moved and/or renamed
            var contentChanged = utility.nodeContentChanged(stat, syncedNode);

            oldNodePath = utility.joinPath(syncedNode.parent, syncedNode.name);

            syncedNode.localActions = {};

            if(utility.namesAreEqual(syncedNode.name, node) === false) {
              syncedNode.localActions.rename = {oldName: syncedNode.name, actionInitialized: new Date()};
              syncedNode.name = node;
            }

            if(syncedNode.parent !== dirPath) {
              if(syncedNode.parent !== oldDirPath) {
                syncedNode.localActions.move = {oldParent: syncedNode.parent, actionInitialized: new Date()};
                syncedNode.parent = dirPath;
              } else {
                //one of the parents has been moved
                syncedNode.parent = dirPath;
              }
            }

            if(contentChanged) {
              syncedNode.localActions.create = {immediate: false, actionInitialized: new Date()};
            }

            if(Object.keys(syncedNode.localActions).length === 0) {
              delete syncedNode.localActions;
            }

            syncDb.update(syncedNode._id, syncedNode, (err, affected) => {
              if(err) return cb(err);
              done(syncedNode._id);
            });
          }
        });

        function done(nodeId) {
          if(stat.isDirectory() === true) {
            process.nextTick(() => {
              _self.findChanges(nodePath, oldNodePath, nodeId, cb);
            });
          } else {
            return cb(null);
          }
        }
      }, () => {
        return callback(null);
      });
    });
  },

  findDeletedNodes: function(callback) {
    async.mapSeries(['getDirectories', 'getFiles'], (nodeSource, cbMap) => {
      syncDb[nodeSource]((err, nodes) => {
        async.eachSeries(nodes, (node, cb) => {

          var nodePath = utility.joinPath(node.parent, node.name);

          process.nextTick(() => {
            if(fsWrap.existsSync(nodePath) === false) {
              //Node doesn't exist localy -> delete it remotely
              deleteNode(node, done);
            } else {
              var stat = fsWrap.lstatSync(nodePath);

              if(stat.ino !== node.ino) {

                syncDb.findOne({name: node.name, parent: node.parent, ino: {$nin: [node.ino]}}, (err, syncedNode) => {
                  if(!syncedNode) {
                    deleteNode(node, done);
                  } else {
                    if(syncedNode.localActions && syncedNode.localActions.create) {
                      //merge deleted and recreated node

                      if(utility.nodeContentChanged(stat, node)) {
                        //if content has changed it needs to be uploaded again
                        node.localActions = node.localActions || {};
                        node.localActions.create = {immediate: false, actionInitialized: new Date()};
                      }

                      node.ino = stat.ino;
                      node.size = stat.size;
                      node.ctime = stat.ctime;
                      node.mtime = stat.mtime;

                      async.parallel([
                        (cb) => {
                          syncDb.update(node._id, node, cb);
                        },
                        (cb) => {
                          syncDb.remove(syncedNode._id, cb);
                        }
                      ], done);

                    } else {
                      deleteNode(node, done);
                    }
                  }
                });

              } else {
                syncDb.findByIno(stat.ino, (err, syncedNode) => {
                  if(syncedNode) return done();

                  async.parallel([
                    (cb) => {
                      deleteNode(cb);
                    },
                    (cb) => {
                      createNode(node.name, node.parent, stat, node.localParent, cb);
                    }
                  ], (err, results) => {
                    if(err) return done(err);

                    done(null);
                  });
                });
              }
            }
          });

          function done(err) {
            return cb(err);
          }
        }, cbMap);
      });
    }, callback);
  }
};

module.exports = localDelta;
