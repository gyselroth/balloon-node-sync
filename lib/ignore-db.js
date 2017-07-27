var path = require('path');
var async = require('async');
var nedb = require('nedb');

var utility = require('./utility.js');
var connected = false;

var syncDb = {
  isConnected: function() {
    return connected;
  },

  connect: function(dbPath, callback) {
    this.db = new nedb({
      inMemoryOnly: true,
      autoload: true,
      onload: (err) => {
        callback(err);
      }
    });

    this.db.ensureIndex({fieldName: 'id'});
    this.db.ensureIndex({fieldName: 'path'});

    connected = true;
  },

  getDb: function() {
    return this.db;
  },

  isIgnoredPath: function(path, callback) {
    var pathParts = path.replace(/^\/+|\/+$/, '').split('/');

    var curPathParts = [];
    var $or = [];

    while(pathParts.length > 0) {
      curPathParts.push(pathParts.shift());
      var curPath = '/' + curPathParts.join('/');

      $or.push({path: curPath});
    }

    this.db.findOne({$or}, (err, foundNode) => {
      if(err) return callback(err);

      callback(null, foundNode !== null);
    });
  },

  insertNodes: function(nodes, callback) {
    async.eachLimit(nodes, 10, (node, cb) => {
      this.db.insert(node, cb);
    }, callback);
  }
}

module.exports = syncDb;
