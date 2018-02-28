var fs = require('fs');
var path = require('path');
var stream = require('stream');
var extend = require('util')._extend;

var md5 = require('md5');

var async = require('async');

var utility = require('../../../lib/utility.js');


module.exports = function(pathFixtures) {
  var localFiles = require(path.join(pathFixtures, 'local-fs.json'));
  var tempfiles = {};
  var nextIno = 0;

  var curTime = new Date();
  var fakeTime = (new Date(curTime.getTime() - (curTime.getTimezoneOffset() * 60 * 1000))).toISOString();


  //get highest inoIndex;
  Object.keys(localFiles).forEach((parent) => {
    var files = localFiles[parent];
    files.forEach((file) => {
      if(file.stat.ino > nextIno) nextIno = file.stat.ino;
    });
  });

  //next ino must be higher then actual highest
  nextIno++;

  function findNodeByName(nodes, name) {
    var node = nodes.find(function(node) {
      return node.name === name;
    });

    return cloneNode(node);
  }

  function findNodeIndexByName(nodes, name) {
    return nodes.findIndex(function(node) {
      return node.name === name;
    });
  }

  var fsWrap = {
    createReadStream: function(filename, options) {
      if(!this.existsSync(filename)) {
        var err = new Error('no such file or directory, createReadStream ' + filename);
        err.code = 'ENOENT';
        throw err;
      }

      return stream.Readable;
    },

    createWriteStream: function(filename, options) {
      var name = utility.getNameFromPath(filename);
      var parent = utility.getParentFromPath(filename);

      if(!this.existsSync(parent)) {
        var err = new Error('no such file or directory, createWriteStream ' + parent);
        err.code = 'ENOENT';
        throw err;
      }

      var ino = nextIno+"";
      var ctime = fakeTime;

      if(this.existsSync(filename)) {
        var stat = this.lstatSync(filename);

        if(stat.isDirectory()) {
          var err = new Error('open \'' + filename + '\'');
          err.code = 'EISDIR';
          throw err;
        } else {
          var oldNode = findNodeByName(localFiles[parent], name);

          if(oldNode.isWritable === false) {
            var err = new Error('operation not permited, write ' + utility.joinPath(parent, name));
            err.code = 'EPERM';
            throw err;
          }

          ino = oldNode.stat.ino;
          ctime = oldNode.stat.ctime;
          removeNode(oldNode);
        }
      } else {
        nextIno++;
      }

      if(!localFiles[parent]) localFiles[parent] = [];
      localFiles[parent].push({name: name, stat: {ino: ino, ctime: ctime, mtime: fakeTime, size: 2}, parent: parent, directory: false});


      return stream.Writable;
    },

    existsSync: function(filename) {
      var name = utility.getNameFromPath(filename);
      var parent = utility.getParentFromPath(filename);

      return (
        (name === '' && parent === '/')
        ||
        (localFiles[parent] !== undefined && findNodeByName(localFiles[parent], name) !== undefined)
      );
    },

    renameSync: function(oldPath, newPath) {
      var oldName = utility.getNameFromPath(oldPath);
      var oldParent = utility.getParentFromPath(oldPath);

      var newName = utility.getNameFromPath(newPath);
      var newParent = utility.getParentFromPath(newPath);

      var oldNode = findNodeByName(localFiles[oldParent], oldName);

      if(oldNode.isBusy) {
        var err = new Error('rename \'' + utility.joinPath(oldNode.parent, oldNode.name) + '\'');
        err.code = 'EBUSY';
        throw err;
      }

      var newNode = cloneNode(oldNode);

      newNode.parent = newParent;
      newNode.name = newName;

      removeNode(oldNode);

      if(!localFiles[newParent]) localFiles[newParent] = [];
      localFiles[newParent].push(newNode);

      if(oldNode.directory) {
        this.readdirSync(oldPath).forEach((node) => {
          var oldNodePath = utility.joinPath(oldPath, node);
          var newNodePath = utility.joinPath(newPath, node);
          this.renameSync(oldNodePath, newNodePath);
        });
      }

      return;
    },

    rename: function(oldPath, newPath, callback) {
      this.renameSync(oldPath, newPath);

      return callback(null);
    },

    unlinkSync: function(filename) {
      if(!this.existsSync(filename)) {
        var err = new Error('no such file or directory, unlink \'' + filename + '\'');
        err.code = 'ENOENT';
        throw err;
      }

      var stat = this.lstatSync(filename);

      if(stat.isDirectory()) {
        var err = new Error('operation not permitted, unlink \'' + filename + '\'');
        err.code = 'EPERM';
        throw err;
      }

      var name = utility.getNameFromPath(filename);
      var parent = utility.getParentFromPath(filename);
      var node = findNodeByName(localFiles[parent], name);
      removeNode(node);
    },

    unlink: function(filename, callback) {
      try {
        this.unlinkSync(filename);
        callback(null);
      } catch(err) {
        callback(err);
      }
    },

    rmdirSync: function(dirPath) {
      if(!this.existsSync(dirPath)) {
        var err = new Error('no such file or directory, rmdir \'' + dirPath + '\'');
        err.code = 'ENOENT';
        throw err;
      }

      var stat = this.lstatSync(dirPath);

      if(stat.isDirectory() === false) {
        var err = new Error('not a directory, rmdir \'' + dirPath + '\'');
        err.code = 'ENOTDIR';
        throw err;
      }

      if(localFiles[dirPath] && localFiles[dirPath].length > 0) {
        var err = new Error('directory not empty, rmdir \'' + dirPath + '\'');
        err.code = 'ENOTEMPTY';
        throw err;
      }

      var name = utility.getNameFromPath(dirPath);
      var parent = utility.getParentFromPath(dirPath);
      var node = findNodeByName(localFiles[parent], name);
      removeNode(node);
    },

    rmdir: function(dirPath, callback) {
      try {
        this.rmdirSync(dirPath);
        callback(null);
      } catch(err) {
        callback(err);
      }
    },

    lstatSync: function(filename) {
      if(!this.existsSync(filename)) {
        var err = new Error('no such file or directory ' + filename);
        err.code = 'ENOENT';
        throw err;
      }

      var name = utility.getNameFromPath(filename);
      var parent = utility.getParentFromPath(filename);

      var node = findNodeByName(localFiles[parent], name);

      return {
        isDirectory: function() {
          return node.directory;
        },
        isFile: function() {
          return !node.directory;
        },
        isSymbolicLink: function() {
          return false;
        },
        ctime: new Date(node.stat.ctime),
        mtime: new Date(node.stat.mtime),
        size: node.stat.size,
        ino: node.stat.ino
      };
    },

    md5FileSync: function(filename) {
      if(!this.existsSync(filename)) {
        var err = new Error('no such file or directory ' + filename);
        err.code = 'ENOENT';
        throw err;
      }

      var name = utility.getNameFromPath(filename);
      var parent = utility.getParentFromPath(filename);

      var node = findNodeByName(localFiles[parent], name);

      return md5(node.parent + node.name + node.size);
    },

    mkdir: function(dirPath, callback) {
      var name = utility.getNameFromPath(dirPath);
      var parent = utility.getParentFromPath(dirPath);

      if(!this.existsSync(parent)) {
        var err = new Error('no such file or directory, mkdir ' + dirPath);
        err.code = 'ENOENT';
        return callback(err);
      }

      if(this.existsSync(dirPath)) {
        var err = new Error('file already exists, mkdir ' + dirPath);
        err.code = 'EEXIST';
        return callback(err);
      }

      if(!localFiles[parent]) localFiles[parent] = [];

      localFiles[parent].push({
        name: name,
        stat: {
          ino: nextIno+"",
          mtime: fakeTime,
          ctime: fakeTime,
          size: 2
        },
        parent: parent,
        directory: true
      });
      nextIno++;

      callback(null);
    },

    mkdirp: function(dirPath, callback) {
      var pathArr = dirPath.split('/').filter(node => {return node.length > 0});
      var currentPath = '/';
      var currentParent;
      var currentChild;

      async.whilst(
        () => {
          currentParent = currentPath;
          currentChild = pathArr.shift();

          return currentChild !== undefined;
        },
        (cb) => {
          currentPath = utility.joinPath(currentParent, currentChild);

          if(!this.existsSync(currentPath)) {
            return this.mkdir(currentPath, cb);
          }

          cb(null);
        },
        callback
      );
    },

    readdir: function(dirPath, callback) {
      return callback(null, readdirResult(dirPath));
    },

    readdirSync: function(dirPath) {
      return readdirResult(dirPath);
    },

    readTempdirSync: function(dirPath) {
      return [];
    },

    /** temporary files **/
    createWriteStreamTemp: function(filename, options) {
      var ino = nextIno+"";
      var ctime = fakeTime;

      nextIno++;

      tempfiles[filename] = {ino: ino, ctime: ctime, mtime: ctime, size: 2};

      return stream.Writable;
    },

    unlinkSyncTemp: function(filename) {
      if(!tempfiles[filename]) {
        var err = new Error('no such file or directory, unlink \'' + filename + '\'');
        err.code = 'ENOENT';
        throw err;
      }

      delete tempfiles[filename];
    },

    moveTempFile: function(filename, targetPath) {
      var tempPath = this.getTempPath(filename);
      var targetNodePath = utility.getNodeFsPath(targetPath);

      if(this.existsSync(targetPath)) this.unlinkSync(targetPath);

      var name = utility.getNameFromPath(targetPath);
      var parent = utility.getParentFromPath(targetPath);

      var newNode = {name: name, stat: tempfiles[filename], parent: parent, directory: false};

      if(!localFiles[parent]) localFiles[parent] = [];
      localFiles[parent].push(newNode);

      return
    }
  }

  function readdirResult(dirPath) {
    return (localFiles[dirPath] || []).map((node) => {
      return node.name;
    });
  }

  function removeNode(node) {
    var oldNodeIndex = findNodeIndexByName(localFiles[node.parent], node.name);

    localFiles[node.parent].splice(oldNodeIndex, 1);
    if(localFiles[node.parent].length === 0) delete localFiles[node.parent];
  }

  function cloneNode(node) {
    return node !== undefined ? extend({}, node) : undefined;
  }

  return {
    mock: fsWrap,
    getFiles: function() {
      var sortedFiles = {};

      Object.keys(localFiles).forEach((key) => {
        sortedFiles[key] = localFiles[key].sort((a, b) => {
          if(a.name !== b.name) return a.name < b.name ? -1 : 1;
          return 0;
        });
      });

      return sortedFiles;
    }
  };
};
