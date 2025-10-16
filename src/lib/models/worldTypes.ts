export const ACTIVITY_LIMIT = 40;

export type ActivityAction = 'create' | 'update' | 'duplicate' | 'delete' | 'move' | 'share';

export type CollaboratorRole = 'Owner' | 'Editor' | 'Viewer';

export interface WorldCollaborator {
  id: string;
  name: string;
  email: string;
  role: CollaboratorRole;
  avatarColor: string;
}

export interface ActivityEntry {
  id: string;
  action: ActivityAction;
  target: string;
  context?: string;
  actorId: string;
  actorName: string;
  timestamp: string;
}

export interface PageNode {
  id: string;
  title: string;
  content: string;
  favorite: boolean;
  children: PageNode[];
}

export interface World {
  id: string;
  name: string;
  ownerId: string;
  pages: PageNode[];
  collaborators: WorldCollaborator[];
  activity: ActivityEntry[];
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const initialWorlds: World[] = [];

export const generateId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const getAvatarColor = (id: string) => {
  const palette = [
    '#6366f1',
    '#10b981',
    '#f59e0b',
    '#ec4899',
    '#14b8a6',
    '#a855f7',
    '#f97316',
    '#0ea5e9',
  ];

  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % palette.length;
  }

  return palette[Math.abs(hash) % palette.length];
};
