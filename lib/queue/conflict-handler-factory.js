var async = require('async');
var escapeStringRegexp = require('escape-string-regexp');

var fsWrap = require('../fs-wrap.js');
var syncDb = require('../sync-db.js');
var utility = require('../utility.js');

var conflictHandlerFactory = function(actionQueue, transferQueue) {
  var conflictHandler = {
    renameConflictNode: function(node, callback) {
      // currently only renames node localy, needs a second sync to rename it remotely
      var currentPath = utility.joinPath(node.parent, node.name);
      var newNodeName = utility.renameConflictNode(node.parent, node.name);
      var newPath = utility.joinPath(node.parent, newNodeName);

      if(node.directory) {
        //if node is a directory, we need to remove all other queued tasks for children of this directory;
        actionQueue.remove((testData) => {
          var testNode = (testData.data && testData.data.node) ? testData.data.node : undefined;

          if(!testNode) return false;

          var regex = new RegExp('^' + escapeStringRegexp(currentPath) + '(\/.*|)$');

          return regex.test(testNode.parent);
        });
      }

      async.parallel([
        (cb) => {
          fsWrap.rename(currentPath, newPath, cb);
        },
        (cb) => {
          node = this.revertLocalRenameMove(node);
          syncDb.update(node._id, node, cb);
        }
      ], callback);
    },

    revertLocalRenameMove: function(node) {
      var lActions = node.localActions;

      if(lActions.rename) {
        node.name = lActions.rename.oldName;
      }

      if(lActions.move) {
        node.parent = lActions.move.oldParent;
      }

      return node;
    }

  }

  return conflictHandler;
}

module.exports = conflictHandlerFactory;
