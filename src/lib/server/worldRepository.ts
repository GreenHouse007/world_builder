import { randomUUID } from 'crypto';
import type { Document as MongoDocument } from 'mongodb';
import { getDatabase } from '../db/mongodb';
import type { ActivityEntry, PageNode, World, WorldCollaborator } from '../models/worldTypes';
import { ACTIVITY_LIMIT } from '../models/worldTypes';

type StoredActivity = MongoDocument & ActivityEntry & { timestamp: Date | string };

type StoredWorld = MongoDocument & {
  _id: string;
  ownerId: string;
  ownerProfileId?: string;
  name: string;
  description?: string;
  pages: PageNode[];
  collaborators: WorldCollaborator[];
  activity: StoredActivity[];
  createdAt: Date | string;
  updatedAt: Date | string;
};

const mapWorld = (document: StoredWorld): World => ({
  id: document._id,
  ownerId: document.ownerProfileId ?? document.ownerId,
    name: document.name,
  description: document.description,
  pages: Array.isArray(document.pages) ? document.pages : [],
  collaborators: Array.isArray(document.collaborators)
    ? document.collaborators.map((collaborator) => ({ ...collaborator }))
    : [],
  activity: Array.isArray(document.activity)
    ? document.activity.map((entry) => ({
        ...entry,
        timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : `${entry.timestamp}`,
      }))
    : [],
  createdAt:
    document.createdAt instanceof Date ? document.createdAt.toISOString() : new Date(document.createdAt).toISOString(),
  updatedAt:
    document.updatedAt instanceof Date ? document.updatedAt.toISOString() : new Date(document.updatedAt).toISOString(),
});

const normalizeActivityForStorage = (activity: ActivityEntry[]): StoredActivity[] => {
  const now = new Date();
  return activity
    .slice(0, ACTIVITY_LIMIT)
    .map((entry) => ({
      ...entry,
      timestamp: entry.timestamp ? new Date(entry.timestamp) : now,
    }));
};

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
  const world = await db.collection<StoredWorld>('worlds').findOne({
    _id: worldId,
    ownerId,
  });

  return world ? mapWorld(world) : null;
}

export async function insertWorld(ownerId: string, name: string, description?: string): Promise<World> {
  const db = await getDatabase();
  const now = new Date();
  const worldId = randomUUID();
  const newWorld: StoredWorld = {
    _id: worldId,
    ownerId,
    ownerProfileId: ownerId,
    name,
    description,
    pages: [],
    collaborators: [],
    activity: [],
    createdAt: now,
    updatedAt: now,
  };

  const collection = db.collection<StoredWorld>('worlds');
  await collection.insertOne(newWorld);

  return mapWorld(newWorld);
}

export async function touchWorld(worldId: string) {
  const db = await getDatabase();
  await db.collection('worlds').updateOne(
    { _id: worldId },
    { $set: { updatedAt: new Date() } }
  );
}

export async function upsertWorld(ownerId: string, world: World): Promise<World> {
  const db = await getDatabase();
  const collection = db.collection<StoredWorld>('worlds');
  const now = new Date();

  const updateResult = await collection.findOneAndUpdate(
    { _id: world.id, ownerId },
    {
      $set: {
        name: world.name,
        description: world.description,
        pages: Array.isArray(world.pages) ? world.pages : [],
        collaborators: Array.isArray(world.collaborators) ? world.collaborators : [],
        activity: normalizeActivityForStorage(world.activity ?? []),
        ownerProfileId: world.ownerId,
        updatedAt: now,
      },
      $setOnInsert: {
        _id: world.id,
        ownerId,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );

  if (updateResult.value) {
    return mapWorld(updateResult.value);
  }

  const inserted: StoredWorld = {
    _id: world.id,
    ownerId,
    name: world.name,
    description: world.description,
    pages: Array.isArray(world.pages) ? world.pages : [],
    collaborators: Array.isArray(world.collaborators) ? world.collaborators : [],
    activity: normalizeActivityForStorage(world.activity ?? []),
    ownerProfileId: world.ownerId,
    createdAt: now,
    updatedAt: now,
  };

  return mapWorld(inserted);
}

export async function deleteWorld(ownerId: string, worldId: string): Promise<void> {
  const db = await getDatabase();
  await db.collection('worlds').deleteOne({ _id: worldId, ownerId });
}
