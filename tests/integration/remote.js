var testFactory = require('./lib/test-factory.js');
var mockdate = require('mockdate');

describe('remote', function() {
  before(function() {
    mockdate.set('1/20/2017');
  });

  var tests = [
    {
      'title': 'Creates directories localy',
      'fixtures': 'remote/create-dir'
    },
    {
      'title': 'Renames directories localy',
      'fixtures': 'remote/rename-dir'
    },
    {
      'title': 'Moves directories localy',
      'fixtures': 'remote/move-dir'
    },
    {
      'title': 'Deletes directories localy',
      'fixtures': 'remote/delete-dir'
    },
    {
      'title': 'Creates files localy',
      'fixtures': 'remote/create-file'
    },
    {
      'title': 'Renames files localy',
      'fixtures': 'remote/rename-file'
    },
    {
      'title': 'Moves files localy',
      'fixtures': 'remote/move-file'
    },
    {
      'title': 'Deletes files localy',
      'fixtures': 'remote/delete-file'
    },
    {
      'title': 'Updates files localy',
      'fixtures': 'remote/update-file'
    },
    {
      'title': 'Does not download a file wich has been previously uploaded',
      'fixtures': 'remote/ignore-localy-created-file'
    },
    {
      'title': 'Renames and updates file localy',
      'fixtures': 'remote/rename-update-file'
    },
    {
      'title': 'Moves and updates file localy',
      'fixtures': 'remote/move-update-file'
    },
    {
      'title': 'Moves, renames and updates file localy',
      'fixtures': 'remote/rename-move-update-file'
    },
    {
      'title': 'Moves file to root directory',
      'fixtures': 'remote/move-file-to-root'
    },
    {
      'title': 'Renames and recreates files localy',
      'fixtures': 'remote/rename-create-file'
    },
    {
      'title': 'Moves and recreates files localy',
      'fixtures': 'remote/move-create-file'
    },
    {
      'title': 'Deletes and recreates files localy',
      'fixtures': 'remote/delete-create-file'
    },
    {
      'title': 'Deletes and recreates files localy',
      'fixtures': 'remote/move-delete-create-file'
    },
    {
      'title': 'Creates directory and moves file into it localy',
      'fixtures': 'remote/create-dir-move-file'
    },
    {
      'title': 'Creates directory and moves dir into it localy',
      'fixtures': 'remote/create-dir-move-dir'
    },
    {
      'title': 'Rename and moves file and deletes old parent directory localy',
      'fixtures': 'remote/renamemove-file-delete-old-parent'
    },
    {
      'title': 'Creates a new file and moves it\'s parent localy',
      'fixtures': 'remote/create-file-move-parent'
    },
    {
      'title': 'Moves a directory even when it\'s parent has been renamed',
      'fixtures': 'remote/move-dir-rename-parent'
    },
    {
      'title': 'Renames a file even when it\'s parent has been moved',
      'fixtures': 'remote/rename-file-move-parent'
    },
    {
      'title': 'Deletes a directory even when it\'s parent has been renamed',
      'fixtures': 'remote/delete-dir-rename-parent'
    },
    {
      'title': 'Creates a directory even when it\'s parent has been renamed',
      'fixtures': 'remote/create-dir-rename-parent'
    },
    {
      'title': 'Deletes and recreates a directory',
      'fixtures': 'remote/delete-dir-recreate-dir'
    },
    {
      'title': 'Deletes directory and renames other directory to path of deleted directory',
      'fixtures': 'remote/delete-dir-rename-dir'
    },
    {
      'title': 'Moves existing dir into non existing directory',
      'fixtures': 'remote/move-dir-to-not-existing-parent'
    }
  ];

  tests.forEach(function(test) {
    it(test.title + ' (' + test.fixtures.replace('remote/', '') + ')', testFactory(test));
  });

  after(function() {
    mockdate.reset();
  });
});
