var fs = require('fs');
var path = require('path');
var assert = require('chai').assert;
var sinon = require('sinon');
var mockdate = require('mockdate');


var config = require('../../lib/config.js');
var utility = require('../../lib/utility.js');

config.setAll({
  balloonDir: '/Users/username/Balloon',
  configDir: '~/',
  username: 'username'
});

describe('utility', function() {
  before(function() {
    mockdate.set('1/20/2017');
  });

  describe('joinPath', function() {
    it('should join the given path segments with a posix separator', function() {
      var result = utility.joinPath('a', 'b', '/c');

      assert.equal(result, 'a/b/c');
    });
  });

  describe('isExcludeFile', function() {
    it('should exclude .DS_Store files', function() {
      var result = utility.isExcludeFile('.DS_Store');

      assert.equal(result, true);
    });

    it('should exclude Thumbs.db files', function() {
      var result = utility.isExcludeFile('Thumbs.db');

      assert.equal(result, true);
    });

    it('should exclude desktop.ini files', function() {
      var result = utility.isExcludeFile('desktop.ini');

      assert.equal(result, true);
    });

    var vimTempFiles = {'swpx': '.filename.swpx', 'swp': '.filename.swp', 'swx': '.filename.swx'};

    Object.keys(vimTempFiles).forEach((key) => {
      it('should exclude ViM temporary ' + key + ' files', function() {
        var result = utility.isExcludeFile(vimTempFiles[key]);

        assert.equal(result, true);
      });
    });

    it('should exclude smultron dat files', function() {
      var result = utility.isExcludeFile('.datfilename');

      assert.equal(result, true);
    });

    it('should exclude win7 lock files', function() {
      var result = utility.isExcludeFile('~lock.filename#');

      assert.equal(result, true);
    });

    it('should exclude osx resource forks', function() {
      var result = utility.isExcludeFile('._filename.txt');

      assert.equal(result, true);
    });

    var validFilenames = [
      '.DS_Store-conflict',
      'lodash._baseassign',
      'test.datatypes.js',
      '.gitignore'
    ];

    validFilenames.forEach((filename) => {
      it('should not exclude '+ filename, function() {
        var result = utility.isExcludeFile(filename);

        assert.equal(result, false);
      });
    });
  });

  describe('getNodeFsPath', function() {
    it('should return the full path', function() {
      var result = utility.getNodeFsPath('/a/b/c');

      assert.equal(result, path.join(config.get('balloonDir'), '/a/b/c'));
    });
  });

  describe('getParentFromPath', function() {
    it('should return the path with leading /', function() {
      var result = utility.getParentFromPath('a/b/c')

      assert.equal(result, '/a/b');
    });

    it('should return / if path is /', function() {
      var result = utility.getParentFromPath('/')

      assert.equal(result, '/');
    });

    it('should remove balloonDir from path', function() {
      var result = utility.getParentFromPath('/Users/username/Balloon/a')

      assert.equal(result, '/');
    });

    it('should not double leading /', function() {
      var result = utility.getParentFromPath('/c/a')

      assert.equal(result, '/c');
    });
  });

  describe('getFileNameParts', function() {
    it('should return the a hash with name and extension', function() {
      var result = utility.getFileNameParts('a.txt');

      assert.deepEqual(result, {name: 'a', ext: 'txt'});
    });

    it('should return the a hash with name and empty extension for dot files', function() {
      var result = utility.getFileNameParts('.gitignore');

      assert.deepEqual(result, {name: '.gitignore', ext: ''});
    });

    it('should return the a hash with name and empty extension for files without extension', function() {
      var result = utility.getFileNameParts('a');

      assert.deepEqual(result, {name: 'a', ext: ''});
    });

    it('should allow dots in file name', function() {
      var result = utility.getFileNameParts('a.edited.txt');

      assert.deepEqual(result, {name: 'a.edited', ext: 'txt'});
    });
  });

  describe('renameConflictNode', function() {
    before(function() {

      sinon.stub(fs, 'existsSync', function(filename) {
        var presentFiles = [
          '/Users/username/Balloon/b-conflict-username-20.01.2017-00.00.txt',
          '/Users/username/Balloon/c-conflict-username-20.01.2017-00.00.txt',
          '/Users/username/Balloon/c-conflict-username-20.01.2017-00.00 (1).txt'
        ]

        return presentFiles.includes(filename);
      });
    });

    it('should append conflicting and username to filename', function() {
      var result = utility.renameConflictNode('/', 'a.txt');

      assert.equal(result, 'a-conflict-username-20.01.2017-00.00.txt');
    });

    it('should append add a version number if file already exists', function() {
      var result = utility.renameConflictNode('/', 'b.txt');

      assert.equal(result, 'b-conflict-username-20.01.2017-00.00 (1).txt');
    });

    it('should append add increase version number if file already exists', function() {
      var result = utility.renameConflictNode('/', 'c.txt');

      assert.equal(result, 'c-conflict-username-20.01.2017-00.00 (2).txt');
    });

    after(function() {
      sinon.restore(fs, 'existsSync');
    });
  });

  describe('renameReadonlyConflictCollection', function() {
    it('should append readonlyconflicts to collectionname', function() {
      var result = utility.renameReadonlyConflictCollection('a');

      assert.equal(result, 'a-readonlyconflicts');
    });
  });

  describe('hasInvalidChars', function() {
    var invalidChars = ['\\', '<', '>', ':', '"', '/', '*', '?', '|', '\n', '\r'];

    invalidChars.forEach(function(invalidChar) {
      it('should return true if filename contains ' + invalidChar, function() {
        var result = utility.hasInvalidChars('test-' + invalidChar + '-file.txt');

        assert.isTrue(result);
      });
    });

    it('should return false if filename contains no ivalid chars', function() {
      var result = utility.hasInvalidChars('test-file.txt');

      assert.isFalse(result);
    });
  });

  describe('nodeContentChanged', function() {
    var statMockFactory = function(statToReturn) {
      return {
        isDirectory: function() {
          return statToReturn.directory;
        },
        isFile: function() {
          return !statToReturn.directory;
        },
        ctime: new Date(statToReturn.ctime),
        mtime: new Date(statToReturn.mtime),
        size: statToReturn.size
      };
    };

    var nodeMockFactory = function(nodeToReturn) {
      return {
        directory: nodeToReturn,
        ctime: new Date(statToReturn.ctime),
        mtime: new Date(statToReturn.mtime),
        size: statToReturn.size
      };
    };



    it('should return false if node is a file and neither mtime nor size have changed', function() {
      var stat = statMockFactory({directory: false, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2});
      var node = statMockFactory({directory: false, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2});
      var result = utility.nodeContentChanged(stat, node);

      assert.isFalse(result);
    });

    it('should return false if node is a directory, even if size has changed', function() {
      var stat = statMockFactory({directory: true, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2});
      var node = statMockFactory({directory: true, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 3});
      var result = utility.nodeContentChanged(stat, node);

      assert.isFalse(result);
    });

    it('should return false if node is a directory, even if mtime has changed', function() {
      var stat = statMockFactory({directory: true, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2});
      var node = statMockFactory({directory: true, mtime: '2017-01-20T14:12:15.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2});
      var result = utility.nodeContentChanged(stat, node);

      assert.isFalse(result);
    });

    it('should return true if node is a file and size has changed', function() {
      var stat = statMockFactory({directory: false, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2});
      var node = statMockFactory({directory: false, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 3});
      var result = utility.nodeContentChanged(stat, node);

      assert.isTrue(result);
    });

    it('should return true if node is a file and mtime has changed', function() {
      var stat = statMockFactory({directory: false, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2});
      var node = statMockFactory({directory: false, mtime: '2017-01-20T14:12:15.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2});
      var result = utility.nodeContentChanged(stat, node);

      assert.isTrue(result);
    });
  });

  after(function() {
    mockdate.reset();
  });

});
