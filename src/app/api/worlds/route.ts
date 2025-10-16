import { NextRequest, NextResponse } from 'next/server';
import type { World } from '@/lib/models/world';
import { getUserIdFromRequest } from '@/lib/server/userContext';
import { createWorldForUser, getWorldsForUser } from '@/lib/server/worldService';
import { isDate } from '@/lib/utils/isDate';

function normalizeDateLike(value: unknown) {
  if (isDate(value)) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return value;
  }

  return undefined;
}

function serializeWorld(world: World) {
  const createdAt = normalizeDateLike(world.createdAt as unknown);
  const updatedAt = normalizeDateLike(world.updatedAt as unknown);

  return {
    ...world,
    createdAt: createdAt ?? world.createdAt,
    updatedAt: updatedAt ?? world.updatedAt,
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
