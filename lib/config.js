var fs = require('original-fs');
var path = require('path');

var config = {};

module.exports = {
  get: function(key) {
    return config[key];
  },
  setAll: function(newConfig) {
    config = newConfig;
  },
  set: function(key, value) {
    config[key] = value;
  }
};
