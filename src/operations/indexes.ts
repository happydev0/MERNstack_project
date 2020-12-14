import { indexInformation, IndexInformationOptions } from './common_functions';
import { AbstractOperation, Aspect, defineAspects } from './operation';
import { MongoError } from '../error';
import {
  maxWireVersion,
  parseIndexOptions,
  MongoDBNamespace,
  Callback,
  getTopology
} from '../utils';
import {
  CommandOperation,
  CommandOperationOptions,
  OperationParent,
  CollationOptions
} from './command';
import { ReadPreference } from '../read_preference';
import type { Server } from '../sdam/server';
import type { Document } from '../bson';
import type { Collection } from '../collection';
import type { Db } from '../db';
import { AbstractCursor } from '../cursor/abstract_cursor';
import type { ClientSession } from '../sessions';
import { executeOperation, ExecutionResult } from './execute_operation';

const LIST_INDEXES_WIRE_VERSION = 3;
const VALID_INDEX_OPTIONS = new Set([
  'background',
  'unique',
  'name',
  'partialFilterExpression',
  'sparse',
  'hidden',
  'expireAfterSeconds',
  'storageEngine',
  'collation',

  // text indexes
  'weights',
  'default_language',
  'language_override',
  'textIndexVersion',

  // 2d-sphere indexes
  '2dsphereIndexVersion',

  // 2d indexes
  'bits',
  'min',
  'max',

  // geoHaystack Indexes
  'bucketSize',

  // wildcard indexes
  'wildcardProjection'
]);

/** @public */
export type IndexDirection = -1 | 1 | '2d' | '2dsphere' | 'text' | 'geoHaystack' | number;
/** @public */
export type IndexSpecification =
  | string
  | [string, IndexDirection]
  | { [key: string]: IndexDirection }
  | [string, IndexDirection][]
  | { [key: string]: IndexDirection }[]
  | IndexSpecification[];

/** @public */
export interface IndexDescription {
  collation?: CollationOptions;
  name?: string;
  key: Document;
}

/** @public */
export interface CreateIndexesOptions extends CommandOperationOptions {
  /** Creates the index in the background, yielding whenever possible. */
  background?: boolean;
  /** Creates an unique index. */
  unique?: boolean;
  /** Override the autogenerated index name (useful if the resulting name is larger than 128 bytes) */
  name?: string;
  /** Creates a partial index based on the given filter object (MongoDB 3.2 or higher) */
  partialFilterExpression?: Document;
  /** Creates a sparse index. */
  sparse?: boolean;
  /** Allows you to expire data on indexes applied to a data (MongoDB 2.2 or higher) */
  expireAfterSeconds?: number;
  storageEngine?: Document;
  /** (MongoDB 4.4. or higher) Specifies how many data-bearing members of a replica set, including the primary, must complete the index builds successfully before the primary marks the indexes as ready. This option accepts the same values for the "w" field in a write concern plus "votingMembers", which indicates all voting data-bearing nodes. */
  commitQuorum?: number | string;
  // text indexes
  weights?: Document;
  default_language?: string;
  language_override?: string;
  textIndexVersion?: number;
  // 2d-sphere indexes
  '2dsphereIndexVersion'?: number;
  // 2d indexes
  bits?: number;
  /** For geospatial indexes set the lower bound for the co-ordinates. */
  min?: number;
  /** For geospatial indexes set the high bound for the co-ordinates. */
  max?: number;
  // geoHaystack Indexes
  bucketSize?: number;
  // wildcard indexes
  wildcardProjection?: Document;
}

function makeIndexSpec(indexSpec: IndexSpecification, options: any): IndexDescription {
  const indexParameters = parseIndexOptions(indexSpec);

  // Generate the index name
  const name = typeof options.name === 'string' ? options.name : indexParameters.name;

  // Set up the index
  const finalIndexSpec: Document = { name, key: indexParameters.fieldHash };

  // merge valid index options into the index spec
  for (const optionName in options) {
    if (VALID_INDEX_OPTIONS.has(optionName)) {
      finalIndexSpec[optionName] = options[optionName];
    }
  }

  return finalIndexSpec as IndexDescription;
}

/** @internal */
export class IndexesOperation extends AbstractOperation<Document> {
  options: IndexInformationOptions;
  collection: Collection;

  constructor(collection: Collection, options: IndexInformationOptions) {
    super(options);
    this.options = options;
    this.collection = collection;
  }

  execute(server: Server, session: ClientSession, callback: Callback<Document>): void {
    const coll = this.collection;
    const options = this.options;

    indexInformation(
      coll.s.db,
      coll.collectionName,
      { full: true, ...options, readPreference: this.readPreference, session },
      callback
    );
  }
}

/** @internal */
export class CreateIndexesOperation<
  T extends string | string[] = string[]
> extends CommandOperation<T> {
  options: CreateIndexesOptions;
  collectionName: string;
  indexes: IndexDescription[];

  constructor(
    parent: OperationParent,
    collectionName: string,
    indexes: IndexDescription[],
    options?: CreateIndexesOptions
  ) {
    super(parent, options);

    this.options = options ?? {};
    this.collectionName = collectionName;

    this.indexes = indexes;
  }

  execute(server: Server, session: ClientSession, callback: Callback<T>): void {
    const options = this.options;
    const indexes = this.indexes;

    const serverWireVersion = maxWireVersion(server);

    // Ensure we generate the correct name if the parameter is not set
    for (let i = 0; i < indexes.length; i++) {
      // Did the user pass in a collation, check if our write server supports it
      if (indexes[i].collation && serverWireVersion < 5) {
        callback(
          new MongoError(
            `Server ${server.name}, which reports wire version ${serverWireVersion}, ` +
              'does not support collation'
          )
        );
        return;
      }

      if (indexes[i].name == null) {
        const keys = [];

        for (const name in indexes[i].key) {
          keys.push(`${name}_${indexes[i].key[name]}`);
        }

        // Set the name
        indexes[i].name = keys.join('_');
      }
    }

    const cmd: Document = { createIndexes: this.collectionName, indexes };

    if (options.commitQuorum != null) {
      if (serverWireVersion < 9) {
        callback(
          new MongoError('`commitQuorum` option for `createIndexes` not supported on servers < 4.4')
        );
        return;
      }
      cmd.commitQuorum = options.commitQuorum;
    }

    // collation is set on each index, it should not be defined at the root
    this.options.collation = undefined;

    super.executeCommand(server, session, cmd, err => {
      if (err) {
        callback(err);
        return;
      }

      const indexNames = indexes.map(index => index.name || '');
      callback(undefined, indexNames as T);
    });
  }
}

/** @internal */
export class CreateIndexOperation extends CreateIndexesOperation<string> {
  constructor(
    parent: OperationParent,
    collectionName: string,
    indexSpec: IndexSpecification,
    options?: CreateIndexesOptions
  ) {
    // createIndex can be called with a variety of styles:
    //   coll.createIndex('a');
    //   coll.createIndex({ a: 1 });
    //   coll.createIndex([['a', 1]]);
    // createIndexes is always called with an array of index spec objects

    super(parent, collectionName, [makeIndexSpec(indexSpec, options)], options);
  }
  execute(server: Server, session: ClientSession, callback: Callback<string>): void {
    super.execute(server, session, (err, indexNames) => {
      if (err || !indexNames) return callback(err);
      return callback(undefined, indexNames[0]);
    });
  }
}

/** @internal */
export class EnsureIndexOperation extends CreateIndexOperation {
  db: Db;
  collectionName: string;

  constructor(
    db: Db,
    collectionName: string,
    indexSpec: IndexSpecification,
    options?: CreateIndexesOptions
  ) {
    super(db, collectionName, indexSpec, options);

    this.readPreference = ReadPreference.primary;
    this.db = db;
    this.collectionName = collectionName;
  }

  execute(server: Server, session: ClientSession, callback: Callback): void {
    const indexName = this.indexes[0].name;
    const cursor = this.db.collection(this.collectionName).listIndexes({ session });
    cursor.toArray((err, indexes) => {
      /// ignore "NamespaceNotFound" errors
      if (err && (err as MongoError).code !== 26) {
        return callback(err);
      }

      if (indexes) {
        indexes = Array.isArray(indexes) ? indexes : [indexes];
        if (indexes.some(index => index.name === indexName)) {
          callback(undefined, indexName);
          return;
        }
      }

      super.execute(server, session, callback);
    });
  }
}

/** @public */
export type DropIndexesOptions = CommandOperationOptions;

/** @internal */
export class DropIndexOperation extends CommandOperation<Document> {
  options: DropIndexesOptions;
  collection: Collection;
  indexName: string;

  constructor(collection: Collection, indexName: string, options?: DropIndexesOptions) {
    super(collection, options);

    this.options = options ?? {};
    this.collection = collection;
    this.indexName = indexName;
  }

  execute(server: Server, session: ClientSession, callback: Callback<Document>): void {
    const cmd = { dropIndexes: this.collection.collectionName, index: this.indexName };
    super.executeCommand(server, session, cmd, callback);
  }
}

/** @internal */
export class DropIndexesOperation extends DropIndexOperation {
  constructor(collection: Collection, options: DropIndexesOptions) {
    super(collection, '*', options);
  }

  execute(server: Server, session: ClientSession, callback: Callback): void {
    super.execute(server, session, err => {
      if (err) return callback(err, false);
      callback(undefined, true);
    });
  }
}

/** @public */
export interface ListIndexesOptions extends CommandOperationOptions {
  /** The batchSize for the returned command cursor or if pre 2.8 the systems batch collection */
  batchSize?: number;
}

/** @internal */
export class ListIndexesOperation extends CommandOperation<Document> {
  options: ListIndexesOptions;
  collectionNamespace: MongoDBNamespace;

  constructor(collection: Collection, options?: ListIndexesOptions) {
    super(collection, options);

    this.options = options ?? {};
    this.collectionNamespace = collection.s.namespace;
  }

  execute(server: Server, session: ClientSession, callback: Callback<Document>): void {
    const serverWireVersion = maxWireVersion(server);
    if (serverWireVersion < LIST_INDEXES_WIRE_VERSION) {
      const systemIndexesNS = this.collectionNamespace.withCollection('system.indexes');
      const collectionNS = this.collectionNamespace.toString();

      server.query(
        systemIndexesNS,
        { query: { ns: collectionNS } },
        { ...this.options, readPreference: this.readPreference },
        callback
      );
      return;
    }

    const cursor = this.options.batchSize ? { batchSize: this.options.batchSize } : {};
    super.executeCommand(
      server,
      session,
      { listIndexes: this.collectionNamespace.collection, cursor },
      callback
    );
  }
}

/** @public */
export class ListIndexesCursor extends AbstractCursor {
  parent: Collection;
  options?: ListIndexesOptions;

  constructor(collection: Collection, options?: ListIndexesOptions) {
    super(getTopology(collection), collection.s.namespace, options);
    this.parent = collection;
    this.options = options;
  }

  clone(): ListIndexesCursor {
    return new ListIndexesCursor(this.parent, {
      ...this.options,
      ...this.cursorOptions
    });
  }

  /** @internal */
  _initialize(session: ClientSession | undefined, callback: Callback<ExecutionResult>): void {
    const operation = new ListIndexesOperation(this.parent, {
      ...this.cursorOptions,
      ...this.options,
      session
    });

    executeOperation(getTopology(this.parent), operation, (err, response) => {
      if (err || response == null) return callback(err);

      // TODO: NODE-2882
      callback(undefined, { server: operation.server, session, response });
    });
  }
}

/** @internal */
export class IndexExistsOperation extends AbstractOperation<boolean> {
  options: IndexInformationOptions;
  collection: Collection;
  indexes: string | string[];

  constructor(
    collection: Collection,
    indexes: string | string[],
    options: IndexInformationOptions
  ) {
    super(options);
    this.options = options;
    this.collection = collection;
    this.indexes = indexes;
  }

  execute(server: Server, session: ClientSession, callback: Callback<boolean>): void {
    const coll = this.collection;
    const indexes = this.indexes;

    indexInformation(
      coll.s.db,
      coll.collectionName,
      { ...this.options, readPreference: this.readPreference, session },
      (err, indexInformation) => {
        // If we have an error return
        if (err != null) return callback(err);
        // Let's check for the index names
        if (!Array.isArray(indexes)) return callback(undefined, indexInformation[indexes] != null);
        // Check in list of indexes
        for (let i = 0; i < indexes.length; i++) {
          if (indexInformation[indexes[i]] == null) {
            return callback(undefined, false);
          }
        }

        // All keys found return true
        return callback(undefined, true);
      }
    );
  }
}

/** @internal */
export class IndexInformationOperation extends AbstractOperation<Document> {
  options: IndexInformationOptions;
  db: Db;
  name: string;

  constructor(db: Db, name: string, options?: IndexInformationOptions) {
    super(options);
    this.options = options ?? {};
    this.db = db;
    this.name = name;
  }

  execute(server: Server, session: ClientSession, callback: Callback<Document>): void {
    const db = this.db;
    const name = this.name;

    indexInformation(
      db,
      name,
      { ...this.options, readPreference: this.readPreference, session },
      callback
    );
  }
}

defineAspects(ListIndexesOperation, [Aspect.READ_OPERATION, Aspect.RETRYABLE]);
defineAspects(CreateIndexesOperation, [Aspect.WRITE_OPERATION]);
defineAspects(CreateIndexOperation, [Aspect.WRITE_OPERATION]);
defineAspects(EnsureIndexOperation, [Aspect.WRITE_OPERATION]);
defineAspects(DropIndexOperation, [Aspect.WRITE_OPERATION]);
defineAspects(DropIndexesOperation, [Aspect.WRITE_OPERATION]);
