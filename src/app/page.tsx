'use client';

import Image from 'next/image';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';

import { loadFirebase } from '@/lib/firebase/client';

type PageNode = {
  id: string;
  title: string;
  content: string;
  children: PageNode[];
};

type World = {
  id: string;
  name: string;
  pages: PageNode[];
};

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

const initialWorlds: World[] = [
  {
    id: 'world-aerie',
    name: 'The Aerie Chronicles',
    pages: [
      {
        id: 'page-overview',
        title: 'World overview',
        content:
          'A windswept archipelago held aloft by luminous crystals. The fox-winged Enfield guides dreamers between islands where forgotten gods still whisper.',
        children: [
          {
            id: 'page-lore-bible',
            title: 'Lore bible',
            content:
              'Foundational myths, seasonal rituals, and the Enfield creation story. Document how the winged fox chose its heralds.',
            children: [
              {
                id: 'page-enfield-myths',
                title: 'Enfield myths',
                content: 'Legends collected from temple murals and sky-ship sailors.',
                children: [],
              },
            ],
          },
          {
            id: 'page-factions',
            title: 'Factions',
            content: 'The Skyward Choir, the Crystal Veil, and clandestine cartographers.',
            children: [
              {
                id: 'page-choir',
                title: 'Skyward Choir',
                content: 'A chorus of mystics who map the winds with song.',
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: 'page-characters',
        title: 'Characters',
        content: 'Profiles for protagonists, antagonists, and pivotal supporting casts.',
        children: [
          {
            id: 'page-protagonists',
            title: 'Protagonists',
            content: 'Heroic figures tied to the Enfield lineage.',
            children: [],
          },
        ],
      },
      {
        id: 'page-locations',
        title: 'Locations',
        content: 'Document each floating isle, climate, and cultural artifact.',
        children: [],
      },
    ],
  },
  {
    id: 'world-seabound',
    name: 'Seabound Requiem',
    pages: [
      {
        id: 'page-sea-overview',
        title: 'World overview',
        content: 'A storm-lashed oceanic realm ruled by tide-binding mages.',
        children: [],
      },
    ],
  },
];

const createPage = (title = 'Untitled page'): PageNode => ({
  id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title,
  content: '',
  children: [],
});

const markExpanded = (nodes: PageNode[], expanded: Record<string, boolean>) => {
  nodes.forEach((node) => {
    expanded[node.id] = true;
    if (node.children.length) {
      markExpanded(node.children, expanded);
    }
  });
};

const getInitialExpanded = (worlds: World[]) => {
  const expanded: Record<string, boolean> = {};
  worlds.forEach((world) => markExpanded(world.pages, expanded));
  return expanded;
};

const addPageToTree = (nodes: PageNode[], parentId: string | null, newPage: PageNode): PageNode[] => {
  if (!parentId) {
    return [...nodes, newPage];
  }

  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.id === parentId) {
      changed = true;
      return { ...node, children: [...node.children, newPage] };
    }

    const updatedChildren = addPageToTree(node.children, parentId, newPage);
    if (updatedChildren !== node.children) {
      changed = true;
      return { ...node, children: updatedChildren };
    }

    return node;
  });

  return changed ? nextNodes : nodes;
};

const updatePageInTree = (
  nodes: PageNode[],
  pageId: string,
  updater: (page: PageNode) => PageNode,
): PageNode[] => {
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.id === pageId) {
      changed = true;
      return updater(node);
    }

    const updatedChildren = updatePageInTree(node.children, pageId, updater);
    if (updatedChildren !== node.children) {
      changed = true;
      return { ...node, children: updatedChildren };
    }

    return node;
  });

  return changed ? nextNodes : nodes;
};

const findPageInTree = (nodes: PageNode[], pageId: string | null): PageNode | null => {
  if (!pageId) return null;

  for (const node of nodes) {
    if (node.id === pageId) {
      return node;
    }

    if (node.children.length) {
      const found = findPageInTree(node.children, pageId);
      if (found) return found;
    }
  }

  return null;
};

type PageTreeProps = {
  nodes: PageNode[];
  expanded: Record<string, boolean>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onAddChild: (id: string) => void;
  depth?: number;
};

function PageTree({ nodes, expanded, selectedId, onSelect, onToggle, onAddChild, depth = 0 }: PageTreeProps) {
  return (
    <ul className={depth === 0 ? 'space-y-1.5' : 'space-y-1.5 border-l border-white/5 pl-3'}>
      {nodes.map((node) => {
        const isExpanded = expanded[node.id] ?? false;
        const hasChildren = node.children.length > 0;
        const isSelected = node.id === selectedId;

        return (
          <li key={node.id}>
            <div
              className={`group flex items-center gap-1 rounded-xl border border-transparent px-2 py-1.5 text-sm transition ${
                isSelected
                  ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-100 shadow-[0_0_0_1px_rgba(129,140,248,0.25)]'
                  : 'text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-slate-100'
              }`}
            >
              <button
                type="button"
                onClick={() => (hasChildren ? onToggle(node.id) : onSelect(node.id))}
                className={`flex h-6 w-6 items-center justify-center rounded-lg border border-transparent transition ${
                  hasChildren
                    ? 'text-slate-400 hover:text-slate-100'
                    : 'text-slate-500 hover:text-slate-200'
                }`}
                aria-label={hasChildren ? (isExpanded ? 'Collapse page' : 'Expand page') : 'Open page'}
              >
                {hasChildren ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className={`h-3.5 w-3.5 transition ${isExpanded ? 'rotate-90 text-indigo-200' : 'text-slate-400'}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M5 3.5 11 8 5 12.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className="h-1 w-1 rounded-full bg-current" />
                )}
              </button>

              <button
                type="button"
                onClick={() => onSelect(node.id)}
                className="flex-1 truncate text-left"
              >
                {node.title}
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
            </div>

            {hasChildren && isExpanded ? (
              <div className="pt-1">
                <PageTree
                  nodes={node.children}
                  expanded={expanded}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onToggle={onToggle}
                  onAddChild={onAddChild}
                  depth={depth + 1}
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
  const [worlds, setWorlds] = useState<World[]>(initialWorlds);
  const [activeWorldId, setActiveWorldId] = useState<string>(initialWorlds[0]?.id ?? '');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [view, setView] = useState<'dashboard' | 'page'>('dashboard');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>(() => getInitialExpanded(initialWorlds));
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isWorldMenuOpen, setIsWorldMenuOpen] = useState(false);

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

  const userDisplayName = authUser?.displayName?.trim() || authUser?.email?.split('@')[0] || 'Writer';
  const userInitial = userDisplayName.charAt(0).toUpperCase();
  const userEmail = authUser?.email ?? '—';

  const handleSelectWorld = (worldId: string) => {
    setActiveWorldId(worldId);
    setSelectedPageId(null);
    setView('dashboard');
    setIsWorldMenuOpen(false);
  };

  const handleCreateWorld = () => {
    const count = worlds.length + 1;
    const newWorld: World = {
      id: `world-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: `New World ${count}`,
      pages: [],
    };

    setWorlds((prev) => [...prev, newWorld]);
    setActiveWorldId(newWorld.id);
    setSelectedPageId(null);
    setView('dashboard');
    setIsWorldMenuOpen(false);
  };

  const handleAddPage = (parentId?: string) => {
    if (!activeWorld) return;

    const newPage = createPage(parentId ? 'Untitled sub-page' : 'Untitled page');
    setWorlds((prev) =>
      prev.map((world) =>
        world.id === activeWorld.id
          ? { ...world, pages: addPageToTree(world.pages, parentId ?? null, newPage) }
          : world,
      ),
    );

    setExpandedNodes((prev) => ({
      ...prev,
      ...(parentId ? { [parentId]: true } : {}),
      [newPage.id]: true,
    }));

    setSelectedPageId(newPage.id);
    setView('page');
  };

  const handleUpdatePageTitle = (pageId: string, title: string) => {
    if (!activeWorld) return;

    setWorlds((prev) =>
      prev.map((world) =>
        world.id === activeWorld.id
          ? {
              ...world,
              pages: updatePageInTree(world.pages, pageId, (page) => ({ ...page, title })),
            }
          : world,
      ),
    );
  };

  const handleUpdatePageContent = (pageId: string, content: string) => {
    if (!activeWorld) return;

    setWorlds((prev) =>
      prev.map((world) =>
        world.id === activeWorld.id
          ? {
              ...world,
              pages: updatePageInTree(world.pages, pageId, (page) => ({ ...page, content })),
            }
          : world,
      ),
    );
  };

  const handleSelectPage = (pageId: string) => {
    setSelectedPageId(pageId);
    setView('page');
  };

  const handleToggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !(prev[nodeId] ?? false),
    }));
  };

  const handleShowDashboard = () => {
    setSelectedPageId(null);
    setView('dashboard');
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

  const renderPageEditor = () => (
    <div className="flex flex-col gap-8">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-8">
        <input
          className="w-full bg-transparent text-3xl font-semibold text-slate-50 outline-none placeholder:text-slate-500"
          value={selectedPage?.title ?? ''}
          onChange={(event) => selectedPage && handleUpdatePageTitle(selectedPage.id, event.target.value)}
          placeholder="Untitled page"
        />
        <p className="mt-2 text-sm text-slate-400">
          Draft lore, collect reference notes, and stitch together the threads of your universe.
        </p>
      </div>

      <div className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-slate-950/60 p-8">
        <textarea
          className="h-[420px] w-full resize-none rounded-2xl border border-white/10 bg-slate-950/80 px-5 py-4 text-sm leading-relaxed text-slate-200 outline-none transition focus:border-indigo-400/50 focus:ring-2 focus:ring-indigo-400/30"
          value={selectedPage?.content ?? ''}
          onChange={(event) => selectedPage && handleUpdatePageContent(selectedPage.id, event.target.value)}
          placeholder="Begin weaving the story of this page..."
        />
        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] uppercase tracking-[0.28em] text-slate-400">
          <span>Markdown friendly · Auto-saved locally</span>
          <button className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.28em] text-indigo-100 transition hover:border-indigo-400/50">
            Export page
          </button>
        </div>
      </div>
    </div>
  );

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
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-slate-300">{activeWorld?.name ?? 'No world selected'}</p>
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsWorldMenuOpen((prev) => !prev)}
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
                  <div className="absolute left-0 top-12 z-20 w-64 rounded-2xl border border-white/10 bg-slate-900/95 p-3 shadow-xl">
                    <p className="px-2 pb-2 text-[11px] uppercase tracking-[0.28em] text-slate-400">Worlds</p>
                    <ul className="space-y-1 text-sm">
                      {worlds.map((world) => (
                        <li key={world.id}>
                          <button
                            type="button"
                            onClick={() => handleSelectWorld(world.id)}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 transition ${
                              world.id === activeWorld?.id
                                ? 'bg-indigo-500/20 text-indigo-100'
                                : 'text-slate-300 hover:bg-white/5 hover:text-slate-100'
                            }`}
                          >
                            <span className="truncate">{world.name}</span>
                            {world.id === activeWorld?.id ? (
                              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m5.5 10 3 3 6-6" />
                              </svg>
                            ) : null}
                          </button>
                        </li>
                      ))}
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

              <button
                type="button"
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:-translate-y-0.5 hover:border-indigo-400/40 hover:text-indigo-200"
                aria-label={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  {isSidebarOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="m15 6-6 6 6 6" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
                  )}
                </svg>
              </button>
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
            <button className="inline-flex items-center gap-2 rounded-2xl border border-indigo-300/40 bg-indigo-500/20 px-4 py-2 text-sm font-medium text-indigo-100 transition hover:-translate-y-0.5 hover:bg-indigo-500/30">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="m5.75 12 3.5 3.5 9-9" />
              </svg>
              Sync now
            </button>
            <button className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-slate-200 transition hover:-translate-y-0.5 hover:border-indigo-400/40 hover:text-indigo-200">
              <span className="sr-only">Open notifications</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2" />
              </svg>
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
          <aside
            className={`${
              isSidebarOpen ? 'lg:translate-x-0 lg:opacity-100' : 'lg:-translate-x-full lg:opacity-0 lg:pointer-events-none'
            } hidden w-full max-w-xs flex-col justify-between border-r border-white/10 bg-slate-950/60 px-6 pb-8 pt-10 transition-all duration-300 ease-out lg:flex`}
          >
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
                    expanded={expandedNodes}
                    selectedId={selectedPageId}
                    onSelect={handleSelectPage}
                    onToggle={handleToggleNode}
                    onAddChild={handleAddPage}
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
