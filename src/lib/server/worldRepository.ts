import type { Document as MongoDocument, ObjectId } from 'mongodb';
import { getDatabase } from '../db/mongodb';
import { World } from '../models/world';

type StoredWorld = MongoDocument & {
  _id: ObjectId;
  ownerId: string;
  name: string;
  description?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};
type NewStoredWorld = Omit<StoredWorld, '_id'>;

function mapWorld(document: StoredWorld): World {
  return {
    _id: document._id?.toString(),
    ownerId: document.ownerId,
    name: document.name,
    description: document.description,
    createdAt: new Date(document.createdAt),
    updatedAt: new Date(document.updatedAt),
  };
}

export async function listWorldsByOwner(ownerId: string): Promise<World[]> {
  const db = await getDatabase();
  const collection = db.collection<StoredWorld>('worlds');
  const worlds = await collection
    .find({ ownerId })
    .sort({ updatedAt: -1 })
    .toArray();

  return worlds.map(mapWorld);
}

export async function findWorldById(worldId: string, ownerId: string): Promise<World | null> {
  const db = await getDatabase();
  const { ObjectId } = await import('mongodb');

  const world = await db.collection<StoredWorld>('worlds').findOne({
    _id: new ObjectId(worldId),
    ownerId,
  });

  return world ? mapWorld(world) : null;
}

export async function insertWorld(ownerId: string, name: string, description?: string): Promise<World> {
  const db = await getDatabase();
  const now = new Date();

  const payload: NewStoredWorld = {
    ownerId,
    name,
    description,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection('worlds').insertOne(payload);

  const storedWorld: StoredWorld = {
    ...payload,
    _id: result.insertedId,
  };

  return mapWorld(storedWorld);
}

export async function touchWorld(worldId: string) {
  const db = await getDatabase();
  const { ObjectId } = await import('mongodb');

  await db.collection('worlds').updateOne(
    { _id: new ObjectId(worldId) },
    { $set: { updatedAt: new Date() } }
  );
}
