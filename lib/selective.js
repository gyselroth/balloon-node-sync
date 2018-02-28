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
   * @param {Function} callback - callback function
   * @returns {void}
   */
  updateIgnoredNodes: function(newIgnoredIds, callback) {
    const instanceDirPath = config.get('instanceDir');

    let ignoredIds; //will hold newly ignored id's
    let unignoredIds; //will hold id's previously ignored, but now not anymore ignored

    ignoreDb.getIgnoredRemoteIds((err, oldIgnoredIds) => {
      if(err) return callback(err);

      ignoredIds = newIgnoredIds.filter(id => !oldIgnoredIds.includes(id));
      unignoredIds = oldIgnoredIds.filter(id => !newIgnoredIds.includes(id));

      async.parallel([
        (cb) => {
          logger.info('applying ignoredIds', {category: 'sync.selective', ignoredIds});

          //if no collections newly ignored, there is nothing to do
          if(ignoredIds.length === 0) return cb();

          async.eachSeries(ignoredIds, (id, cbEach) => {
            ignoreDb.insert({remoteId: id}, cbEach);
          }, cb);
        },
        (cb) => {
          logger.info('removing ignored nodes from file system', {category: 'sync.selective', ignoredIds});

          //if syncDb does not exist, it will be a fresh sync anyway
          if(syncDb.collectionExists(instanceDirPath) === false) return cb();

          //if no collections newly ignored, there is nothing to do
          if(ignoredIds.length === 0) return cb();

          async.eachLimit(ignoredIds, 10, (id, cbEach) => {
            syncDb.findByRemoteId(id, (err, syncedNode) => {
              if(err) return cbEach(err);
              if(!syncedNode) return cbEach();


              this.removeIgnoredNode(syncedNode, cbEach);
            });
          }, cb);
        },
        (cb) => {
          logger.info('applying unignored nodes to syncDb', {category: 'sync.selective', unignoredIds});

          //if no collections unignored, there is nothing to do
          if(unignoredIds.length === 0) return cb();

          //if syncDb does not exist, it will be a fresh sync anyway
          if(syncDb.collectionExists(instanceDirPath) === false) return cb();

          blnApi.getAttributesByIds(unignoredIds, ['name', 'parent', 'path', 'id'], (err, remoteNodes) => {
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
                    parent: '/' + remoteNode.path.split('/').slice(2).join('/'),
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
          logger.info('removing unignored nodes from ignoreDb', {category: 'sync.selective', unignoredIds});

          //if no collections unignored, there is nothing to do
          if(unignoredIds.length === 0) return cb()

          ignoreDb.remove({remoteId: {$in: unignoredIds}}, {multi: true}, cb);
        }
      ], err => {
        logger.debug('updateSelectiveSync ended', {catgory: 'sync.selective', err});
        if(err) return callback(err);

        callback(null);
      });
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

          if(utility.nodeContentChanged(stat, syncedChildNode)) {
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
  }
};

module.exports = selective;
