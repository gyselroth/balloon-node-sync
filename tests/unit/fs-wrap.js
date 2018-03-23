var fs = require('fs');
var path = require('path');
var assert = require('chai').assert;
var sinon = require('sinon');
var mockdate = require('mockdate');


var config = require('../../lib/config.js');
var fsWrap = require('../../lib/fs-wrap.js');

config.setAll({
  balloonDir: '/Users/username/Balloon',
  configDir: '~/',
  username: 'username'
});

describe('fsWrap', function() {
  before(function() {
    mockdate.set('1/20/2017');
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
      var node = {
        directory: nodeToReturn.directory,
        ctime: new Date(nodeToReturn.ctime),
        mtime: new Date(nodeToReturn.mtime),
        size: nodeToReturn.size
      };

      if(nodeToReturn.hash) node.hash = nodeToReturn.hash;

      return node;
    };

    sinon.stub(fsWrap, 'md5FileSync', function() {
      return '5a105e8b9d40e1329780d62ea2265d8a';
    });

    var nodePath = '/a/a.txt';

    it('should return false if node is a file and neither mtime nor size have changed', function() {
      var stat = statMockFactory({directory: false, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2});
      var node = nodeMockFactory({directory: false, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2, hash: '5a105e8b9d40e1329780d62ea2265d8a'});
      var result = fsWrap.nodeContentChanged(stat, node, nodePath);

      assert.isFalse(result);
    });

    it('should return false if node is a directory, even if size has changed', function() {
      var stat = statMockFactory({directory: true, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2});
      var node = nodeMockFactory({directory: true, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 3});
      var result = fsWrap.nodeContentChanged(stat, node, nodePath);

      assert.isFalse(result);
    });

    it('should return false if node is a directory, even if mtime has changed', function() {
      var stat = statMockFactory({directory: true, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2});
      var node = nodeMockFactory({directory: true, mtime: '2017-01-20T14:12:15.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2});
      var result = fsWrap.nodeContentChanged(stat, node, nodePath);

      assert.isFalse(result);
    });

    it('should return true if node is a file, mtime has changed and hash has changed', function() {
      var stat = statMockFactory({directory: false, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2});
      var node = nodeMockFactory({directory: false, mtime: '2017-01-20T14:12:15.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2, hash: '5a105e8b9d40e1329780d62ea2265d8f'});
      var result = fsWrap.nodeContentChanged(stat, node, nodePath);

      assert.isTrue(result);
    });

    it('should return true if node is a file, mtime has changed but hash has not changed', function() {
      var stat = statMockFactory({directory: false, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2});
      var node = nodeMockFactory({directory: false, mtime: '2017-01-20T14:12:15.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2, hash: '5a105e8b9d40e1329780d62ea2265d8a'});
      var result = fsWrap.nodeContentChanged(stat, node, nodePath);

      assert.isFalse(result);
    });

    it('should return true if node is a file, size has changed and hash has changed', function() {
      var stat = statMockFactory({directory: false, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2});
      var node = nodeMockFactory({directory: false, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 3, hash: '5a105e8b9d40e1329780d62ea2265d8f'});
      var result = fsWrap.nodeContentChanged(stat, node, nodePath);

      assert.isTrue(result);
    });

    it('should return true if node is a file, size has changed but hash has not changed', function() {
      var stat = statMockFactory({directory: false, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 2});
      var node = nodeMockFactory({directory: false, mtime: '2017-01-20T14:12:14.000Z', ctime: '2017-01-20T14:12:14.000Z', size: 3, hash: '5a105e8b9d40e1329780d62ea2265d8a'});
      var result = fsWrap.nodeContentChanged(stat, node, nodePath);

      assert.isFalse(result);
    });
  });

  after(function() {
    mockdate.reset();
  });

});
