/**************************************************************************************************************
 *  @author Marcin Szajek [szajek@programa.pl]                                                                 
 *  Node.js library used to communicate with recognize.im API.
 *  Required modules:
 *    - http
 *    - xml2js
 *    - crypto
 *    - util
 *
 **************************************************************************************************************/

var 
  http    = require("http"),
  xml2js  = require('xml2js'),
  crypto  = require('crypto'),
  utils   = require('util')
  ;

//limits for query images:
//for SingleIR
var SINGLEIR_MAX_FILE_SIZE = 500;    //KBytes
var SINGLEIR_MIN_DIMENSION = 100;    //pix
var SINGLEIR_MIN_IMAGE_AREA = 0.05;  //Mpix
var SINGLEIR_MAX_IMAGE_AREA = 0.31;  //Mpix
//for MultipleIR
var MULTIIR_MAX_FILE_SIZE = 3500;    //KBytes
var MULTIIR_MIN_DIMENSION = 100;     //pix
var MULTIIR_MIN_IMAGE_AREA = 0.1;    //Mpix
var MULTIIR_MAX_IMAGE_AREA = 5.1;    //Mpix

// credentials
var CLIENT_ID = '';
var API_KEY = '';
var CLAPI_KEY = '';

var callbacks = {};       // object containing callbacks for 'success' and 'error'
  
var userCookie = false;  // cookie for session

/**************************************************************************************************************/
/*  Internal, protected methods                                                                               */
/**************************************************************************************************************/

// check if user is authorized (session cookie is present)
function userAuthorized() {
  return !!userCookie;
}

/**
 * Build SOAP docuemnt and call specific method
 * @param method Method name
 * @param params XML containing method params
 */
function callSoapMethod(method, params) {
    if (!params)
      params = '';
		var doc = "<?xml version=\"1.0\" encoding=\"utf-8\"?>"
		+"<soap:Envelope xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\" xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\">"
		+"<soap:Body>"
		+"<"+ method + " xmlns=\"http://clapi.itraff.pl\">"
    + params
		+ "</" + method + ">"
		+ "</soap:Body></soap:Envelope>";
		callAPI('/'+method, doc);
}

/**
 *Authorize user. Called automatically when needed.
 */
function auth(){
    var params 
    = "<client_id>"+CLIENT_ID+"</client_id>"
		+ "<key_clapi>"+CLAPI_KEY+"</key_clapi>"
		+ "<ip></ip>"
		
		callSoapMethod('auth', params);
}

/**
 * Call API SOAP method using given data
 * @param method Query string for method (for example '/indexStatus')
 * @param data XML SOAP document with parameters 
 */
function callAPI(method, data) {

  // Internal method, used when we need do call auth first
  var internallCall = function () {
    var options = {
      host: 'clapi.itraff.pl',              //< You can find host in the WSDL file: http://clapi.itraff.pl/wsdl
      port: 80,                             //< Always 80
      path: method,                         //< SOAP method, for example '/indexStatus'
      method: 'POST',                       //< always POST
    };
    
    var req = http.request(options, function(res) {
      res.setEncoding('utf8');
      var respData = '';
      if(res.headers['set-cookie'])               //< We need to remember session cookie
        userCookie = res.headers['set-cookie'];
      res.on('end', function () {
        var parser = new xml2js.Parser();
        parser.parseString(respData, function(err, result){
            result = result['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0];
            var obj;
            for (var i in result) {
              if (i == 'SOAP-ENV:Fault') {
                  if(callbacks.hasOwnProperty("error")) {
                      callbacks['error'](utils.inspect(result['SOAP-ENV:Fault'][0]['faultstring']));
                  } else {
                      console.log("No callback assigned!");
                  }
              } else if (result.hasOwnProperty(i)) {
                  obj = parse(result[i][0]['return'][0]['item']);
                  if (obj.status == 0 && callbacks.hasOwnProperty("success"))
                      callbacks['success'](obj.hasOwnProperty('data')?obj.data:"");
                  else if(callbacks.hasOwnProperty("error")) {
                      callbacks['error'](obj.hasOwnProperty('message')?obj.message:'An Error Occured!');
                  } else {
                      console.log("No callback assigned!");
                  }
                  return;
              }
            }
        });
      });
      res.on('data', function (chunk) {
        respData+=chunk;
      });
    });

    req.on('error', function(e) {
      console.log('problem with request: ' + e.message);
    })
    if (userAuthorized()) {
      req.setHeader('Cookie', userCookie);
    };
    
    req.write(data);
    req.end();
  }

   // if user is not authorized we need to call '/auth' first...
   if(method !== '/auth' && !userAuthorized()) {
      var onSuccess = callbacks['success'];     //< ... so we are remembering old onSuccess callback
      callbacks['success'] = function() {      //< and create new temporary callback using closure
        callbacks['success'] = onSuccess;       //< new callback should revert old one
        internallCall();                        //< and call specific method
      }
      auth();
   } else {
      internallCall();                          //< We don't need to auth, so we can just call method
   }
}

/**
 * Convert XML Map JSON object to regular JSON object
 */
function parse(data) {
  var obj = {};
  for (var i in data) {
    if(data[i].hasOwnProperty('value') && data[i]['value'].hasOwnProperty('0')) {
      if (data[i]['value'][0].hasOwnProperty('_'))
        obj[data[i]['key'][0]['_']] = data[i]['value'][0]['_'];
      else if (data[i]['value'][0].hasOwnProperty('item'))
        obj[data[i]['key'][0]['_']] = parse(data[i]['value'][0]['item']);
    } else {
        if(data[i].hasOwnProperty('item')) {
          obj[i] = parse(data[i]['item']);
        }
    }
  }
  return obj;
}

/**
 * Check whether query image follows requirements.
 * If it does, return null, otherwise return error message.
 */
function checkImageLimits(image, multi) {
  // fetch image data
  var imageinfo = require('imageinfo');
  var info = imageinfo(image);
  var size = image.length / 1024.0; //KB
  var area = info.width * info.height / 1000000.0 //Mpix

  // check image data
  if (multi) {
    if (size > MULTIIR_MAX_FILE_SIZE ||
        info.width < MULTIIR_MIN_DIMENSION ||
        info.height < MULTIIR_MIN_DIMENSION ||
        area < MULTIIR_MIN_IMAGE_AREA ||
        area > MULTIIR_MAX_IMAGE_AREA)
      return "Image does not meet the requirements of multi mode query image.\n"
  } else {
    if (size > SINGLEIR_MAX_FILE_SIZE ||
        info.width < SINGLEIR_MIN_DIMENSION ||
        info.height < SINGLEIR_MIN_DIMENSION ||
        area < SINGLEIR_MIN_IMAGE_AREA ||
        area > SINGLEIR_MAX_IMAGE_AREA)
      return "Image does not meet the requirements of single mode query image.\n"
  }

  return null;
}

/**************************************************************************************************************/
/*  Public, offline methods                                                                                   */
/**************************************************************************************************************/

/**
 * Set credential for API calls. You can get them from http://www.recognize.im/user/profile
 * @param id CLIENT_ID
 * @param api_k KEY_API
 * @param clapi_k KEY_CLAPI
 */
exports.setCredentials = function(id, api_k, clapi_k) {
  CLIENT_ID = id;
  API_KEY = api_k;
  CLAPI_KEY = clapi_k;
}

/**
 * Set callback for all API calls
 * @param type callback type, valid values are 'success' and 'error'
 * @param callback
 * @return voolean TRUE if callback was set, FALSE otherwise
 */
exports.on = function(type, callback) {
  if(type != 'success' && type != 'error')
    return false;
  callbacks[type] = callback;
  return true;
}


/**************************************************************************************************************/
/*  API methods                                                                                               */
/**************************************************************************************************************/

// recognize object using given photo and call given callback
exports.recognize = function(data, callback, multi, getAll){
  var error = checkImageLimits(data, multi);
  if (error) {
    callback(null, error);
  } else {
    var path = '/v2/recognize/';
    if (multi) {
      path = path + 'multi/';
    } else {
      path = path + 'single/';
    }
    if (getAll) {
        path = path + 'all/';
    }
    var hash = crypto.createHash('md5', 'ascii').update(API_KEY).update(data, "binary").digest("hex");
    var options = {
      'host': 'clapi.itraff.pl',
      'port': 80,
      'path': path + CLIENT_ID,
      'method': 'POST'
    };

    var req = http.request(options, function(res) {
      res.setEncoding('utf8');
      var respData = '';
      res.on('end', function () {
        var obj = JSON.parse(respData);
        if (callback)
        callback(obj, null);
      });
      res.on('data', function (chunk) {
        respData+=chunk;
      });
    });

    req.on('error', function(e) {
      console.log('problem with request: ' + e.message);
    });

    req.setHeader("Content-type", "image/jpeg");
    req.setHeader("x-itraff-hash", hash);
    req.write(data, "binary");
    req.end();
  }
}

/**
 * Get user data
 */
exports.userGet = function() {
		callSoapMethod('userGet');
}

/**
 * Delete user
 */
exports.userDelete = function() {
		callSoapMethod('userDelete');
}

/**
 * Get current limits for user
 */
exports.userLimits = function() {
  	callSoapMethod('userLimits');
}

/**
 * Count user's images
 */
exports.imageCount = function() {
  	callSoapMethod('imageCount');
}

/**
 * List data about all user images
 */
exports.imageList = function() {
		callSoapMethod('imageList');
}

/**
 * Insert new image
 * @param id
 * @param name 
 * @param data binary data of JPEG image, will be base64 encoded
 */
exports.imageInsert = function(id, name, data) {
    var params =
      "<id>"+id+"</id>"
    + "<name>"+name+"</name>"
		+ "<data>"+ new Buffer(data, 'binary').toString('base64')+"</data>"
		callSoapMethod('imageInsert', params);
}

/**
 * Delete user's image for given image ID
 */
exports.imageDelete = function(ID) {
		var params = "<ID>"+ID+"</ID>"
		callSoapMethod('imageDelete', params);
}

/**
 * Get metadata of image for given ID
 */
exports.imageGet = function(ID) {
		var params = "<ID>"+ID+"</ID>"
		callSoapMethod('imageGet', params);
}

/**
 * Apply changes into your index
 */
exports.indexBuild = function() {
  callSoapMethod('indexBuild');
}

/**
 * Provide callback URL for indexBuild result. Async method.
 */
exports.callback = function(callbackURL) {
		var params = "<callbackURL>"+callbackURL+"</callbackURL>"
    callSoapMethod('callback', params);
}

/**
 * Check status of indexBuild process
 */
exports.indexStatus = function() {
		callSoapMethod('indexStatus');
}

/**
 * Get (or regenerate and get) API_KEY for user
 */
exports.keyGet = function(regenerate) {
		var params = "<regenerate>"+regenerate+"</regenerate>"
    callSoapMethod('keyGet', params);
}

/**
 * Toggle recognition mode between 'single' and 'multi'
 */
exports.modeSet = function() {
  	callSoapMethod('modeSet');
}

/**
 * Get current recognition mode
 */
exports.modeGet = function() {
  	callSoapMethod('modeGet');
}

/**
 * Get list of all your payements
 */
exports.paymentList = function() {
		callSoapMethod('/paymentList');
}

/**************************************************************************************************************/
