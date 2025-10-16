'use client';

import Image from 'next/image';
import type { ChangeEvent, DragEvent, FormEvent, KeyboardEvent } from 'react';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';

import { loadFirebase } from '@/lib/firebase/client';
import {
  ACTIVITY_LIMIT,
  ActivityAction,
  ActivityEntry,
  CollaboratorRole,
  PageNode,
  World,
  WorldCollaborator,
  generateId,
  getAvatarColor,
  initialWorlds,
} from '@/lib/models/worldTypes';
import {
  addPageToTree,
  clonePageTree,
  createPage,
  findPageInTree,
  flattenPages,
  insertPageAfter,
  isDescendant,
  movePageBefore,
  removePageFromTree,
  updatePageInTree,
} from '@/lib/models/pageTree';
import { WorldChange, applyWorldChanges, buildPageChange } from '@/lib/models/worldChanges';

type FirebaseBundle = NonNullable<Awaited<ReturnType<typeof loadFirebase>>>;

const collections = [
  {
    title: 'World Overview',
    description: "High-level timeline, themes, and narrative arcs that define your setting.",
    status: 'In Review',
    progress: 72,
  },
  {
    title: 'Characters',
    description: 'Track motivations, relationships, and voice references for every persona.',
    status: 'Drafting',
    progress: 54,
  },
  {
    title: 'Locations',
    description: 'Sketch cultures, climates, and sensory anchors for each region.',
    status: 'Polishing',
    progress: 83,
  },
];

const timeline = [
  {
    label: 'Morning Ritual',
    detail: "Review yesterday's notes and mark research questions for later.",
    time: '08:00',
  },
  {
    label: 'Deep Lore Session',
    detail: 'Outline the Enfield legacy mythos with visual references.',
    time: '10:30',
  },
  {
    label: 'Editorial Sync',
    detail: 'Share updated chapter briefs with your co-author.',
    time: '15:00',
  },
];

const quickLinks = [
  { label: 'Create page', shortcut: '⌘ N' },
  { label: 'New database', shortcut: '⌘ D' },
  { label: 'Capture idea', shortcut: '⌘ I' },
];

const templates = [
  {
    name: 'Culture Brief',
    blurb: 'Summarize traditions, rituals, and power structures in minutes.',
  },
  {
    name: 'Character Dossier',
    blurb: 'A layered profile for voice, arcs, and dramatic tension.',
  },
  {
    name: 'Adventure Module',
    blurb: 'Structure quests and branching encounters for tabletop sessions.',
  },
];

const toTitleCase = (value: string) =>
  value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const appendActivity = (entries: ActivityEntry[], entry: ActivityEntry) =>
  [entry, ...entries].slice(0, ACTIVITY_LIMIT);

const summarizeActivity = (entry: ActivityEntry) => {
  switch (entry.action) {
    case 'create':
      return `Created “${entry.target}”`;
    case 'update':
      return `Updated “${entry.target}”`;
    case 'duplicate':
      return `Duplicated “${entry.target}”`;
    case 'delete':
      return `Deleted “${entry.target}”`;
    case 'move':
      return `Moved “${entry.target}”`;
    case 'share':
      return `Updated access for ${entry.target}`;
    default:
      return entry.target;
  }
};

const formatRelativeTime = (isoTimestamp: string) => {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) {
    return 'Just now';
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }

  const weeks = Math.floor(days / 7);
  if (weeks < 4) {
    return `${weeks}w ago`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months}mo ago`;
  }

  const years = Math.floor(days / 365);
  return `${years}y ago`;
};

const ensureHtmlContent = (content: string) => {
  if (!content || !content.trim()) {
    return '';
  }

  const trimmed = content.trim();
  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return content;
  }

  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  return `<p>${escaped.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br />')}</p>`;
};

const sanitizeEditorHtml = (html: string) => html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');

const normalizePageTree = (nodes: PageNode[] | undefined): PageNode[] =>
  (nodes ?? []).map((node) => ({
    ...node,
    favorite: node.favorite ?? false,
    children: normalizePageTree(node.children ?? []),
  }));

const normalizeCollaborators = (
  worldId: string,
  collaborators: WorldCollaborator[] | undefined,
  ownerId: string | undefined,
  worldName: string,
) => {
  const normalized = (collaborators ?? []).map((collaborator, index) => {
    const collaboratorId = collaborator?.id ?? `${worldId}-collaborator-${index}`;
    return {
      id: collaboratorId,
      name: collaborator?.name ?? `Collaborator ${index + 1}`,
      email: collaborator?.email ?? 'collaborator@example.com',
      role: collaborator?.role ?? (collaboratorId === ownerId ? 'Owner' : 'Editor'),
      avatarColor: collaborator?.avatarColor ?? getAvatarColor(collaboratorId),
    };
  });

  let resolvedOwnerId =
    ownerId && normalized.some((collaborator) => collaborator.id === ownerId)
      ? ownerId
      : normalized.find((collaborator) => collaborator.role === 'Owner')?.id;

  if (!resolvedOwnerId) {
    const fallbackId = ownerId ?? `${worldId}-owner`;
    normalized.unshift({
      id: fallbackId,
      name: `${worldName} Owner`,
      email: 'owner@example.com',
      role: 'Owner',
      avatarColor: getAvatarColor(fallbackId),
    });
    resolvedOwnerId = fallbackId;
  } else {
    normalized.forEach((collaborator) => {
      if (collaborator.id === resolvedOwnerId) {
        collaborator.role = 'Owner';
      }
    });
  }

  return {
    collaborators: normalized,
    ownerId: resolvedOwnerId,
  };
};

const normalizeActivity = (activity: ActivityEntry[] | undefined): ActivityEntry[] =>
  (activity ?? [])
    .map((entry) => ({
      id: entry?.id ?? generateId('activity'),
      action: entry?.action ?? 'update',
      target: entry?.target ?? 'Entry',
      context: entry?.context ?? '',
      actorId: entry?.actorId ?? 'system',
      actorName: entry?.actorName ?? 'System',
      timestamp:
        typeof entry?.timestamp === 'string' && entry.timestamp ? entry.timestamp : new Date().toISOString(),
    }))
    .slice(0, ACTIVITY_LIMIT);

const normalizeWorlds = (worlds: Partial<World>[]): World[] =>
  worlds.map((world) => {
    const worldId = world.id ?? generateId('world');
    const worldName = world.name ?? 'Untitled world';
    const { collaborators, ownerId } = normalizeCollaborators(worldId, world.collaborators, world.ownerId, worldName);

    return {
      id: worldId,
      name: worldName,
      pages: normalizePageTree(world.pages ?? []),
      ownerId,
      collaborators,
      activity: normalizeActivity(world.activity),
    };
  });

type CachedState = {
  worlds: World[];
  pendingChanges: WorldChange[];
  timestamp: number;
};

const CACHE_STORAGE_KEY = 'enfield-worlds-cache-v2';

const loadCachedState = (): CachedState | null => {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(CACHE_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as Partial<CachedState> & { worlds?: Partial<World>[] };
    if (!Array.isArray(parsed?.worlds)) {
      return null;
    }

    return {
      worlds: normalizeWorlds(parsed.worlds as World[]),
      pendingChanges: Array.isArray(parsed.pendingChanges)
        ? (parsed.pendingChanges as WorldChange[])
        : [],
      timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now(),
    };
  } catch (error) {
    console.warn('Unable to read cached worlds.', error);
    return null;
  }
};

const saveCachedState = (worlds: World[], pendingChanges: WorldChange[]) => {
  if (typeof window === 'undefined') return;

  const payload: CachedState = {
    worlds,
    pendingChanges,
    timestamp: Date.now(),
  };

  try {
    window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Unable to persist worlds cache.', error);
  }
};

const findParentId = (nodes: PageNode[], pageId: string, parentId: string | null = null): string | null => {
  for (const node of nodes) {
    if (node.id === pageId) {
      return parentId;
    }

    const candidate = findParentId(node.children, pageId, node.id);
    if (candidate) {
      return candidate;
    }
  }

  return null;
};

type PageTreeProps = {
  nodes: PageNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddChild: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onCopyLink: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onStartRename: (id: string) => void;
  onRenameChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  editingPageId: string | null;
  pageTitleDraft: string;
  actionMenuId: string | null;
  onOpenActionMenu: (id: string) => void;
  onCloseActionMenu: () => void;
  onDragStart: (id: string, event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDrop: (targetId: string) => void;
  draggedPageId: string | null;
  depth?: number;
  collapsedIds: string[];
  onToggleCollapse: (id: string) => void;
};
function PageTree({
  nodes,
  selectedId,
  onSelect,
  onAddChild,
  onToggleFavorite,
  onCopyLink,
  onDuplicate,
  onDelete,
  onStartRename,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  editingPageId,
  pageTitleDraft,
  actionMenuId,
  onOpenActionMenu,
  onCloseActionMenu,
  onDragStart,
  onDragEnd,
  onDrop,
  draggedPageId,
  depth = 0,
  collapsedIds,
  onToggleCollapse,
}: PageTreeProps) {
  return (
    <ul className={depth === 0 ? 'space-y-1.5' : 'space-y-1.5 border-l border-white/5 pl-4'}>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const isSelected = node.id === selectedId;
        const isEditing = node.id === editingPageId;
        const isMenuOpen = actionMenuId === node.id;
        const isFavorite = node.favorite;
        const isDragging = draggedPageId === node.id;
        const isCollapsed = collapsedIds.includes(node.id);

        return (
          <li key={node.id} className="relative space-y-1">
            <div
              className={`group flex items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 text-sm transition ${
                isSelected
                  ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-100 shadow-[0_0_0_1px_rgba(129,140,248,0.25)]'
                  : 'text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-slate-100'
              } ${isDragging ? 'opacity-70 ring-2 ring-indigo-400/50' : ''}`}
              draggable
              onDragStart={(event) => onDragStart(node.id, event)}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                event.stopPropagation();
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDrop(node.id);
                onCloseActionMenu();
              }}
              onDragEnd={onDragEnd}
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleCollapse(node.id);
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-lg border border-white/10 text-xs transition ${
                    isCollapsed ? 'text-slate-400 hover:text-slate-200' : 'text-indigo-200/80 hover:text-indigo-100'
                  }`}
                  aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${node.title}`}
                  aria-expanded={!isCollapsed}
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                    {isCollapsed ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6.5 12 10l-4 3.5" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="m6.5 8.5 3.5 3.5 3.5-3.5" />
                    )}
                  </svg>
                </button>
              ) : (
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-lg border border-transparent text-xs text-slate-400"
                  aria-hidden="true"
                >
                  •
                </span>
              )}

              <button
                type="button"
                onClick={() => onSelect(node.id)}
                className={`flex-1 truncate text-left ${isFavorite ? 'font-semibold text-indigo-100' : ''}`}
              >
                <span className="flex items-center gap-1 truncate">
                  {isFavorite ? (
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 text-amber-300" fill="currentColor">
                      <path d="m10 2.4 2.4 4.86 5.36.78-3.88 3.78.92 5.34L10 14.8l-4.8 2.36.92-5.34-3.88-3.78 5.36-.78L10 2.4Z" />
                    </svg>
                  ) : null}
                  <span className="truncate">{node.title}</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => onAddChild(node.id)}
                className="hidden h-6 w-6 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition hover:border-indigo-300/60 hover:text-indigo-200 group-hover:flex"
                aria-label="Add sub-page"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
                  <path d="M9 3a1 1 0 0 1 2 0v4h4a1 1 0 1 1 0 2h-4v4a1 1 0 1 1-2 0V9H5a1 1 0 1 1 0-2h4z" />
                </svg>
              </button>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (isMenuOpen) {
                    onCloseActionMenu();
                  } else {
                    onOpenActionMenu(node.id);
                  }
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition hover:border-indigo-300/60 hover:text-indigo-200"
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
                aria-label={`Page options for ${node.title}`}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
                  <path d="M4 10a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm4.5 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm4.5 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" />
                </svg>
              </button>
            </div>

            {isMenuOpen ? (
              <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl">
                <button
                  type="button"
                  onClick={() => {
                    onToggleFavorite(node.id);
                    onCloseActionMenu();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5 hover:text-indigo-100"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 ${isFavorite ? 'text-amber-300' : ''}`} fill="currentColor">
                    <path d="m10 2.5 2.3 4.66 5.14.75-3.72 3.63.88 5.12L10 14.77l-4.6 2.39.88-5.12-3.72-3.63 5.14-.75L10 2.5Z" />
                  </svg>
                  {isFavorite ? 'Unfavorite' : 'Favorite'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCopyLink(node.id);
                    onCloseActionMenu();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5 hover:text-indigo-100"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.5A2.5 2.5 0 0 1 11.5 4H15a2.5 2.5 0 0 1 0 5h-1.5" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 13.5A2.5 2.5 0 0 1 8.5 16H5a2.5 2.5 0 0 1 0-5h1.5" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 10h6" />
                  </svg>
                  Copy link
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onStartRename(node.id);
                    onCloseActionMenu();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5 hover:text-indigo-100"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 13.5V16h2.5l7.4-7.4-2.5-2.5L4 13.5Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="m12.9 5.6 1.5-1.5a1.5 1.5 0 0 1 2.1 2.1l-1.5 1.5" />
                  </svg>
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDuplicate(node.id);
                    onCloseActionMenu();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5 hover:text-indigo-100"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                    <path d="M5 5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5Zm9 0a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V5Zm-9 4a1 1 0 0 0-1 1v5a3 3 0 0 0 3 3h5a1 1 0 0 0 0-2H7a1 1 0 0 1-1-1v-5a1 1 0 0 0-1-1Z" />
                  </svg>
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(node.id);
                    onCloseActionMenu();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-200 transition hover:bg-rose-500/10 hover:text-rose-100"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h8m-7 0-.4 8.5a1.5 1.5 0 0 0 1.5 1.5h3.8a1.5 1.5 0 0 0 1.5-1.5L13 6M8 6V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" />
                  </svg>
                  Delete
                </button>
              </div>
            ) : null}

            {hasChildren && !isCollapsed ? (
              <div className="pt-1">
                <PageTree
                  nodes={node.children}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onAddChild={onAddChild}
                  onToggleFavorite={onToggleFavorite}
                  onCopyLink={onCopyLink}
                  onDuplicate={onDuplicate}
                  onDelete={onDelete}
                  onStartRename={onStartRename}
                  onRenameChange={onRenameChange}
                  onRenameCommit={onRenameCommit}
                  onRenameCancel={onRenameCancel}
                  editingPageId={editingPageId}
                  pageTitleDraft={pageTitleDraft}
                  actionMenuId={actionMenuId}
                  onOpenActionMenu={onOpenActionMenu}
                  onCloseActionMenu={onCloseActionMenu}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDrop={onDrop}
                  draggedPageId={draggedPageId}
                  depth={depth + 1}
                  collapsedIds={collapsedIds}
                  onToggleCollapse={onToggleCollapse}
                />
              </div>
            ) : null}

            {isEditing ? (
              <div className="absolute left-0 top-0 z-30 w-full rounded-xl border border-indigo-300/60 bg-slate-950/95 p-2 shadow-2xl">
                <input
                  value={pageTitleDraft}
                  onChange={(event) => onRenameChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onRenameCommit();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      onRenameCancel();
                    }
                  }}
                  onBlur={onRenameCommit}
                  autoFocus
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-300/60 focus:ring-2 focus:ring-indigo-400/30"
                  placeholder="Untitled page"
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export default function Home() {
  const [firebaseBundle, setFirebaseBundle] = useState<FirebaseBundle | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUnavailable, setFirebaseUnavailable] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const initialWorldsRef = useRef<World[]>(normalizeWorlds(initialWorlds));
  const [worlds, setWorlds] = useState<World[]>(initialWorldsRef.current);
  const [activeWorldId, setActiveWorldId] = useState<string>(initialWorldsRef.current[0]?.id ?? '');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [view, setView] = useState<'dashboard' | 'page'>('dashboard');
  const [isWorldMenuOpen, setIsWorldMenuOpen] = useState(false);
  const [worldActionMenuId, setWorldActionMenuId] = useState<string | null>(null);
  const [editingWorldId, setEditingWorldId] = useState<string | null>(null);
  const [worldNameDraft, setWorldNameDraft] = useState('');
  const worldNameInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const isLocalEditRef = useRef(false);
  const [editorTitle, setEditorTitle] = useState('');
  const [pageActionMenuId, setPageActionMenuId] = useState<string | null>(null);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [pageTitleDraft, setPageTitleDraft] = useState('');
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [shareMenuWorldId, setShareMenuWorldId] = useState<string | null>(null);
  const [textSize, setTextSize] = useState('3');
  const [textColor, setTextColor] = useState('#e2e8f0');
  const [isLightMode, setIsLightMode] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [selectedExportPageIds, setSelectedExportPageIds] = useState<string[]>([]);
  const [collapsedPageIds, setCollapsedPageIds] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'offline' | 'syncing'>('syncing');
  const [isOnline, setIsOnline] = useState(true);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const previousRootIdsRef = useRef<string[]>([]);
  const worldsRef = useRef(worlds);
  const pendingChangesRef = useRef<WorldChange[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  const commitWorldsUpdate = useCallback(
    (updater: World[] | ((previous: World[]) => World[])) => {
      if (typeof updater === 'function') {
        setWorlds((previous) => {
          const nextWorlds = (updater as (prev: World[]) => World[])(previous);
          worldsRef.current = nextWorlds;
          saveCachedState(nextWorlds, pendingChangesRef.current);
          return nextWorlds;
        });
      } else {
        const nextWorlds = updater;
        worldsRef.current = nextWorlds;
        saveCachedState(nextWorlds, pendingChangesRef.current);
        setWorlds(nextWorlds);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const cached = loadCachedState();

    if (cached && cached.worlds.length) {
      pendingChangesRef.current = cached.pendingChanges;
      commitWorldsUpdate(cached.worlds);
      setActiveWorldId((previous) => (previous && cached.worlds.some((world) => world.id === previous)
        ? previous
        : cached.worlds[0]?.id ?? ''));
      setSaveStatus(cached.pendingChanges.length ? 'offline' : 'saved');
    }

    const fetchWorlds = async () => {
      try {
        const response = await fetch('/api/worlds/sync', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Failed to load worlds from server');
        }

        const payload = await response.json();
        const serverWorlds = normalizeWorlds((payload?.data ?? []) as World[]);
        const merged = pendingChangesRef.current.length
          ? applyWorldChanges(serverWorlds, pendingChangesRef.current)
          : serverWorlds;

        if (cancelled) return;

        commitWorldsUpdate(merged);
        setActiveWorldId((previous) =>
          previous && merged.some((world) => world.id === previous)
            ? previous
            : merged[0]?.id ?? '',
        );
        saveCachedState(merged, pendingChangesRef.current);
        setSaveStatus(pendingChangesRef.current.length ? 'saving' : 'saved');
      } catch (error) {
        console.warn('Unable to load worlds from server.', error);
        if (cancelled) return;

        if (!cached || !cached.worlds.length) {
          const fallback = normalizeWorlds(initialWorlds);
          pendingChangesRef.current = [];
          commitWorldsUpdate(fallback);
          setActiveWorldId(fallback[0]?.id ?? '');
          saveCachedState(fallback, []);
        }
        
        setSaveStatus(pendingChangesRef.current.length ? 'offline' : 'saved');
      }
    };

    fetchWorlds();

    return () => {
      cancelled = true;
    };
  }, [commitWorldsUpdate]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, []);

  const getCurrentUserCollaborator = useCallback(
    (role: CollaboratorRole = 'Owner'): WorldCollaborator => {
      const id = authUser?.uid ?? 'local-user';
      const email = authUser?.email ?? 'storyteller@example.com';
      const baseName = authUser?.displayName?.trim() || (email ? email.split('@')[0] : 'Storyteller');
      const formattedName = toTitleCase(baseName || 'Storyteller');

      return {
        id,
        name: formattedName || 'Storyteller',
        email,
        role,
        avatarColor: getAvatarColor(id),
      };
    },
    [authUser],
  );

  const buildActivityEntry = useCallback(
    (action: ActivityAction, target: string, context?: string): ActivityEntry => {
      const actor = getCurrentUserCollaborator();
      return {
        id: generateId('activity'),
        action,
        target,
        context,
        actorId: actor.id,
        actorName: actor.name,
        timestamp: new Date().toISOString(),
      };
    },
    [getCurrentUserCollaborator],
  );

  const createEmptyWorld = useCallback(
    (name: string): World => {
      const ownerProfile = getCurrentUserCollaborator('Owner');
      const worldId = generateId('world');
      const createdEntry = buildActivityEntry('create', name, 'Created world');

      return {
        id: worldId,
        name,
        pages: [],
        ownerId: ownerProfile.id,
        collaborators: [ownerProfile],
        activity: [createdEntry],
      };
    },
    [buildActivityEntry, getCurrentUserCollaborator],
  );

  const currentUser = useMemo(() => getCurrentUserCollaborator(), [getCurrentUserCollaborator]);

  const flushPendingChanges = useCallback(async () => {
    if (!pendingChangesRef.current.length) {
      setSaveStatus('saved');
      return;
    }

    if (!isOnline) {
      setSaveStatus('offline');
      return;
    }

    const batch = [...pendingChangesRef.current];
    setSaveStatus('syncing');

    try {
      const response = await fetch('/api/worlds/sync', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: batch }),
      });

      if (!response.ok) {
        throw new Error('Failed to sync changes');
      }

      const payload = await response.json();
      const serverWorlds = normalizeWorlds((payload?.data ?? []) as World[]);

      pendingChangesRef.current = [];
      commitWorldsUpdate(serverWorlds);
      setActiveWorldId((previous) =>
        previous && serverWorlds.some((world) => world.id === previous)
          ? previous
          : serverWorlds[0]?.id ?? '',
      );
      setSelectedPageId((previous) => {
        if (!previous) return previous;
        const exists = serverWorlds.some((world) => findPageInTree(world.pages, previous));
        return exists ? previous : null;
      });
      saveCachedState(serverWorlds, []);
      setSaveStatus('saved');
    } catch (error) {
      console.error('World sync failed.', error);
      pendingChangesRef.current = [...batch, ...pendingChangesRef.current];
      setSaveStatus('offline');
    }
  }, [commitWorldsUpdate, isOnline]);

  const queueChanges = useCallback(
    (changes: WorldChange[]) => {
      if (!changes.length) return;

      pendingChangesRef.current = [...pendingChangesRef.current, ...changes];
      saveCachedState(worldsRef.current, pendingChangesRef.current);
      setSaveStatus(isOnline ? 'saving' : 'offline');

      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
      }

      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null;
        void flushPendingChanges();
      }, 800);
    },
    [flushPendingChanges, isOnline],
  );

  useEffect(() => {
    if (isOnline && pendingChangesRef.current.length) {
      void flushPendingChanges();
    }
  }, [isOnline, flushPendingChanges]);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    loadFirebase()
      .then((bundle) => {
        if (!isMounted) return;

        if (!bundle) {
          setFirebaseUnavailable(true);
          setAuthReady(true);
          return;
        }

        setFirebaseBundle(bundle);
        unsubscribe = bundle.authModule.onAuthStateChanged(bundle.auth, (user) => {
          if (!isMounted) return;
          setAuthUser(user);
          setAuthReady(true);
        });
      })
      .catch(() => {
        if (!isMounted) return;
        setFirebaseUnavailable(true);
        setAuthReady(true);
      });

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!firebaseBundle) {
      setAuthError('Authentication is unavailable right now. Please try again in a moment.');
      return;
    }

    const { auth, authModule } = firebaseBundle;

    setAuthSubmitting(true);
    setAuthError(null);

    try {
      if (authMode === 'login') {
        await authModule.signInWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        const credential = await authModule.createUserWithEmailAndPassword(auth, authEmail, authPassword);
        if (authName.trim()) {
          await authModule.updateProfile(credential.user, { displayName: authName.trim() });
        }
      }

      setAuthPassword('');
      setAuthEmail('');
      if (authMode === 'signup') {
        setAuthName('');
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to complete the request.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!firebaseBundle) {
      setAuthError('Authentication is unavailable right now. Please try again in a moment.');
      return;
    }

    const { auth, authModule } = firebaseBundle;

    setAuthSubmitting(true);
    setAuthError(null);

    try {
      const provider = new authModule.GoogleAuthProvider();
      await authModule.signInWithPopup(auth, provider);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Google sign-in was interrupted.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    if (!firebaseBundle) return;

    try {
      await firebaseBundle.authModule.signOut(firebaseBundle.auth);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign out.');
    }
  };

  const activeWorld = worlds.find((world) => world.id === activeWorldId) ?? worlds[0] ?? null;

  const selectedPage = useMemo(
    () => (activeWorld ? findPageInTree(activeWorld.pages, selectedPageId) : null),
    [activeWorld, selectedPageId],
  );
  const currentPageId = selectedPage?.id ?? null;
  const currentPageTitle = selectedPage?.title ?? '';
  const currentPageContent = selectedPage?.content ?? '';
  const rootPageIdSignature = useMemo(
    () => (activeWorld?.pages ?? []).map((page) => page.id).join('|'),
    [activeWorld?.pages],
  );
  const favoritePages = useMemo(
    () => (activeWorld ? flattenPages(activeWorld.pages).filter((page) => page.favorite) : []),
    [activeWorld],
  );
  const sharedWorlds = useMemo(
    () => worlds.filter((world) => world.collaborators.length > 1),
    [worlds],
  );
  const activityEntries = activeWorld?.activity ?? [];

  const syncStatusLabel = useMemo(() => {
    switch (saveStatus) {
      case 'saving':
        return 'Saving…';
      case 'offline':
        return 'Offline — changes queued';
      case 'syncing':
        return 'Syncing…';
      default:
        return 'All changes saved';
    }
  }, [saveStatus]);

  const syncButtonClasses = useMemo(() => {
    if (saveStatus === 'offline') {
      return 'border-amber-300/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20';
    }

    if (saveStatus === 'saved') {
      return 'border-emerald-300/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20';
    }

    return 'border-indigo-300/40 bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/30';
  }, [saveStatus]);

  const userDisplayName = authUser?.displayName?.trim() || authUser?.email?.split('@')[0] || 'Writer';
  const userInitial = userDisplayName.charAt(0).toUpperCase();
  const userEmail = authUser?.email ?? '—';

  useEffect(() => {
    if (!editingWorldId) return;

    const timer = window.setTimeout(() => {
      worldNameInputRef.current?.focus();
      worldNameInputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [editingWorldId]);

  useEffect(() => {
    if (currentPageId) {
      setEditorTitle(currentPageTitle);
    } else {
      setEditorTitle('');
    }
  }, [currentPageId, currentPageTitle]);

  useEffect(() => {
    if (!editorRef.current) return;

    if (!currentPageId) {
      editorRef.current.innerHTML = '';
      return;
    }

    if (isLocalEditRef.current) {
      isLocalEditRef.current = false;
      return;
    }

    const html = ensureHtmlContent(currentPageContent);
    if (editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html;
    }
  }, [currentPageId, currentPageContent]);


  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateStatus = () => {
      setIsOnline(navigator.onLine ?? true);
    };

    updateStatus();

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, []);

  useEffect(() => {
    const rootPages = activeWorld?.pages ?? [];
    const currentRootIds = rootPages.map((page) => page.id);
    const previousRootIds = previousRootIdsRef.current;
    const removedIds = previousRootIds.filter((id) => !currentRootIds.includes(id));
    const addedIds = currentRootIds.filter((id) => !previousRootIds.includes(id));

    setSelectedExportPageIds((prev) => {
      let next = prev;
      let changed = false;

      if (removedIds.length) {
        next = prev.filter((id) => !removedIds.includes(id));
        changed = true;
      }

      if (addedIds.length) {
        const appended = addedIds.filter((id) => !next.includes(id));
        if (appended.length) {
          next = [...next, ...appended];
          changed = true;
        }
      }

      if (!prev.length && currentRootIds.length && !changed) {
        return currentRootIds;
      }

      return changed ? next : prev;
    });

    previousRootIdsRef.current = currentRootIds;
  }, [activeWorld, activeWorldId, rootPageIdSignature]);

  useEffect(() => {
    if (!isExportMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!exportMenuRef.current) return;
      if (event.target instanceof Node && !exportMenuRef.current.contains(event.target)) {
        setIsExportMenuOpen(false);
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExportMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExportMenuOpen]);

  useEffect(() => {
    setTextColor(isLightMode ? '#0f172a' : '#e2e8f0');
  }, [isLightMode]);

  const handleSelectWorld = (worldId: string) => {
    setActiveWorldId(worldId);
    setSelectedPageId(null);
    setView('dashboard');
    setIsWorldMenuOpen(false);
    setWorldActionMenuId(null);
    setEditingWorldId(null);
    setWorldNameDraft('');
    setPageActionMenuId(null);
    setEditingPageId(null);
    setPageTitleDraft('');
    setDraggedPageId(null);
    setShareMenuWorldId(null);
    setCollapsedPageIds([]);
  };

  const handleCreateWorld = () => {
    const count = worlds.length + 1;
    const newWorld = createEmptyWorld(`New World ${count}`);

    commitWorldsUpdate((prev) => [...prev, newWorld]);
    queueChanges([{ type: 'createWorld', world: newWorld }]);
    setActiveWorldId(newWorld.id);
    setSelectedPageId(null);
    setView('dashboard');
    setIsWorldMenuOpen(false);
    setWorldActionMenuId(null);
    setEditingWorldId(newWorld.id);
    setWorldNameDraft(newWorld.name);
    setCollapsedPageIds([]);
  };

  const handleAddPage = (parentId?: string) => {
    if (!activeWorld) return;

    const newPage = createPage(parentId ? 'Untitled sub-page' : 'Untitled page');
    const parentTitle = parentId ? findPageInTree(activeWorld.pages, parentId)?.title ?? '' : '';
    const activityEntry = buildActivityEntry(
      'create',
      newPage.title,
      parentTitle ? `Added beneath “${parentTitle}”` : 'Added to the index',
    );
    if (parentId) {
      setCollapsedPageIds((prev) => prev.filter((id) => id !== parentId));
    }

    commitWorldsUpdate((prev) =>
      prev.map((world) =>
        world.id === activeWorld.id
          ? {
              ...world,
              pages: addPageToTree(world.pages, parentId ?? null, newPage),
              activity: appendActivity(world.activity, activityEntry),
            }
          : world,
      ),
    );
    queueChanges([
      { type: 'insertPage', worldId: activeWorld.id, parentId: parentId ?? null, page: newPage },
      { type: 'appendActivity', worldId: activeWorld.id, entries: [activityEntry] },
    ]);

    setSelectedPageId(newPage.id);
    setView('page');
    setPageActionMenuId(null);
    setEditingPageId(newPage.id);
    setPageTitleDraft(newPage.title);
  };

  const startWorldRename = (world: World) => {
    setEditingWorldId(world.id);
    setWorldNameDraft(world.name);
  };

  const commitWorldRename = () => {
    if (!editingWorldId) return;

    const nextName = worldNameDraft.trim() || 'Untitled world';
    commitWorldsUpdate((prev) =>
      prev.map((world) => (world.id === editingWorldId ? { ...world, name: nextName } : world)),
    );
    queueChanges([{ type: 'updateWorld', worldId: editingWorldId, data: { name: nextName } }]);
    setEditingWorldId(null);
    setWorldNameDraft('');
  };

  const cancelWorldRename = () => {
    setEditingWorldId(null);
    setWorldNameDraft('');
  };

  const handleDuplicateWorld = (worldId: string) => {
    const source = worlds.find((world) => world.id === worldId);
    if (!source) return;

    const copyName = `${source.name} copy`;
    const duplicateBase = createEmptyWorld(copyName);
    const duplicate: World = {
      ...duplicateBase,
      pages: clonePageTree(source.pages),
      activity: appendActivity(
        duplicateBase.activity,
        buildActivityEntry('duplicate', source.name, `Copied from “${source.name}”`),
      ),
    };

    commitWorldsUpdate((prev) => [...prev, duplicate]);
    queueChanges([{ type: 'createWorld', world: duplicate }]);
    setActiveWorldId(duplicate.id);
    setSelectedPageId(null);
    setView('dashboard');
    setIsWorldMenuOpen(false);
    setWorldActionMenuId(null);
    setEditingWorldId(duplicate.id);
    setWorldNameDraft(copyName);
    setCollapsedPageIds([]);
  };

  const handleDeleteWorld = (worldId: string) => {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('Delete this world and all of its pages?');
      if (!confirmed) {
        setWorldActionMenuId(null);
        return;
      }
    }

    let fallbackWorld: World | null = null;
    commitWorldsUpdate((prev) => {
      const remaining = prev.filter((world) => world.id !== worldId);

      if (remaining.length === 0) {
        fallbackWorld = createEmptyWorld('Untitled world');
        setActiveWorldId(fallbackWorld.id);
        setSelectedPageId(null);
        setView('dashboard');
        setIsWorldMenuOpen(false);
        setWorldActionMenuId(null);
        setEditingWorldId(null);
        return [fallbackWorld];
      }

      if (worldId === activeWorldId) {
        const nextWorld = remaining[0];
        setActiveWorldId(nextWorld.id);
        setSelectedPageId(null);
        setView('dashboard');
      }

      return remaining;
    });
    const changes: WorldChange[] = [{ type: 'deleteWorld', worldId }];
    if (fallbackWorld) {
      changes.push({ type: 'createWorld', world: fallbackWorld });
    }
    queueChanges(changes);

    setWorldActionMenuId(null);
    setIsWorldMenuOpen(false);
    setEditingWorldId(null);
    setWorldNameDraft('');
    setShareMenuWorldId(null);
    if (worldId === activeWorldId || fallbackWorld) {
      setCollapsedPageIds([]);
    }
  };

  const handleOpenPageMenu = (pageId: string) => {
    setPageActionMenuId(pageId);
    setEditingPageId(null);
    setPageTitleDraft('');
  };

  const handleClosePageMenu = () => {
    setPageActionMenuId(null);
  };

  const handleStartPageRename = (pageId: string) => {
    if (!activeWorld) return;

    const page = findPageInTree(activeWorld.pages, pageId);
    if (!page) return;

    setEditingPageId(pageId);
    setPageTitleDraft(page.title);
    setPageActionMenuId(null);
  };

  const handleCommitPageRename = () => {
    if (!activeWorld || !editingPageId) return;

    const nextTitle = pageTitleDraft.trim() || 'Untitled page';
    const existingPage = findPageInTree(activeWorld.pages, editingPageId);
    const previousTitle = existingPage?.title ?? 'Untitled page';
    const shouldLog = previousTitle !== nextTitle;
    const renameEntry = shouldLog
      ? buildActivityEntry('update', nextTitle, `Renamed from “${previousTitle}”`)
      : null;

    commitWorldsUpdate((prev) =>
      prev.map((world) =>
        world.id === activeWorld.id
          ? {
              ...world,
              pages: updatePageInTree(world.pages, editingPageId, (page) => ({
                ...page,
                title: nextTitle,
              })),
              activity: renameEntry ? appendActivity(world.activity, renameEntry) : world.activity,
            }
          : world,
      ),
    );
    const renameChanges: WorldChange[] = [
      { type: 'updatePage', worldId: activeWorld.id, pageId: editingPageId, data: { title: nextTitle } },
    ];
    if (renameEntry) {
      renameChanges.push({ type: 'appendActivity', worldId: activeWorld.id, entries: [renameEntry] });
    }
    queueChanges(renameChanges);

    if (editingPageId === currentPageId) {
      setEditorTitle(nextTitle);
    }

    setEditingPageId(null);
    setPageTitleDraft('');
  };

  const handleCancelPageRename = () => {
    setEditingPageId(null);
    setPageTitleDraft('');
  };

  const handlePageRenameChange = (value: string) => {
    setPageTitleDraft(value);
  };

  const handleRemoveCollaborator = (worldId: string, collaboratorId: string) => {
    let collaboratorsAfterRemoval: WorldCollaborator[] | null = null;
    let removalEntry: ActivityEntry | null = null;

    commitWorldsUpdate((prev) =>
      prev.map((world) => {
        if (world.id !== worldId) {
          return world;
        }

        if (collaboratorId === world.ownerId || world.ownerId !== currentUser.id) {
          return world;
        }

        const collaborator = world.collaborators.find((member) => member.id === collaboratorId);
        if (!collaborator) {
          return world;
        }

        removalEntry = buildActivityEntry('share', collaborator.name, 'Removed from shared access');
        collaboratorsAfterRemoval = world.collaborators.filter((member) => member.id !== collaboratorId);

        return {
          ...world,
          collaborators: collaboratorsAfterRemoval,
          activity: appendActivity(world.activity, removalEntry),
        };
      }),
    );

    if (collaboratorsAfterRemoval) {
      const changes: WorldChange[] = [
        { type: 'setCollaborators', worldId, collaborators: collaboratorsAfterRemoval },
      ];
      if (removalEntry) {
        changes.push({ type: 'appendActivity', worldId, entries: [removalEntry] });
      }
      queueChanges(changes);
    }
  };

  const handleToggleFavorite = (pageId: string) => {
    if (!activeWorld) return;

    commitWorldsUpdate((prev) =>
      prev.map((world) =>
        world.id === activeWorld.id
          ? {
              ...world,
              pages: updatePageInTree(world.pages, pageId, (page) => ({
                ...page,
                favorite: !page.favorite,
              })),
            }
          : world,
      ),
    );
    const page = findPageInTree(activeWorld.pages, pageId);
    const nextFavorite = !(page?.favorite ?? false);
    queueChanges([buildPageChange(activeWorld.id, pageId, { favorite: nextFavorite })]);
  };

  const handleCopyPageLink = (pageId: string) => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    url.searchParams.set('world', activeWorldId);
    url.searchParams.set('page', pageId);

    if (typeof navigator !== 'undefined' && navigator.clipboard && 'writeText' in navigator.clipboard) {
      navigator.clipboard.writeText(url.toString()).catch(() => {
        window.prompt('Copy this link to share the page:', url.toString());
      });
    } else {
      window.prompt('Copy this link to share the page:', url.toString());
    }
  };

  const handleDuplicatePage = (pageId: string) => {
    if (!activeWorld) return;

    const sourcePage = findPageInTree(activeWorld.pages, pageId);
    if (!sourcePage) return;

    const duplicateTitle = `${sourcePage.title} copy`;
    const duplicatePage: PageNode = {
      id: generateId('page'),
      title: duplicateTitle,
      content: sourcePage.content,
      favorite: false,
      children: clonePageTree(sourcePage.children),
    };
    const duplicateEntry = buildActivityEntry('duplicate', duplicateTitle, `Copied from “${sourcePage.title}”`);
    const duplicateParentId = findParentId(activeWorld.pages, pageId);

    if (duplicateParentId) {
      setCollapsedPageIds((prev) => prev.filter((id) => id !== duplicateParentId));
    }

    commitWorldsUpdate((prev) =>
      prev.map((world) => {
        if (world.id !== activeWorld.id) {
          return world;
        }

        const insertion = insertPageAfter(world.pages, pageId, duplicatePage);
        return {
          ...world,
          pages: insertion.inserted ? insertion.nodes : [...world.pages, duplicatePage],
          activity: appendActivity(world.activity, duplicateEntry),
        };
      }),
    );
    queueChanges([
      { type: 'insertPage', worldId: activeWorld.id, parentId: duplicateParentId, page: duplicatePage },
      { type: 'appendActivity', worldId: activeWorld.id, entries: [duplicateEntry] },
    ]);

    setSelectedPageId(duplicatePage.id);
    setView('page');
    setEditorTitle(duplicateTitle);
    setPageActionMenuId(null);
    setEditingPageId(null);
    setPageTitleDraft('');
  };

  const handleToggleCollapse = (pageId: string) => {
    setCollapsedPageIds((prev) =>
      prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId],
    );
  };

  const handleDeletePage = (pageId: string) => {
    if (!activeWorld) return;

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('Delete this page and its sub-pages?');
      if (!confirmed) {
        return;
      }
    }

    const removal = removePageFromTree(activeWorld.pages, pageId);
    if (!removal.removed) {
      return;
    }
    const removedPage = removal.removed;
    const deleteEntry = buildActivityEntry(
      'delete',
      removedPage.title,
      removedPage.children.length
        ? 'Removed the page and its nested entries'
        : 'Removed the page from the index',
    );

    setCollapsedPageIds((prev) => {
      const collectIds = (node: PageNode): string[] => {
        let ids = [node.id];
        for (const child of node.children) {
          ids = ids.concat(collectIds(child));
        }
        return ids;
      };
      const removedIds = collectIds(removedPage);
      return prev.filter((id) => !removedIds.includes(id));
    });

    commitWorldsUpdate((prev) =>
      prev.map((world) =>
        world.id === activeWorld.id
          ? {
              ...world,
              pages: removal.nodes,
              activity: appendActivity(world.activity, deleteEntry),
            }
          : world,
      ),
    );
    queueChanges([
      { type: 'removePage', worldId: activeWorld.id, pageId },
      { type: 'appendActivity', worldId: activeWorld.id, entries: [deleteEntry] },
    ]);

    if (selectedPageId === pageId) {
      setSelectedPageId(null);
      setView('dashboard');
      setEditorTitle('');
    }

    setPageActionMenuId(null);
    setEditingPageId(null);
    setPageTitleDraft('');
  };

  const handlePageDragStart = (pageId: string, event: DragEvent<HTMLDivElement>) => {
    setDraggedPageId(pageId);
    setPageActionMenuId(null);
    setEditingPageId(null);
    setPageTitleDraft('');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', pageId);
  };

  const handlePageDragEnd = () => {
    setDraggedPageId(null);
  };

  const handlePageDrop = (targetId: string) => {
    if (!activeWorld || !draggedPageId) return;

    if (draggedPageId === targetId) {
      setDraggedPageId(null);
      return;
    }
    if (isDescendant(activeWorld.pages, draggedPageId, targetId)) {
      setDraggedPageId(null);
      return;
    }

    const draggedPage = findPageInTree(activeWorld.pages, draggedPageId);
    const targetPage = findPageInTree(activeWorld.pages, targetId);
    const moveEntry = draggedPage
      ? buildActivityEntry(
          'move',
          draggedPage.title,
          targetPage ? `Repositioned before “${targetPage.title}”` : 'Reordered in the index',
        )
      : null;

    commitWorldsUpdate((prev) =>
      prev.map((world) =>
        world.id === activeWorld.id
          ? {
              ...world,
              pages: movePageBefore(world.pages, draggedPageId, targetId),
              activity: moveEntry ? appendActivity(world.activity, moveEntry) : world.activity,
            }
          : world,
      ),
    );
    queueChanges([
      { type: 'movePage', worldId: activeWorld.id, pageId: draggedPageId, targetId, position: 'before' },
      ...(moveEntry ? [{ type: 'appendActivity', worldId: activeWorld.id, entries: [moveEntry] }] : []),
    ]);

    setDraggedPageId(null);
  };

  const handleUpdatePageTitle = (pageId: string, title: string) => {
    if (!activeWorld) return;

    commitWorldsUpdate((prev) =>
      prev.map((world) =>
        world.id === activeWorld.id
          ? {
              ...world,
              pages: updatePageInTree(world.pages, pageId, (page) => ({ ...page, title })),
            }
          : world,
      ),
    );
    queueChanges([buildPageChange(activeWorld.id, pageId, { title })]);
  };

  const handleUpdatePageContent = (pageId: string, content: string) => {
    if (!activeWorld) return;

    commitWorldsUpdate((prev) =>
      prev.map((world) =>
        world.id === activeWorld.id
          ? {
              ...world,
              pages: updatePageInTree(world.pages, pageId, (page) => ({ ...page, content })),
            }
          : world,
      ),
    );
    queueChanges([buildPageChange(activeWorld.id, pageId, { content })]);
  };

  const handleEditorInput = () => {
    if (!currentPageId) return;

    const raw = editorRef.current?.innerHTML ?? '';
    const sanitized = sanitizeEditorHtml(raw);

    if (editorRef.current && raw !== sanitized) {
      editorRef.current.innerHTML = sanitized;
    }

    isLocalEditRef.current = true;
    handleUpdatePageContent(currentPageId, sanitized);
  };

  const handleToolbarAction = (command: string, value?: string) => {
    if (!editorRef.current) return;

    editorRef.current.focus();

    if (typeof document !== 'undefined') {
      document.execCommand(command, false, value ?? '');
      window.setTimeout(() => {
        handleEditorInput();
      }, 0);
    }
  };

  const handleManualSync = async () => {
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    await flushPendingChanges();
  };

  const handleToggleExportPage = (pageId: string) => {
    setSelectedExportPageIds((prev) =>
      prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId],
    );
  };

  const handleExportPdf = () => {
    const rootPages = activeWorld?.pages ?? [];
    const selectedSet = new Set(selectedExportPageIds);
    const selectedPages = rootPages.filter((page) => selectedSet.has(page.id));

    if (!selectedPages.length) {
      if (typeof window !== 'undefined') {
        window.alert('Select at least one page to export.');
      }
      return;
    }

    setIsExportMenuOpen(false);

    if (typeof window !== 'undefined') {
      const titles = selectedPages.map((page) => page.title || 'Untitled page').join(', ');
      window.setTimeout(() => {
        window.alert(`Preparing a PDF with: ${titles}. It will download shortly.`);
      }, 150);
    }
  };

  const handleToggleLightMode = () => {
    setIsLightMode((prev) => !prev);
  };

  const handleSelectAllExportPages = () => {
    const rootPages = activeWorld?.pages ?? [];
    setSelectedExportPageIds(rootPages.map((page) => page.id));
  };

  const handleClearExportPages = () => {
    setSelectedExportPageIds([]);
  };

  const handleWorldNameInput = (event: ChangeEvent<HTMLInputElement>) => {
    setWorldNameDraft(event.target.value);
  };

  const handleWorldNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitWorldRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelWorldRename();
    }
  };

  const handleSelectPage = (pageId: string) => {
    setSelectedPageId(pageId);
    setView('page');
    setPageActionMenuId(null);
    setEditingPageId(null);
    setPageTitleDraft('');
  };

  const handleShowDashboard = () => {
    setSelectedPageId(null);
    setView('dashboard');
    setPageActionMenuId(null);
    setEditingPageId(null);
    setPageTitleDraft('');
    setShareMenuWorldId(null);
  };

  const renderDashboard = () => (
    <div className="flex flex-col gap-10">
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-8 shadow-inner">
          <p className="text-sm uppercase tracking-[0.28em] text-indigo-200">Welcome back</p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight text-slate-50 sm:text-4xl">
            Architect the worlds your stories deserve.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-slate-300">
            Enfield World Builder offers a calm, luminous canvas for novelists and game masters. Collect every whisper of lore, align timelines, and surface the threads that make your universe unforgettable.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button className="inline-flex items-center gap-2 rounded-2xl bg-indigo-500/80 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-indigo-500/40 transition hover:-translate-y-0.5 hover:bg-indigo-400">
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                <path d="M9 3a1 1 0 0 1 2 0v6h6a1 1 0 0 1 0 2h-6v6a1 1 0 0 1-2 0v-6H3a1 1 0 0 1 0-2h6V3Z" />
              </svg>
              Create chapter
            </button>
            <button className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:-translate-y-0.5 hover:border-indigo-400/50">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 17h5l-1.4-1.4A2 2 0 0 1 17 14.2V11a5 5 0 1 0-10 0v3.2c0 .5-.2 1-.6 1.4L5 17h5" />
              </svg>
              Invite collaborator
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.34em] text-indigo-200">Favorites</p>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.3em] text-indigo-100">
                {favoritePages.length}
              </span>
            </div>

            {favoritePages.length > 0 ? (
              <ul className="mt-4 space-y-3 text-sm text-slate-200">
                {favoritePages.map((page) => (
                  <li
                    key={page.id}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 transition hover:border-indigo-300/40 hover:bg-white/10"
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectPage(page.id)}
                      className="flex-1 truncate text-left hover:text-indigo-100"
                    >
                      {page.title}
                    </button>
                    <span className="ml-3 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.3em] text-indigo-200">
                      Open
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8 6 4 4-4 4" />
                      </svg>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-slate-400">Mark pages as favorites to see them here.</p>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
            <p className="text-xs uppercase tracking-[0.32em] text-indigo-200">Today’s cadence</p>
            <ul className="mt-4 space-y-4">
              {timeline.map((item) => (
                <li key={item.label} className="flex items-start justify-between gap-3 text-sm text-slate-300">
                  <div>
                    <p className="font-medium text-slate-100">{item.label}</p>
                    <p className="mt-1 text-slate-400">{item.detail}</p>
                  </div>
                  <span className="rounded-full border border-indigo-400/40 bg-indigo-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-indigo-200">
                    {item.time}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-dashed border-indigo-300/40 bg-indigo-500/10 p-6 text-sm text-indigo-100">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-indigo-100/80">Export preview</p>
            <p className="mt-3 leading-relaxed">
              Send a polished PDF to your editor, or publish a live companion site that updates with every lore entry you capture.
            </p>
            <button className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-indigo-200/60 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-indigo-50 transition hover:-translate-y-0.5 hover:bg-white/20">
              Schedule export
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.34em] text-indigo-200/80">Shared worlds</p>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.3em] text-indigo-100">
              {sharedWorlds.length}
            </span>
          </div>

          {sharedWorlds.length ? (
            <ul className="mt-4 space-y-3">
              {sharedWorlds.map((world) => {
                const owner =
                  world.collaborators.find((member) => member.id === world.ownerId) ?? world.collaborators[0];
                const collaboratorCount = world.collaborators.length;
                const isExpanded = shareMenuWorldId === world.id;
                const canManage = currentUser.id === world.ownerId;

                return (
                  <li
                    key={world.id}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-indigo-300/40 hover:bg-white/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-100">{world.name}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {collaboratorCount} {collaboratorCount === 1 ? 'member' : 'members'} • Owner: {owner?.name ?? 'Unknown'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setShareMenuWorldId((previous) => (previous === world.id ? null : world.id))
                        }
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-indigo-100 transition hover:border-indigo-300/60"
                        aria-expanded={isExpanded}
                        aria-controls={`shared-world-${world.id}`}
                      >
                        {isExpanded ? 'Hide' : 'View'}
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 20 20"
                          className={`h-4 w-4 transition ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m6 8 4 4 4-4" />
                        </svg>
                      </button>
                    </div>

                    {isExpanded ? (
                      <ul id={`shared-world-${world.id}`} className="mt-4 space-y-2">
                        {world.collaborators.map((member) => {
                          const isOwner = member.id === world.ownerId;
                          const canRemove = canManage && !isOwner;
                          const initial = member.name?.[0]?.toUpperCase() ?? '?';

                          return (
                            <li
                              key={member.id}
                              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200"
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-slate-950"
                                  style={{ backgroundColor: member.avatarColor }}
                                  aria-hidden="true"
                                >
                                  {initial}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-slate-100">{member.name}</p>
                                  <p className="truncate text-xs text-slate-400">{member.email}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.3em] ${
                                    isOwner
                                      ? 'border-amber-300/50 text-amber-200'
                                      : 'border-white/10 text-indigo-100'
                                  }`}
                                >
                                  {member.role}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCollaborator(world.id, member.id)}
                                  disabled={!canRemove}
                                  className={`inline-flex h-8 items-center rounded-lg border px-2 text-xs font-semibold uppercase tracking-[0.28em] transition ${
                                    canRemove
                                      ? 'border-white/10 text-rose-200 hover:border-rose-300/60 hover:text-rose-100'
                                      : 'cursor-not-allowed border-white/5 text-slate-500'
                                  }`}
                                >
                                  Remove
                                </button>
                              </div>
                            </li>
                          );
                        })}
                        {!canManage ? (
                          <li className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
                            Only the world owner can manage access.
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-400">
              Invite collaborators to share your worlds and manage access in one place.
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.34em] text-indigo-200/80">World activity</p>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.3em] text-indigo-100">
              {activityEntries.length}
            </span>
          </div>

          {activityEntries.length ? (
            <ul className="mt-4 space-y-3">
              {activityEntries.slice(0, 6).map((entry) => (
                <li key={entry.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-100">{entry.actorName}</p>
                      <p className="mt-1 text-sm text-slate-300">{summarizeActivity(entry)}</p>
                      {entry.context ? (
                        <p className="mt-1 text-xs text-slate-400">{entry.context}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs uppercase tracking-[0.28em] text-indigo-200/80">
                      {formatRelativeTime(entry.timestamp)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-400">
              Activity will appear once you start editing pages in this world.
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {collections.map((collection) => (
          <article
            key={collection.title}
            className="group relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 p-6 transition hover:-translate-y-1 hover:border-indigo-400/40 hover:bg-slate-900/90"
          >
            <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-indigo-400/10 blur-2xl transition group-hover:bg-indigo-400/20" />
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.32em] text-indigo-200/80">{collection.status}</p>
              <span className="text-sm text-slate-400">{collection.progress}%</span>
            </div>
            <h2 className="mt-3 text-xl font-semibold text-slate-50">{collection.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">{collection.description}</p>
            <div className="mt-6 flex items-center justify-between text-xs text-indigo-200/80">
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-indigo-400/80" />
                Updated 12m ago
              </span>
              <button className="rounded-2xl border border-white/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.32em] text-slate-200 transition hover:border-indigo-300/50">
                Open
              </button>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.34em] text-indigo-200/80">Quick commands</p>
            <button className="text-xs uppercase tracking-[0.3em] text-indigo-300 transition hover:text-indigo-100">Customize</button>
          </div>
          <ul className="mt-4 space-y-3 text-sm text-slate-200">
            {quickLinks.map((link) => (
              <li
                key={link.label}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-indigo-300/40 hover:bg-white/10"
              >
                <span>{link.label}</span>
                <span className="text-[11px] uppercase tracking-[0.32em] text-indigo-200/80">{link.shortcut}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent p-6">
          <p className="text-xs uppercase tracking-[0.32em] text-indigo-100/80">Templates</p>
          <ul className="mt-4 space-y-4 text-sm text-slate-100">
            {templates.map((template) => (
              <li
                key={template.name}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-indigo-200/50 hover:bg-white/10"
              >
                <p className="font-semibold text-slate-50">{template.name}</p>
                <p className="mt-2 text-slate-300">{template.blurb}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );

  const renderPageEditor = () => {
    if (!currentPageId) {
      return (
        <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-slate-950/60 p-12 text-center text-slate-300">
          <p className="text-lg font-semibold text-slate-100">Select a page to begin writing.</p>
          <p className="mt-2 text-sm text-slate-400">
            Choose a page from the index or create a new one to unlock the editor.
          </p>
        </div>
      );
    }

    const toolbarButtons: { label: string; command: string; value?: string; icon: ReactElement }[] = [
      {
        label: 'Bold',
        command: 'bold',
        icon: (
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
            <path d="M6 4.25a.75.75 0 0 1 .75-.75h4a3.25 3.25 0 0 1 1.8 5.96A3.5 3.5 0 0 1 11 16H6.75a.75.75 0 0 1-.75-.75V4.25Zm1.5.75v4h3.25a1.75 1.75 0 1 0 0-3.5H7.5Zm0 5.5v3.5H11a2 2 0 1 0 0-4H7.5Z" />
          </svg>
        ),
      },
      {
        label: 'Italic',
        command: 'italic',
        icon: (
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 4h6M5 16h6M11 4 9 16" />
          </svg>
        ),
      },
      {
        label: 'Underline',
        command: 'underline',
        icon: (
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 4v5a4 4 0 0 0 8 0V4" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16h12" />
          </svg>
        ),
      },
      {
        label: 'Heading 1',
        command: 'formatBlock',
        value: 'h1',
        icon: (
          <span className="text-sm font-semibold">H1</span>
        ),
      },
      {
        label: 'Heading 2',
        command: 'formatBlock',
        value: 'h2',
        icon: (
          <span className="text-sm font-semibold">H2</span>
        ),
      },
      {
        label: 'Bulleted list',
        command: 'insertUnorderedList',
        icon: (
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
            <path d="M4 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM4 11.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM7 6h9v2H7V6Zm0 6h9v2H7v-2Z" />
          </svg>
        ),
      },
      {
        label: 'Numbered list',
        command: 'insertOrderedList',
        icon: (
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6H6v4h-.75M4.5 14h1.5m-1.5 0H6m0 0v1H4.5M9 6h7v2H9V6Zm0 6h7v2H9v-2Z" />
          </svg>
        ),
      },
      {
        label: 'Quote',
        command: 'formatBlock',
        value: 'blockquote',
        icon: (
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
            <path d="M6.5 5A2.5 2.5 0 0 0 4 7.5v5A2.5 2.5 0 0 0 6.5 15H7v-3H5.5v-1A1.5 1.5 0 0 1 7 9.5V5h-.5Zm7 0A2.5 2.5 0 0 0 11 7.5v5A2.5 2.5 0 0 0 13.5 15H14v-3h-1.5v-1A1.5 1.5 0 0 1 14 9.5V5h-.5Z" />
          </svg>
        ),
      },
    ];

    const sizeOptions = [
      { label: 'Small', value: '2' },
      { label: 'Normal', value: '3' },
      { label: 'Large', value: '4' },
      { label: 'Huge', value: '5' },
    ];

    const colorOptions = isLightMode
      ? [
          { label: 'Ink', value: '#0f172a' },
          { label: 'Amber', value: '#b45309' },
          { label: 'Rosewood', value: '#be123c' },
          { label: 'Ocean', value: '#0ea5e9' },
          { label: 'Moss', value: '#047857' },
          { label: 'Orchid', value: '#6d28d9' },
        ]
      : [
          { label: 'Snow', value: '#e2e8f0' },
          { label: 'Celestial', value: '#38bdf8' },
          { label: 'Petal', value: '#f472b6' },
          { label: 'Aurora', value: '#a855f7' },
          { label: 'Ember', value: '#f97316' },
          { label: 'Verdant', value: '#34d399' },
        ];

    const panelClasses = isLightMode
      ? 'overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl'
      : 'overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 shadow-inner';

    const toolbarSectionClasses = isLightMode
      ? 'border-b border-slate-200 bg-slate-50 px-3 py-3'
      : 'border-b border-white/10 bg-slate-950/85 px-3 py-3';

    const titleSectionClasses = isLightMode
      ? 'border-b border-slate-200 bg-white px-3 py-3'
      : 'border-b border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent px-3 py-3';

    const bodySectionClasses = isLightMode ? 'bg-white px-3 py-3' : 'bg-slate-950/85 px-3 py-3';

    const toolbarButtonClass = isLightMode
      ? 'inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-semibold uppercase tracking-[0.28em] text-slate-700 transition hover:-translate-y-0.5 hover:border-indigo-300/70 hover:bg-slate-200/70 hover:text-indigo-600'
      : 'inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold uppercase tracking-[0.28em] text-slate-200 transition hover:-translate-y-0.5 hover:border-indigo-300/60 hover:text-indigo-100';

    const sizeControlClass = isLightMode
      ? 'inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-[11px] uppercase tracking-[0.3em] text-slate-600'
      : 'inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.3em] text-slate-300';

    const selectClass = isLightMode
      ? 'rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-700 outline-none focus:border-indigo-300/80'
      : 'rounded-lg border border-white/10 bg-slate-900/70 px-2 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-100 outline-none focus:border-indigo-300/60';

    const colorGroupClass = isLightMode
      ? 'flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5'
      : 'flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5';

    const colorLabelClass = isLightMode
      ? 'text-[11px] uppercase tracking-[0.3em] text-slate-600'
      : 'text-[11px] uppercase tracking-[0.3em] text-slate-300';

    const editorSurfaceClass = `mt-3 min-h-[420px] rounded-2xl border px-3 py-2 text-base leading-relaxed outline-none transition focus-within:ring-2 ${
      isLightMode
        ? 'border-slate-200 bg-white text-slate-800 focus-within:border-indigo-300 focus-within:ring-indigo-200/70'
        : 'border-white/10 bg-slate-950/80 text-slate-200 focus-within:border-indigo-400/50 focus-within:ring-indigo-400/30'
    }`;

    const infoRowClass = `mt-3 flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-[0.28em] ${
      isLightMode ? 'text-slate-500' : 'text-slate-400'
    }`;

    const exportButtonClass = isLightMode
      ? 'inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-indigo-300/70 hover:text-indigo-600'
      : 'inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-indigo-100 transition hover:-translate-y-0.5 hover:border-indigo-300/60 hover:text-indigo-50';

    const exportMenuClasses = isLightMode
      ? 'absolute right-0 top-11 z-30 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl'
      : 'absolute right-0 top-11 z-30 w-64 rounded-2xl border border-white/10 bg-slate-950/95 p-4 shadow-2xl';

    const exportMenuHeadingClass = isLightMode
      ? 'text-[11px] uppercase tracking-[0.28em] text-slate-500'
      : 'text-[11px] uppercase tracking-[0.28em] text-slate-400';

    const exportMenuDescriptionClass = isLightMode ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-400';

    const exportMenuListClass = isLightMode
      ? 'mt-3 space-y-2 text-sm text-slate-700'
      : 'mt-3 space-y-2 text-sm text-slate-200';

    const exportMenuItemClass = isLightMode
      ? 'flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2'
      : 'flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2';

    const exportMenuActionClass = `${
      isLightMode
        ? 'rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-indigo-300/70 hover:text-indigo-600'
        : 'rounded-lg border border-white/10 bg-slate-900/70 text-slate-200 hover:border-indigo-300/60 hover:text-indigo-100'
    } px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.28em] transition disabled:cursor-not-allowed disabled:opacity-60`;

    const exportDownloadClass = `${
      isLightMode
        ? 'rounded-lg border border-indigo-200 bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20'
        : 'rounded-lg border border-indigo-300/60 bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/30'
    } px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.28em] transition disabled:cursor-not-allowed disabled:opacity-60`;

    const toggleButtonClass = isLightMode
      ? 'ml-auto inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-700 transition hover:-translate-y-0.5 hover:border-indigo-300/70 hover:text-indigo-600'
      : 'ml-auto inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-slate-900/70 px-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-200 transition hover:-translate-y-0.5 hover:border-indigo-300/60 hover:text-indigo-100';

    const toggleIconClass = isLightMode ? 'h-4 w-4 text-amber-500' : 'h-4 w-4 text-indigo-200';

    const titleInputClasses = isLightMode
      ? 'w-full bg-transparent text-3xl font-semibold text-slate-800 outline-none placeholder:text-slate-400'
      : 'w-full bg-transparent text-3xl font-semibold text-slate-50 outline-none placeholder:text-slate-500';

    const rootPages = activeWorld?.pages ?? [];
    const selectedExportCount = selectedExportPageIds.length;
    const totalExportable = rootPages.length;

    const handleTextSizeSelect = (value: string) => {
      setTextSize(value);
      handleToolbarAction('fontSize', value);
    };

    const handleTextColorSelect = (color: string) => {
      setTextColor(color);
      handleToolbarAction('foreColor', color);
    };

    return (
      <div className="flex flex-col gap-6">
        <div className={panelClasses}>
          <div className={toolbarSectionClasses}>
            <div className="flex w-full flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex flex-1 flex-wrap items-center gap-2 sm:gap-3">
                {toolbarButtons.map((button) => (
                  <button
                    key={button.label}
                    type="button"
                    onClick={() => handleToolbarAction(button.command, button.value)}
                    className={toolbarButtonClass}
                    aria-label={button.label}
                  >
                    {button.icon}
                  </button>
                ))}

                <label className={sizeControlClass}>
                  Size
                  <select
                    value={textSize}
                    onChange={(event) => handleTextSizeSelect(event.target.value)}
                    className={selectClass}
                  >
                    {sizeOptions.map((option) => (
                      <option key={option.value} value={option.value} className="text-slate-900">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className={colorGroupClass}>
                  <span className={colorLabelClass}>Color</span>
                  <div className="flex items-center gap-1.5">
                    {colorOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleTextColorSelect(option.value)}
                        className={`h-6 w-6 rounded-full border-2 transition ${
                          textColor === option.value
                            ? isLightMode
                              ? 'border-indigo-300 ring-2 ring-indigo-200/70'
                              : 'border-white ring-2 ring-indigo-300/60'
                            : isLightMode
                              ? 'border-slate-300 hover:border-slate-400'
                              : 'border-white/20 hover:border-white/60'
                        }`}
                        style={{ backgroundColor: option.value }}
                        aria-label={`Set text color to ${option.label}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleLightMode}
                className={toggleButtonClass}
                aria-pressed={isLightMode}
                title={isLightMode ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {isLightMode ? (
                  <svg aria-hidden="true" viewBox="0 0 20 20" className={toggleIconClass} fill="currentColor">
                    <path d="M11.08 2.25a.75.75 0 0 1 .9.9 6.5 6.5 0 0 0 7.17 7.92.75.75 0 0 1 .57 1.35 8 8 0 1 1-8.64-10.17Z" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 20 20" className={toggleIconClass} fill="currentColor">
                    <path d="M10 3a1 1 0 0 1 1 1v1.25a1 1 0 0 1-2 0V4a1 1 0 0 1 1-1Zm5.657 1.343a1 1 0 0 1 0 1.414l-.884.884a1 1 0 1 1-1.414-1.414l.884-.884a1 1 0 0 1 1.414 0ZM17 9a1 1 0 1 1 0 2h-1.25a1 1 0 0 1 0-2H17ZM5.64 5.64a1 1 0 0 1-1.414 0l-.884-.884a1 1 0 1 1 1.414-1.414l.884.884a1 1 0 0 1 0 1.414ZM10 6.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7ZM4 10a1 1 0 0 1-1 1H1.75a1 1 0 0 1 0-2H3a1 1 0 0 1 1 1Zm10.017 4.358a1 1 0 0 1 1.415 1.414l-.885.884a1 1 0 0 1-1.414-1.414l.884-.884ZM11 16a1 1 0 1 1-2 0v-1.25a1 1 0 0 1 2 0V16Zm-6.071-1.358.884.884a1 1 0 0 1-1.414 1.414l-.884-.884a1 1 0 0 1 1.414-1.414Z" />
                  </svg>
                )}
                <span>{isLightMode ? 'Dark' : 'Light'}</span>
              </button>
            </div>
          </div>

          <div className={titleSectionClasses}>
            <input
              className={titleInputClasses}
              value={editorTitle}
              onChange={(event) => {
                setEditorTitle(event.target.value);
                handleUpdatePageTitle(currentPageId, event.target.value);
              }}
              placeholder="Untitled page"
            />
          </div>

          <div className={bodySectionClasses}>
            <div
              ref={editorRef}
              className={editorSurfaceClass}
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onBlur={handleEditorInput}
              data-placeholder="Begin weaving the story of this page..."
              role="textbox"
              aria-multiline="true"
            />

            <div className={infoRowClass}>
              <span>Rich text · Live autosave</span>
              <div className="relative" ref={exportMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsExportMenuOpen((prev) => !prev)}
                  className={exportButtonClass}
                  aria-expanded={isExportMenuOpen}
                  aria-haspopup="menu"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 4h8m-7 4h6m-7 4h6m-8 4h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 14h6l-3 4-3-4Z" />
                  </svg>
                  <span>Export PDF</span>
                </button>

                {isExportMenuOpen ? (
                  <div className={exportMenuClasses} role="menu">
                    <p className={exportMenuHeadingClass}>Export PDF</p>
                    <p className={exportMenuDescriptionClass}>Choose pages from your inbox to include in the download.</p>
                    {rootPages.length ? (
                      <>
                        <ul className={exportMenuListClass}>
                          {rootPages.map((page) => {
                            const isChecked = selectedExportPageIds.includes(page.id);
                            return (
                              <li key={page.id} className={exportMenuItemClass}>
                                <label className="flex flex-1 items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggleExportPage(page.id)}
                                    className={`h-4 w-4 rounded border focus:ring-2 ${
                                      isLightMode
                                        ? 'border-slate-300 text-indigo-500 focus:ring-indigo-300/70'
                                        : 'border-slate-600 bg-slate-900 text-indigo-300 focus:ring-indigo-400/60'
                                    }`}
                                  />
                                  <span className="truncate">{page.title || 'Untitled page'}</span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <div
                            className={`text-[11px] uppercase tracking-[0.28em] ${
                              isLightMode ? 'text-slate-500' : 'text-slate-400'
                            }`}
                          >
                            {totalExportable ? `${selectedExportCount}/${totalExportable} selected` : 'No pages'}
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={handleSelectAllExportPages} className={exportMenuActionClass}>
                              Select all
                            </button>
                            <button
                              type="button"
                              onClick={handleClearExportPages}
                              className={exportMenuActionClass}
                              disabled={!selectedExportCount}
                            >
                              Clear
                            </button>
                            <button
                              type="button"
                              onClick={handleExportPdf}
                              className={exportDownloadClass}
                              disabled={!selectedExportCount}
                            >
                              Download
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className={`mt-3 text-sm ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        Add pages to this world to build your PDF.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderLoading = () => (
    <div className="relative min-h-screen text-slate-100">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.18),_transparent_55%)]" />
        <div className="absolute -top-32 left-1/2 h-64 w-[480px] -translate-x-1/2 rounded-full bg-[conic-gradient(from_90deg_at_50%_50%,_rgba(79,70,229,0.35),_transparent_70%)] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1300px] flex-col items-center justify-center overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/70 shadow-[0_30px_80px_rgba(15,23,42,0.6)] backdrop-blur-xl">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-indigo-400/40 bg-indigo-500/20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-transparent" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-[0.28em] text-indigo-200/80">Enfield World Builder</p>
            <p className="mt-3 max-w-sm text-sm text-slate-300">
              Warming the archives and preparing your storytelling workspace.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderWelcome = () => {
    const authDisabled = authSubmitting || firebaseUnavailable || !firebaseBundle;

    return (
      <div className="relative min-h-screen text-slate-100">
        <div className="pointer-events-none absolute inset-0 opacity-80">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.18),_transparent_55%)]" />
          <div className="absolute -top-32 left-1/2 h-64 w-[520px] -translate-x-1/2 rounded-full bg-[conic-gradient(from_90deg_at_50%_50%,_rgba(165,180,252,0.4),_transparent_70%)] blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-screen max-w-[1300px] flex-col overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/75 shadow-[0_30px_80px_rgba(15,23,42,0.6)] backdrop-blur-xl">
          <header className="flex items-center justify-between border-b border-white/10 bg-slate-950/60 px-8 py-5">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-500 text-white shadow-inner">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 32 32"
                  className="h-7 w-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                >
                  <path
                    d="M20.9 6.4c-5.3 0-9.7 4.2-9.7 9.5 0 3.8 2.4 6.9 5.3 8.9 3.8 2.7 8.9 2.8 11.8-.5 3.4-3.8 1.3-9-2.7-10.5-1.4-.5-3.2-.2-4.3.7-.8.7-1.3 1.7-1.1 2.8.3 1.6 1.7 2.7 3.3 2.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12.5 12.4c-1.7-2-4.6-2.3-6.5-.4-2.2 2.2-1.4 5.5.9 6.9 1.3.8 3 .9 4.4.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.32em] text-indigo-200/70">Enfield</p>
                <p className="text-lg font-semibold text-slate-100">World Builder</p>
              </div>
            </div>

            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.32em] text-slate-300">
              Storycraft beta
            </span>
          </header>

          <div className="grid flex-1 gap-10 px-8 py-16 lg:grid-cols-[1.1fr_1fr] lg:px-12 lg:py-20">
            <div className="flex flex-col justify-center gap-10">
              <div className="space-y-5">
                <p className="text-xs uppercase tracking-[0.4em] text-indigo-200/70">for authors, game masters, world weavers</p>
                <h1 className="text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
                  Build immersive universes with clarity and poetic focus.
                </h1>
                <p className="max-w-xl text-base text-slate-300">
                  Enfield World Builder helps you map every timeline, faction, and narrative thread in one elegant canvas. Unlock the full workspace to draft, organize, and publish living lore.
                </p>
              </div>

              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <dt className="flex items-center gap-3 text-sm font-semibold text-slate-100">
                    <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-200">✧</span>
                    Narrative databases
                  </dt>
                  <dd className="mt-3 text-sm text-slate-300">Nest infinite pages to trace characters, cultures, and chronologies with ease.</dd>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <dt className="flex items-center gap-3 text-sm font-semibold text-slate-100">
                    <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-200">⌁</span>
                    Export-ready briefs
                  </dt>
                  <dd className="mt-3 text-sm text-slate-300">Generate polished PDFs or secure portals when your world bible is ready to share.</dd>
                </div>
              </dl>
            </div>

            <div className="flex items-center">
              <div className="w-full rounded-3xl border border-white/10 bg-slate-950/60 p-8 shadow-[0_15px_45px_rgba(15,23,42,0.45)]">
                <p className="text-sm font-semibold tracking-[0.28em] text-indigo-200/80">Sign in to continue</p>
                <p className="mt-2 text-sm text-slate-300">Secure your chronicles and resume exactly where you left off.</p>

                <div className="mt-6 space-y-4" aria-live="polite">
                  {firebaseUnavailable ? (
                    <p className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
                      Authentication is currently unavailable. Confirm your Firebase credentials and refresh to continue.
                    </p>
                  ) : null}
                  {authError ? (
                    <p className="rounded-2xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{authError}</p>
                  ) : null}
                </div>

                <form onSubmit={handleAuthSubmit} className="mt-6 space-y-4" noValidate>
                  {authMode === 'signup' ? (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">Display name</label>
                      <input
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                        placeholder="How should we greet you?"
                        value={authName}
                        onChange={(event) => {
                          setAuthName(event.target.value);
                          setAuthError(null);
                        }}
                        disabled={authDisabled}
                        autoComplete="name"
                      />
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">Email</label>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                      type="email"
                      required
                      value={authEmail}
                      onChange={(event) => {
                        setAuthEmail(event.target.value);
                        setAuthError(null);
                      }}
                      disabled={authDisabled}
                      autoComplete={authMode === 'login' ? 'email' : 'new-email'}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">Password</label>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                      type="password"
                      required
                      value={authPassword}
                      onChange={(event) => {
                        setAuthPassword(event.target.value);
                        setAuthError(null);
                      }}
                      disabled={authDisabled}
                      autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authDisabled}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-indigo-300/50 px-4 py-3 text-sm font-semibold uppercase tracking-[0.32em] transition ${
                      authDisabled
                        ? 'cursor-not-allowed border-white/10 bg-white/5 text-slate-500'
                        : 'bg-indigo-500/20 text-indigo-100 hover:-translate-y-0.5 hover:border-indigo-300/70 hover:bg-indigo-500/30'
                    }`}
                  >
                    {authSubmitting ? 'One moment…' : authMode === 'login' ? 'Sign in' : 'Create account'}
                  </button>
                </form>

                <div className="mt-6 space-y-4">
                  <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.32em] text-slate-500">
                    <span className="h-px flex-1 bg-white/10" />
                    <span>Or continue with</span>
                    <span className="h-px flex-1 bg-white/10" />
                  </div>
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={authDisabled}
                    className={`inline-flex w-full items-center justify-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                      authDisabled
                        ? 'cursor-not-allowed border-white/10 bg-white/5 text-slate-500'
                        : 'border-white/10 bg-white/5 text-slate-100 hover:-translate-y-0.5 hover:border-indigo-300/60 hover:text-indigo-100'
                    }`}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                      <path d="M12.24 10.08v3.84h5.44c-.24 1.28-1.44 3.76-5.44 3.76a6.24 6.24 0 1 1 0-12.48 5.7 5.7 0 0 1 4.04 1.6l2.76-2.76A9.64 9.64 0 0 0 12.24 2a9.76 9.76 0 1 0 9.76 9.76c0-.64-.08-1.12-.16-1.68z" />
                    </svg>
                    Sign in with Google
                  </button>
                </div>

                <p className="mt-6 text-center text-sm text-slate-400">
                  {authMode === 'login' ? 'Need an Enfield account?' : 'Already with Enfield?'}{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode((mode) => (mode === 'login' ? 'signup' : 'login'));
                      setAuthError(null);
                    }}
                    className="font-semibold text-indigo-200 hover:text-indigo-100"
                  >
                    {authMode === 'login' ? 'Create one' : 'Sign in'}
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!authReady) {
    return renderLoading();
  }

  if (!authUser) {
    return renderWelcome();
  }

  return (
    <div className="relative min-h-screen text-slate-100">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.18),_transparent_55%)]" />
        <div className="absolute -top-32 left-1/2 h-64 w-[480px] -translate-x-1/2 rounded-full bg-[conic-gradient(from_90deg_at_50%_50%,_rgba(79,70,229,0.35),_transparent_70%)] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1300px] flex-col overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/70 shadow-[0_30px_80px_rgba(15,23,42,0.6)] backdrop-blur-xl">
        <header className="relative flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950/60 px-6 py-4 backdrop-blur sm:flex-nowrap">
          <div className="flex shrink-0 items-center gap-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-500 text-white shadow-inner">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 32 32"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                >
                  <path
                    d="M20.9 6.4c-5.3 0-9.7 4.2-9.7 9.5 0 3.8 2.4 6.9 5.3 8.9 3.8 2.7 8.9 2.8 11.8-.5 3.4-3.8 1.3-9-2.7-10.5-1.4-.5-3.2-.2-4.3.7-.8.7-1.3 1.7-1.1 2.8.3 1.6 1.7 2.7 3.3 2.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12.5 12.4c-1.7-2-4.6-2.3-6.5-.4-2.2 2.2-1.4 5.5.9 6.9 1.3.8 3 .9 4.4.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="sr-only">Enfield World Builder workspace</span>
                <span className="text-[11px] uppercase tracking-[0.32em] text-indigo-200/70">Enfield</span>
                <span className="text-sm font-semibold text-slate-100">World Builder</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {editingWorldId === activeWorld?.id ? (
                  <input
                    ref={editingWorldId === activeWorld?.id ? worldNameInputRef : null}
                    value={worldNameDraft}
                    onChange={handleWorldNameInput}
                    onKeyDown={handleWorldNameKeyDown}
                    onBlur={commitWorldRename}
                    className="w-full max-w-sm rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-lg font-semibold text-slate-50 outline-none focus:border-indigo-300/60 focus:ring-2 focus:ring-indigo-400/30"
                    placeholder="Untitled world"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => activeWorld && startWorldRename(activeWorld)}
                    className="max-w-sm truncate rounded-2xl bg-white/5 px-4 py-2 text-left text-lg font-semibold text-slate-100 transition hover:-translate-y-0.5 hover:bg-white/10 hover:text-white"
                  >
                    {activeWorld?.name ?? 'No world selected'}
                  </button>
                )}
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setIsWorldMenuOpen((prev) => {
                      const next = !prev;
                      if (!next) {
                        if (editingWorldId) {
                          commitWorldRename();
                        }
                        setWorldActionMenuId(null);
                        setEditingWorldId(null);
                        setWorldNameDraft('');
                      }
                      return next;
                    })
                  }
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:-translate-y-0.5 hover:border-indigo-400/40 hover:text-indigo-200"
                  aria-haspopup="menu"
                  aria-expanded={isWorldMenuOpen}
                  aria-label="Select world"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" d="M4 6h16M4 12h10M4 18h16" />
                  </svg>
                </button>

                {isWorldMenuOpen ? (
                  <div className="absolute left-0 top-12 z-20 w-72 rounded-2xl border border-white/10 bg-slate-900/95 p-3 shadow-xl">
                    <p className="px-2 pb-2 text-[11px] uppercase tracking-[0.28em] text-slate-400">Worlds</p>
                    <ul className="space-y-1 text-sm">
                      {worlds.map((world) => {
                        const isSelected = world.id === activeWorld?.id;
                        const isEditing = editingWorldId === world.id;

                        return (
                          <li key={world.id} className="relative">
                            <div
                              className={`flex items-center gap-2 rounded-xl border border-transparent px-2 py-2 ${
                                isSelected
                                  ? 'border-indigo-400/40 bg-indigo-500/20 text-indigo-100'
                                  : 'text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-slate-100'
                              }`}
                            >
                              <div className="flex min-w-0 flex-1 items-center">
                                {isEditing ? (
                                  <input
                                    ref={isEditing ? worldNameInputRef : null}
                                    value={worldNameDraft}
                                    onChange={handleWorldNameInput}
                                    onKeyDown={handleWorldNameKeyDown}
                                    onBlur={commitWorldRename}
                                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/30"
                                    placeholder="Untitled world"
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleSelectWorld(world.id)}
                                    className="flex-1 truncate text-left"
                                  >
                                    {world.name}
                                  </button>
                                )}
                              </div>

                              {isSelected ? (
                                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m5.5 10 3 3 6-6" />
                                </svg>
                              ) : null}

                              <button
                                type="button"
                                onClick={() =>
                                  setWorldActionMenuId((prev) => (prev === world.id ? null : world.id))
                                }
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition hover:border-indigo-300/60 hover:text-indigo-200"
                                aria-haspopup="menu"
                                aria-expanded={worldActionMenuId === world.id}
                                aria-label={`World options for ${world.name}`}
                              >
                                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                                  <path d="M4 10a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm4.5 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm4.5 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" />
                                </svg>
                              </button>
                            </div>

                            {worldActionMenuId === world.id ? (
                              <div className="absolute left-0 top-full z-30 mt-2 w-48 rounded-xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl">
                                <button
                                  type="button"
                                  onClick={() => {
                                    startWorldRename(world);
                                    setWorldActionMenuId(null);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5 hover:text-indigo-100"
                                >
                                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 13.5V16h2.5l7.4-7.4-2.5-2.5L4 13.5Z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m12.9 5.6 1.5-1.5a1.5 1.5 0 0 1 2.1 2.1l-1.5 1.5" />
                                  </svg>
                                  Rename world
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleDuplicateWorld(world.id);
                                    setWorldActionMenuId(null);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5 hover:text-indigo-100"
                                >
                                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                                    <path d="M6 3.75A1.75 1.75 0 0 1 7.75 2h6.5A1.75 1.75 0 0 1 16 3.75v6.5A1.75 1.75 0 0 1 14.25 12h-6.5A1.75 1.75 0 0 1 6 10.25v-6.5Zm-2 4.5A1.75 1.75 0 0 1 5.75 6.5H6v3.75A3.25 3.25 0 0 0 9.25 13.5H13v.75A1.75 1.75 0 0 1 11.25 16h-6.5A1.75 1.75 0 0 1 3 14.25v-6.5Z" />
                                  </svg>
                                  Duplicate world
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteWorld(world.id)}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-200 transition hover:bg-rose-500/10 hover:text-rose-100"
                                >
                                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 4h6m-7 2h8l-.6 9.4A1.5 1.5 0 0 1 11.9 17H8.1a1.5 1.5 0 0 1-1.49-1.6L6 6Z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 9.5v4m3-4v4" />
                                  </svg>
                                  Delete world
                                </button>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                    <button
                      type="button"
                      onClick={handleCreateWorld}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 px-3 py-2 text-sm text-slate-200 transition hover:border-indigo-300/50 hover:text-indigo-100"
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
                        <path d="M9 3a1 1 0 0 1 2 0v4h4a1 1 0 1 1 0 2h-4v4a1 1 0 1 1-2 0V9H5a1 1 0 1 1 0-2h4z" />
                      </svg>
                      Create new world
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-end gap-3">
            <div className="relative hidden max-w-sm flex-1 sm:block">
              <input
                className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                placeholder="Search realms, notes, or inspiration..."
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] uppercase tracking-[0.24em] text-slate-400/80">
                ⌘ K
              </span>
            </div>
            <button
              type="button"
              onClick={handleManualSync}
              className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5 ${syncButtonClasses}`}
            >
              {saveStatus === 'saving' || saveStatus === 'syncing' ? (
                <span className="flex h-4 w-4 items-center justify-center">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                </span>
              ) : saveStatus === 'offline' ? (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a7 7 0 0 1 11.95-4.95M5 19h14a3 3 0 0 0 0-6h-.26" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="m3 3 18 18" />
                </svg>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m5.75 12 3.5 3.5 9-9" />
                </svg>
              )}
              <span>{syncStatusLabel}</span>
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-slate-200 transition hover:-translate-y-0.5 hover:border-rose-300/50 hover:text-rose-100"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="m16 17 5-5-5-5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12H9" />
              </svg>
              Sign out
            </button>
          </div>
        </header>

        <div className="flex flex-1 flex-col lg:flex-row">
          <aside className="hidden w-full max-w-xs flex-col justify-between border-r border-white/10 bg-slate-950/60 px-6 pb-8 pt-10 lg:flex">
            <div className="space-y-8">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 px-3 py-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-500 text-base font-semibold text-white">
                  {authUser?.photoURL ? (
                    <Image
                      src={authUser.photoURL}
                      alt={userDisplayName}
                      width={40}
                      height={40}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <span>{userInitial}</span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-100">{userDisplayName}</p>
                  <p className="text-xs text-indigo-200/70">{userEmail}</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleShowDashboard}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    view === 'dashboard'
                      ? 'bg-indigo-500/20 text-indigo-100'
                      : 'text-slate-300 hover:bg-white/5 hover:text-slate-100'
                  }`}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h10M4 17h7" />
                  </svg>
                  Dashboard
                </button>

                <button
                  type="button"
                  onClick={() => handleAddPage()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-slate-200 transition hover:border-indigo-300/60 hover:text-indigo-100"
                  aria-label="Add new page"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                    <path d="M9 3a1 1 0 0 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H3a1 1 0 1 1 0-2h6z" />
                  </svg>
                </button>
              </div>

              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Pages</p>
                {activeWorld && activeWorld.pages.length > 0 ? (
                  <PageTree
                    nodes={activeWorld.pages}
                    selectedId={selectedPageId}
                    onSelect={handleSelectPage}
                    onAddChild={handleAddPage}
                    onToggleFavorite={handleToggleFavorite}
                    onCopyLink={handleCopyPageLink}
                    onDuplicate={handleDuplicatePage}
                    onDelete={handleDeletePage}
                    onStartRename={handleStartPageRename}
                    onRenameChange={handlePageRenameChange}
                    onRenameCommit={handleCommitPageRename}
                    onRenameCancel={handleCancelPageRename}
                    editingPageId={editingPageId}
                    pageTitleDraft={pageTitleDraft}
                    actionMenuId={pageActionMenuId}
                    onOpenActionMenu={handleOpenPageMenu}
                    onCloseActionMenu={handleClosePageMenu}
                    onDragStart={handlePageDragStart}
                    onDragEnd={handlePageDragEnd}
                    onDrop={handlePageDrop}
                    draggedPageId={draggedPageId}
                    collapsedIds={collapsedPageIds}
                    onToggleCollapse={handleToggleCollapse}
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-400">
                    Start this world with a new page.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.32em] text-indigo-200/80">Insight</p>
              <p className="leading-relaxed text-slate-100">
                Export your world bible as an illuminated PDF or share a live web portal with co-creators. Your next session is synced and ready.
              </p>
            </div>
          </aside>

          <div className="flex flex-1 flex-col">
            <main className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 pb-16 pt-10 sm:px-10">
                {view === 'dashboard' ? renderDashboard() : renderPageEditor()}
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
