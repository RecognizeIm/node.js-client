Recognize.im API
===============

Recognize.im is providing API for Image Recognition. Those module is sample connector to the API

Installation
============

Simplest way to install  is to use [npm](http://npmjs.org), just `npm
install recognize.im` which will download module and all dependencies.

Usage
=====

    // first get module object and set credentials
    var API = require("recognize.im");
    API.setCredentials(1, '7b8968c6cf', 'dbf552b9f7f7e3b6918d3f854011f4ff');
    
    // next provide callbacks for success and for error
    API.on("error", function(msg){
        consoloe.log("Recognize.im connection error: " + msg);
    });
    
    API.on('success', function(data) {
        var utils = require('util');
        console.log(utils.inspect(data));
    });
    
    // call API function
    API.indexBuild();

Authorization
=============

You don't need to call method auth by yourself. Module object will authorize you when needed, you just need do provide valid credentials. You can get them from your [account tab](http://recognize.im/user/profile)