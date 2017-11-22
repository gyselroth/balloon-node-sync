var path = require('path');
var async = require('async');
var nedb = require('nedb');
var escapeStringRegexp = require('escape-string-regexp');

var utility = require('./utility.js');
var connected = false;

var syncDb = {
  isConnected: function() {
    return connected;
  },

  connect: function(dbPath, callback) {
    var pathCollection = path.join(dbPath, 'db', 'nodes.db');
    this.db = new nedb({
      filename: pathCollection,
      autoload: true,
      onload: (err) => {
        callback(err);
      }
    });

    this.db.ensureIndex({fieldName: 'ino'});
    this.db.ensureIndex({fieldName: 'localId'});
    this.db.ensureIndex({fieldName: 'localParent'});
    this.db.ensureIndex({fieldName: 'remoteId'});
    this.db.ensureIndex({fieldName: 'parent'});
    this.db.ensureIndex({fieldName: 'name'});

    connected = true;
  },

  getDb: function() {
    return this.db;
  },

  find: function(query, callback) {
    this.db.find(query, callback);
  },

  findOne: function(query, callback) {
    this.db.findOne(query, (err, doc) => {
      callback(err, doc || undefined);
    });
  },

  findByRemoteId: function(id, callback) {
    this.db.findOne({remoteId: id}, (err, doc) => {
      callback(err, doc || undefined);
    });
  },

  findByPath: function(nodePath, callback) {
    var name = utility.getNameFromPath(nodePath);
    var parent = utility.getParentFromPath(nodePath);
    this.db.findOne({name: name, parent: parent}, (err, doc) => {
      callback(err, doc || undefined);
    });
  },

  getDirectories: function(callback) {
    this.db.find({directory: true}, (err, docs) => {
      callback(err, docs || []);
    });
  },

  getFiles: function(callback) {
    this.db.find({directory: false}, (err, docs) => {
      callback(err, docs || []);
    });
  },

  create: function(newNode, callback) {
    this.db.insert(newNode, function (err, createdNode) {
      callback(err, createdNode || undefined);
    });
  },

  update: function(id, newNode, callback) {
    if(newNode.directory === false) {
      this.db.update({'_id': id}, newNode, callback);
    } else {
      this.findByLocalId(id, (err, oldNode) => {
        if(err) return callback(err);
        if(!oldNode) return callback(null, 0);

        this.db.update({'_id': id}, newNode, (err, affected) => {
          if(err) return callback(err);

          var oldNodePath = utility.joinPath(oldNode.parent, oldNode.name);
          var newNodePath = utility.joinPath(newNode.parent, newNode.name);

          if(affected > 0 && newNodePath !== oldNodePath) {

            this.queryChildrenByPath(oldNodePath, {}, (err, docs) => {
              if(err) return callback(err);

              async.map(docs, (doc, cb) => {
                doc.parent = doc.parent.replace(oldNodePath, newNodePath);

                this.db.update({'_id': doc._id}, doc, cb);
              }, (err) => {
                if(err) return callback(err);

                callback(null, affected);
              });
            });
          } else {
            return callback(null, affected);
          }
        });
      });
    }
  },

  remove: function(id, callback) {
    this.db.remove({'_id': id}, (err, numRemoved) => {
      callback(err, numRemoved);
    });
  },

  delete: function(id, callback) {
    async.series([
      (cb) => {
        this.findByLocalId(id, (err, foundNode) => {
          if(err) return cb(err);

          node = foundNode;
          cb(null);
        });
      },
      (cb) => {
        if(node && node.directory) {
          return this.deleteChildren(node._id, cb);
        }

        cb(null);
      },
      (cb) => {
        this.db.remove({_id: id}, (err, numRemoved) => {
          cb(null);
        });
      }
    ], () => {
      callback(null, true);
    });
  },

  deleteChildren: function(id, callback) {
    this.findByLocalParent(id, (err, childNodes) => {
      if(err) return callback(err);

      async.map(childNodes, (foundNode, cb) => {
        this.delete(foundNode._id, cb);
      }, () => {
        callback(null, true);
      });
    });
  },

  findDirecotriesByParent: function(parent, callback) {
    this.db.find({parent: parent, directory: true}, (err, docs) => {
      callback(err, docs || []);
    });
  },

  findByParent: function(parent, callback) {
    this.db.find({parent: parent}, (err, docs) => {
      callback(err, docs || []);
    });
  },

  findByLocalId: function(id, callback) {
    this.db.findOne({_id: id}, (err, doc) => {
      callback(err, doc || undefined);
    });
  },

  findByLocalParent: function(id, callback) {
    this.db.find({localParent: id}, (err, docs) => {
      callback(err, docs || []);
    });
  },

  findByIno: function(ino, callback) {
    this.db.findOne({ino: ino}, (err, doc) => {
      callback(err, doc || undefined);
    });
  },

  getNodes: function() {
    return this.db.find({});
  },

  walkTree: function(parent, processFiles, stopOnDeletedDir, iterator, callback) {
    function descendIntoNode(node) {
      if(node.directory === false) return false;

      if(stopOnDeletedDir === false) return true;

      var rActions = node.remoteActions;
      var lActions = node.localActions;
      return ((rActions !== undefined && rActions.delete !== undefined) || (lActions !== undefined && lActions.delete !== undefined)) === false;
    }

    async.parallel([
      (cb) => {
        if(processFiles) {
          this.findByParent(parent, cb);
        } else {
          this.findDirecotriesByParent(parent, cb);
        }
      },
      (cb) => {
        //special case for root node
        if(parent === '/') return cb(null, {_id: null, remoteId: ''});

        this.findByPath(parent, (err, node) => {
          if(err) return cb(err);

          cb(null, node);
        });
      },
    ], (err, results) => {
      if(err) return callback(err);

      var nodes = results[0];
      var parentNode = results[1];

      async.eachSeries(nodes, (node, cbMap) => {
        async.series([
          (cb) => {
            process.nextTick(() => {
              iterator(node, parentNode, cb);
            });
          },
          (cb) => {
            if(descendIntoNode(node) === false) return cb(null);

            process.nextTick(() => {
              this.walkTree(utility.joinPath(node.parent, node.name), processFiles, stopOnDeletedDir, iterator, cb);
            });
          }
        ], cbMap);
      }, callback);
    })
  },

  processChildren: function(parentId, iterator, callback) {
    async.waterfall([
      (cb) => {
        this.findByLocalParent(parentId, (err, nodes) => {
          if(err) return cb(err);

          cb(null, nodes);
        });
      },
      (nodes, cb) => {
        async.mapLimit(nodes, 5, (node, mapCb) => {
          iterator(node, mapCb);
        }, cb);
      }
    ], callback)
  },

  queryChildrenByPath: function(nodePath, query, callback) {
    var name = utility.getNameFromPath(nodePath);
    var parent = utility.getParentFromPath(nodePath);

    var pathQuery = {$or: [
      {$and: [{name, parent}]},
      {parent: new RegExp('^' + escapeStringRegexp(nodePath) + '(\/.*|)$')}
    ]};

    this.db.find({$and: [pathQuery, query]}, (err, docs) => {
      callback(err, docs || []);
    });
  }
}

module.exports = syncDb;
