import type { PageNode } from './worldTypes';
import { generateId } from './worldTypes';

const cloneNode = (node: PageNode): PageNode => ({
  ...node,
  children: node.children.map(cloneNode),
});

const normalizePage = (page: PageNode): PageNode => ({
  id: page.id || generateId('page'),
  title: page.title ?? 'Untitled page',
  content: page.content ?? '',
  favorite: Boolean(page.favorite),
  children: (page.children ?? []).map(cloneNode),
});

export const clonePageTree = (nodes: PageNode[]): PageNode[] => nodes.map(cloneNode);

export const createPage = (title: string, options?: Partial<PageNode>): PageNode => ({
  id: options?.id ?? generateId('page'),
  title,
  content: options?.content ?? '',
  favorite: options?.favorite ?? false,
  children: options?.children ? clonePageTree(options.children) : [],
});

export const findPageInTree = (nodes: PageNode[], id: string): PageNode | null => {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }

    const child = findPageInTree(node.children, id);
    if (child) {
      return child;
    }
  }

  return null;
};

const insertIntoChildren = (
  nodes: PageNode[],
  parentId: string,
  page: PageNode,
): { nodes: PageNode[]; inserted: boolean } => {
  let inserted = false;
  const nextNodes = nodes.map((node) => {
    if (inserted) {
      return cloneNode(node);
    }

    if (node.id === parentId) {
      inserted = true;
      return {
        ...cloneNode(node),
        children: [...node.children.map(cloneNode), normalizePage(page)],
      };
    }

    const cloned = cloneNode(node);
    const result = insertIntoChildren(node.children, parentId, page);
    if (result.inserted) {
      inserted = true;
      cloned.children = result.nodes;
    }
    return cloned;
  });

  return { nodes: nextNodes, inserted };
};

export const addPageToTree = (nodes: PageNode[], parentId: string | null, page: PageNode): PageNode[] => {
  const normalized = normalizePage(page);

  if (!parentId) {
    return [...nodes.map(cloneNode), normalized];
  }

  const result = insertIntoChildren(nodes, parentId, normalized);
  if (result.inserted) {
    return result.nodes;
  }

  return [...nodes.map(cloneNode), normalized];
};

const insertRelative = (
  nodes: PageNode[],
  targetId: string,
  page: PageNode,
  position: 'before' | 'after',
): { nodes: PageNode[]; inserted: boolean } => {
  const normalized = normalizePage(page);
  let inserted = false;
  const nextNodes: PageNode[] = [];

  for (const node of nodes) {
    if (!inserted && node.id === targetId && position === 'before') {
      nextNodes.push(normalized);
      inserted = true;
    }

    const cloned = cloneNode(node);
    const result = insertRelative(node.children, targetId, page, position);
    if (result.inserted) {
      inserted = true;
      cloned.children = result.nodes;
    }

    nextNodes.push(cloned);

    if (!inserted && node.id === targetId && position === 'after') {
      nextNodes.push(normalized);
      inserted = true;
    }
  }

  return { nodes: nextNodes, inserted };
};

export const insertPageAfter = (
  nodes: PageNode[],
  targetId: string,
  page: PageNode,
): { nodes: PageNode[]; inserted: boolean } => insertRelative(nodes, targetId, page, 'after');

export const insertPageBefore = (
  nodes: PageNode[],
  targetId: string,
  page: PageNode,
): { nodes: PageNode[]; inserted: boolean } => insertRelative(nodes, targetId, page, 'before');

export const removePageFromTree = (
  nodes: PageNode[],
  pageId: string,
): { nodes: PageNode[]; removed: PageNode | null } => {
  let removed: PageNode | null = null;

  const nextNodes = nodes
    .map((node) => {
      if (node.id === pageId) {
        removed = cloneNode(node);
        return null;
      }

      const cloned = cloneNode(node);
      const result = removePageFromTree(node.children, pageId);
      if (result.removed) {
        removed = result.removed;
        cloned.children = result.nodes;
      }
      return cloned;
    })
    .filter((node): node is PageNode => node !== null);

  return { nodes: nextNodes, removed };
};

export const movePageBefore = (nodes: PageNode[], pageId: string, targetId: string): PageNode[] => {
  const removal = removePageFromTree(nodes, pageId);
  if (!removal.removed) {
    return nodes.map(cloneNode);
  }

  const insertion = insertPageBefore(removal.nodes, targetId, removal.removed);
  if (insertion.inserted) {
    return insertion.nodes;
  }

  return [...removal.nodes, normalizePage(removal.removed)];
};

export const flattenPages = (nodes: PageNode[]): PageNode[] => {
  const result: PageNode[] = [];
  const visit = (node: PageNode) => {
    result.push(node);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return result;
};

export const isDescendant = (nodes: PageNode[], parentId: string, candidateId: string): boolean => {
  for (const node of nodes) {
    if (node.id === parentId) {
      const stack = [...node.children];
      while (stack.length) {
        const current = stack.pop()!;
        if (current.id === candidateId) {
          return true;
        }
        stack.push(...current.children);
      }
      return false;
    }

    if (isDescendant(node.children, parentId, candidateId)) {
      return true;
    }
  }
  return false;
};

export const updatePageInTree = (
  nodes: PageNode[],
  pageId: string,
  updater: (page: PageNode) => PageNode,
): PageNode[] =>
  nodes.map((node) => {
    if (node.id === pageId) {
      return {
        ...updater(cloneNode(node)),
        children: node.children.map(cloneNode),
      };
    }

    return {
      ...cloneNode(node),
      children: updatePageInTree(node.children, pageId, updater),
    };
  });
