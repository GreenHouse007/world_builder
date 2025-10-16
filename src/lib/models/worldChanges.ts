import {
  ACTIVITY_LIMIT,
  ActivityEntry,
  PageNode,
  World,
  WorldCollaborator,
} from './worldTypes';
import {
  addPageToTree,
  clonePageTree,
  insertPageAfter,
  insertPageBefore,
  removePageFromTree,
  updatePageInTree,
} from './pageTree';

export type WorldChange =
  | { type: 'createWorld'; world: World }
  | { type: 'updateWorld'; worldId: string; data: Partial<Pick<World, 'name' | 'ownerId' | 'description'>> }
  | { type: 'deleteWorld'; worldId: string }
  | { type: 'insertPage'; worldId: string; parentId: string | null; page: PageNode }
  | { type: 'updatePage'; worldId: string; pageId: string; data: Partial<Pick<PageNode, 'title' | 'content' | 'favorite'>> }
  | { type: 'removePage'; worldId: string; pageId: string }
  | { type: 'movePage'; worldId: string; pageId: string; targetId: string; position: 'before' | 'after' }
  | { type: 'appendActivity'; worldId: string; entries: ActivityEntry[] }
  | { type: 'setCollaborators'; worldId: string; collaborators: WorldCollaborator[] };

const cloneWorld = (world: World): World => ({
  ...world,
  pages: clonePageTree(world.pages ?? []),
  collaborators: (world.collaborators ?? []).map((collaborator) => ({ ...collaborator })),
  activity: (world.activity ?? []).map((entry) => ({ ...entry })),
});

const sanitizeActivityEntry = (entry: ActivityEntry): ActivityEntry => ({
  id: entry.id,
  action: entry.action,
  target: entry.target,
  context: entry.context,
  actorId: entry.actorId,
  actorName: entry.actorName,
  timestamp: entry.timestamp ?? new Date().toISOString(),
});

const withUpdatedWorld = (
  worlds: World[],
  worldId: string,
  updater: (world: World) => World,
): World[] =>
  worlds.map((world) => (world.id === worldId ? updater(world) : world));

export const applyWorldChanges = (worlds: World[], changes: WorldChange[]): World[] => {
  let next = worlds.map(cloneWorld);

  for (const change of changes) {
    switch (change.type) {
      case 'createWorld': {
        const newWorld: World = cloneWorld({
          ...change.world,
          pages: change.world.pages ?? [],
          collaborators: change.world.collaborators ?? [],
          activity: change.world.activity ?? [],
        });
        next = [...next.filter((world) => world.id !== newWorld.id), newWorld];
        break;
      }
      case 'updateWorld': {
        next = withUpdatedWorld(next, change.worldId, (world) => ({
          ...world,
          ...change.data,
        }));
        break;
      }
      case 'deleteWorld': {
        next = next.filter((world) => world.id !== change.worldId);
        break;
      }
      case 'insertPage': {
        next = withUpdatedWorld(next, change.worldId, (world) => ({
          ...world,
          pages: addPageToTree(world.pages, change.parentId, change.page),
        }));
        break;
      }
      case 'updatePage': {
        next = withUpdatedWorld(next, change.worldId, (world) => ({
          ...world,
          pages: updatePageInTree(world.pages, change.pageId, (page) => ({
            ...page,
            ...change.data,
          })),
        }));
        break;
      }
      case 'removePage': {
        next = withUpdatedWorld(next, change.worldId, (world) => ({
          ...world,
          pages: removePageFromTree(world.pages, change.pageId).nodes,
        }));
        break;
      }
      case 'movePage': {
        next = withUpdatedWorld(next, change.worldId, (world) => {
          const removal = removePageFromTree(world.pages, change.pageId);
          if (!removal.removed) {
            return world;
          }

          const page = removal.removed;
          if (change.position === 'before') {
            const insertion = insertPageBefore(removal.nodes, change.targetId, page);
            return {
              ...world,
              pages: insertion.inserted ? insertion.nodes : [...removal.nodes, page],
            };
          }

          const insertion = insertPageAfter(removal.nodes, change.targetId, page);
          return {
            ...world,
            pages: insertion.inserted ? insertion.nodes : [...removal.nodes, page],
          };
        });
        break;
      }
      case 'appendActivity': {
        next = withUpdatedWorld(next, change.worldId, (world) => {
          const entries = change.entries.map(sanitizeActivityEntry);
          const merged = [...entries, ...world.activity];
          return {
            ...world,
            activity: merged.slice(0, ACTIVITY_LIMIT),
          };
        });
        break;
      }
      case 'setCollaborators': {
        next = withUpdatedWorld(next, change.worldId, (world) => ({
          ...world,
          collaborators: change.collaborators.map((collaborator) => ({ ...collaborator })),
        }));
        break;
      }
      default:
        break;
    }
  }

  return next;
};

export const buildPageChange = (
  worldId: string,
  pageId: string,
  data: Partial<Pick<PageNode, 'title' | 'content' | 'favorite'>>,
): WorldChange => ({
  type: 'updatePage',
  worldId,
  pageId,
  data: {
    ...(typeof data.title === 'string' ? { title: data.title } : {}),
    ...(typeof data.content === 'string' ? { content: data.content } : {}),
    ...(typeof data.favorite === 'boolean' ? { favorite: data.favorite } : {}),
  },
});
