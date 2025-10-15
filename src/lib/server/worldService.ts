import { World } from '../models/world';
import { findWorldById, insertWorld, listWorldsByOwner } from './worldRepository';

export async function getWorldsForUser(ownerId: string): Promise<World[]> {
  return listWorldsByOwner(ownerId);
}

export async function createWorldForUser(ownerId: string, name: string, description?: string) {
  return insertWorld(ownerId, name, description);
}

export async function ensureWorldAccess(worldId: string, ownerId: string) {
  const world = await findWorldById(worldId, ownerId);
  if (!world) {
    throw Object.assign(new Error('World not found'), { status: 404 });
  }
  return world;
}
