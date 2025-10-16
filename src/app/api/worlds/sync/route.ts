import { NextRequest, NextResponse } from 'next/server';

import type { World } from '@/lib/models/worldTypes';
import type { WorldChange } from '@/lib/models/worldChanges';
import { getUserIdFromRequest } from '@/lib/server/userContext';
import { listWorldsByOwner } from '@/lib/server/worldRepository';
import { syncWorldChanges } from '@/lib/server/worldSyncService';

const SUPPORTED_CHANGE_TYPES = new Set<WorldChange['type']>([
  'createWorld',
  'updateWorld',
  'deleteWorld',
  'insertPage',
  'updatePage',
  'removePage',
  'movePage',
  'appendActivity',
  'setCollaborators',
]);

const serializeWorld = (world: World) => ({
  ...world,
  activity: world.activity.map((entry) => ({
    ...entry,
    timestamp: entry.timestamp ?? new Date().toISOString(),
  })),
});

const resolveStatus = (error: unknown, fallback: number) => {
  if (typeof error === 'object' && error && 'status' in error) {
    const status = (error as { status?: number }).status;
    if (typeof status === 'number') {
      return status;
    }
  }
  return fallback;
};

const handleError = (error: unknown, fallback = 500) => {
  const status = resolveStatus(error, fallback);
  const message = error instanceof Error ? error.message : 'Unexpected error';
  console.error('[worlds-sync-route]', message, error);
  return NextResponse.json({ error: message }, { status });
};

const parseChanges = (raw: unknown): WorldChange[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is WorldChange => {
      if (typeof item !== 'object' || !item) {
        return false;
      }
      const candidate = item as { type?: unknown };
      return typeof candidate.type === 'string' && SUPPORTED_CHANGE_TYPES.has(candidate.type as WorldChange['type']);
    })
    .map((item) => item as WorldChange);
};

export async function GET(request: NextRequest) {
  try {
    const ownerId = getUserIdFromRequest(request);
    const worlds = await listWorldsByOwner(ownerId);
    return NextResponse.json({ data: worlds.map(serializeWorld) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ownerId = getUserIdFromRequest(request);
    const body = await request.json();
    const changes = parseChanges(body?.changes ?? []);

    const worlds = await syncWorldChanges(ownerId, changes);
    return NextResponse.json({ data: worlds.map(serializeWorld) });
  } catch (error) {
    return handleError(error);
  }
}
