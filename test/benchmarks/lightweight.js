var Suite = require('betterbenchmarks').Suite,
  Benchmark = require('betterbenchmarks').Benchmark,
  JSONStream = require('JSONStream'),
  // MBSimpleReporter = require('./mb_lightweight_reporter'),
  MBSimpleReporter = require('./mb_featherweight_reporter'),
  es = require('event-stream'),
  co = require('co'),
  stream = require('stream'),
  f = require('util').format,
  fs = require('fs'),
  ldj = require('ldjson-stream'),
  globalSetup = require('./shared').globalSetup,
  getDb = require('./shared').getDb,
  deflate = require('./shared').deflate,
  MongoClient = require('../../').MongoClient,
  GridFSBucket = require('../../').GridFSBucket;

// Created a BSON instance
var BSON = require('bson').native().BSON;

// Create a suite
var suite = new Suite('feather weight test suite', {
  warmup: 1, cycles: 1, iterations: 10000, async:true
});

// // Add the MB reporter
// suite.addReporter(new MBSimpleReporter());

// // -----------------------------------------------------------------------------
// //
// // RUN COMMAND BENCHMARK
// //
// // -----------------------------------------------------------------------------
//
// // ismaster run in serial mode
// suite.addTest(new Benchmark('ismaster command benchmark in serial mode')
//   .set(function(context, callback) {
//     context.db.command({ismaster:true}, function() {
//       callback();
//     });
//   })
//   .setup(function(context, options, callback) {
//     co(function*(){
//       // Create a bson serializer
//       var bson = new BSON();
//       // Start up the server
//       context.manager = yield globalSetup();
//       // Total size
//       context.size = bson.calculateObjectSize({ismaster:true}) * suite.options.iterations;
//       // Get db connection
//       context.db = yield getDb('benchmark', 10);
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
//   .teardown(function(context, stats, options, callback) {
//     co(function*(){
//       // Stop the db connection
//       yield context.db.close();
//       // Start up the server
//       context.manager.stop();
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
// );

// // Add the flat json parsing test
// suite.addTest(new Benchmark('ismaster command benchmark parallel')
//   // Add custom method (we are responsible for marking the demarkation)
//   .custom(function(context, stats, callback) {
//     // Commands left to do
//     var left = suite.options.iterations;
//
//     // Keep scope local for stat object
//     var execute = function() {
//       var stat = stats.startParallelIteration();
//       // Execute the command
//       context.db.command({ismaster:true}, function(err, r) {
//         stat.end();
//         left = left - 1;
//
//         if(left == 0) {
//           callback();
//         }
//       });
//     }
//
//     // Fire of all the messages in parallel
//     for(var i = 0; i < suite.options.iterations; i++) {
//       execute()
//     }
//   })
//   .addMetadata({custom:true})
//   .setup(function(context, options, callback) {
//     co(function*(){
//       // Create a bson serializer
//       var bson = new BSON();
//       // Start up the server
//       context.manager = yield globalSetup();
//       // Total size
//       context.size = bson.calculateObjectSize({ismaster:true}) * suite.options.iterations;
//       // Get db connection
//       context.db = yield getDb('benchmark', 10);
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
//   .teardown(function(context, stats, options, callback) {
//     co(function*(){
//       // Stop the db connection
//       yield context.db.close();
//       // Start up the server
//       context.manager.stop();
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
// );

// // -----------------------------------------------------------------------------
// //
// // FIND ONE BY ID
// //
// // -----------------------------------------------------------------------------
//
// // Add the flat json parsing test
// suite.addTest(new Benchmark('find one by id')
//   // The benchmark function
//   .set(function(context, callback) {
//     context.collection.findOne({_id: context.queryId++}, function(e, r) {
//       callback();
//     });
//   })
//   .setup(function(context, options, callback) {
//     co(function*(){
//       // Create a bson serializer
//       var bson = new BSON();
//       // Start up the server
//       context.manager = yield globalSetup();
//       // Get db connection
//       context.db = yield getDb('benchmark', 10);
//       // Get the corpus collection
//       context.collection = context.db.collection('corpus');
//       // Id used for the docs
//       context.id = 1;
//       // Context query id
//       context.queryId = 1;
//       // Insert all the documents
//       var filestream = fs.createReadStream(f('%s/performance-data/TWITTER', __dirname));
//       filestream
//       .pipe(ldj.parse())
//       .on('data', function(doc) {
//         filestream.pause();
//         // Add _id value
//         doc._id = context.id++;
//         // Perform an insert
//         context.collection.insertOne(doc, {w:1}, function(err, r) {
//           filestream.resume();
//         });
//       })
//       .on('end', function() {
//         callback();
//       });
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
//   .teardown(function(context, stats, options, callback) {
//     co(function*(){
//       // Stop the db connection
//       yield context.db.close();
//       // Start up the server
//       context.manager.stop();
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
// );

// // Add the flat json parsing test
// suite.addTest(new Benchmark('find one by id MB/s parallel')
//   // Add custom method (we are responsible for marking the demarkation)
//   .custom(function(context, stats, callback) {
//     // Commands left to do
//     var left = suite.options.iterations;
//
//     // Run a single iteration
//     stats.startIteration();
//
//     // Fire of all the messages in parallel
//     for(var i = 0; i < suite.options.iterations; i++) {
//       context.collection.findOne({_id: i}, function() {
//         left = left - 1;
//
//         if(left == 0) {
//           stats.endIteration();
//           callback();
//         }
//       });
//     }
//   })
//   .setup(function(context, options, callback) {
//     co(function*(){
//       // Create a bson serializer
//       var bson = new BSON();
//       // Start up the server
//       context.manager = yield globalSetup();
//       // Get db connection
//       context.db = yield getDb('benchmark', 10);
//       // Get the corpus collection
//       context.collection = context.db.collection('corpus');
//       // Id used for the docs
//       context.id = 1;
//       // Context query id
//       context.queryId = 1;
//       // Size used to calculate the
//       context.size = 0;
//       // Insert all the documents
//       var filestream = fs.createReadStream(f('%s/performance-data/TWITTER', __dirname));
//       filestream
//       .pipe(ldj.parse())
//       .on('data', function(doc) {
//         filestream.pause();
//         // Add _id value
//         doc._id = context.id++;
//
//         // Calculate the bson size for the first 100000 docs
//         if(context.id <= 10000) {
//           context.size = context.size + bson.calculateObjectSize(doc);
//         }
//
//         // Perform an insert
//         context.collection.insertOne(doc, {w:1}, function(err, r) {
//           filestream.resume();
//         });
//       })
//       .on('end', function() {
//         callback();
//       });
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
//   .teardown(function(context, stats, options, callback) {
//     co(function*(){
//       // Stop the db connection
//       yield context.db.close();
//       // Start up the server
//       context.manager.stop();
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
// );

// // -----------------------------------------------------------------------------
// //
// // SMALL DOC INSERT
// //
// // -----------------------------------------------------------------------------
//
// // Add the flat json parsing test
// suite.addTest(new Benchmark('small doc insert MB/s 1')
//   // Add custom method (we are responsible for marking the demarkation)
//   .set(function(context, callback) {
//     context.collection.insertOne(context.json, function(err, r) {
//       callback();
//     });
//   })
//   .iteration().setup(function(context, options, callback) {
//     delete context.json['_id'];
//     callback();
//   })
//   .cycle().setup(function(context, options, callback) {
//     context.collection.drop(function() {
//       callback();
//     });
//   })
//   .setup(function(context, options, callback) {
//     co(function*(){
//       // Create a bson serializer
//       var bson = new BSON();
//       // Start up the server
//       context.manager = yield globalSetup();
//       // Get db connection
//       context.db = yield getDb('benchmark', 10);
//       // Get the corpus collection
//       context.collection = context.db.collection('corpus');
//       // Get the json document
//       var json = fs.readFileSync(f('%s/performance-data/SINGLE_DOCUMENT/SMALL_DOC.json', __dirname), 'utf8');
//       json = JSON.parse(json);
//       json = deflate(json);
//       // Add to the context
//       context.json = json;
//       // Finish up the setup
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
//   .teardown(function(context, stats, options, callback) {
//     co(function*(){
//       // Stop the db connection
//       yield context.db.close();
//       // Start up the server
//       context.manager.stop();
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
// );

// // Add the flat json parsing test
// suite.addTest(new Benchmark('small doc insert MB/s parallel')
//   // Add custom method (we are responsible for marking the demarkation)
//   .custom(function(context, stats, callback) {
//     var left = suite.options.iterations;
//
//     // Keep scope local for stat object
//     var execute = function() {
//       delete context.json['_id'];
//       var stat = stats.startParallelIteration();
//       // Execute the command
//       context.collection.insertOne(context.json, function(err, r) {
//         console.dir(r)
//         stat.end();
//         left = left - 1;
//
//         if(left == 0) {
//           callback();
//         }
//       });
//     }
//
//     // Fire of all the messages in parallel
//     for(var i = 0; i < suite.options.iterations; i++) {
//       execute(context.json);
//     }
//   })
//   .cycle().setup(function(context, options, callback) {
//     context.collection.drop(function() {
//       callback();
//     });
//   })
//   .setup(function(context, options, callback) {
//     co(function*(){
//       // Create a bson serializer
//       var bson = new BSON();
//       // Start up the server
//       context.manager = yield globalSetup();
//       // Get db connection
//       context.db = yield getDb('benchmark', 10);
//       // Get the corpus collection
//       context.collection = context.db.collection('corpus');
//       // Get the json document
//       var json = fs.readFileSync(f('%s/performance-data/SINGLE_DOCUMENT/SMALL_DOC.json', __dirname), 'utf8');
//       json = JSON.parse(json);
//       json = deflate(json);
//       // Add to the context
//       context.json = json;
//       // Finish up the setup
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
//   .teardown(function(context, stats, options, callback) {
//     co(function*(){
//       // Stop the db connection
//       yield context.db.close();
//       // Start up the server
//       context.manager.stop();
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
// );

// // -----------------------------------------------------------------------------
// //
// // LARGE DOC INSERT
// //
// // -----------------------------------------------------------------------------
//
// // Add the flat json parsing test
// suite.addTest(new Benchmark('large doc insert', {
//     iterations:10
//   })
//   // Add custom method (we are responsible for marking the demarkation)
//   .set(function(context, callback) {
//     context.collection.insertOne(context.json, function(err, r) {
//       callback();
//     });
//   })
//   .iteration().setup(function(context, options, callback) {
//     delete context.json['_id'];
//     callback();
//   })
//   .cycle().setup(function(context, options, callback) {
//     context.collection.drop(function() {
//       callback();
//     });
//   })
//   .setup(function(context, options, callback) {
//     co(function*(){
//       // Create a bson serializer
//       var bson = new BSON();
//       // Start up the server
//       context.manager = yield globalSetup();
//       // Get db connection
//       context.db = yield getDb('benchmark', 10);
//       // Get the corpus collection
//       context.collection = context.db.collection('corpus');
//       // Get the json document
//       var json = fs.readFileSync(f('%s/performance-data/SINGLE_DOCUMENT/LARGE_DOC.json', __dirname), 'utf8');
//       json = JSON.parse(json);
//       json = deflate(json);
//       // Add to the context
//       context.json = json;
//       // Finish up the setup
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
//   .teardown(function(context, stats, options, callback) {
//     co(function*(){
//       // Stop the db connection
//       yield context.db.close();
//       // Start up the server
//       context.manager.stop();
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
// );
//
// // Add the flat json parsing test
// suite.addTest(new Benchmark('large doc insert parallell', {
//     iterations:10
//   })
//   // Add custom method (we are responsible for marking the demarkation)
//   .custom(function(context, stats, options, callback) {
//     var left = options.iterations;
//
//     // Keep scope local for stat object
//     var execute = function() {
//       delete context.json['_id'];
//       var stat = stats.startParallelIteration();
//       // Execute the command
//       context.collection.insertOne(context.json, function(err, r) {
//         stat.end();
//         left = left - 1;
//
//         if(left == 0) {
//           callback();
//         }
//       });
//     }
//
//     // Fire of all the messages in parallel
//     for(var i = 0; i < options.iterations; i++) {
//       execute(context.json);
//     }
//   })
//   .cycle().setup(function(context, options, callback) {
//     context.collection.drop(function() {
//       callback();
//     });
//   })
//   .setup(function(context, options, callback) {
//     co(function*(){
//       // Create a bson serializer
//       var bson = new BSON();
//       // Start up the server
//       context.manager = yield globalSetup();
//       // Get db connection
//       context.db = yield getDb('benchmark', 10);
//       // Get the corpus collection
//       context.collection = context.db.collection('corpus');
//       // Get the json document
//       var json = fs.readFileSync(f('%s/performance-data/SINGLE_DOCUMENT/LARGE_DOC.json', __dirname), 'utf8');
//       json = JSON.parse(json);
//       json = deflate(json);
//       // Add to the context
//       context.json = json;
//       // Finish up the setup
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
//   .teardown(function(context, stats, options, callback) {
//     co(function*(){
//       // Stop the db connection
//       yield context.db.close();
//       // Start up the server
//       context.manager.stop();
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
// );

// -----------------------------------------------------------------------------
//
// Find many and empty the cursor
//
// -----------------------------------------------------------------------------

// Add the flat json parsing test
suite.addTest(new Benchmark('find many and empty the cursor')
  // The benchmark function
  .set(function(context, callback) {
    context.collection.find({}).each(function(e, r) {
      if(r == null) callback();
    });
  })
  .setup(function(context, options, callback) {
    co(function*(){
      // Create a bson serializer
      var bson = new BSON();
      // Start up the server
      context.manager = yield globalSetup();
      // Get db connection
      context.db = yield getDb('benchmark', 10);
      // Get the corpus collection
      context.collection = context.db.collection('corpus');
      // Id used for the docs
      context.id = 1;
      // Total size of query
      context.size = 0;
      // Context query id
      context.queryId = 1;
      // Contains pipe
      var pipe = ldj.parse();
      // Insert all the documents
      var filestream = fs.createReadStream(f('%s/performance-data/TWITTER', __dirname));
      filestream
        .pipe(pipe)
        .on('data', function(doc) {
          pipe.pause();
          // Add _id value
          doc._id = context.id++;
          // Calculate size of entire query
          context.size = context.size + bson.calculateObjectSize(doc);
          // Perform an insert
          context.collection.insertOne(doc, {w:1}, function(err, r) {
            pipe.resume();
          });
        })
        .on('end', function() {
          callback();
        });
    }).catch(function(e) {
      console.log(e.stack);
    });
  })
  .teardown(function(context, stats, options, callback) {
    co(function*(){
      // Stop the db connection
      yield context.db.close();
      // Start up the server
      context.manager.stop();
      // Finish up
      callback();
    }).catch(function(e) {
      console.log(e.stack);
    });
  })
);

// // -----------------------------------------------------------------------------
// //
// // Small doc bulk insert
// //
// // -----------------------------------------------------------------------------
//
// // Add the flat json parsing test
// suite.addTest(new Benchmark('small doc bulk insert MB/s')
//   // Add custom method (we are responsible for marking the demarkation)
//   .custom(function(context, stats, callback) {
//     // Commands left to do
//     var left = context.documents.length;
//
//     // Run a single iteration
//     stats.startIteration();
//
//     // Execute bulk insert
//     context.collection.insertMany(context.documents, function(err) {
//       stats.endIteration();
//       callback();
//     });
//   })
//   .addMetadata({
//     custom:true
//   })
//   .cycle().setup(function(context, options, callback) {
//     context.collection.drop(function() {
//       callback();
//     });
//   })
//   .setup(function(context, options, callback) {
//     co(function*(){
//       // Create a bson serializer
//       var bson = new BSON();
//       // Start up the server
//       context.manager = yield globalSetup();
//       // Get db connection
//       context.db = yield getDb('benchmark', 10);
//       // Get the corpus collection
//       context.collection = context.db.collection('corpus');
//       // Size used to calculate the
//       context.size = 0;
//       // Documents
//       context.documents = [];
//       // Insert all the documents
//       var filestream = fs.createReadStream(f('%s/performance-data/SMALL_DOC', __dirname));
//       filestream
//       .pipe(ldj.parse())
//       .on('data', function(doc) {
//         context.documents.push(doc);
//         context.size = context.size + bson.calculateObjectSize(doc);
//       })
//       .on('end', function() {
//         callback();
//       });
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
//   .teardown(function(context, stats, options, callback) {
//     co(function*(){
//       // Stop the db connection
//       yield context.db.close();
//       // Start up the server
//       context.manager.stop();
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
// );

// // -----------------------------------------------------------------------------
// //
// // Large doc bulk insert
// //
// // -----------------------------------------------------------------------------
//
// // Add the flat json parsing test
// suite.addTest(new Benchmark('large doc bulk insert MB/s')
//   // Add custom method (we are responsible for marking the demarkation)
//   .custom(function(context, stats, callback) {
//     // Commands left to do
//     var left = context.documents.length;
//
//     // Run a single iteration
//     stats.startIteration();
//
//     // Execute bulk insert
//     context.collection.insertMany(context.documents, function(err) {
//       stats.endIteration();
//       callback();
//     });
//   })
//   .addMetadata({
//     custom:true
//   })
//   .cycle().setup(function(context, options, callback) {
//     context.collection.drop(function() {
//       callback();
//     });
//   })
//   .setup(function(context, options, callback) {
//     co(function*(){
//       // Create a bson serializer
//       var bson = new BSON();
//       // Start up the server
//       context.manager = yield globalSetup();
//       // Get db connection
//       context.db = yield getDb('benchmark', 10);
//       // Get the corpus collection
//       context.collection = context.db.collection('corpus');
//       // Size used to calculate the
//       context.size = 0;
//       // Number of docs
//       context.numberOfDocs = 0;
//       // Documents
//       context.documents = [];
//       // Insert all the documents
//       var filestream = fs.createReadStream(f('%s/performance-data/LARGE_DOC', __dirname));
//       filestream
//         .pipe(ldj.parse())
//         .on('data', function(doc) {
//           context.documents.push(doc);
//           context.numberOfDocs = context.numberOfDocs + 1;
//           context.size = context.size + bson.calculateObjectSize(doc);
//
//           if(context.numberOfDocs == 100) {
//             return filestream.destroy()
//           }
//         });
//
//       filestream.on('close', function() {
//         callback();
//       });
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
//   .teardown(function(context, stats, options, callback) {
//     co(function*(){
//       // Stop the db connection
//       yield context.db.close();
//       // Start up the server
//       context.manager.stop();
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
// );

// // -----------------------------------------------------------------------------
// //
// // GridFS upload
// //
// // -----------------------------------------------------------------------------
//
// // Add the flat json parsing test
// suite.addTest(new Benchmark('GridFS upload MB/s')
//   // Add custom method (we are responsible for marking the demarkation)
//   .custom(function(context, stats, callback) {
//     var bucket = new GridFSBucket(context.db);
//     var index = 0;
//
//     // Execute
//     var execute = function(left, _callback) {
//       if(left == 0) return callback();
//       // Create a simple read stream
//       var readStream = new stream.Readable();
//       readStream._read = function noop() {}; // redundant? see update below
//       readStream.push(context.document);
//       readStream.push(null);
//       // Create an upload stream
//       var uploadStream = bucket.openUploadStream(f('file%s.txt', index++));
//       var s = new Date();
//       // Wait for stream to finish
//       uploadStream.once('finish', function() {
//         stats.endIteration()
//         execute(left - 1, _callback);
//       });
//
//       stats.startIteration();
//       readStream.pipe(uploadStream);
//     }
//
//     execute(context.numberOfDocs, callback);
//   })
//   .addMetadata({
//     custom:true
//   })
//   .cycle().setup(function(context, options, callback) {
//     context.collection.drop(function() {
//       callback();
//     });
//   })
//   .setup(function(context, options, callback) {
//     co(function*(){
//       // Create a bson serializer
//       var bson = new BSON();
//       // Start up the server
//       context.manager = yield globalSetup();
//       // Get db connection
//       context.db = yield getDb('benchmark', 10);
//       // Get the corpus collection
//       context.collection = context.db.collection('corpus');
//       // Number of docs
//       context.numberOfDocs = 50;
//       // Document
//       context.document = new Buffer(50 * 1024 * 1024).toString('utf8');
//       // Set the file size
//       context.size = context.document.length;
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
//   .teardown(function(context, stats, options, callback) {
//     co(function*(){
//       // Stop the db connection
//       yield context.db.close();
//       // Start up the server
//       context.manager.stop();
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
// );

// // -----------------------------------------------------------------------------
// //
// // GridFS download
// //
// // -----------------------------------------------------------------------------
//
// // Add the flat json parsing test
// suite.addTest(new Benchmark('GridFS download MB/s')
//   // Add custom method (we are responsible for marking the demarkation)
//   .custom(function(context, stats, callback) {
//     var bucket = new GridFSBucket(context.db);
//
//     // Execute
//     var execute = function(left, _callback) {
//       if(left == 0) return callback();
//       // Create a simple read stream
//       var downloadStream = bucket.openDownloadStream(context.id);
//       downloadStream.on('data', function(data) {});
//
//       stats.startIteration();
//
//       downloadStream.once('end', function() {
//         stats.endIteration();
//         execute(left - 1, callback);
//       });
//     }
//
//     execute(context.numberOfDocs, callback);
//   })
//   .cycle().setup(function(context, options, callback) {
//     context.collection.drop(function() {
//       callback();
//     });
//   })
//   .addMetadata({
//     custom:true
//   })
//   .setup(function(context, options, callback) {
//     co(function*(){
//       // Create a bson serializer
//       var bson = new BSON();
//       // Start up the server
//       context.manager = yield globalSetup();
//       // Get db connection
//       context.db = yield getDb('benchmark', 10);
//       // Get the corpus collection
//       context.collection = context.db.collection('corpus');
//       // Number of docs
//       context.numberOfDocs = 50;
//       // Document
//       context.document = new Buffer(50 * 1024 * 1024).toString('utf8');
//       // Set the file size
//       context.size = context.document.length;
//
//       // Create a simple read stream
//       var readStream = new stream.Readable();
//       readStream._read = function noop() {}; // redundant? see update below
//       readStream.push(context.document);
//       readStream.push(null);
//       // Open the bucket
//       var bucket = new GridFSBucket(context.db);
//       // Create an upload stream
//       var uploadStream = bucket.openUploadStream(f('file0.txt'));
//       context.id = uploadStream.id;
//       // Wait for stream to finish
//       uploadStream.once('finish', function() {
//         callback();
//       });
//
//       readStream.pipe(uploadStream);
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
//   .teardown(function(context, stats, options, callback) {
//     co(function*(){
//       // Stop the db connection
//       yield context.db.close();
//       // Start up the server
//       context.manager.stop();
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
// );

// // -----------------------------------------------------------------------------
// //
// // LDJSON multi-file import
// //
// // -----------------------------------------------------------------------------
//
// // Add the flat json parsing test
// suite.addTest(new Benchmark('LDJSON multi-file import MB/s')
//   // Add custom method (we are responsible for marking the demarkation)
//   .custom(function(context, stats, callback) {
//     var bucket = new GridFSBucket(context.db);
//     var index = 0;
//
//     // Execute
//     var execute = function(left, _callback) {
//       if(left == 0) return callback();
//
//       // Deserialize the whole set of documents
//       var pipe = ldj.parse();
//       var docs = [];
//
//       // Create a simple read stream
//       var readStream = new stream.Readable();
//       readStream._read = function noop() {}; // redundant? see update below
//       readStream.push(context.documents[index++]);
//       readStream.push(null);
//
//       // All documents
//       pipe.on('data', function(doc) {
//         docs.push(doc);
//       });
//
//       pipe.once('end', function() {
//         // Perform unordered insert
//         stats.startIteration();
//
//         // Inset all the documents
//         context.collection.insertMany(docs, {ordered:false}, function() {
//           stats.endIteration();
//           execute(left - 1, callback);
//         });
//       });
//
//       readStream.pipe(pipe);
//     }
//
//     execute(context.documents.length, callback);
//   })
//   .addMetadata({
//     custom:true
//   })
//   .cycle().setup(function(context, options, callback) {
//     context.collection.drop(function() {
//       callback();
//     });
//   })
//   .setup(function(context, options, callback) {
//     co(function*(){
//       // Create a bson serializer
//       var bson = new BSON();
//       // Start up the server
//       context.manager = yield globalSetup();
//       // Get db connection
//       context.db = yield getDb('benchmark', 10);
//       // Get the corpus collection
//       context.collection = context.db.collection('corpus');
//       // Read in all the ldjson documents
//       var files = fs.readdirSync(f('%s/performance-data/LDJSON_data_file_directory', __dirname));
//       files = files.slice(0, 1);
//       context.documents = files.filter(function(x) {
//         return x.indexOf('.txt');
//       }).map(function(x) {
//         return fs.readFileSync(f('%s/performance-data/LDJSON_data_file_directory/%s', __dirname, x));
//       });
//
//       // Get the size
//       context.size = context.documents[0].length;
//
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
//   .teardown(function(context, stats, options, callback) {
//     co(function*(){
//       // Stop the db connection
//       yield context.db.close();
//       // Start up the server
//       context.manager.stop();
//       // Finish up
//       callback();
//     }).catch(function(e) {
//       console.log(e.stack);
//     });
//   })
// );

module.exports = suite;
