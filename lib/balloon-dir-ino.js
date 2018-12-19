const fs = require('./fs.js');
const path = require('path');

module.exports = function(instanceDir) {
  const pathStorage = path.join(instanceDir, 'balloon-dir-ino');

  //ensure storage exists
  if(fs.existsSync(pathStorage) === false) {
    fs.closeSync(fs.openSync(pathStorage, 'w'));
  }

  return {
    write: function(ino) {
      fs.truncateSync(pathStorage, 0);
      fs.writeFileSync(pathStorage, ino);
    },

    read: function() {
      var inoFromStorage = fs.readFileSync(pathStorage).toString();
      return inoFromStorage !== '' ? inoFromStorage : undefined;
    }
  }
};
