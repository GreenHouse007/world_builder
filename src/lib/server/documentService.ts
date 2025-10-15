import { DocumentNode, DocumentPayload, DocumentTreeNode } from '../models/document';
import {
  deleteDocument,
  findDocumentById,
  insertDocument,
  listDocuments,
  updateDocument,
} from './documentRepository';
import { touchWorld } from './worldRepository';

function buildTree(documents: DocumentNode[]): DocumentTreeNode[] {
  const nodeMap = new Map<string, DocumentTreeNode>();
  const roots: DocumentTreeNode[] = [];

  documents.forEach((document) => {
    const node: DocumentTreeNode = {
      ...document,
      children: [],
    };
    if (document._id) {
      nodeMap.set(document._id, node);
    }
  });

  nodeMap.forEach((node) => {
    const parentId = node.parentId ?? undefined;
    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

export async function getDocumentTree(ownerId: string, worldId: string) {
  const documents = await listDocuments(worldId, ownerId);
  return buildTree(documents);
}

export async function createDocument(
  ownerId: string,
  worldId: string,
  payload: DocumentPayload
) {
  const document = await insertDocument(ownerId, worldId, payload);
  await touchWorld(worldId);
  return document;
}

export async function updateDocumentContent(
  ownerId: string,
  documentId: string,
  updates: Partial<DocumentPayload> & { content?: string }
) {
  const document = await updateDocument(documentId, ownerId, updates);
  if (document?.worldId) {
    await touchWorld(document.worldId);
  }
  return document;
}

export async function removeDocument(ownerId: string, documentId: string) {
  const existing = await findDocumentById(documentId, ownerId);
  if (!existing) {
    return { deletedCount: 0 };
  }

  const result = await deleteDocument(documentId, ownerId);
  if (existing.worldId) {
    await touchWorld(existing.worldId);
  }
  return result;
}

export async function getDocument(ownerId: string, documentId: string) {
  return findDocumentById(documentId, ownerId);
}
