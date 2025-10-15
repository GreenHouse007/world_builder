export interface DocumentNode {
  _id?: string;
  worldId: string;
  ownerId: string;
  title: string;
  content: string;
  parentId?: string | null;
  path: string[];
  isRoot: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentPayload {
  title: string;
  content?: string;
  parentId?: string | null;
}

export interface DocumentTreeNode extends DocumentNode {
  children: DocumentTreeNode[];
}
