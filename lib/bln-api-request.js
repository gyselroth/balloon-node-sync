var os = require('os');

var request = require('request');
//require('request-debug')(request);
var logger = require('./logger.js');

var config = require('./config.js');

var BlnApiRequestError = require('../errors/bln-api-request.js');
var BlnConfigError = require('../errors/bln-config.js');

var apiUrl;
function getApiUrl() {
  if(!apiUrl) {
    apiUrl = config.get('apiUrl');
  }

  if(!apiUrl) {
    throw new BlnConfigError('ApiUrl is not set', 'E_BLN_CONFIG_APIURL');
  }

  return apiUrl;
}

function buildUri(endpoint) {
  if(endpoint[0] !== '/') endpoint = '/' + endpoint;
  return getApiUrl() + endpoint;
}

function getAuthorizationHeader() {
  if(config.get('accessToken')) {
    return 'Bearer ' + config.get('accessToken');
  } else if(config.get('username') && config.get('password')){
    return 'Basic ' + (new Buffer(config.get('username') + ':' + config.get('password')).toString('base64'));
  } else {
    throw new BlnConfigError('Neither acessToken nor username/password set', 'E_BLN_CONFIG_CREDENTIALS')
  }
}

function getReqOptions(method, endpoint, params) {
  var xClientHeader = [
    'Balloon-Desktop-App',
    config.get('version'),
    os.hostname()
  ].join('|');

  var reqOptions = {
    uri: buildUri(endpoint),
    method: method.toUpperCase() || 'GET',
    headers: {
      'User-Agent': 'Balloon Client',
      'X-Client': xClientHeader,
      'Authorization': getAuthorizationHeader()
    },
    qs: params,
    json: true
  };

  if(method.toLowerCase() === 'put' && (endpoint === '/file' || endpoint === '/file/chunk')) {
    /*
    If the content-type header is not set `request` sets it to `application/json` for json files
    If the content-type is set to `application/json` the body is interpreted as json on the server,
    which might lead to errors where the body overrides query paramteres
    eg. {"name": "somename"} will override the paramter `name`
    */
    reqOptions.headers['Content-Type']  = '';
  }

  logger.info('API: ' + method.toUpperCase() + ' request to ' + endpoint + ' with params: ', params);

  return reqOptions;
}

function handleResponse(response, body, callback) {
  if(!!(body && body.constructor && body.call && body.apply)) {
    callback = body;
    body = undefined;
  }

  if(response.statusCode === 401) {
    logger.warning('API: Got Status Code 401 Unauthorized');

    return callback(new BlnApiRequestError('API: User is not authenticated', 'E_BLN_API_REQUEST_UNAUTHORIZED'));
  }

  if(response.statusCode < 200 || response.statusCode > 299) {
    var errCode;
    var errMsg = 'Unknown API Error with status code: ' + response.statusCode;


    if(body && body.data && (body.data.error || body.data.message || body.data.code)) {
      logger.info('API REQ: Got body:', body);

      if(body.data.error) {
        errMsg = body.data.error;
      }

      if(body.data.message) {
        errMsg = (errMsg ? (errMsg + ' ') : '') + '(' + body.data.message + ')';
      }

      if(body.data.code) {
        switch(body.data.code) {
          case 25:
            //node has readonly flag set or parent node is readonly
            errCode = 'E_BLN_API_REQUEST_NODE_READ_ONLY';
          break;
          case 34: //delete
          case 35: //update
          case 38: //create
            // node is in a share with read only flag set
            errCode = 'E_BLN_API_REQUEST_READ_ONLY_SHARE';
          break;
          case 54:
            errCode = 'E_BLN_API_REQUEST_DEST_NOT_FOUND';
          break;
        }
      }
    }

    logger.warning('API: ' + errMsg);

    return callback(new BlnApiRequestError(errMsg, errCode), body);
  }

  callback(null, body);
}

var blnApiRequest = {
  sendRequest: function(method, endpoint, params, callback) {
    if(!!(params && params.constructor && params.call && params.apply)) {
      callback = params;
      params = {};
    }

    return request(getReqOptions(method, endpoint, params), (err, response, body) => {
      if(err) return callback(err);

      handleResponse(response, body, callback);
    });
  },

  sendStreamingRequest: function(method, endpoint, params) {
    var req = request(getReqOptions(method, endpoint, params));

    req.on('response', function(response) {
      handleResponse(response, function(err) {
        if(err) {
          req.emit('error', err);
        } else {
          req.emit('bln-response', response);
        }
      });
    });

    return req;
  }
}

module.exports = blnApiRequest;
