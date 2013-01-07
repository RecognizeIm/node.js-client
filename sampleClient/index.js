var server = require("./server");
var router = require("./router");
var requestHandlers = require("./requestHandlers");

var handle = {}
handle["/"] = requestHandlers.start;
handle["/start"] = requestHandlers.start;
handle["/recognize"] = requestHandlers.recognize;
handle["/status"] = requestHandlers.status;
handle["/build"] = requestHandlers.build;
handle["/list"] = requestHandlers.list;
handle["/imageInsert"] = requestHandlers.insert;

server.start(router.route, handle);