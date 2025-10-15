import { NextRequest, NextResponse } from 'next/server';
import type { World } from '@/lib/models/world';
import { getUserIdFromRequest } from '@/lib/server/userContext';
import { createWorldForUser, getWorldsForUser } from '@/lib/server/worldService';

function serializeWorld(world: World) {
  return {
    ...world,
    createdAt: world.createdAt instanceof Date ? world.createdAt.toISOString() : world.createdAt,
    updatedAt: world.updatedAt instanceof Date ? world.updatedAt.toISOString() : world.updatedAt,
  };
}

function resolveStatus(error: unknown, fallbackStatus: number) {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: number }).status;
    if (typeof status === 'number') {
      return status;
    }
  }
  return fallbackStatus;
}

function handleError(error: unknown, fallbackStatus = 500) {
  const status = resolveStatus(error, fallbackStatus);
  const message = error instanceof Error ? error.message : 'Unexpected error';
  console.error('[worlds-route]', message, error);
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const ownerId = getUserIdFromRequest(request);
    const worlds = await getWorldsForUser(ownerId);
    return NextResponse.json({ data: worlds.map(serializeWorld) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ownerId = getUserIdFromRequest(request);
    const body = await request.json();
    if (!body?.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const world = await createWorldForUser(ownerId, body.name, body.description);
    return NextResponse.json({ data: serializeWorld(world) }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
