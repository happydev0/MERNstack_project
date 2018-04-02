'use strict';

// Core module
const core = require('mongodb-core');
const Instrumentation = require('./lib/apm');

// Set up the connect function
const connect = require('./lib/mongo_client').connect;

// Expose error class
connect.MongoError = core.MongoError;

// Actual driver classes exported
connect.Admin = require('./lib/admin');
connect.MongoClient = require('./lib/mongo_client');
connect.Db = require('./lib/db');
connect.Collection = require('./lib/collection');
connect.Server = require('./lib/topologies/server');
connect.ReplSet = require('./lib/topologies/replset');
connect.Mongos = require('./lib/topologies/mongos');
connect.ReadPreference = require('mongodb-core').ReadPreference;
connect.GridStore = require('./lib/gridfs/grid_store');
connect.Chunk = require('./lib/gridfs/chunk');
connect.Logger = core.Logger;
connect.Cursor = require('./lib/cursor');
connect.GridFSBucket = require('./lib/gridfs-stream');
// Exported to be used in tests not to be used anywhere else
connect.CoreServer = require('mongodb-core').Server;
connect.CoreConnection = require('mongodb-core').Connection;

// BSON types exported
connect.Binary = core.BSON.Binary;
connect.Code = core.BSON.Code;
connect.Map = core.BSON.Map;
connect.DBRef = core.BSON.DBRef;
connect.Double = core.BSON.Double;
connect.Int32 = core.BSON.Int32;
connect.Long = core.BSON.Long;
connect.MinKey = core.BSON.MinKey;
connect.MaxKey = core.BSON.MaxKey;
connect.ObjectID = core.BSON.ObjectID;
connect.ObjectId = core.BSON.ObjectID;
connect.Symbol = core.BSON.Symbol;
connect.Timestamp = core.BSON.Timestamp;
connect.BSONRegExp = core.BSON.BSONRegExp;
connect.Decimal128 = core.BSON.Decimal128;

// Add connect method
connect.connect = connect;

// Set up the instrumentation method
connect.instrument = function(options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  // return new Instrumentation(core, options, callback);
  const instrumentation = new Instrumentation();
  instrumentation.instrument(connect.MongoClient, callback);
  return instrumentation;
};

// Set our exports to be the connect function
module.exports = connect;
