var testFactory = require('./lib/test-factory.js');
var mockdate = require('mockdate');

describe('local', function() {
  before(function() {
    mockdate.set('1/20/2017');
  });

  var tests = [
    {
      'title': 'Creates directories remotely',
      'fixtures': 'local/create-dir'
    },
    {
      'title': 'Renames directories remotely',
      'fixtures': 'local/rename-dir'
    },
    {
      'title': 'Resolves conflict when dir has been renamed to a name that already exists',
      'fixtures': 'local/rename-dir-in-letterbox-share'
    },
    {
      'title': 'Renames directories remotely, does not issue move requests for children',
      'fixtures': 'local/rename-dir-with-children'
    },
    {
      'title': 'Moves directories remotely',
      'fixtures': 'local/move-dir'
    },
    {
      'title': 'Moves directories remotely, does not issue move requests for children',
      'fixtures': 'local/move-dir-with-children'
    },
    {
      'title': 'Deletes directories remotely',
      'fixtures': 'local/delete-dir'
    },
    {
      'title': 'Creates files remotely',
      'fixtures': 'local/create-file'
    },
    {
      'title': 'Renames files remotely',
      'fixtures': 'local/rename-file'
    },
    {
      'title': 'Moves files remotely',
      'fixtures': 'local/move-file'
    },
    {
      'title': 'Deletes files remotely',
      'fixtures': 'local/delete-file'
    },
    {
      'title': 'Updates files remotely',
      'fixtures': 'local/update-file'
    },
    {
      'title': 'Renames and updates file remotely',
      'fixtures': 'local/rename-update-file'
    },
    {
      'title': 'Moves and updates file remotely',
      'fixtures': 'local/move-update-file'
    },
    {
      'title': 'Moves, renames and updates file remotely',
      'fixtures': 'local/rename-move-update-file'
    },
    {
      'title': 'Resolves conflict when readonly file has been updated localy',
      'fixtures': 'local/update-readonly-file'
    },
    {
      'title': 'Resolves conflict when file has been created in readonly collection',
      'fixtures': 'local/create-file-in-readonly-collection'
    },
    {
      'title': 'Resolves conflict when file has been created in letterbox share but target already exists remotely',
      'fixtures': 'local/create-file-in-letterbox-share'
    },
    {
      'title': 'Resolves conflict when directory has been created in letterbox share but target already exists remotely',
      'fixtures': 'local/create-dir-in-letterbox-share'
    },
    {
      'title': 'Resolves conflict when directory has been created in readonly collection',
      'fixtures': 'local/create-dir-in-readonly-collection'
    },
    {
      'title': 'Resolves conflict when directory with children has been created in readonly collection',
      'fixtures': 'local/create-dir-in-readonly-collection-2'
    },
    {
      'title': 'Resolves conflict when directory has been created in readonly share',
      'fixtures': 'local/create-dir-in-readonly-share'
    },
    {
      'title': 'Resolves conflict when directory with children has been created in readonly share',
      'fixtures': 'local/create-dir-in-readonly-share-2'
    },
    {
      'title': 'Resolves conflict when file has been created in readonly share',
      'fixtures': 'local/create-file-in-readonly-share'
    },
    {
      'title': 'Resolves conflict when file has been updated in readonly share',
      'fixtures': 'local/update-file-in-readonly-share'
    },
    {
      'title': 'Resolves conflict when file has been deleted in readonly share',
      'fixtures': 'local/delete-file-in-readonly-share'
    },
    {
      'title': 'Resolves conflict when a readonly file has been deleted',
      'fixtures': 'local/delete-readonly-file'
    },
    {
      'title': 'Resolves conflict when a directory containing a readonly file has been deleted',
      'fixtures': 'local/delete-dir-containing-readonly-file'
    },
    {
      'title': 'Resolves conflict when a readonly directory has been deleted',
      'fixtures': 'local/delete-readonly-dir'
    },
    {
      'title': 'Resolves conflict when a readonly directory has been deleted',
      'fixtures': 'local/delete-dir-in-readonly-share'
    },
    {
      'title': 'Creates directory and moves file into it remotely',
      'fixtures': 'local/create-dir-move-file'
    },
    {
      'title': 'Creates directory and moves dir into it remotely',
      'fixtures': 'local/create-dir-move-dir'
    },
    {
      'title': 'Rename and moves file and deletes old parent directory remotely',
      'fixtures': 'local/renamemove-file-delete-old-parent'
    },
    {
      'title': 'Creates a new file and moves it\'s parent remotely',
      'fixtures': 'local/create-file-move-parent'
    },
    {
      'title': 'Moves a directory even when it\'s parent has been renamed',
      'fixtures': 'local/move-dir-rename-parent'
    },
    {
      'title': 'Renames a file even when it\'s parent has been moved',
      'fixtures': 'local/rename-file-move-parent'
    },
    {
      'title': 'Deletes a directory even when it\'s parent has been renamed',
      'fixtures': 'local/delete-dir-rename-parent'
    },
    {
      'title': 'Creates a directory even when it\'s parent has been renamed',
      'fixtures': 'local/create-dir-rename-parent'
    },
    {
      'title': 'Resolves conflict when file has been renamed in letterbox collection but target file already exists remote',
      'fixtures': 'local/rename-file-in-letterbox-share'
    },
    {
      'title': 'Resolves conflict when file has been renamed in readonly share',
      'fixtures': 'local/rename-file-in-readonly-share'
    },
    {
      'title': 'Resolves conflict when file has been moved in readonly share',
      'fixtures': 'local/move-file-in-readonly-share'
    },
    {
      'title': 'Resolves conflict when file has been moved in letterbox collection but target file already exists remote',
      'fixtures': 'local/move-file-in-letterbox-share'
    },
    {
      'title': 'Resolves conflict when file has been renamed and moved in readonly share',
      'fixtures': 'local/renamemove-file-in-readonly-share'
    },
    {
      'title': 'Resolves conflict when file has been renamed and moved into a newly created directory in a readonly share',
      'fixtures': 'local/readonly-share-1'
    }
  ];

  tests.forEach(function(test) {
    it(test.title + ' (' + test.fixtures.replace('local/', '') + ')', testFactory(test));
  });

  after(function() {
    mockdate.reset();
  });
});
