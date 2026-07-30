import type { CanvasNode } from './model';
import {
  insertLocalNode,
  removeSubtree,
  replaceLocalNode,
  restoreSubtree,
  type SceneDocument,
  type SceneSubtreeSnapshot,
} from './scene';

export type SceneCommand =
  | { id: string; type: 'add-node'; node: CanvasNode }
  | { id: string; type: 'add-nodes'; nodes: CanvasNode[] }
  | { id: string; type: 'delete-subtree'; snapshot: SceneSubtreeSnapshot }
  | { id: string; type: 'update-node'; before: CanvasNode; after: CanvasNode };

export type SceneHistoryState = {
  document: SceneDocument;
  undoStack: SceneCommand[];
  redoStack: SceneCommand[];
};

export type SceneHistoryAction =
  | { type: 'hydrate'; document: SceneDocument }
  | { type: 'execute'; command: SceneCommand }
  | { type: 'undo' }
  | { type: 'redo' };

const HISTORY_LIMIT = 100;

export function createSceneHistory(document: SceneDocument): SceneHistoryState {
  return { document, undoStack: [], redoStack: [] };
}

export function sceneHistoryReducer(state: SceneHistoryState, action: SceneHistoryAction): SceneHistoryState {
  if (action.type === 'hydrate') return createSceneHistory(action.document);

  if (action.type === 'execute') {
    const document = applySceneCommand(state.document, action.command);
    if (document === state.document) return state;
    return {
      document,
      undoStack: [...state.undoStack, action.command].slice(-HISTORY_LIMIT),
      redoStack: [],
    };
  }

  if (action.type === 'undo') {
    const command = state.undoStack[state.undoStack.length - 1];
    if (!command) return state;
    return {
      document: revertSceneCommand(state.document, command),
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, command],
    };
  }

  const command = state.redoStack[state.redoStack.length - 1];
  if (!command) return state;
  return {
    document: applySceneCommand(state.document, command),
    undoStack: [...state.undoStack, command].slice(-HISTORY_LIMIT),
    redoStack: state.redoStack.slice(0, -1),
  };
}

export function createCommandId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function applySceneCommand(document: SceneDocument, command: SceneCommand): SceneDocument {
  if (command.type === 'add-node') return insertLocalNode(document, command.node);
  if (command.type === 'add-nodes') return command.nodes.reduce((next, node) => insertLocalNode(next, node), document);
  if (command.type === 'delete-subtree') return removeSubtree(document, command.snapshot.rootId);
  return replaceLocalNode(document, command.after);
}

function revertSceneCommand(document: SceneDocument, command: SceneCommand): SceneDocument {
  if (command.type === 'add-node') return removeSubtree(document, command.node.id);
  if (command.type === 'add-nodes') return command.nodes.reduceRight((next, node) => removeSubtree(next, node.id), document);
  if (command.type === 'delete-subtree') return restoreSubtree(document, command.snapshot);
  return replaceLocalNode(document, command.before);
}
