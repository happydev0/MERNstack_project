exports['Should Correctly Do MongoClient with bufferMaxEntries:0'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: 'single'
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
      console.log("========================================= -1")
    var MongoClient = configuration.require.MongoClient;
    MongoClient.connect(configuration.url() + "?maxPoolSize=1", {
      db: {bufferMaxEntries:0},
    }, function(err, db) {
      console.log("========================================= 0 ++")
      // Listener for closing event
      var closeListener = function(has_error) {
        console.log("========================================= 0 -- ")
        // Let's insert a document
        var collection = db.collection('test_object_id_generation.data2');
        // Insert another test document and collect using ObjectId
        collection.insert({"name":"Patty", "age":34}, configuration.writeConcern(), function(err, ids) {
          test.ok(err != null);
          test.ok(err.message.indexOf("0") != -1)
          // Let's close the db
          db.close();
          test.done();
        });
      };

      // Add listener to close event
      db.once("close", closeListener);
      // Ensure death of server instance
      db.serverConfig.connections()[0].destroy();
      // console.dir(db.serverConfig.connections());
    });
  }
}

