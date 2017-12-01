var testFactory = require('./lib/test-factory.js');
var mockdate = require('mockdate');

describe('conflicts', function() {
  before(function() {
    mockdate.set('1/20/2017');
  });

  var tests = [
    {
      'title': 'remote rename takes precedence',
      'fixtures': 'conflicts/dir-1'
    },
    {
      'title': 'remote move takes precedence',
      'fixtures': 'conflicts/dir-2'
    },
    {
      'title': 'remote move and local rename are merged',
      'fixtures': 'conflicts/dir-3'
    },
    {
      'title': 'remote move and local rename of move target are merged',
      'fixtures': 'conflicts/dir-4'
    },
    {
      'title': 'remote create and local rename of parent dir are merged',
      'fixtures': 'conflicts/dir-5'
    },
    {
      'title': 'remote create and local move of parent dir are merged',
      'fixtures': 'conflicts/dir-6'
    },
    {
      'title': 'remote rename and local create of two different directories with the same target are resolved',
      'fixtures': 'conflicts/dir-7'
    },
    {
      'title': 'remote rename and local rename of two different directories with the same target are resolved',
      'fixtures': 'conflicts/dir-8'
    },
    {
      'title': 'remote delete dir and local create inside the remotely deleted dir are resolved',
      'fixtures': 'conflicts/dir-9'
    },
    //there are two possible versions how a recursive delete can be reflected in remote delta
    {
      'title': 'remote delete dir and local create inside the remotely deleted dir are resolved',
      'fixtures': 'conflicts/dir-9-2'
    },
    {
      'title': 'remote rename and local rename of two different directories with the same target are resolved',
      'fixtures': 'conflicts/dir-10'
    },
    {
      'title': 'local delete and re create of a dirctory is resolved',
      'fixtures': 'conflicts/dir-11'
    },
    {
      'title': 'remote delete of a directory and local move to remotely deleted directory are resolved',
      'fixtures': 'conflicts/dir-12'
    },
    //there are two possible versions how a recursive delete can be reflected in remote delta
    {
      'title': 'remote delete of a directory and local move to remotely deleted directory are resolved',
      'fixtures': 'conflicts/dir-12-2'
    },
    {
      'title': 'local move and re create of a directory are resolved',
      'fixtures': 'conflicts/dir-13'
    },
    {
      'title': 'local move and re create of a directory are resolved',
      'fixtures': 'conflicts/dir-14'
    },
    {
      'title': 'local delete and re create of a directory are resolved',
      'fixtures': 'conflicts/dir-15'
    },
    {
      'title': 'remote delete and re create of a directory is resolved',
      'fixtures': 'conflicts/dir-16'
    },
    {
      'title': 'remote delete and local create in same directory is resolved',
      'fixtures': 'conflicts/dir-17'
    },
    //there are two possible versions how a recursive delete can be reflected in remote delta
    {
      'title': 'remote delete and local create in same directory is resolved',
      'fixtures': 'conflicts/dir-17-2'
    },
    {
      'title': 'remote rename and local rename of two different directories with the same target are resolved, even when local file can\'t be renamed',
      'fixtures': 'conflicts/dir-17'
    },
    {
      'title': 'local create and remote rename of parent dir are merged',
      'fixtures': 'conflicts/dir-19'
    },
    {
      'title': 'local create file and remote move of parent dir are merged',
      'fixtures': 'conflicts/dir-20'
    },
    {
      'title': 'local create file and remote delete parent and rename other directory to same name as parent',
      'fixtures': 'conflicts/dir-21'
    },
    {
      'title': 'remote create file and local delete parent and rename other directory to same name as parent',
      'fixtures': 'conflicts/dir-22'
    },
    {
      'title': 'remote rename and local rename of two different directories with the same target are resolved in a readonly share',
      'fixtures': 'conflicts/readonly-share-1'
    },



    {
      'title': 'remote create and local create file with same name are resolved',
      'fixtures': 'conflicts/file-1'
    },
    {
      'title': 'remote rename and local rename of two different files to the same target are resolved',
      'fixtures': 'conflicts/file-2'
    },
    {
      'title': 'remote move and local move of two different files to the same target are resolved',
      'fixtures': 'conflicts/file-3'
    },
    {
      'title': 'remote move and rename and local create of two different files with the same target are resolved',
      'fixtures': 'conflicts/file-4'
    },
    {
      'title': 'remote update and local update of the same file are resolved',
      'fixtures': 'conflicts/file-5'
    },
    {
      'title': 'local delete and re create with same name is resolved',
      'fixtures': 'conflicts/file-6'
    },
    {
      'title': 'remote rename, update and local update is resolved',
      'fixtures': 'conflicts/file-7'
    },
    {
      'title': 'remote rename, update, local update and local create of remote tarrget is resolved',
      'fixtures': 'conflicts/file-8'
    },
    {
      'title': 'remote update and local update with same content is resolved',
      'fixtures': 'conflicts/file-9'
    },
    {
      'title': 'remote rename and local rename of two different files to the same target are resolved even when local file can\'t be renamed',
      'fixtures': 'conflicts/file-10'
    },
    {
      'title': 'remote rename, update, local update and local create of remote tarrget is resolved even when the local file can\'t be renamed',
      'fixtures': 'conflicts/file-11'
    },
    {
      'title': 'remote move and local move of two different files to the same target are resolved even when the local file can\'t be renamed',
      'fixtures': 'conflicts/file-12'
    },
    {
      'title': 'remote move and rename and local create of two different files with the same target are resolved even when the local file can\'t be renamed',
      'fixtures': 'conflicts/file-13'
    },
    {
      'title': 'remote create and local create file with same name are resolved even when the local file can\'t be renamed',
      'fixtures': 'conflicts/file-15'
    },
    {
      'title': 'remote update and local update of the same file are resolved even when the local file can\'t be renamed',
      'fixtures': 'conflicts/file-16'
    }
  ];

  tests.forEach(function(test) {
    it(test.title + ' (' + test.fixtures.replace('conflicts/', '') + ')', testFactory(test));
  });

  after(function() {
    mockdate.reset();
  });
});
