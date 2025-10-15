import { NextRequest, NextResponse } from 'next/server';
import type { DocumentNode } from '@/lib/models/document';
import { getUserIdFromRequest } from '@/lib/server/userContext';
import { ensureWorldAccess } from '@/lib/server/worldService';
import { getDocument, removeDocument, updateDocumentContent } from '@/lib/server/documentService';

function serializeDocument(document: DocumentNode) {
  return {
    ...document,
    createdAt: document.createdAt instanceof Date ? document.createdAt.toISOString() : document.createdAt,
    updatedAt: document.updatedAt instanceof Date ? document.updatedAt.toISOString() : document.updatedAt,
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
  console.error('[document-route]', message, error);
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { worldId: string; documentId: string } }
) {
  try {
    const ownerId = getUserIdFromRequest(request);
    const { worldId, documentId } = params;

    await ensureWorldAccess(worldId, ownerId);
    const document = await getDocument(ownerId, documentId);

    if (!document || document.worldId !== worldId) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({ data: serializeDocument(document) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { worldId: string; documentId: string } }
) {
  try {
    const ownerId = getUserIdFromRequest(request);
    const { worldId, documentId } = params;
    const body = await request.json();

    await ensureWorldAccess(worldId, ownerId);

    const document = await updateDocumentContent(ownerId, documentId, {
      title: body?.title,
      content: body?.content,
    });

    if (!document || document.worldId !== worldId) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({ data: serializeDocument(document) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { worldId: string; documentId: string } }
) {
  try {
    const ownerId = getUserIdFromRequest(request);
    const { worldId, documentId } = params;

    await ensureWorldAccess(worldId, ownerId);
    const result = await removeDocument(ownerId, documentId);

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
