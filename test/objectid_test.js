var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;

var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  gleak = require('../dev/tools/gleak'),
  ObjectID = require('../lib/mongodb/bson/objectid').ObjectID,
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  var self = exports;  
  client.open(function(err, db_p) {
    if(numberOfTestsRun == (Object.keys(self).length)) {
      // If first test drop the db
      client.dropDatabase(function(err, done) {
        callback();
      });
    } else {
      return callback();
    }
  });
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.tearDown = function(callback) {
  var self = this;
  numberOfTestsRun = numberOfTestsRun - 1;
  // Close connection
  client.close();
  callback();
}

// Test the generation of the object ids
exports.shouldCorrectlyGenerateObjectID = function(test) {
  var number_of_tests_done = 0;

  client.collection('test_object_id_generation.data', function(err, collection) {
    // Insert test documents (creates collections and test fetch by query)
    collection.insert({name:"Fred", age:42}, {safe:true}, function(err, ids) {
      test.equal(1, ids.length);
      test.ok(ids[0]['_id'].toHexString().length == 24);
      // Locate the first document inserted
      collection.findOne({name:"Fred"}, function(err, document) {
        test.equal(ids[0]['_id'].toHexString(), document._id.toHexString());
        number_of_tests_done++;
      });
    });

    // Insert another test document and collect using ObjectId
    collection.insert({name:"Pat", age:21}, {safe:true}, function(err, ids) {
      test.equal(1, ids.length);
      test.ok(ids[0]['_id'].toHexString().length == 24);
      // Locate the first document inserted
      collection.findOne(ids[0]['_id'], function(err, document) {
        test.equal(ids[0]['_id'].toHexString(), document._id.toHexString());
        number_of_tests_done++;
      });
    });

    // Manually created id
    var objectId = new ObjectID(null);
    // Insert a manually created document with generated oid
    collection.insert({"_id":objectId, name:"Donald", age:95}, {safe:true}, function(err, ids) {
      test.equal(1, ids.length);
      test.ok(ids[0]['_id'].toHexString().length == 24);
      test.equal(objectId.toHexString(), ids[0]['_id'].toHexString());
      // Locate the first document inserted
      collection.findOne(ids[0]['_id'], function(err, document) {
        test.equal(ids[0]['_id'].toHexString(), document._id.toHexString());
        test.equal(objectId.toHexString(), document._id.toHexString());
        number_of_tests_done++;
      });
    });
  });

  var intervalId = setInterval(function() {
    if(number_of_tests_done == 3) {
      clearInterval(intervalId);
      test.done();
    }
  }, 100);    
}

exports.shouldCorrectlyTransformObjectIDToAndFromHexString = function(test) {
  var objectId = new ObjectID(null);
  var originalHex= objectId.toHexString();

  var newObjectId= new ObjectID.createFromHexString(originalHex)
  var newHex= newObjectId.toHexString();
  test.equal(originalHex, newHex);
  test.done();
}

// Use some other id than the standard for inserts
exports.shouldCorrectlyCreateOIDNotUsingObjectID = function(test) {
  client.createCollection('test_non_oid_id', function(err, collection) {
    var date = new Date();
    date.setUTCDate(12);
    date.setUTCFullYear(2009);
    date.setUTCMonth(11 - 1);
    date.setUTCHours(12);
    date.setUTCMinutes(0);
    date.setUTCSeconds(30);

    collection.insert({'_id':date}, {safe:true}, function(err, ids) {
      collection.find({'_id':date}, function(err, cursor) {
        cursor.toArray(function(err, items) {
          test.equal(("" + date), ("" + items[0]._id));

          // Let's close the db
          test.done();
        });
      });
    });
  });
}

exports.shouldCorrectlyGenerateObjectIDFromTimestamp = function(test) {
  var timestamp = Math.floor(new Date().getTime()/1000);
  var objectID = new ObjectID(timestamp);
  var time2 = objectID.generationTime;
  test.equal(timestamp, time2);
  test.done();
}

exports.shouldCorrectlyCreateAnObjectIDAndOverrideTheTimestamp = function(test) {
  var timestamp = 1000;
  var objectID = new ObjectID();
  var id1 = objectID.id;
  // Override the timestamp
  objectID.generationTime = timestamp
  var id2 = objectID.id;  
  // Check the strings
  test.equal(id1.substr(4), id2.substr(4));
  test.done();
}

exports.shouldCorrectlyInsertWithObjectId = function(test) {
  client.createCollection('shouldCorrectlyInsertWithObjectId', function(err, collection) {
    collection.insert({}, {safe:true}, function(err, ids) {
      setTimeout(function() {
        collection.insert({}, {safe:true}, function(err, ids) {
          collection.find().toArray(function(err, items) {
            var compareDate = new Date();
            
            // Date 1
            var date1 = new Date();
            date1.setTime(items[0]._id.generationTime * 1000);
            // Date 2
            var date2 = new Date();
            date2.setTime(items[1]._id.generationTime * 1000);

            // Compare
            test.equal(compareDate.getFullYear(), date1.getFullYear());
            test.equal(compareDate.getDate(), date1.getDate());
            test.equal(compareDate.getMonth(), date1.getMonth());
            test.equal(compareDate.getHours(), date1.getHours());
            test.equal(compareDate.getMinutes(), date1.getMinutes());

            test.equal(compareDate.getFullYear(), date2.getFullYear());
            test.equal(compareDate.getDate(), date2.getDate());
            test.equal(compareDate.getMonth(), date2.getMonth());
            test.equal(compareDate.getHours(), date2.getHours());
            test.equal(compareDate.getMinutes(), date2.getMinutes());
            test.ok(date2.getSeconds() >= date1.getSeconds());
            // Let's close the db
            test.done();
          });
        });
      }, 2000);        
    });
  });    
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.noGlobalsLeaked = function(test) {
  var leaks = gleak.detectNew();
  test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
  test.done();
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
var numberOfTestsRun = Object.keys(this).length - 2;