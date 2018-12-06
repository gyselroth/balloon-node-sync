let fs;

try {
  fs = require('original-fs');
} catch(err) {
  //if not executed via electron fallback to native fs
  fs = require('fs');
}

module.exports = fs;
