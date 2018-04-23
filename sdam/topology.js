'use strict';
const EventEmitter = require('events');
const ServerDescription = require('./server_description').ServerDescription;
const TopologyDescription = require('./topology_description').TopologyDescription;
const TopologyType = require('./topology_description').TopologyType;
const monitoring = require('./monitoring');
const calculateDurationInMs = require('../utils').calculateDurationInMs;
const MongoTimeoutError = require('../error').MongoTimeoutError;
const MongoError = require('../error').MongoError;

// Global state
let globalTopologyCounter = 0;

// Constants
const DEFAULT_LOCAL_THRESHOLD_MS = 15;
const DEFAULT_HEARTBEAT_FREQUENCY = 10000;
const DEFAULT_SERVER_SELECTION_TIMEOUT = 30000;

/**
 * A container of server instances representing a connection to a MongoDB topology.
 *
 * @fires Topology#serverOpening
 * @fires Topology#serverClosed
 * @fires Topology#serverDescriptionChanged
 * @fires Topology#topologyOpening
 * @fires Topology#topologyClosed
 * @fires Topology#topologyDescriptionChanged
 * @fires Topology#serverHeartbeatStarted
 * @fires Topology#serverHeartbeatSucceeded
 * @fires Topology#serverHeartbeatFailed
 */
class Topology extends EventEmitter {
  /**
   * Create a topology
   *
   * @param {Array|String} seedlist a string list, or array of Server instances to connect to
   * @param {Object} [options] Optional settings
   * @param {Number} [options.localThresholdMS=15] The size of the latency window for selecting among multiple suitable servers
   * @param {Number} [options.serverSelectionTimeoutMS=30000] How long to block for server selection before throwing an error
   * @param {Number} [options.heartbeatFrequencyMS=10000] The frequency with which topology updates are scheduled
   */
  constructor(seedlist, options) {
    super();
    seedlist = seedlist || [];
    options = Object.assign(
      {},
      {
        localThresholdMS: DEFAULT_LOCAL_THRESHOLD_MS,
        serverSelectionTimeoutMS: DEFAULT_SERVER_SELECTION_TIMEOUT,
        heartbeatFrequencyMS: DEFAULT_HEARTBEAT_FREQUENCY
      },
      options
    );

    const topologyType =
      seedlist.length === 1 && !options.replicaset
        ? TopologyType.Single
        : options.replicaset
          ? TopologyType.ReplicaSetNoPrimary
          : TopologyType.Unknown;

    const topologyId = globalTopologyCounter++;
    const serverDescriptions = seedlist.reduce((result, seed) => {
      const address = seed.port ? `${seed.host}:${seed.port}` : `${seed.host}:27017`;
      result.set(address, new ServerDescription(address));
      return result;
    }, new Map());

    this.s = {
      // the id of this topology
      id: topologyId,
      // passed in options
      options: Object.assign({}, options),
      // initial seedlist of servers to connect to
      seedlist: seedlist,
      // the topology description
      description: new TopologyDescription(
        topologyType,
        serverDescriptions,
        options.replicaset,
        null,
        null,
        options
      ),
      serverSelectionTimeoutMS:
        options.serverSelectionTimeoutMS || DEFAULT_SERVER_SELECTION_TIMEOUT,
      heartbeatFrequencyMS: options.heartbeatFrequencyMS || DEFAULT_HEARTBEAT_FREQUENCY,
      ServerClass: options.ServerClass || null /* eventually our Server class, but null for now */
    };
  }

  /**
   * @return A `TopologyDescription` for this topology
   */
  get description() {
    return this.s.description;
  }

  /**
   * Initiate server connect
   *
   * @param {Object} [options] Optional settings
   * @param {Array} [options.auth=null] Array of auth options to apply on connect
   */
  connect(/* options */) {
    // emit SDAM monitoring events
    this.emit('topologyOpening', new monitoring.TopologyOpeningEvent(this.s.id));

    // emit an event for the topology change
    this.emit(
      'topologyDescriptionChanged',
      new monitoring.TopologyDescriptionChangedEvent(
        this.s.id,
        new TopologyDescription(TopologyType.Unknown), // initial is always Unknown
        this.s.description
      )
    );

    // emit ServerOpeningEvents for each server in our topology
    Array.from(this.s.description.servers.keys()).forEach(serverAddress => {
      // publish an open event for each ServerDescription created
      this.emit('serverOpening', new monitoring.ServerOpeningEvent(this.s.id, serverAddress));
    });
  }

  /**
   * Close this topology
   */
  close() {
    // emit an event for close
    this.emit('topologyClosed', new monitoring.TopologyClosedEvent(this.s.id));
  }

  /**
   * Selects a server according to the selection predicate provided
   *
   * @param {function} [selector] An optional selector to select servers by, defaults to a random selection within a latency window
   * @return {Server} An instance of a `Server` meeting the criteria of the predicate provided
   */
  selectServer(selector, options, callback) {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign(
      {},
      { serverSelectionTimeoutMS: this.s.serverSelectionTimeoutMS },
      options
    );

    selectServers(
      this,
      selector,
      options.serverSelectionTimeoutMS,
      process.hrtime(),
      (err, servers) => {
        if (err) return callback(err, null);
        callback(null, randomSelection(servers));
      }
    );
  }

  /**
   * Update the internal TopologyDescription with a ServerDescription
   *
   * @param {object} serverDescription The server to update in the internal list of server descriptions
   */
  update(serverDescription) {
    // these will be used for monitoring events later
    const previousTopologyDescription = this.s.description;
    const previousServerDescription = this.s.description.servers.get(serverDescription.address);

    // first update the TopologyDescription
    this.s.description = this.s.description.update(serverDescription);

    // emit monitoring events for this change
    this.emit(
      'serverDescriptionChanged',
      new monitoring.ServerDescriptionChangedEvent(
        this.s.id,
        serverDescription.address,
        previousServerDescription,
        this.s.description.servers.get(serverDescription.address)
      )
    );

    this.emit(
      'topologyDescriptionChanged',
      new monitoring.TopologyDescriptionChangedEvent(
        this.s.id,
        previousTopologyDescription,
        this.s.description
      )
    );
  }
}

function randomSelection(array) {
  return array[Math.floor(Math.random() * array.length)];
}

class FakeServer {
  constructor(description) {
    this.description = description;
  }
}

/**
 *
 * @param {*} topology
 * @param {*} selector
 * @param {*} options
 * @param {*} callback
 */
function selectServers(topology, selector, timeout, start, callback) {
  if (!topology.description.compatible) {
    return callback(new MongoError(topology.description.compatibilityError));
  }

  const serverDescriptions = Array.from(topology.description.servers.values());
  let descriptions = selector(topology.description, serverDescriptions);
  if (descriptions.length) {
    // TODO: obviously return the actual server in the future
    const servers = descriptions.map(d => new FakeServer(d));
    return callback(null, servers);
  }

  const duration = calculateDurationInMs(process.hrtime(start));
  if (duration > timeout) {
    return callback(new MongoTimeoutError(`Server selection timed out after ${timeout} ms`));
  }

  // TODO: loop this, add monitoring
}

/**
 * A server opening SDAM monitoring event
 *
 * @event Topology#serverOpening
 * @type {ServerOpeningEvent}
 */

/**
 * A server closed SDAM monitoring event
 *
 * @event Topology#serverClosed
 * @type {ServerClosedEvent}
 */

/**
 * A server description SDAM change monitoring event
 *
 * @event Topology#serverDescriptionChanged
 * @type {ServerDescriptionChangedEvent}
 */

/**
 * A topology open SDAM event
 *
 * @event Topology#topologyOpening
 * @type {TopologyOpeningEvent}
 */

/**
 * A topology closed SDAM event
 *
 * @event Topology#topologyClosed
 * @type {TopologyClosedEvent}
 */

/**
 * A topology structure SDAM change event
 *
 * @event Topology#topologyDescriptionChanged
 * @type {TopologyDescriptionChangedEvent}
 */

/**
 * A topology serverHeartbeatStarted SDAM event
 *
 * @event Topology#serverHeartbeatStarted
 * @type {ServerHeartbeatStartedEvent}
 */

/**
 * A topology serverHeartbeatFailed SDAM event
 *
 * @event Topology#serverHeartbeatFailed
 * @type {ServerHearbeatFailedEvent}
 */

/**
 * A topology serverHeartbeatSucceeded SDAM change event
 *
 * @event Topology#serverHeartbeatSucceeded
 * @type {ServerHeartbeatSucceededEvent}
 */

module.exports = {
  Topology,
  ServerDescription
};
