var fs = require('fs');
var path = require('path');

var async = require('async');

var config = require('./lib/config.js');

var actionQueueFactory = require('./lib/queue/action-queue-factory.js');
var blnApi = require('./lib/bln-api.js');
var delta = require('./lib/delta/delta.js');
var fsWrap = require('./lib/fs-wrap.js');
var garbageCollector = require('./lib/garbage-collector.js');
var lastCursor = require('./lib/last-cursor.js');
var ignoreDb = require('./lib/ignore-db.js');
var logger = require('./lib/logger.js');
var loggingUtilityFactory = require('./lib/logging-utility-factory.js');
var remoteDeltaLogDb = require('./lib/delta/remote-delta-log-db.js');
var queueErrorDb = require('./lib/queue/queue-error-db.js');
var syncDb = require('./lib/sync-db.js');
var syncEvents = require('./lib/sync-events.js')();
var transferDb = require('./lib/transfer-db.js');
var utility = require('./lib/utility.js');

var BlnConfigError = require('./errors/bln-config.js');

var syncFactory = function($config, $logger) {
  var stopped = false;
  var err = validateConfiguration($config);

  if(err !== null) {
    throw err;
  }

  config.setAll($config);
  logger.setLogger($logger);

  return {
    blnApi: blnApi,

    stop: function(forceQuit, callback) {
      if(!!(forceQuit && forceQuit.constructor && forceQuit.call && forceQuit.apply)) {
        callback = forceQuit;
        forceQuit = false;
      }

      logger.info('Sync: STOP Requested', {forceQuit});
      stopped = true;

      //Stop queue
      if(this.actionQueue) this.actionQueue.stop(callback);

      syncEvents.emit(syncEvents.STOP, forceQuit);
    },

    start: function(callback) {
      this.checkConfigDirAccess((err) => {
        if(err) {
          if(err.code === 'EACCES') {
            err = new BlnConfigError('\'' + err.path + '\' is not accessible', 'E_BLN_CONFIG_CONFIGDIR_ACCES');
          }

          logger.error('Sync: can\'t start sync config access check not successfull', {err});
          return callback(err);
        }

        this.run(callback);
      });
    },

    run: function(callback) {
      var newCursor;

      this.actionQueue = actionQueueFactory();

      if(config.get('context') === 'development') {
        var loggingUtility = new loggingUtilityFactory(new Date())
      }

      logger.info('Starting Sync with remote cursor: ' + lastCursor.get());

      async.series([
        (cb) => {
          //create a snapshot in development context
          if(stopped || config.get('context') !== 'development') return cb(null);

          loggingUtility.createSnapshot('before', err => {
            if(err) logger.error(err);
            //always continue to next step - even if taking snapshot was not successfull
            cb(null);
          });
        },
        (cb) => {
          if(stopped) return cb(null);

          this.connectDbs(cb);
        },
        (cb) => {
          if(stopped) return cb(null);

          this.populateIgnoreDb(cb);
        },
        (cb) => {
          if(stopped) return cb(null);
          delta.getDelta('/', lastCursor.get(), (err, cursor) => {
            newCursor = cursor;
            cb(err);
          });
        },
        (cb) => {
          if(stopped) return cb(null);

          queueErrorDb.findAll((err, errors) => {
            if(err) return cb(err);

            async.mapSeries(errors, this.applyQueueError, cb);
          });
        },
        (cb) => {
          if(stopped) return cb(null);

          this.processDirectoryChanges((err, results) => {
            cb(err);
          });
        },
        (cb) => {
          if(stopped) return cb(null);

          this.processFileChanges((err, results) => {
            cb(err);
          });
        },
        (cb) => {
          if(stopped) return cb(null);

          this.processRemoves('/', (err, results) => {
            cb(err);
          });
        },
        (cb) => {
          if(stopped) return cb(null);

          this.actionQueue.process(cb);
        }
      ], (err, results) => {
        if(!stopped && newCursor !== undefined) lastCursor.set(newCursor);

        var finalizeSync = () => {
          syncEvents.destroy();

          this.cleanup((errCleanup) => {
            if(err) return callback(err);
            if(errCleanup) return callback(errCleanup);

            callback(null, results);
          });
        }

        if(config.get('context') !== 'development') return finalizeSync();

        loggingUtility.createSnapshot('after', finalizeSync);
      });
    },

    cleanup: function(callback) {
      async.parallel([
        (cb) => {
          if(syncDb.isConnected() === false) return cb(null);

          this.cleanDatabase(cb);
        },
        (cb) => {
          garbageCollector.run(cb);
        }
      ], callback);
    },

    populateIgnoreDb: function(callback) {
      var ignoreNodes = config.get('ignoreNodes') || [];

      blnApi.getAttributesByIds(ignoreNodes, ['path', 'id'], (err, nodes) => {
        if(err) return callback(err);

        ignoreDb.insertNodes(nodes, callback);
      });
    },

    checkConfigDirAccess: function(callback) {
      var configDirPath = config.get('configDir');

      if(!fs.existsSync(configDirPath)) return callback(new BlnConfigError('ConfigDir \'' + configDirPath + '\'doesn\'t exist', 'E_BLN_CONFIG_CONFIGDIR_NOTEXISTS'));

      checkAccessRecursive(configDirPath, (err) => {
        callback(err);
      });

      function checkAccessRecursive(dirPath, callback) {
        fs.readdir(dirPath, (err, nodes) => {
          if(err) return callback(err);

          async.map(nodes, (node, cb) => {
            var nodePath = path.join(dirPath, node);

            fs.access(nodePath, fs.constants.R_OK | fs.constants.W_OK, (err) => {
              if(err) return cb(err);

              fs.lstat(nodePath, (err, stat) => {
                if(err) return cb(err);

                stat.isDirectory() ? checkAccessRecursive(nodePath, cb) : cb(null);
              });
            });
          }, callback);
        });
      }
    },

    processDirectoryChanges: function(callback) {
      syncDb.walkTree('/', false, false, (node, parentNode, cb) => {
        this.applyDirectoryChanges(node, cb);
      }, callback);
    },

    processFileChanges: function(callback) {
      var query = {$and: [
        {directory: false},
        {$or: [
          {remoteActions: {$exists: true}},
          {localActions: {$exists: true}}
        ]}
      ]};

      syncDb.getDb().find(query).sort({parent: 1, name: 1}).exec((err, nodes) => {
        if(err) return callback(err);
        async.each(nodes, (node, cb) => {
          this.applyFileChanges(node, cb);
        }, callback);
      });
    },

    processRemoves: function(parent, callback) {
      syncDb.walkTree(parent, true, true, (node, parentNode, cb) => {
        this.processRemove(node, cb);
      }, callback);
    },

    processRemove: function(node, callback) {
      var rActions = node.remoteActions;
      var lActions = node.localActions;

      if(rActions && rActions.delete) {
        this.actionQueue.push('remote', {action: 'remove', node: node, created: rActions.delete.actionInitialized});
      }

      if(lActions && lActions.delete) {
        this.actionQueue.push('local', {action: 'remove', node: node, created: lActions.delete.actionInitialized});
      }

      return callback(null);
    },

    applyDirectoryChanges: function(node, callback) {
      var rActions = node.remoteActions;
      var lActions = node.localActions;

      if(node.directory === false) return callback(null);

      //no changes - nothing to do
      if(!rActions && !lActions) return callback(null);


      var actionsErr = this.validateActions(node);

      //do not process invalid actions
      if(actionsErr) return callback(actionsErr);

      this.resolveDirectoryRemoveConflicts(node, (err, results) => {
        if(err) return callback(err);

        var rActions = node.remoteActions;
        var lActions = node.localActions;

        //when there was r:delete && l:delete or r:create && l:create before conflict resolution there are no more actions for this node
        if(!rActions && !lActions) return callback(null);

        if(rActions) {
          if(rActions.create) {
            this.actionQueue.push('remote', {action: 'create', node: node, created: rActions.create.actionInitialized});
          }

          if(rActions.rename || rActions.move) {
            var created = rActions.rename ? rActions.rename.actionInitialized : rActions.move.actionInitialized;
            this.actionQueue.push('remote', {action: 'renamemove', node: node, created});
          }
        }

        if(lActions) {
          if(lActions.rename || lActions.move) {
            var created = lActions.rename ? lActions.rename.actionInitialized : lActions.move.actionInitialized;

            this.actionQueue.push('local', {action: 'renamemove', node: node, created});
          }

          if(lActions.create) {
            this.actionQueue.push('local', {action: 'create', node: node, created: lActions.create.actionInitialized, immediate: lActions.create.immediate});
          }
        }

        return callback(null);
      });
    },

    applyFileChanges: function(node, callback) {
      var rActions = node.remoteActions;
      var lActions = node.localActions;

      if(node.directory === true) return callback(null);

      if(!rActions && !lActions) return callback(null);

      var actionsErr = this.validateActions(node);

      //do not process invalid actions
      if(actionsErr) return callback(actionsErr);

      var rActions = node.remoteActions;
      var lActions = node.localActions;

      //when there aren't any more actions after conflict resolution, nothing to do
      if(!rActions && !lActions) return callback(null);

      if(rActions) {
        if(rActions.create) {
          this.actionQueue.push('remote', {action: 'create', node: node, created: rActions.create.actionInitialized});
        }

        if(rActions.rename || rActions.move) {
          var created = rActions.rename ? rActions.rename.actionInitialized : rActions.move.actionInitialized;
          this.actionQueue.push('remote', {action: 'renamemove', node: node, created});
        }
      }

      if(lActions) {
        if(lActions.move || lActions.rename) {
          var created = lActions.rename ? lActions.rename.actionInitialized : lActions.move.actionInitialized;
          this.actionQueue.push('local', {action: 'renamemove', node: node, created});
        }

        if(lActions.create) {
          this.actionQueue.push('local', {action: 'create', node: node, created: lActions.create.actionInitialized, immediate: lActions.create.immediate});
        }
      }

      return callback(null);
    },

    resolveDirectoryRemoveConflicts: function(node, callback) {
      function processRemove(node, source, callback) {
        var target = (source === 'remote') ? 'local' : 'remote';
        var actions = node[source + 'Actions'];
        var path = utility.joinPath(node.parent, node.name);

        if(!actions || !actions.delete) return callback(null);

        var query = {$or: [{}, {}, {}]};
        query['$or'][0][target + 'Actions.create'] = {$exists: true};
        query['$or'][1][target + 'Actions.update'] = {$exists: true};
        query['$or'][2][target + 'Actions.move'] = {$exists: true};

        //check if children of directory contain local changes
        return syncDb.queryChildrenByPath(path, query, (err, changedNodes) => {
          if(changedNodes.length === 0) {
            //no create, update or move on any children in opposite, directory can safely be removed
            callback(null);
          } else {
            if(!actions.create) {
              node[target + 'Actions'] = node[target + 'Actions'] || {};
              node[target + 'Actions'].create = {immediate: true};
            }

            delete node[source + 'Actions'].delete;
            if(Object.keys(node[source + 'Actions']).length === 0) delete node[source + 'Actions'];

            syncDb.update(node._id, node, (err, updatedNode) => {
              //delete all nodes without changes
              syncDb.queryChildrenByPath(path, {'_id': {
                $nin: changedNodes.map(changedNode => {return changedNode._id})
              }}, (err, nodesToDelete) => {

                async.map(nodesToDelete, (nodeToDelete, mapCb) => {
                  if(node._id === nodeToDelete._id) return mapCb(null);

                  nodeToDelete[source + 'Actions'] = nodeToDelete[source + 'Actions'] || {};
                  nodeToDelete[source + 'Actions'].delete = true;

                  syncDb.update(nodeToDelete._id, nodeToDelete, mapCb);
                }, callback);
              });
            });
          }
        });
      }

      async.parallel([
        (cb) => {
          processRemove.call(this, node, 'remote', cb);
        },
        (cb) => {
          processRemove.call(this, node, 'local', cb);
        }
      ], callback);
    },

    validateActions: function(node) {
      var rActions = node.remoteActions;
      var lActions = node.localActions;

      if(lActions) {
        if(lActions.create && lActions.delete) {
          return new Error('Local actions are invalid: create and delete can not be combined');
        } else if(lActions.delete && Object.keys(lActions) > 1) {
          return new Error('Local actions are invalid: delete can not be combined with other actions');
        }
      }
    },

    cleanDatabase: function(callback) {
      syncDb.walkTree('/', true, false, (node, parentNode, cb) => {
        if(!node.remoteId) {
          //node which was created from remote, but not downloaded
          return syncDb.remove(node._id, cb);
        }

        node.localParent = parentNode._id;
        node.remoteParent = parentNode.remoteId;

        delete node.localActions;
        delete node.remoteActions;

        return syncDb.update(node._id, node, cb);
      }, callback);
    },

    connectDbs: function(callback) {
      var configDir = config.get('configDir');

      async.parallel([
        (cb) => {
          if(stopped) return cb(null);

          syncDb.connect(configDir, cb);
        },
        (cb) => {
          if(stopped) return cb(null);

          ignoreDb.connect(configDir, cb);
        },
        (cb) => {
          if(stopped) return cb(null);

          queueErrorDb.connect(configDir, cb);
        },
        (cb) => {
          if(stopped) return cb(null);

          transferDb.connect(configDir, cb);
        },
        (cb) => {
          if(stopped) return cb(null);

          remoteDeltaLogDb.connect(configDir, cb);
        }
      ], callback);
    },

    applyQueueError: function(error, callback) {
      var task = error.task;

      function removeError(id, callback) {
        queueErrorDb.remove(id, callback);
      }

      if(task && task.node && task.action && task.created.getTime() > (new Date()).getTime() - (48 * 60 * 60 * 1000)) {
        //if error is older then 48hours or there is no task associated dismiss the error

        var errorNode = task.node;
        var errorAction = task.action;
        var errorOrigin = error.origin;

        switch(errorAction) {
          case 'remove':
            addNodeActionByLocalId(errorNode._id, errorOrigin, {key: 'delete',  value: {actionInitialized: task.created}}, callback);
          break;
          case 'renamemove':
            var errorActions = errorNode[errorOrigin + 'Actions'];
            async.series([
              (cb) => {
                if(!errorActions.move) return cb(null);
                var actionValue = errorActions.move;
                actionValue.actionInitialized = task.created;
                addNodeActionByLocalId(errorNode._id, errorOrigin, {key: 'move',  value: actionValue}, cb);
              },
              (cb) => {
                if(!errorActions.rename) return cb(null);
                var actionValue = errorActions.rename;
                actionValue.actionInitialized = task.created;
                addNodeActionByLocalId(errorNode._id, errorOrigin, {key: 'rename',  value: actionValue}, cb);
              }
            ], callback);
          break;
          case 'create':
          case 'download':
          case 'upload':
            syncDb.findByPath(utility.joinPath(errorNode.parent, errorNode.name), (err, syncedNode) => {
              if(err) return callback(err);

              if(!syncedNode) {
                syncDb.create(errorNode, (err) => {
                  if(err) return callback(err);

                  removeError(error._id, callback);
                });
              } else if(errorAction) {
                var actionValue = errorNode.remoteActions.create;
                actionValue.actionInitialized = task.created;

                addNodeAction(syncedNode, errorOrigin, {key: 'create', value: actionValue}, (err) => {
                  if(err) return callback(err);

                  removeError(error._id, callback);
                });
              } else {
                //directory already present
                removeError(error._id, callback);
              }
            });
          break;
        }

        function addNodeActionByLocalId(id, origin, action, callback) {
          syncDb.findByLocalId(id, (err, syncedNode) => {
            if(err) return callback(err);

            if(!syncedNode) return removeError(error._id, callback);

            addNodeAction(syncedNode, origin, action, (err) => {
              if(err) return callback(err);

              removeError(error._id, callback);
            });
          });
        }

        function addNodeAction(syncedNode, origin, action, callback) {
          if(!syncedNode[origin + 'Actions']) syncedNode[origin + 'Actions'] = {};

          if(!syncedNode[origin + 'Actions'][action.key]) {
            syncedNode[origin + 'Actions'][action.key] = action.value;
          }

          syncDb.update(syncedNode._id, syncedNode, callback);
        }
      } else {
        removeError(error._id, callback);
      }
    }
  }
}

function validateConfiguration(config) {
  if(config.context === 'test') return null;

  if(!config.accessToken && (!config.username || !config.password)) {
    return new BlnConfigError('Neither acessToken nor username/password set', 'E_BLN_CONFIG_CREDENTIALS');
  } else if(!config.balloonDir) {
    return new BlnConfigError('BalloonDir is not set', 'E_BLN_CONFIG_BALLOONDIR');
  } else if(!config.configDir) {
    return new BlnConfigError('ConfigDir is not set', 'E_BLN_CONFIG_CONFIGDIR');
  } else if(!config.apiUrl) {
    return new BlnConfigError('ApiUrl is not set', 'E_BLN_CONFIG_APIURL');
  } else {

    var pathDb = path.join(config.configDir, 'db/nodes.db');
    var pathCursor = path.join(config.configDir, 'last-cursor');

    var dbExists = fs.existsSync(pathDb);
    var cursorExists = fs.existsSync(pathCursor);

    if(dbExists ? !cursorExists : cursorExists) {
      //sync can only run successfully when cursor and db both exist or both don't exists
      //aka dbExists XOR lastCursorExists
      if(dbExists) {
        logger.info('Sync: db exists, but not last cursor. Deleteing db.');
        fs.unlinkSync(pathDb);
      }
      if(cursorExists) {
        logger.info('Sync: last_cursor exists, but not last db. Deleteing last_cursor.');
        fs.unlinkSync(pathCursor);
      }
    }

    var pathTemp = path.join(config.configDir, 'temp');
    if(!fs.existsSync(config.configDir)) fs.mkdirSync(config.configDir);
    if(!fs.existsSync(pathTemp)) fs.mkdirSync(pathTemp);
  }

  return null;
}

module.exports = syncFactory;
