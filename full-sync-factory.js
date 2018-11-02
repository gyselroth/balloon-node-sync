var fs = require('fs');
var path = require('path');
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

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
var queueErrorDb = require('./lib/queue/queue-error-db.js');
var selective = require('./lib/selective.js');
var syncDb = require('./lib/sync-db.js');
var syncEvents = require('./lib/sync-events.js')();
var transferDb = require('./lib/transfer-db.js');
var utility = require('./lib/utility.js');

var BlnConfigError = require('./errors/bln-config.js');

var sync;


function SyncFactory($config, $logger) {
  if (!(this instanceof SyncFactory)) return new SyncFactory();

  this.stopped = false;
  config.setAll($config);
  logger.setLogger($logger);

  var err = validateConfiguration($config);

  if(err !== null) {
    throw err;
  }

  EventEmitter.call(this);
}

inherits(SyncFactory, EventEmitter);

module.exports = function($config, $logger) {
  return new SyncFactory($config, $logger);
};

SyncFactory.prototype.blnApi = blnApi;

SyncFactory.prototype.updateSelectiveSync = function(newIgnoredIds) {
  return new Promise((resolve, reject) => {
    this.connectDbs({transferDb: true, queueErrorDb: true}, err => {
      if(err) return reject(err);

      selective.updateIgnoredNodes(newIgnoredIds, (err) => {
        if(err) return reject(err);

        resolve();
      });
    });
  });
}

SyncFactory.prototype.getIgnoredRemoteIds = function(callback) {
  this.connectDbs({transferDb: true, queueErrorDb: true, syncDb: true}, (err) => {
    if(err) return callback(err);

    selective.getIgnoredRemoteIds(callback);
  });
}

SyncFactory.prototype.stop = function(forceQuit, callback) {
  if(!!(forceQuit && forceQuit.constructor && forceQuit.call && forceQuit.apply)) {
    callback = forceQuit;
    forceQuit = false;
  }

  logger.info('Sync: STOP Requested', {forceQuit});
  this.stopped = true;

  //Stop queue
  if(this.actionQueue) {
    this.actionQueue.stop(err => {
      this.emit('transfer-end');
      if(callback) callback(err);
    });
  } else {
    if(callback) callback(null);
  }

  syncEvents.emit(syncEvents.STOP, forceQuit);
}

SyncFactory.prototype.start = function(callback) {
  logger.info('Checking config dir access', {category: 'sync.main'});

  if(this.stopped) return callback(null);

  this.checkConfigDirAccess((err) => {
    if(err) {
      if(err.code === 'EACCES') {
        err = new BlnConfigError('\'' + err.path + '\' is not accessible', 'E_BLN_CONFIG_CONFIGDIR_ACCES');
      }

      logger.error('Can\'t start sync config access check not successfull', {category: 'sync.main', err});
      return callback(err);
    }

    if(this.stopped) return callback(null);

    this.run(callback);
  });
}

SyncFactory.prototype.run = function(callback) {
  var newCursor;

  this.actionQueue = actionQueueFactory();

  logger.info('Starting Sync', {category: 'sync.main', cursor: lastCursor.get()});

  async.series([
    (cb) => {
      logger.info('Connecting databases', {category: 'sync.main', stopped: this.stopped});

      if(this.stopped) return cb(null);

      this.connectDbs({}, cb);
    },
    (cb) => {
      logger.info('Cleaning up', {category: 'sync.main'});

      if(this.stopped) return cb(null);

      this.cleanup(cb);
    },
    (cb) => {
      logger.info('Update ignore db', {category: 'sync.main', stopped: this.stopped});

      if(this.stopped) return cb(null);

      selective.updateIgnoreDb(cb);
    },
    (cb) => {
      logger.info('Getting delta', {category: 'sync.main', stopped: this.stopped});

      if(this.stopped) return cb(null);

      delta.getDelta('/', lastCursor.get(), (err, cursor) => {
        newCursor = cursor;
        cb(err);
      });
    },
    (cb) => {
      logger.info('Applying error queue', {category: 'sync.main', stopped: this.stopped});

      if(this.stopped) return cb(null);

      queueErrorDb.findAll((err, errors) => {
        if(err) return cb(err);

        async.mapSeries(errors, this.applyQueueError, cb);
      });
    },
    (cb) => {
      logger.info('Procesing directory changes', {category: 'sync.main', stopped: this.stopped});

      if(this.stopped) return cb(null);

      this.emit('transfer-start');
      this.processDirectoryChanges((err, results) => {
        cb(err);
      });
    },
    (cb) => {
      logger.info('Processing file changes', {category: 'sync.main', stopped: this.stopped});

      if(this.stopped) return cb(null);

      this.processFileChanges((err, results) => {
        cb(err);
      });
    },
    (cb) => {
      logger.info('Processing removes', {category: 'sync.main', stopped: this.stopped});

      if(this.stopped) return cb(null);

      this.processRemoves((err, results) => {
        cb(err);
      });
    },
    (cb) => {
      logger.info('Processing action queue', {category: 'sync.main', stopped: this.stopped});

      if(this.stopped) return cb(null);

      this.actionQueue.process(err => {
        this.emit('transfer-end');
        cb(err);
      });
    }
  ], (err, results) => {
    logger.info('Finalizing sync', {category: 'sync.main', stopped: this.stopped});

    if(!this.stopped && newCursor !== undefined) lastCursor.set(newCursor);

    if(this.stopped) {
      syncEvents.destroy();

      return callback(null);
    }

    logger.info('Cleaning up', {category: 'sync.main', stopped: this.stopped});

    this.cleanup((cleanupErr) => {
      syncEvents.destroy();

      if(err) return callback(err);
      if(cleanupErr) return callback(cleanupErr);

      callback(null, results);
    });
  });
}

SyncFactory.prototype.cleanup = function(callback) {
  async.parallel([
    (cb) => {
      if(syncDb.isConnected() === false) return cb(null);

      logger.info('Cleaning database', {category: 'sync.main.cleanup', stopped: this.stopped});
      this.cleanDatabase(cb);
    },
    (cb) => {
      logger.info('Running garbage collector', {category: 'sync.main.cleanup', stopped: this.stopped});
      garbageCollector.run(cb);
    }
  ], callback);
},

SyncFactory.prototype.checkConfigDirAccess = function(callback) {
  var instanceDirPath = config.get('instanceDir');

  if(!fs.existsSync(instanceDirPath)) return callback(new BlnConfigError('ConfigDir \'' + instanceDirPath + '\'doesn\'t exist', 'E_BLN_CONFIG_CONFIGDIR_NOTEXISTS'));

  checkAccessRecursive(instanceDirPath, (err) => {
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
}

SyncFactory.prototype.processDirectoryChanges = function(callback) {
  syncDb.walkTree('/', false, false, (node, parentNode, cb) => {
    this.applyDirectoryChanges(node, cb);
  }, callback);
}

SyncFactory.prototype.processFileChanges = function(callback) {
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
}

SyncFactory.prototype.processRemoves = function(callback) {
  syncDb.walkTree('/', true, true, (node, parentNode, cb) => {
    this.processRemove(node, cb);
  }, callback);
}

SyncFactory.prototype.processRemove = function(node, callback) {
  var rActions = node.remoteActions;
  var lActions = node.localActions;

  if(rActions && rActions.delete) {
    this.actionQueue.push('remote', {action: 'remove', node: node, created: rActions.delete.actionInitialized});
  }

  if(lActions && lActions.delete) {
    this.actionQueue.push('local', {action: 'remove', node: node, created: lActions.delete.actionInitialized, immediate: lActions.delete.immediate});
  }

  return callback(null);
}

SyncFactory.prototype.applyDirectoryChanges = function(node, callback) {
  var rActions = node.remoteActions;
  var lActions = node.localActions;

  if(node.directory === false) return callback(null);

  //no changes - nothing to do
  if(!rActions && !lActions) return callback(null);


  var actionsErr = this.validateActions(node);

  //do not process invalid actions
  if(actionsErr) return callback(actionsErr);

  this.resolveDirectoryRemoveConflicts(node, (err, node) => {
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
}

SyncFactory.prototype.applyFileChanges = function(node, callback) {
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
}

SyncFactory.prototype.resolveDirectoryRemoveConflicts = function(node, callback) {
  function processRemove(source, callback) {
    var target = (source === 'remote') ? 'local' : 'remote';
    var actions = node[source + 'Actions'];
    var path = utility.joinPath(node.parent, node.name);

    if(!actions || !actions.delete) return callback(null);

    var actionsQuery = {$or: [{}, {}, {}]};
    actionsQuery['$or'][0][target + 'Actions.create'] = {$exists: true};
    actionsQuery['$or'][1][target + 'Actions.update'] = {$exists: true};
    actionsQuery['$or'][2][target + 'Actions.move'] = {$exists: true};

    var query = {$and: [actionsQuery]};

    //check if children of directory contain local changes
    return syncDb.queryChildrenByPath(path, query, true, (err, changedNodes) => {
      if(changedNodes.length === 0 && Object.keys(actions).length === 1) {
        //no create, update or move on any children in opposite, directory can safely be removed, if actions.delete is the only action
        if(node[target + 'Actions']) delete node[target + 'Actions'];
        syncDb.update(node._id, node, callback);
      } else {
        if(!actions.create) {
          node[target + 'Actions'] = node[target + 'Actions'] || {};
          node[target + 'Actions'].create = {immediate: true};

          if(target === 'remote') {
            node['remoteActions'].create.remoteId = node.remoteId;
          }
        }

        delete node[source + 'Actions'].delete;
        if(Object.keys(node[source + 'Actions']).length === 0) delete node[source + 'Actions'];

        syncDb.update(node._id, node, (err, updatedNode) => {
          //delete all nodes without changes
          var query = {$and: [
            {'_id': { $nin: changedNodes.map(changedNode => {return changedNode._id})}}
          ]};

          if(target === 'remote') {
            query['$and'].push({remoteParent: node.remoteId});
          } else {
            query['$and'].push({localParent: node._id});
          }

          async.parallel([
            (cb) => {
              syncDb.queryChildrenByPath(path, query, true, (err, nodesToDelete) => {

                async.map(nodesToDelete, (nodeToDelete, mapCb) => {
                  if(node._id === nodeToDelete._id) return mapCb(null);

                  nodeToDelete[source + 'Actions'] = nodeToDelete[source + 'Actions'] || {};
                  nodeToDelete[source + 'Actions'].delete = true;

                  syncDb.update(nodeToDelete._id, nodeToDelete, mapCb);
                }, cb);
              });
            },
            (cb) => {
              syncDb.findByPath(path, {$not: {_id: node._id}}, (err, conflictingNode) => {
                if(err || !conflictingNode) return cb(err);

                logger.debug('Renaming conflict file', {category: 'sync.main', parent: conflictingNode.parent, name: conflictingNode.name, conflictingNode});
                // TODO pixtron - this is basicaly renameConflictNode from lib/delta/delta.js, use this method as it has better error handling
                var newLocalName = utility.renameConflictNode(conflictingNode.parent, conflictingNode.name);

                fsWrap.renameSync(path, utility.joinPath(conflictingNode.parent, newLocalName));

                conflictingNode.name = newLocalName;

                conflictingNode.localActions = conflictingNode.localActions || {};

                if(!conflictingNode.localActions.create && !conflictingNode.localActions.rename) {
                  //rename the node if not localy created or localy renamed (always keep original local rename actions)
                  conflictingNode.localActions.rename = {immediate: false, actionInitialized: new Date(), oldName: conflictingNode.name};
                }

                syncDb.update(conflictingNode._id, conflictingNode, cb);
              });
            }
          ], callback);
        });
      }
    });
  }

  async.parallel([
    (cb) => {
      processRemove.call(this, 'remote', cb);
    },
    (cb) => {
      processRemove.call(this, 'local', cb);
    }
  ], (err, results) => {
    callback(err, node);
  });
}

SyncFactory.prototype.validateActions = function(node) {
  var rActions = node.remoteActions;
  var lActions = node.localActions;

  if(lActions) {
    if(lActions.create && lActions.delete) {
      return new Error('Local actions are invalid: create and delete can not be combined');
    } else if(lActions.delete && Object.keys(lActions) > 1) {
      return new Error('Local actions are invalid: delete can not be combined with other actions');
    }
  }
}

SyncFactory.prototype.cleanDatabase = function(callback) {
  async.series([
    (cb) => {
      // remove all nodes, created from remote but not downloaded or created from local but not uploaded
      syncDb.getDb().remove({$where: function() {return !this.remoteId || (!this.ino && !this.downloadOriginal)}}, {multi: true}, cb);
    },
    (cb) => {
      // remove all local and remote actions
      syncDb.getDb().update({}, {$unset: {localActions: true, remoteActions: true}}, {multi: true}, cb);
    }
  ], callback);
}

SyncFactory.prototype.connectDbs = function(excludeDbs, callback) {
  var instanceDir = config.get('instanceDir');

  async.parallel([
    (cb) => {
      if(excludeDbs.syncDb) return cb(null);

      logger.debug('Connecting syncDb', {category: 'sync.main', stopped: this.stopped});
      if(this.stopped) return cb(null);

      syncDb.connect(instanceDir, cb);
    },
    (cb) => {
      if(excludeDbs.ignoreDb) return cb(null);

      logger.debug('Connecting ignoreDb', {category: 'sync.main', stopped: this.stopped});
      if(this.stopped) return cb(null);

      ignoreDb.connect(instanceDir, cb);
    },
    (cb) => {
      if(excludeDbs.queueErrorDb) return cb(null);

      logger.debug('Connecting queueErrorDb', {category: 'sync.main', stopped: this.stopped});
      if(this.stopped) return cb(null);

      queueErrorDb.connect(instanceDir, cb);
    },
    (cb) => {
      if(excludeDbs.transferDb) return cb(null);

      logger.debug('Connecting transferDb', {category: 'sync.main', stopped: this.stopped});
      if(this.stopped) return cb(null);

      transferDb.connect(instanceDir, cb);
    }
  ], callback);
}

SyncFactory.prototype.applyQueueError = function(error, callback) {
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
            if(errorOrigin === 'local') {
              //if file not anymore localy present we can ignore the node (not anymore necessary to upload node's content)
              return removeError(error._id, callback)
            }

            var remoteId = getRemoteId(errorNode);
            var query = {$or: [
              {remoteId: remoteId},
              {'remoteActions.create.remoteId': remoteId},
              {'remoteActions.renamemove.remoteId': remoteId},
              {'remoteActions.delete.remoteId': remoteId},
            ]};

            syncDb.find(query, (err, syncedNode) => {
              if(!syncedNode) {
                syncDb.create(errorNode, (err) => {
                  if(err) return callback(err);

                  removeError(error._id, callback);
                });
              } else {
                createNodeByError(errorOrigin, errorNode, task, syncedNode, callback);
              }
            });
          } else if(errorAction) {
            createNodeByError(errorOrigin, errorNode, task, syncedNode, callback);
          } else {
            //directory already present
            removeError(error._id, callback);
          }
        });
      break;
    }

    function getRemoteId(node) {
      if(node.remoteId) return node.remoteId;

      return node.remoteActions.create.remoteId || node.remoteActions.renamemove.remoteId || node.remoteActions.delete.remoteId;
    }

    function createNodeByError(origin, errorNode, task, node, callback) {
      var actionValue = errorNode[origin+'Actions'].create;
      actionValue.actionInitialized = task.created;

      addNodeAction(node, origin, {key: 'create', value: actionValue}, (err) => {
        if(err) return callback(err);

        removeError(error._id, callback);
      });
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

SyncFactory.prototype.lstatSync = function(nodePath) {
  return fsWrap.existsSync(nodePath) ? fsWrap.lstatSync(nodePath) : {};
}

SyncFactory.prototype.find = function(query, callback) {
  if (!syncDb.isConnected()) {
    syncDb.connect(config.get('instanceDir'), callback);
  }

  syncDb.find(query, callback);
}

function validateConfiguration(config) {
  if(config.context === 'test') return null;

  //TODO for API usage only we do not need those configurations, for example GET /user/whoami
  if(!config.instanceDir) {
    return null;
  }

  if(!config.authMethod) {
    return new BlnConfigError('authMethod not set', 'E_BLN_CONFIG_CREDENTIALS');
  } else if(!config.authMethod === 'oidc' && !config.accessToken) {
    return new BlnConfigError('No accessToken set for oidc authentication', 'E_BLN_CONFIG_CREDENTIALS');
  } else if(!config.authMethod === 'basic' && !config.username) {
    return new BlnConfigError('No username set for basuc authentication', 'E_BLN_CONFIG_CREDENTIALS');
  } else if(!config.balloonDir) {
    return new BlnConfigError('balloonDir is not set', 'E_BLN_CONFIG_BALLOONDIR');
  } else if(!config.instanceDir) {
    return new BlnConfigError('instanceDir is not set', 'E_BLN_CONFIG_CONFIGDIR');
  } else if(!config.apiUrl) {
    return new BlnConfigError('apiUrl is not set', 'E_BLN_CONFIG_APIURL');
  } else {
    var pathDb = path.join(config.instanceDir, 'db/nodes.db');
    var pathCursor = path.join(config.instanceDir, 'last-cursor');

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

    var pathTemp = path.join(config.instanceDir, 'temp');
    if(!fs.existsSync(config.instanceDir)) fs.mkdirSync(config.instanceDir);
    if(!fs.existsSync(pathTemp)) fs.mkdirSync(pathTemp);
  }

  return null;
}
