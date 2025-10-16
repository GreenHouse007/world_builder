import type { World } from '@/lib/models/worldTypes';
import { applyWorldChanges, type WorldChange } from '@/lib/models/worldChanges';
import { deleteWorld, listWorldsByOwner, upsertWorld } from './worldRepository';

export async function syncWorldChanges(ownerId: string, changes: WorldChange[]): Promise<World[]> {
  const existing = await listWorldsByOwner(ownerId);
  if (!changes.length) {
    return existing;
  }

  const nextState = applyWorldChanges(existing, changes);
  const existingIds = new Set(existing.map((world) => world.id));
  const nextIds = new Set(nextState.map((world) => world.id));

  for (const id of existingIds) {
    if (!nextIds.has(id)) {
      await deleteWorld(ownerId, id);
    }
  }

  for (const world of nextState) {
    await upsertWorld(ownerId, world);
  }

  return listWorldsByOwner(ownerId);
}
