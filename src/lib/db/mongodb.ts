import type { Db, MongoClient } from 'mongodb';

const globalForMongo = globalThis as unknown as {
  _mongoClientPromise?: Promise<MongoClient>;
};

let initialized = false;

async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection('worlds').createIndex({ ownerId: 1, updatedAt: -1 }),
    db.collection('documents').createIndex({ worldId: 1, ownerId: 1, path: 1 }),
    db.collection('documents').createIndex({ parentId: 1 }),
  ]);
}

export async function getMongoClient(): Promise<MongoClient> {
  if (!process.env.MONGODB_URI) {
    throw new Error('Missing MONGODB_URI environment variable.');
  }

  if (!globalForMongo._mongoClientPromise) {
    globalForMongo._mongoClientPromise = import('mongodb')
      .then(({ MongoClient }) => {
        const client = new MongoClient(process.env.MONGODB_URI as string, {
          maxPoolSize: 10,
        });
        return client.connect();
      })
      .catch((error) => {
        console.error('Failed to initialize MongoDB client', error);
        if (
          error instanceof Error &&
          error.message &&
          error.message.toLowerCase().includes('cannot find module')
        ) {
          error.message =
            'The `mongodb` driver is not installed. Add it to your project with `npm install mongodb`.';
        }
        throw error;
      });
  }

  return globalForMongo._mongoClientPromise;
}

export async function getDatabase(): Promise<Db> {
  const client = await getMongoClient();
  const dbName = process.env.MONGODB_DB ?? 'enfield_world_builder';
  const db = client.db(dbName);

  if (!initialized) {
    await ensureIndexes(db);
    initialized = true;
  }

  return db;
}
