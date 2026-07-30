import type { CanvasNode } from './model';

export type SceneDocument = {
  version: 1;
  revision: number;
  rootIds: string[];
  nodesById: Record<string, CanvasNode>;
  childIdsByParent: Record<string, string[]>;
};

export type SceneSubtreeSnapshot = {
  rootId: string;
  parentId?: string;
  insertionIndex: number;
  nodes: CanvasNode[];
};

export function createSceneDocument(worldNodes: CanvasNode[]): SceneDocument {
  const worldById = new Map(worldNodes.map((node) => [node.id, node]));
  const nodesById: Record<string, CanvasNode> = {};
  const rootIds: string[] = [];
  const childIdsByParent: Record<string, string[]> = {};

  for (const worldNode of worldNodes) {
    const parent = worldNode.parentId ? worldById.get(worldNode.parentId) : undefined;
    const localNode = parent
      ? { ...worldNode, x: worldNode.x - parent.x, y: worldNode.y - parent.y }
      : { ...worldNode, parentId: undefined };
    nodesById[localNode.id] = localNode as CanvasNode;
    if (localNode.parentId) {
      childIdsByParent[localNode.parentId] = [...(childIdsByParent[localNode.parentId] ?? []), localNode.id];
    } else {
      rootIds.push(localNode.id);
    }
  }

  return { version: 1, revision: 0, rootIds, nodesById, childIdsByParent };
}

export function getSceneWorldNodes(document: SceneDocument): CanvasNode[] {
  const result: CanvasNode[] = [];
  const visited = new Set<string>();

  const visit = (id: string, parentX: number, parentY: number) => {
    if (visited.has(id)) return;
    const node = document.nodesById[id];
    if (!node) return;
    visited.add(id);
    const worldNode = {
      ...node,
      x: parentX + node.x,
      y: parentY + node.y,
    } as CanvasNode;
    result.push(worldNode);
    for (const childId of document.childIdsByParent[id] ?? []) visit(childId, worldNode.x, worldNode.y);
  };

  for (const rootId of document.rootIds) visit(rootId, 0, 0);
  for (const id of Object.keys(document.nodesById)) visit(id, 0, 0);
  return result;
}

export function getWorldNode(document: SceneDocument, id: string): CanvasNode | undefined {
  const node = document.nodesById[id];
  if (!node) return undefined;
  let x = node.x;
  let y = node.y;
  let parentId = node.parentId;
  const visited = new Set<string>([id]);

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = document.nodesById[parentId];
    if (!parent) break;
    x += parent.x;
    y += parent.y;
    parentId = parent.parentId;
  }

  return { ...node, x, y } as CanvasNode;
}

export function worldNodeToLocal(document: SceneDocument, worldNode: CanvasNode): CanvasNode {
  if (!worldNode.parentId) return { ...worldNode, parentId: undefined } as CanvasNode;
  const parent = getWorldNode(document, worldNode.parentId);
  if (!parent || parent.id === worldNode.id || isDescendant(document, parent.id, worldNode.id)) {
    return { ...worldNode, parentId: undefined } as CanvasNode;
  }
  return {
    ...worldNode,
    x: worldNode.x - parent.x,
    y: worldNode.y - parent.y,
  } as CanvasNode;
}

export function insertLocalNode(document: SceneDocument, node: CanvasNode, insertionIndex?: number): SceneDocument {
  const parentId = node.parentId && document.nodesById[node.parentId] ? node.parentId : undefined;
  const normalizedNode = { ...node, parentId } as CanvasNode;
  const nodesById = { ...document.nodesById, [node.id]: normalizedNode };
  const childIdsByParent = { ...document.childIdsByParent };
  let rootIds = document.rootIds;

  if (parentId) {
    const siblings = [...(childIdsByParent[parentId] ?? [])].filter((id) => id !== node.id);
    const index = insertionIndex == null ? siblings.length : Math.max(0, Math.min(insertionIndex, siblings.length));
    siblings.splice(index, 0, node.id);
    childIdsByParent[parentId] = siblings;
    rootIds = rootIds.filter((id) => id !== node.id);
  } else {
    const roots = rootIds.filter((id) => id !== node.id);
    const index = insertionIndex == null ? roots.length : Math.max(0, Math.min(insertionIndex, roots.length));
    roots.splice(index, 0, node.id);
    rootIds = roots;
  }

  return bump(document, { nodesById, childIdsByParent, rootIds });
}

export function replaceLocalNode(document: SceneDocument, node: CanvasNode): SceneDocument {
  const previous = document.nodesById[node.id];
  if (!previous) return document;
  const previousParentId = previous.parentId;
  const nextParentId = node.parentId && document.nodesById[node.parentId] && !isDescendant(document, node.parentId, node.id)
    ? node.parentId
    : undefined;
  const normalizedNode = { ...node, parentId: nextParentId } as CanvasNode;
  let rootIds = document.rootIds;
  const childIdsByParent = { ...document.childIdsByParent };

  if (previousParentId !== nextParentId) {
    if (previousParentId) {
      childIdsByParent[previousParentId] = (childIdsByParent[previousParentId] ?? []).filter((id) => id !== node.id);
    } else {
      rootIds = rootIds.filter((id) => id !== node.id);
    }

    if (nextParentId) {
      childIdsByParent[nextParentId] = [...(childIdsByParent[nextParentId] ?? []).filter((id) => id !== node.id), node.id];
    } else {
      rootIds = [...rootIds.filter((id) => id !== node.id), node.id];
    }
  }

  return bump(document, {
    nodesById: { ...document.nodesById, [node.id]: normalizedNode },
    childIdsByParent,
    rootIds,
  });
}

export function captureSubtree(document: SceneDocument, rootId: string): SceneSubtreeSnapshot | null {
  const root = document.nodesById[rootId];
  if (!root) return null;
  const nodes: CanvasNode[] = [];
  const visit = (id: string) => {
    const node = document.nodesById[id];
    if (!node) return;
    nodes.push(node);
    for (const childId of document.childIdsByParent[id] ?? []) visit(childId);
  };
  visit(rootId);
  const siblings = root.parentId ? document.childIdsByParent[root.parentId] ?? [] : document.rootIds;
  return {
    rootId,
    parentId: root.parentId,
    insertionIndex: Math.max(0, siblings.indexOf(rootId)),
    nodes,
  };
}

export function removeSubtree(document: SceneDocument, rootId: string): SceneDocument {
  const snapshot = captureSubtree(document, rootId);
  if (!snapshot) return document;
  const removedIds = new Set(snapshot.nodes.map((node) => node.id));
  const nodesById = { ...document.nodesById };
  const childIdsByParent = { ...document.childIdsByParent };
  for (const id of removedIds) {
    delete nodesById[id];
    delete childIdsByParent[id];
  }
  for (const [parentId, childIds] of Object.entries(childIdsByParent)) {
    childIdsByParent[parentId] = childIds.filter((id) => !removedIds.has(id));
  }
  return bump(document, {
    nodesById,
    childIdsByParent,
    rootIds: document.rootIds.filter((id) => !removedIds.has(id)),
  });
}

export function restoreSubtree(document: SceneDocument, snapshot: SceneSubtreeSnapshot): SceneDocument {
  let next = document;
  snapshot.nodes.forEach((node, index) => {
    next = insertLocalNode(next, node, index === 0 ? snapshot.insertionIndex : undefined);
  });
  return next;
}

export function getAncestorIds(document: SceneDocument, id: string): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  let parentId = document.nodesById[id]?.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    result.push(parentId);
    parentId = document.nodesById[parentId]?.parentId;
  }
  return result;
}

export function areSceneNodesEqual(a: CanvasNode, b: CanvasNode) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isDescendant(document: SceneDocument, candidateId: string, ancestorId: string) {
  let parentId = document.nodesById[candidateId]?.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    if (parentId === ancestorId) return true;
    visited.add(parentId);
    parentId = document.nodesById[parentId]?.parentId;
  }
  return false;
}

function bump(document: SceneDocument, patch: Pick<SceneDocument, 'rootIds' | 'nodesById' | 'childIdsByParent'>): SceneDocument {
  return { ...document, ...patch, revision: document.revision + 1 };
}

export function serializeSceneDocument(document: SceneDocument) {
  return JSON.stringify(document);
}

export function parseSceneDocument(raw: string): SceneDocument | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.nodesById)) return null;

    const nodesById: Record<string, CanvasNode> = {};
    for (const [id, candidate] of Object.entries(value.nodesById)) {
      if (!isCanvasNode(candidate) || candidate.id !== id) continue;
      nodesById[id] = { ...candidate } as CanvasNode;
    }

    for (const node of Object.values(nodesById)) {
      if (!node.parentId || !nodesById[node.parentId] || node.parentId === node.id) {
        node.parentId = undefined;
        continue;
      }
      const visited = new Set<string>([node.id]);
      let parentId: string | undefined = node.parentId;
      while (parentId) {
        if (visited.has(parentId)) {
          node.parentId = undefined;
          break;
        }
        visited.add(parentId);
        parentId = nodesById[parentId]?.parentId;
      }
    }

    const savedRootIds = Array.isArray(value.rootIds)
      ? value.rootIds.filter((id): id is string => typeof id === 'string')
      : [];
    const rootIds = savedRootIds.filter((id, index) => (
      Boolean(nodesById[id]) && !nodesById[id].parentId && savedRootIds.indexOf(id) === index
    ));
    for (const node of Object.values(nodesById)) {
      if (!node.parentId && !rootIds.includes(node.id)) rootIds.push(node.id);
    }

    const childIdsByParent: Record<string, string[]> = {};
    const savedChildren = isRecord(value.childIdsByParent) ? value.childIdsByParent : {};
    for (const parentId of Object.keys(nodesById)) {
      const savedIds = Array.isArray(savedChildren[parentId])
        ? savedChildren[parentId].filter((id): id is string => typeof id === 'string')
        : [];
      const childIds = savedIds.filter((id, index) => (
        nodesById[id]?.parentId === parentId && savedIds.indexOf(id) === index
      ));
      for (const node of Object.values(nodesById)) {
        if (node.parentId === parentId && !childIds.includes(node.id)) childIds.push(node.id);
      }
      if (childIds.length) childIdsByParent[parentId] = childIds;
    }

    return {
      version: 1,
      revision: typeof value.revision === 'number' && Number.isFinite(value.revision) ? value.revision : 0,
      rootIds,
      nodesById,
      childIdsByParent,
    };
  } catch {
    return null;
  }
}

function isCanvasNode(value: unknown): value is CanvasNode {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return false;
  if (!isFiniteNumber(value.width) || value.width <= 0 || !isFiniteNumber(value.height) || value.height <= 0) return false;
  if (!isFiniteNumber(value.rotation) || !isFiniteNumber(value.zIndex)) return false;
  if (value.parentId != null && typeof value.parentId !== 'string') return false;

  if (value.kind === 'pegboard') {
    return isFiniteNumber(value.columns) && value.columns > 0
      && isFiniteNumber(value.rows) && value.rows > 0
      && ['warm-metal', 'light-metal', 'dark-metal'].includes(String(value.material));
  }
  if (value.kind === 'hook') return ['single', 'double', 'utility'].includes(String(value.hookType));
  if (value.kind === 'shelf' || value.kind === 'divider') return ['oak', 'white-metal', 'black-metal'].includes(String(value.material));
  if (value.kind === 'gear') return isFiniteNumber(value.gearIndex) && ['wall', 'surface'].includes(String(value.pose));
  if (value.kind === 'label') return typeof value.text === 'string';
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
