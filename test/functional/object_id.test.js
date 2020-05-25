'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
const { ObjectID } = require('../../src');

describe('ObjectID', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  it('shouldCorrectlyGenerateObjectID', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var number_of_tests_done = 0;

        var collection = db.collection('test_object_id_generation.data');
        // Insert test documents (creates collections and test fetch by query)
        collection.insert({ name: 'Fred', age: 42 }, { w: 1 }, function(err, r) {
          test.equal(1, r.ops.length);
          test.ok(r.ops[0]['_id'].toHexString().length === 24);
          // Locate the first document inserted
          collection.findOne({ name: 'Fred' }, function(err, document) {
            test.equal(r.ops[0]['_id'].toHexString(), document._id.toHexString());
            number_of_tests_done++;
          });
        });

        // Insert another test document and collect using ObjectId
        collection.insert({ name: 'Pat', age: 21 }, { w: 1 }, function(err, r) {
          test.equal(1, r.ops.length);
          test.ok(r.ops[0]['_id'].toHexString().length === 24);
          // Locate the first document inserted
          collection.findOne(r.ops[0]['_id'], function(err, document) {
            test.equal(r.ops[0]['_id'].toHexString(), document._id.toHexString());
            number_of_tests_done++;
          });
        });

        // Manually created id
        var objectId = new ObjectID(null);
        // Insert a manually created document with generated oid
        collection.insert({ _id: objectId, name: 'Donald', age: 95 }, { w: 1 }, function(err, r) {
          test.equal(1, r.ops.length);
          test.ok(r.ops[0]['_id'].toHexString().length === 24);
          test.equal(objectId.toHexString(), r.ops[0]['_id'].toHexString());
          // Locate the first document inserted
          collection.findOne(r.ops[0]['_id'], function(err, document) {
            test.equal(r.ops[0]['_id'].toHexString(), document._id.toHexString());
            test.equal(objectId.toHexString(), document._id.toHexString());
            number_of_tests_done++;
          });
        });

        var intervalId = setInterval(function() {
          if (number_of_tests_done === 3) {
            clearInterval(intervalId);
            client.close(done);
          }
        }, 100);
      });
    }
  });

  it('shouldCorrectlyRetrieve24CharacterHexStringFromToString', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      // Create a new ObjectID
      var objectId = new ObjectID();
      // Verify that the hex string is 24 characters long
      test.equal(24, objectId.toString().length);
      done();
    }
  });

  it('shouldCorrectlyRetrieve24CharacterHexStringFromToJSON', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      // Create a new ObjectID
      var objectId = new ObjectID();
      // Verify that the hex string is 24 characters long
      test.equal(24, objectId.toJSON().length);
      done();
    }
  });

  it('shouldCorrectlyCreateOIDNotUsingObjectID', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection('test_non_oid_id');
        var date = new Date();
        date.setUTCDate(12);
        date.setUTCFullYear(2009);
        date.setUTCMonth(11 - 1);
        date.setUTCHours(12);
        date.setUTCMinutes(0);
        date.setUTCSeconds(30);

        collection.insert({ _id: date }, { w: 1 }, function(err) {
          test.equal(null, err);
          collection.find({ _id: date }).toArray(function(err, items) {
            test.equal('' + date, '' + items[0]._id);

            // Let's close the db
            client.close(done);
          });
        });
      });
    }
  });

  it('shouldCorrectlyGenerateObjectIDFromTimestamp', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var timestamp = Math.floor(new Date().getTime() / 1000);
      var objectID = new ObjectID(timestamp);
      var time2 = objectID.generationTime;
      test.equal(timestamp, time2);
      done();
    }
  });

  it('shouldCorrectlyCreateAnObjectIDAndOverrideTheTimestamp', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var timestamp = 1000;
      var objectID = new ObjectID();
      var id1 = objectID.id;
      // Override the timestamp
      objectID.generationTime = timestamp;
      var id2 = objectID.id;

      // Check the timestamp
      if (id1 instanceof Buffer && id2 instanceof Buffer) {
        test.deepEqual(id1.slice(0, 4), id2.slice(0, 4));
      } else {
        test.equal(id1.substr(4), id2.substr(4));
      }

      done();
    }
  });

  it('shouldCorrectlyInsertWithObjectId', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var db = client.db(configuration.db);
        var collection = db.collection('shouldCorrectlyInsertWithObjectId');
        collection.insert({}, { w: 1 }, function(err) {
          test.equal(null, err);
          const firstCompareDate = new Date();

          setTimeout(function() {
            collection.insert({}, { w: 1 }, function(err) {
              test.equal(null, err);
              const secondCompareDate = new Date();

              collection.find().toArray(function(err, items) {
                test.equal(null, err);

                // Date 1
                var date1 = new Date();
                date1.setTime(items[0]._id.generationTime * 1000);
                // Date 2
                var date2 = new Date();
                date2.setTime(items[1]._id.generationTime * 1000);

                // Compare
                test.equal(firstCompareDate.getFullYear(), date1.getFullYear());
                test.equal(firstCompareDate.getDate(), date1.getDate());
                test.equal(firstCompareDate.getMonth(), date1.getMonth());
                test.equal(firstCompareDate.getHours(), date1.getHours());

                test.equal(secondCompareDate.getFullYear(), date2.getFullYear());
                test.equal(secondCompareDate.getDate(), date2.getDate());
                test.equal(secondCompareDate.getMonth(), date2.getMonth());
                test.equal(secondCompareDate.getHours(), date2.getHours());
                // Let's close the db
                client.close(done);
              });
            });
          }, 2000);
        });
      });
    }
  });
});
