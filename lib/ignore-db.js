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
    return path.join(dbPath, 'ignored.db');
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

    this.db.ensureIndex({fieldName: 'remoteId'});
    this.db.ensureIndex({fieldName: 'remotePath'});

    connected = true;
  },

  getDb: function() {
    return this.db;
  },

  isIgnoredNode: function(query, callback) {
    var $or = [];

    if(query.remoteId) $or.push({remoteId: query.remoteId});

    if(query.path) {
      var pathParts = query.path.replace(/^\/+|\/+$/, '').split('/');
      var curPathParts = [];

      while(pathParts.length > 0) {
        curPathParts.push(pathParts.shift());
        var curPath = '/' + curPathParts.join('/');

        $or.push({remotePath: curPath});
      }
    }

    //if neither path nor id is given, node is not ignored
    if($or.length === 0) return callback(null, false);

    this.db.findOne({$or}, (err, foundNode) => {
      if(err) return callback(err);

      callback(null, foundNode !== null);
    });
  },

  updateRemotePaths: function(nodes, callback) {
    async.eachLimit(nodes, 10, (node, cb) => {
      this.db.update({'remoteId': node.id}, {$set: {remotePath: node.path}}, cb);
    }, callback);
  },

  getIgnoredRemoteIds: function(callback) {
    this.db.find({}, (err, nodes) => {
      if(err) return callback(err);

      const ignoredRemoteIds = nodes.map(node => {
        return node.remoteId;
      });

      callback(null, ignoredRemoteIds);
    });
  },

  add: function(node, callback) {
    async.series([
      (cb) => {
        //remove all children of newly ignored node from db
        const query = {
          path : new RegExp('^' + escapeStringRegexp(node.path) + '(\/.*|)$')
        };

        this.db.remove(query, {multi: true}, cb);
      },
      (cb) => {
        //add current node
        this.insert({remoteId: node.remoteId, path: node.path}, cb);
      }
    ], callback);
  },

  find: function(query, callback) {
    this.db.find(query, callback);
  },

  insert: function(node, callback) {
    this.db.insert(node, callback);
  },

  remove: function(query, options, callback) {
    if(!!(options && options.constructor && options.call && options.apply)) {
      callback = options;
      options = {};
    }

    this.db.remove(query, options, callback);
  }
}

module.exports = syncDb;
