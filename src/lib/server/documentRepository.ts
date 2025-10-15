import type { Document as MongoDocument, ObjectId } from 'mongodb';
import { getDatabase } from '../db/mongodb';
import { DocumentNode, DocumentPayload } from '../models/document';

type StoredDocument = MongoDocument & {
  _id: ObjectId;
  ownerId: string;
  worldId: string;
  title: string;
  content?: string;
  parentId?: ObjectId | null;
  path?: Array<string | ObjectId>;
  isRoot?: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};
function mapDocument(document: StoredDocument): DocumentNode {
  return {
    _id: document._id?.toString(),
    worldId: document.worldId,
    ownerId: document.ownerId,
    title: document.title,
    content: document.content ?? '',
    parentId: document.parentId ? document.parentId.toString() : null,
    path: Array.isArray(document.path)
      ? document.path.map((segment) =>
          typeof segment === 'string' ? segment : (segment as ObjectId).toString()
        )
      : [],
    isRoot: Boolean(document.isRoot),
    createdAt: new Date(document.createdAt),
    updatedAt: new Date(document.updatedAt),
  };
}

export async function listDocuments(worldId: string, ownerId: string): Promise<DocumentNode[]> {
  const db = await getDatabase();
  const collection = db.collection<StoredDocument>('documents');
  const documents = await collection
    .find({ worldId, ownerId })
    .sort({ path: 1, createdAt: 1 })
    .toArray();

  return documents.map(mapDocument);
}

export async function findDocumentById(documentId: string, ownerId: string): Promise<DocumentNode | null> {
  const db = await getDatabase();
  const { ObjectId } = await import('mongodb');

  const document = await db.collection<StoredDocument>('documents').findOne({
    _id: new ObjectId(documentId),
    ownerId,
  });

  return document ? mapDocument(document) : null;
}

export async function insertDocument(
  ownerId: string,
  worldId: string,
  payload: DocumentPayload
): Promise<DocumentNode> {
  const db = await getDatabase();
  const { ObjectId } = await import('mongodb');

  let parentPath: string[] = [];
  let parentId: ObjectId | null = null;
  let isRoot = true;

  if (payload.parentId) {
    parentId = new ObjectId(payload.parentId);
    const parent = await db.collection<StoredDocument>('documents').findOne({
      _id: parentId,
      ownerId,
      worldId,
    });

    if (!parent) {
      throw new Error('Parent document not found.');
    }

    const normalizedPath = Array.isArray(parent.path)
      ? parent.path.map((segment) =>
          typeof segment === 'string' ? segment : (segment as ObjectId).toString()
        )
      : [];

    parentPath = [...normalizedPath, parent._id.toString()];
    isRoot = false;
  }

  const now = new Date();
  const newDocument: StoredDocument = {
    _id: new ObjectId(),
    ownerId,
    worldId,
    title: payload.title,
    content: payload.content ?? '',
    parentId: parentId ?? null,
    path: parentPath,
    isRoot,
    createdAt: now,
    updatedAt: now,
  };

  const collection = db.collection<StoredDocument>('documents');
  await collection.insertOne(newDocument);

  return mapDocument(newDocument);
}

export async function updateDocument(
  documentId: string,
  ownerId: string,
  updates: Partial<DocumentPayload> & { content?: string }
): Promise<DocumentNode | null> {
  const db = await getDatabase();
  const { ObjectId } = await import('mongodb');

  const now = new Date();
  const updateDoc: Record<string, unknown> = {
    updatedAt: now,
  };

  if (typeof updates.title === 'string') {
    updateDoc.title = updates.title;
  }

  if (typeof updates.content === 'string') {
    updateDoc.content = updates.content;
  }

  const result = await db.collection<StoredDocument>('documents').findOneAndUpdate(
    { _id: new ObjectId(documentId), ownerId },
    { $set: updateDoc },
    { returnDocument: 'after' }
  );

  return result.value ? mapDocument(result.value) : null;
}

export async function deleteDocument(documentId: string, ownerId: string) {
  const db = await getDatabase();
  const { ObjectId } = await import('mongodb');

  const targetId = new ObjectId(documentId);
  const target = await db.collection<StoredDocument>('documents').findOne({
    _id: targetId,
    ownerId,
  });

  if (!target) {
    return { deletedCount: 0 };
  }

  const descendantSelector = {
    ownerId,
    worldId: target.worldId,
    $or: [
      { _id: targetId },
      { path: target._id.toString() },
    ],
  };

  const result = await db.collection('documents').deleteMany(descendantSelector);
  return { deletedCount: result.deletedCount }; 
}
