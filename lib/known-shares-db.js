var path = require('path');
var nedb = require('nedb');

var utility = require('./utility.js');
var connected = false;

var knownSharesDb = {
  isConnected: function() {
    return connected;
  },

  getCollectionPath: function(dbPath) {
    return path.join(dbPath, 'known-shares.db');
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

    connected = true;
  },

  getDb: function() {
    return this.db;
  },

  find: function(query, callback) {
    this.db.find(query, callback);
  },

  insert: function(node, callback) {
    this.db.insert(node, callback);
  }
}

module.exports = knownSharesDb;
