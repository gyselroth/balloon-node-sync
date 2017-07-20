var fs = require('fs');
var path = require('path');
var extend = require('util')._extend;
var nedb = require('nedb');

var async = require('async');

var utility = require('../../../lib/utility.js');

var databasePath = path.join(__dirname, 'db');
var pathTmpCollectionFile = path.join(databasePath, 'nodes.db');
var nextAutoIncrement = 0;
var db;

module.exports = function(pathFixtures) {
  var syncDb = {
    isConnected: function() {
      return true;
    },

    connect: function(dbPath, callback) {
      var actualDb = require(path.join(pathFixtures, 'local-synced.json'));
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

            node.mtime = new Date(node.mtime);
            node.ctime = new Date(node.ctime);

            this.db.insert(node, cb);
          }, (err, results) => {
            callback(err);
          });
        }
      });
    },

    create: function(newNode, callback) {
      newNode._id = getAutoIncrement();

      this.db.insert(newNode, function (err, createdNode) {
        callback(err, createdNode || undefined);
      });
    }
  }

  function getAutoIncrement() {
    var autoIncrement = nextAutoIncrement+"";
    nextAutoIncrement++;

    return autoIncrement;
  }

  return {
    mock: syncDb,
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
        if(docs) {
          nodes = docs.map((node) => {
            if(node.ctime) node.ctime = node.ctime.toJSON();
            if(node.mtime) node.mtime = node.mtime.toJSON();

            return node;
          });
        }

        callback(null, nodes);
      });
    }
  };
};
