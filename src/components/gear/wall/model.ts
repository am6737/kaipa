export type CanvasPoint = { x: number; y: number };
export type CanvasSize = { width: number; height: number };

export type WallMaterial = 'warm-metal' | 'light-metal' | 'dark-metal';
export type ShelfMaterial = 'oak' | 'white-metal' | 'black-metal';

export type CanvasNodeBase = CanvasPoint & CanvasSize & {
  id: string;
  rotation: number;
  zIndex: number;
  parentId?: string;
  locked?: boolean;
  hidden?: boolean;
};

export type PegboardNode = CanvasNodeBase & {
  kind: 'pegboard';
  columns: number;
  rows: number;
  material: WallMaterial;
};

export type HookNode = CanvasNodeBase & {
  kind: 'hook';
  hookType: 'single' | 'double' | 'utility';
  holeColumn?: number;
  holeRow?: number;
};

export type ShelfNode = CanvasNodeBase & {
  kind: 'shelf';
  material: ShelfMaterial;
};

export type DividerNode = CanvasNodeBase & {
  kind: 'divider';
  material: ShelfMaterial;
};

export type GearCanvasNode = CanvasNodeBase & {
  kind: 'gear';
  gearIndex: number;
  pose: 'wall' | 'surface';
};

export type LabelNode = CanvasNodeBase & {
  kind: 'label';
  text: string;
};

export type CanvasNode = PegboardNode | HookNode | ShelfNode | DividerNode | GearCanvasNode | LabelNode;
export type CanvasNodeKind = CanvasNode['kind'];

export type CanvasCamera = {
  panX: number;
  panY: number;
  zoom: number;
};

export type GearWallScene = {
  version: 1;
  name: string;
  nodes: CanvasNode[];
  camera: CanvasCamera;
};

export type ComponentCategory = 'structure' | 'fixture' | 'gear' | 'decoration';

export type ComponentDefinition = {
  id: string;
  category: ComponentCategory;
  kind: CanvasNodeKind;
  width: number;
  height: number;
  attachTo?: CanvasNodeKind[];
  wallGrid?: { columns: number; rows: number };
};

export const COMPONENT_CATALOG: ComponentDefinition[] = [
  { id: 'wall-single', category: 'structure', kind: 'pegboard', width: 256, height: 344, wallGrid: { columns: 1, rows: 1 } },
  { id: 'wall-four', category: 'structure', kind: 'pegboard', width: 256, height: 344, wallGrid: { columns: 2, rows: 2 } },
  { id: 'wall-eight', category: 'structure', kind: 'pegboard', width: 256, height: 344, wallGrid: { columns: 4, rows: 2 } },
  { id: 'wall-twelve', category: 'structure', kind: 'pegboard', width: 256, height: 344, wallGrid: { columns: 4, rows: 3 } },
  { id: 'shelf-oak', category: 'fixture', kind: 'shelf', width: 208, height: 18, attachTo: ['pegboard'] },
  { id: 'divider-metal', category: 'fixture', kind: 'divider', width: 16, height: 344, attachTo: ['pegboard'] },
  { id: 'hook-single', category: 'fixture', kind: 'hook', width: 18, height: 34, attachTo: ['pegboard'] },
  { id: 'gear-item', category: 'gear', kind: 'gear', width: 72, height: 88, attachTo: ['pegboard', 'shelf'] },
  { id: 'label', category: 'decoration', kind: 'label', width: 120, height: 36 },
];

export const isStructuralNode = (node: CanvasNode): node is PegboardNode => node.kind === 'pegboard';
