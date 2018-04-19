var fs = require('fs');
var path = require('path');
var extend = require('util')._extend;
var nedb = require('nedb');

var async = require('async');

var utility = require('../../../lib/utility.js');

var databasePath = path.join(__dirname, 'db');
var pathTmpCollectionFile = path.join(databasePath, 'ignore-db.db');
var nextAutoIncrement = 0;
var db;

module.exports = function(pathFixtures) {
  var ignoreDb = {
    isConnected: function() {
      return true;
    },

    getCollectionPath: function(dbPath) {
      return path.join(pathFixtures, 'local-ignore-db.json');
    },

    connect: function(dbPath, callback) {
      var pathCollection = this.getCollectionPath(dbPath);
      var actualDb = [];

      if(fs.existsSync(pathCollection)) {
        actualDb = require(pathCollection);
      }

      nextAutoIncrement = actualDb.length;

      if(fs.existsSync(databasePath) === false) {
        fs.mkdirSync(databasePath);
      }

      if(fs.existsSync(pathTmpCollectionFile)) {
        fs.unlinkSync(pathTmpCollectionFile);
      }

      this.db = db = new nedb({
        filename: pathTmpCollectionFile,
        autoload: true,
        onload: (err) => {
          async.mapLimit(actualDb, 5, (node, cb) => {
            this.db.insert(node, cb);
          }, (err, results) => {
            callback(err);
          });
        }
      });
    },

    insert: function(node, callback) {
      node._id = getAutoIncrement();

      this.db.insert(node, callback);
    },
  }

  function getAutoIncrement() {
    var autoIncrement = nextAutoIncrement+"";
    nextAutoIncrement++;

    return autoIncrement;
  }

  return {
    mock: ignoreDb,
    tearDown: function() {
      if(fs.existsSync(pathTmpCollectionFile)) {
        fs.unlinkSync(pathTmpCollectionFile);
      }

      if(fs.existsSync(databasePath) === false) {
        fs.rmdirSync(databasePath);
      }

      db = undefined;
      nextAutoIncrement = 0
    },
    getNodeList: function(callback) {
      return db.find({}).sort({_id: 1}).exec((err, docs) => {
        var nodes = [];

        if(docs) {
          nodes = docs;
        }

        callback(null, nodes);
      });
    }
  };
};
