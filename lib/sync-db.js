var fs = require('original-fs');
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

  getCollectionPath: function(dbPath) {
    return path.join(dbPath, 'db', 'nodes.db');
  },

  collectionExists: function(dbPath) {
    var pathCollection = this.getCollectionPath(dbPath);
    return fs.existsSync(pathCollection);
  },

  connect: function(dbPath, callback) {
    var pathCollection = this.getCollectionPath(dbPath);
    this.db = new nedb({
      filename: pathCollection,
      autoload: true,
      onload: (err) => {
        callback(err);
      }
    });

    this.db.ensureIndex({fieldName: 'ino'});
    this.db.ensureIndex({fieldName: 'localParent'});
    this.db.ensureIndex({fieldName: 'remoteId'});
    this.db.ensureIndex({fieldName: 'parent'});
    this.db.ensureIndex({fieldName: 'name'});
    this.db.ensureIndex({fieldName: 'directory'});

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

  findByPath: function(nodePath, additionalQuery, callback) {
    if(!!(additionalQuery && additionalQuery.constructor && additionalQuery.call && additionalQuery.apply)) {
      callback = additionalQuery;
      additionalQuery = undefined;
    }

    var name = utility.getNameFromPath(nodePath);
    var parent = utility.getParentFromPath(nodePath);
    var basicQuery = {name, parent};

    var query;

    if(additionalQuery) {
      query = {$and: [basicQuery, additionalQuery]};
    } else {
      query = basicQuery;
    }

    this.db.findOne(query, (err, doc) => {
      callback(err, doc || undefined);
    });
  },

  findByParentPath: function(parentPath, additionalQuery, callback) {
    if(!!(additionalQuery && additionalQuery.constructor && additionalQuery.call && additionalQuery.apply)) {
      callback = additionalQuery;
      additionalQuery = undefined;
    }

    var basicQuery = {parent: parentPath};

    var query;

    if(additionalQuery) {
      query = {$and: [basicQuery, additionalQuery]};
    } else {
      query = basicQuery;
    }

    this.db.find(query, (err, docs) => {
      callback(err, docs || []);
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

            var childQuery = {};
            var childQuery = {'$or': [
              {'$and': [
                {localParent: newNode._id},
                {localParent: {'$exists': true}}
              ]}
            ]};

            if(newNode.remoteId) {
              childQuery['$or'].push(
                {$and: [
                  {remoteParent: newNode.remoteId},
                  {remoteParent: {'$exists': true}}
                ]}
              );
            }

            this.findByParentPath(oldNodePath, childQuery, (err, docs) => {
              if(err) return callback(err);

              async.map(docs, (doc, cb) => {
                doc.parent = doc.parent.replace(oldNodePath, newNodePath);

                this.update(doc._id, doc, cb);
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

  walkTree: function(parentNode, processFiles, stopOnDeletedDir, iterator, callback) {
    function descendIntoNode(node) {
      if(node.directory === false) return false;

      if(stopOnDeletedDir === false) return true;

      var rActions = node.remoteActions;
      var lActions = node.localActions;
      return ((rActions !== undefined && rActions.delete !== undefined) || (lActions !== undefined && lActions.delete !== undefined)) === false;
    }

    var parent;
    if(parentNode === '/') {
      parent = '/';
      parentNode = {_id: null, remoteId: ''};
    } else {
      parent = utility.joinPath(parentNode.parent, parentNode.name);
    }

    var query = {$and: [
      {parent}
    ]};

    if(!processFiles) {
      query['$and'].push({directory: true});
    }

    this.db.find(query, (err, docs) => {
      if(err) return callback(err);

      var nodes = docs || [];

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
              this.walkTree(node, processFiles, stopOnDeletedDir, iterator, cb);
            });
          }
        ], cbMap);
      }, callback);
    });
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

  queryChildrenByPath: function(nodePath, query, excludeSelf, callback) {
    var pathQuery = {$or: [
      {parent: new RegExp('^' + escapeStringRegexp(nodePath) + '(\/.*|)$')}
    ]};

    if(!excludeSelf) {
      var name = utility.getNameFromPath(nodePath);
      var parent = utility.getParentFromPath(nodePath);

      pathQuery['$or'].push({$and: [{name, parent}]});
    }

    this.db.find({$and: [pathQuery, query]}, (err, docs) => {
      callback(err, docs || []);
    });
  }
}

module.exports = syncDb;
