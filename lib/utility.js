var fs = require('fs');
var path = require('path');

var unorm = require('unorm');
var uuid4 = require('uuid4');
var dateFormat = require('dateformat');

var config = require('./config.js');

var utility = {
  uuid4: function() {
    //wrapping uuid4 so it can be stubed in tests
    return uuid4();
  },

  joinPath: function() {
   return path.posix.join.apply(this, arguments);
  },

  namesAreEqual: function(name1, name2) {
    return name1 === name2;
  },

  hasInvalidChars: function(name) {
    return /[\x00-\x1F\x7F\\<>:"/\*\?\|]/.test(name);
  },

  isExcludeFile: function(name) {
    var excludePattern = new RegExp(/^(\.DS_Store|Thumbs\.db|desktop\.ini|\.(.*)\.(swpx|swp|swx)|\.dat(.*)|~lock\.(.*)#|\._(.*))$/i);
    return excludePattern.test(name);
  },

  getNameFromPath: function(nodePath) {
    return nodePath.split('/').pop();
  },

  getNodeFsPath: function(nodePath) {
    //here path.join is used, to create fs specific paths
    return path.join(config.get('balloonDir'), nodePath);
  },

  getParentFromPath: function(nodePath) {
    var nodePath = nodePath.replace(config.get('balloonDir'), '');

    return this.joinPath('/', nodePath, '..');
  },

  getFileNameParts: function(name) {
    var tmp = name.split('.');

    if(tmp.length === 1 || (tmp[0] === '' && tmp.length === 2)) {
      return {name: name, ext: ''};
    } else {
      var ext = tmp.pop();
      return {name: tmp.join('.'), ext: ext}
    }
  },

  renameConflictNode: function(parent, name) {
    var newFilename;
    var filenameParts = utility.getFileNameParts(name);

    var filename = filenameParts.name;
    var username = config.get('username') ? config.get('username') + '-' : '';
    var dateString = dateFormat(new Date(), "dd.mm.yyyy-HH.MM");
    var extension = (filenameParts.ext !== '' ? '.' + filenameParts.ext : '');
    var versionNumber = 0;
    var version = '';

    while(true) {
      if(versionNumber > 0) version = ' (' + versionNumber + ')';
      var newFilename = filename + '-conflict-' + username + dateString + version + extension;
      var nodeFsPath = this.getNodeFsPath(this.joinPath(parent, newFilename));

      if(!fs.existsSync(nodeFsPath)) break;

      versionNumber++;
    }

    return newFilename;
  },

  renameReadonlyConflictCollection: function(name) {
    return name + '-readonlyconflicts';
  },

  renameConflictNodeRemote: function(name) {
    var newFilename;
    var filenameParts = utility.getFileNameParts(name);

    var filename = filenameParts.name;
    var dateString = dateFormat(new Date(), "dd.mm.yyyy-HH.MM");
    var extension = (filenameParts.ext !== '' ? '.' + filenameParts.ext : '');

    return filename + '-conflict-remote-' + dateString + extension;
  },

  decodeFilenames: function(filenames) {
    return filenames.map(filename => { return this.decodeFilename(filename)});
  },

  decodeFilename: function(filename) {
    if(process.platform === 'darwin') {
      filename = unorm.nfc(filename);
    }

    return filename;
  },

  nodeContentChanged: function(stat, syncedNode) {
    if(stat.isDirectory() === true) return false;

    if(stat.mtime.getTime() !== syncedNode.mtime.getTime() || stat.size !== syncedNode.size) return true;

    return false;
  }
}

module.exports = utility;
