import { NextRequest, NextResponse } from 'next/server';
import type { DocumentTreeNode } from '@/lib/models/document';
import { getUserIdFromRequest } from '@/lib/server/userContext';
import { ensureWorldAccess } from '@/lib/server/worldService';
import { createDocument, getDocumentTree } from '@/lib/server/documentService';

function serializeDates<T extends { createdAt: Date | string; updatedAt: Date | string }>(document: T) {
  return {
    ...document,
    createdAt: document.createdAt instanceof Date ? document.createdAt.toISOString() : document.createdAt,
    updatedAt: document.updatedAt instanceof Date ? document.updatedAt.toISOString() : document.updatedAt,
  };
}

function serializeTree(document: DocumentTreeNode): DocumentTreeNode & { createdAt: string | Date; updatedAt: string | Date } {
  const base = serializeDates(document);
  return {
    ...base,
    children: document.children.map(serializeTree),
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
  console.error('[documents-route]', message, error);
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { worldId: string } }
) {
  try {
    const ownerId = getUserIdFromRequest(request);
    const worldId = params.worldId;

    await ensureWorldAccess(worldId, ownerId);
    const tree = await getDocumentTree(ownerId, worldId);
    return NextResponse.json({ data: tree.map(serializeTree) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { worldId: string } }
) {
  try {
    const ownerId = getUserIdFromRequest(request);
    const worldId = params.worldId;
    const body = await request.json();

    await ensureWorldAccess(worldId, ownerId);

    if (!body?.title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const document = await createDocument(ownerId, worldId, {
      title: body.title,
      content: body.content ?? '',
      parentId: body.parentId ?? null,
    });

    return NextResponse.json({ data: serializeDates(document) }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
