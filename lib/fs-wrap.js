var fs = require('./fs.js');
var {mkdirp} = require('fs-extra')
var path = require('path');

var md5File = require('md5-file');

var config = require('./config.js');
var utility = require('./utility.js');
var logger = require('./logger.js');

var lstatSync = function(nodePath) {
  var stat = fs.lstatSync(nodePath, {bigint: true});

  //string, as we can't insert bigints into db
  stat.ino = stat.ino.toString();

  return stat;
}


var fsWrap = {
  /** General Methods **/
  rmdirRecursiveSync: function(dirPath) {
    logger.info('FS: remove directory recursive', dirPath);

    if(this.existsSync(dirPath)) {
      this.readdirSync(dirPath).forEach((file, index) => {
        var currentPath = utility.joinPath(dirPath, file);

        if(this.lstatSync(currentPath).isDirectory()) { // recurse
          this.rmdirRecursiveSync(currentPath);
        } else { // delete file
          this.unlinkSync(currentPath);
        }
      });

      this.rmdirSync(dirPath);
    }
  },

  createReadStream: function(filename, options) {
    var nodePath = utility.getNodeFsPath(filename);
    return fs.createReadStream(nodePath, options);
  },

  createWriteStream: function(filename, options) {
    var nodePath = utility.getNodeFsPath(filename);
    return fs.createWriteStream(nodePath);
  },

  existsSync: function(filename) {
    var nodePath = utility.getNodeFsPath(filename);

    return fs.existsSync(nodePath);
  },

  rename: function(oldPath, newPath, callback) {
    logger.info('FS: rename node', oldPath, newPath);

    var oldNodePath = utility.getNodeFsPath(oldPath);
    var newNodePath = utility.getNodeFsPath(newPath);

    return fs.rename(oldNodePath, newNodePath, callback);
  },

  renameSync: function(oldPath, newPath) {
    logger.info('FS: rename node', oldPath, newPath);

    var oldNodePath = utility.getNodeFsPath(oldPath);
    var newNodePath = utility.getNodeFsPath(newPath);

    return fs.renameSync(oldNodePath, newNodePath);
  },

  unlinkSync: function(filename) {
    logger.info('FS: unlink file', filename);

    var nodePath = utility.getNodeFsPath(filename);

    return fs.unlinkSync(nodePath);
  },

  unlink: function(filename, callback) {
    logger.info('FS: unlink file', filename);

    var nodePath = utility.getNodeFsPath(filename);

    fs.unlink(nodePath, callback);
  },

  rmdirSync: function(filename) {
    logger.info('FS: remove directory', filename);

    var nodePath = utility.getNodeFsPath(filename);

    return fs.rmdirSync(nodePath);
  },

  rmdir: function(filename, callback) {
    logger.info('FS: remove directory', filename);

    var nodePath = utility.getNodeFsPath(filename);

    return fs.rmdir(nodePath, callback);
  },

  lstatSync: function(filename) {
    var nodePath = utility.getNodeFsPath(filename);

    return lstatSync(nodePath);
  },

  nodeContentChanged: function(stat, syncedNode, nodePath) {
    if(stat.isDirectory() === true) return false;

    if(syncedNode.mtime && syncedNode.size && stat.mtime.getTime() === syncedNode.mtime.getTime() && stat.size === syncedNode.size) return false;

    return !(syncedNode.hash && this.md5FileSync(nodePath) === syncedNode.hash);
  },

  /** File Methods **/
  md5FileSync: function(filename) {
    var nodePath = utility.getNodeFsPath(filename);

    return md5File.sync(nodePath);
  },

  /** Directory Methods **/
  mkdir: function(dirPath, callback) {
    logger.info('FS: mkdir', dirPath);

    var nodePath = utility.getNodeFsPath(dirPath);

    return fs.mkdir(nodePath, callback);
  },

  mkdirp: function(dirPath, callback) {
    logger.info('FS: mkdirp', dirPath);

    var nodePath = utility.getNodeFsPath(dirPath);

    return mkdirp(nodePath, callback);
  },

  readdir: function(dirPath, callback) {
    var nodePath = utility.getNodeFsPath(dirPath);

    return fs.readdir(nodePath, (err, nodes) => {
      if(err) return callback(err);

      callback(null, utility.decodeFilenames(nodes));
    });
  },

  readdirSync: function(dirPath) {
    var nodePath = utility.getNodeFsPath(dirPath);
    var nodes = fs.readdirSync(nodePath);

    return utility.decodeFilenames(nodes);
  },

  /** temporary files **/
  getTempPath: function(filename) {
    return path.join(config.get('instanceDir'), 'temp', filename);
  },

  readTempdirSync: function(dirPath) {
    var tempPath = this.getTempPath('/');
    var files = fs.readdirSync(tempPath);

    return files;
  },

  createWriteStreamTemp: function(filename, options) {
    var tempPath = this.getTempPath(filename);
    return fs.createWriteStream(tempPath, options);
  },

  unlinkSyncTemp: function(filename) {
    logger.info('FS: unlink temporary file', filename);

    var tempPath = this.getTempPath(filename);

    return fs.unlinkSync(tempPath);
  },

  existsSyncTemp: function(filename) {
    var tempPath = this.getTempPath(filename);

    return fs.existsSync(tempPath);
  },

  lstatSyncTemp: function(filename) {
    var tempPath = this.getTempPath(filename);

    return lstatSync(tempPath);
  },

  moveTempFile: function(filename, targetPath) {
    logger.info('FS: move temp file to node', {filename, targetPath});

    if(this.existsSync(targetPath)) this.unlinkSync(targetPath);

    var tempPath = this.getTempPath(filename);
    var targetNodePath = utility.getNodeFsPath(targetPath);

    try {
      fs.renameSync(tempPath, targetNodePath);
    } catch(err) {
      if(err.code === 'EXDEV') {
        //if temp file and target are not on same drive we need to copy the file with streams
        var src = fs.createReadStream(tempPath);
        var target = fs.createWriteStream(targetNodePath);

        src.on('end', function() {
          fs.unlinkSync(tempPath);
        });

        src.pipe(target);
      } else {
        var srcExists = fs.existsSync(tempPath);
        var targetParentExists = this.existsSync(path.join(targetPath, '..'));

        var errorMessage = `Could not move temp file '${tempPath}' to Balloon '${targetPath}'`;
        logger.error(errorMessage, {code: err.code, message: err.message, targetParentExists, srcExists});
        throw err;
      }
    }
  }
}

module.exports = fsWrap;
