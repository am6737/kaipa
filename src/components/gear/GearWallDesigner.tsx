import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import {
  BlurMask,
  Canvas,
  Group,
  Image as SkiaImage,
  LinearGradient,
  Line,
  Picture,
  PaintStyle,
  Rect,
  RoundedRect,
  Skia,
  useImage,
  vec,
} from '@shopify/react-native-skia';
import type { SkCanvas, SkImage, SkPicture } from '@shopify/react-native-skia';
import {
  CircleDot,
  Focus,
  Layers3,
  Minus,
  Package,
  PanelsTopLeft,
  Plus,
  Rows3,
  Tag,
  Trash2,
  Undo2,
  Redo2,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Theme } from '../../theme/theme';
import { GearItem } from '../../data/gear';
import { useI18n } from '../../i18n';
import { AppIconButton, space, type } from '../../design-system';
import { Press } from '../Press';
import {
  CanvasNode,
  ComponentCategory,
  ComponentDefinition,
  COMPONENT_CATALOG,
  PegboardNode,
} from './wall/model';
import {
  createCommandId,
  createSceneHistory,
  sceneHistoryReducer,
} from './wall/commands';
import {
  areSceneNodesEqual,
  captureSubtree,
  createSceneDocument,
  getAncestorIds,
  getSceneWorldNodes,
  parseSceneDocument,
  serializeSceneDocument,
  worldNodeToLocal,
} from './wall/scene';
import type { SceneDocument } from './wall/scene';

const WORLD_WIDTH = 1800;
const WORLD_HEIGHT = 1400;
const BOARD_CELL = 22;
const BOARD_PADDING = 18;
const SNAP_DISTANCE = 18;
const FIXTURE_OUTLINE_INSET = 5;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const INITIAL_ZOOM = 0.72;
const GEAR_WALL_STORAGE_KEY = '@kaipa/gear-wall/scene-v1';

const pegboardPictureCache = new Map<string, SkPicture>();
let lightGridPicture: SkPicture | null = null;
let darkGridPicture: SkPicture | null = null;

type CanvasRuntime = {
  activeNodeId: SharedValue<string>;
  activeBaseX: SharedValue<number>;
  activeBaseY: SharedValue<number>;
  activeDragX: SharedValue<number>;
  activeDragY: SharedValue<number>;
};

const clamp = (value: number, min: number, max: number) => {
  'worklet';
  return Math.min(max, Math.max(min, value));
};

const initialNodes: CanvasNode[] = [
  { id: 'board-a', kind: 'pegboard', x: 460, y: 300, width: 256, height: 344, columns: 10, rows: 14, material: 'warm-metal', rotation: 0, zIndex: 10 },
  { id: 'board-b', kind: 'pegboard', x: 718, y: 300, width: 256, height: 344, columns: 10, rows: 14, material: 'warm-metal', rotation: 0, zIndex: 10 },
  { id: 'hook-a', kind: 'hook', x: 510, y: 370, width: 18, height: 34, parentId: 'board-a', hookType: 'single', rotation: 0, zIndex: 30 },
  { id: 'hook-b', kind: 'hook', x: 820, y: 395, width: 18, height: 34, parentId: 'board-b', hookType: 'single', rotation: 0, zIndex: 30 },
  { id: 'shelf-a', kind: 'shelf', x: 742, y: 536, width: 208, height: 18, parentId: 'board-b', material: 'oak', rotation: 0, zIndex: 25 },
  { id: 'gear-a', kind: 'gear', x: 486, y: 402, width: 92, height: 108, parentId: 'board-a', gearIndex: 0, pose: 'wall', rotation: 0, zIndex: 40 },
  { id: 'gear-b', kind: 'gear', x: 838, y: 408, width: 94, height: 108, parentId: 'board-b', gearIndex: 1, pose: 'wall', rotation: 0, zIndex: 40 },
];

const initialHistory = createSceneHistory(createSceneDocument(initialNodes));

export function GearWallDesigner({
  theme,
  items,
  onBack,
}: {
  theme: Theme;
  items: GearItem[];
  onBack: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const controlsTop = insets.top + 64;
  const libraryBottom = Math.max(insets.bottom, space.sm);
  const libraryClearance = libraryBottom + 160;
  const viewportHeight = Math.max(1, height);

  const [history, dispatchHistory] = useReducer(sceneHistoryReducer, initialHistory);
  const { document } = history;
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);
  const documentRef = useRef(document);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  documentRef.current = document;
  const nodes = useMemo(() => getSceneWorldNodes(document), [document]);
  const [category, setCategory] = useState<ComponentCategory>('structure');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const metalTexture = useImage(require('../../../assets/gear-wall/pegboard-metal.png'));
  const woodTexture = useImage(require('../../../assets/gear-wall/workbench-oak.png'));
  const pendingCommitIdRef = useRef<string | null>(null);

  const zoom = useSharedValue(INITIAL_ZOOM);
  const panX = useSharedValue(0);
  const panY = useSharedValue(40);
  const gestureStartPanX = useSharedValue(0);
  const gestureStartPanY = useSharedValue(40);
  const pinchStartZoom = useSharedValue(INITIAL_ZOOM);
  const pinchStartPanX = useSharedValue(0);
  const pinchStartPanY = useSharedValue(40);
  const pinchWorldX = useSharedValue(WORLD_WIDTH / 2);
  const pinchWorldY = useSharedValue(WORLD_HEIGHT / 2);

  const activeNodeId = useSharedValue('');
  const activeBaseX = useSharedValue(0);
  const activeBaseY = useSharedValue(0);
  const activeDragX = useSharedValue(0);
  const activeDragY = useSharedValue(0);
  const runtime = useMemo<CanvasRuntime>(() => ({
    activeNodeId,
    activeBaseX,
    activeBaseY,
    activeDragX,
    activeDragY,
  }), [activeBaseX, activeBaseY, activeDragX, activeDragY, activeNodeId]);

  const orderedNodes = useMemo(
    () => nodes.filter((node) => !node.hidden).slice().sort((a, b) => a.zIndex - b.zIndex),
    [nodes],
  );
  const hitTestNodes = useMemo(() => orderedNodes.slice().reverse(), [orderedNodes]);
  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedId), [nodes, selectedId]);
  const selectedPegboard = selectedNode?.kind === 'pegboard' ? selectedNode : undefined;
  const pegboardScenePicture = useMemo(() => createPegboardScenePicture(
    orderedNodes.filter((node): node is PegboardNode => node.kind === 'pegboard' && node.id !== selectedPegboard?.id),
    metalTexture,
  ), [metalTexture, orderedNodes, selectedPegboard?.id]);
  const ancestorIdsByNode = useMemo(() => new Map(nodes.map((node) => [node.id, getAncestorIds(document, node.id)])), [document, nodes]);

  const cameraTransform = useDerivedValue(() => [
    { translateX: width / 2 + panX.value },
    { translateY: viewportHeight / 2 + panY.value },
    { scale: zoom.value },
    { translateX: -WORLD_WIDTH / 2 },
    { translateY: -WORLD_HEIGHT / 2 },
  ]);

  const clearActiveRuntime = useCallback(() => {
    activeNodeId.value = '';
    activeDragX.value = 0;
    activeDragY.value = 0;
  }, [activeDragX, activeDragY, activeNodeId]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(GEAR_WALL_STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const savedDocument = parseSceneDocument(raw);
        if (savedDocument) dispatchHistory({ type: 'hydrate', document: normalizeFixtureDimensions(savedDocument) });
      })
      .catch(() => {})
      .finally(() => {
        if (!active) return;
        hydratedRef.current = true;
        setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const persistDocument = useCallback((nextDocument: typeof document) => {
    const serialized = serializeSceneDocument(nextDocument);
    const nextSave = saveQueueRef.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(GEAR_WALL_STORAGE_KEY, serialized));
    saveQueueRef.current = nextSave;
    return nextSave;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void persistDocument(document);
  }, [document, hydrated, persistDocument]);

  useEffect(() => () => {
    if (hydratedRef.current) void persistDocument(documentRef.current);
  }, [persistDocument]);

  const exitDesigner = useCallback(() => {
    if (!hydrated) {
      onBack();
      return;
    }
    void persistDocument(document).catch(() => {}).finally(onBack);
  }, [document, hydrated, onBack, persistDocument]);

  useLayoutEffect(() => {
    if (!pendingCommitIdRef.current) return;
    pendingCommitIdRef.current = null;
    clearActiveRuntime();
  }, [clearActiveRuntime, nodes]);

  useLayoutEffect(() => {
    if (selectedId && !document.nodesById[selectedId]) setSelectedId(null);
  }, [document, selectedId]);

  const commitDraggedNode = useCallback((id: string, x: number, y: number) => {
    const moving = nodes.find((node) => node.id === id);
    const before = document.nodesById[id];
    if (!moving || !before || moving.locked) {
      clearActiveRuntime();
      return;
    }
    const moved = { ...moving, x, y } as CanvasNode;
    const snapped = snapNode(moved, nodes.filter((node) => node.id !== id));
    const after = worldNodeToLocal(document, snapped);
    if (areSceneNodesEqual(before, after)) {
      clearActiveRuntime();
      return;
    }
    pendingCommitIdRef.current = id;
    dispatchHistory({
      type: 'execute',
      command: { id: createCommandId('move'), type: 'update-node', before, after },
    });
  }, [clearActiveRuntime, document, nodes]);

  const selectNode = useCallback((id: string | null) => setSelectedId(id), []);

  const panGesture = useMemo(() => Gesture.Pan()
    .maxPointers(1)
    .minDistance(3)
    .onBegin((event) => {
      gestureStartPanX.value = panX.value;
      gestureStartPanY.value = panY.value;

      const startX = event.x - event.translationX;
      const startY = event.y - event.translationY;
      const worldX = WORLD_WIDTH / 2 + (startX - width / 2 - panX.value) / zoom.value;
      const worldY = WORLD_HEIGHT / 2 + (startY - viewportHeight / 2 - panY.value) / zoom.value;
      const hit = hitTestCanvasNode(hitTestNodes, worldX, worldY);
      if (!hit || hit.locked) {
        activeNodeId.value = '';
        activeDragX.value = 0;
        activeDragY.value = 0;
        runOnJS(selectNode)(hit?.id ?? null);
        return;
      }
      activeNodeId.value = hit.id;
      activeBaseX.value = hit.x;
      activeBaseY.value = hit.y;
      activeDragX.value = 0;
      activeDragY.value = 0;
      runOnJS(selectNode)(hit.id);
    })
    .onUpdate((event) => {
      if (activeNodeId.value) {
        activeDragX.value = event.translationX / zoom.value;
        activeDragY.value = event.translationY / zoom.value;
        return;
      }
      panX.value = gestureStartPanX.value + event.translationX;
      panY.value = gestureStartPanY.value + event.translationY;
    })
    .onEnd(() => {
      if (!activeNodeId.value) return;
      const id = activeNodeId.value;
      const x = activeBaseX.value + activeDragX.value;
      const y = activeBaseY.value + activeDragY.value;
      runOnJS(commitDraggedNode)(id, x, y);
    }), [
      activeBaseX,
      activeBaseY,
      activeDragX,
      activeDragY,
      activeNodeId,
      commitDraggedNode,
      gestureStartPanX,
      gestureStartPanY,
      hitTestNodes,
      panX,
      panY,
      selectNode,
      viewportHeight,
      width,
      zoom,
    ]);

  const tapGesture = useMemo(() => Gesture.Tap()
    .maxDuration(220)
    .onEnd((event) => {
      activeNodeId.value = '';
      activeDragX.value = 0;
      activeDragY.value = 0;
      const worldX = WORLD_WIDTH / 2 + (event.x - width / 2 - panX.value) / zoom.value;
      const worldY = WORLD_HEIGHT / 2 + (event.y - viewportHeight / 2 - panY.value) / zoom.value;
      const hit = hitTestCanvasNode(hitTestNodes, worldX, worldY);
      runOnJS(selectNode)(hit?.id ?? null);
    }), [activeDragX, activeDragY, activeNodeId, hitTestNodes, panX, panY, selectNode, viewportHeight, width, zoom]);

  const pinchGesture = useMemo(() => Gesture.Pinch()
    .onBegin((event) => {
      activeNodeId.value = '';
      activeDragX.value = 0;
      activeDragY.value = 0;
      pinchStartZoom.value = zoom.value;
      pinchStartPanX.value = panX.value;
      pinchStartPanY.value = panY.value;
      pinchWorldX.value = WORLD_WIDTH / 2 + (event.focalX - width / 2 - panX.value) / zoom.value;
      pinchWorldY.value = WORLD_HEIGHT / 2 + (event.focalY - viewportHeight / 2 - panY.value) / zoom.value;
    })
    .onUpdate((event) => {
      const nextZoom = clamp(pinchStartZoom.value * event.scale, MIN_ZOOM, MAX_ZOOM);
      zoom.value = nextZoom;
      panX.value = event.focalX - width / 2 - (pinchWorldX.value - WORLD_WIDTH / 2) * nextZoom;
      panY.value = event.focalY - viewportHeight / 2 - (pinchWorldY.value - WORLD_HEIGHT / 2) * nextZoom;
    }), [
      activeDragX,
      activeDragY,
      activeNodeId,
      panX,
      panY,
      pinchStartPanX,
      pinchStartPanY,
      pinchStartZoom,
      pinchWorldX,
      pinchWorldY,
      viewportHeight,
      width,
      zoom,
    ]);

  const canvasGesture = useMemo(
    () => Gesture.Simultaneous(pinchGesture, Gesture.Exclusive(panGesture, tapGesture)),
    [panGesture, pinchGesture, tapGesture],
  );

  const fitScene = useCallback(() => {
    const visible = nodes.filter((node) => !node.hidden);
    if (!visible.length) return;
    const minX = Math.min(...visible.map((node) => node.x));
    const minY = Math.min(...visible.map((node) => node.y));
    const maxX = Math.max(...visible.map((node) => node.x + node.width));
    const maxY = Math.max(...visible.map((node) => node.y + node.height));
    const contentWidth = maxX - minX + 120;
    const contentHeight = maxY - minY + 120;
    const nextZoom = clamp(Math.min((width - 28) / contentWidth, (viewportHeight - 20) / contentHeight), MIN_ZOOM, 1.25);
    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;
    zoom.value = withTiming(nextZoom, { duration: 220 });
    panX.value = withTiming(-(contentCenterX - WORLD_WIDTH / 2) * nextZoom, { duration: 220 });
    panY.value = withTiming(-(contentCenterY - WORLD_HEIGHT / 2) * nextZoom, { duration: 220 });
  }, [nodes, panX, panY, viewportHeight, width, zoom]);

  const changeZoom = useCallback((factor: number) => {
    zoom.value = withTiming(clamp(zoom.value * factor, MIN_ZOOM, MAX_ZOOM), { duration: 160 });
  }, [zoom]);

  const revealNode = useCallback((node: CanvasNode) => {
    const currentZoom = zoom.value;
    const viewportLeft = WORLD_WIDTH / 2 + (-width / 2 - panX.value) / currentZoom;
    const viewportRight = WORLD_WIDTH / 2 + (width / 2 - panX.value) / currentZoom;
    const viewportTopEdge = WORLD_HEIGHT / 2 + (-viewportHeight / 2 - panY.value) / currentZoom;
    const viewportBottomEdge = WORLD_HEIGHT / 2 + (viewportHeight / 2 - panY.value) / currentZoom;
    const margin = 36 / currentZoom;
    const fullyVisible = node.x >= viewportLeft + margin
      && node.x + node.width <= viewportRight - margin
      && node.y >= viewportTopEdge + margin
      && node.y + node.height <= viewportBottomEdge - margin;
    if (fullyVisible) return;

    const fitZoom = Math.min(
      currentZoom,
      (width - 72) / Math.max(node.width, 1),
      (viewportHeight - 56) / Math.max(node.height, 1),
    );
    const nextZoom = clamp(fitZoom, MIN_ZOOM, MAX_ZOOM);
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;
    zoom.value = withTiming(nextZoom, { duration: 220 });
    panX.value = withTiming(-(centerX - WORLD_WIDTH / 2) * nextZoom, { duration: 220 });
    panY.value = withTiming(-(centerY - WORLD_HEIGHT / 2) * nextZoom, { duration: 220 });
  }, [panX, panY, viewportHeight, width, zoom]);

  const addComponent = (definition: ComponentDefinition) => {
    const centerX = WORLD_WIDTH / 2 - panX.value / zoom.value;
    const centerY = WORLD_HEIGHT / 2 - panY.value / zoom.value;

    if (definition.kind === 'pegboard') {
      const grid = definition.wallGrid ?? { columns: 1, rows: 1 };
      const wallWidth = grid.columns * definition.width + (grid.columns - 1) * 2;
      const wallHeight = grid.rows * definition.height + (grid.rows - 1) * 2;
      const defaultPosition = {
        x: centerX - wallWidth / 2,
        y: centerY - wallHeight / 2,
      };
      const position = findPegboardExpansionPosition(nodes, wallWidth, wallHeight, defaultPosition);
      const commandId = createCommandId('add-wall');
      const wallNodes: CanvasNode[] = [];

      for (let row = 0; row < grid.rows; row += 1) {
        for (let column = 0; column < grid.columns; column += 1) {
          wallNodes.push({
            id: `${commandId}-${row}-${column}`,
            kind: 'pegboard',
            x: position.x + column * (definition.width + 2),
            y: position.y + row * (definition.height + 2),
            width: definition.width,
            height: definition.height,
            columns: Math.max(6, Math.round((definition.width - BOARD_PADDING * 2) / BOARD_CELL)),
            rows: 14,
            material: 'warm-metal',
            rotation: 0,
            zIndex: 10,
          });
        }
      }

      dispatchHistory({
        type: 'execute',
        command: { id: commandId, type: 'add-nodes', nodes: wallNodes },
      });
      setSelectedId(wallNodes[0]?.id ?? null);
      revealNode({
        ...wallNodes[0],
        width: wallWidth,
        height: wallHeight,
      } as CanvasNode);
      return;
    }

    const defaultPosition = {
      x: centerX - definition.width / 2,
      y: centerY - definition.height / 2,
    };
    const base = {
      id: `${definition.kind}-${Date.now()}`,
      x: defaultPosition.x,
      y: defaultPosition.y,
      width: definition.width,
      height: definition.height,
      rotation: 0,
      zIndex: 20,
    };
    let node: CanvasNode;
    if (definition.kind === 'shelf') {
      node = { ...base, kind: 'shelf', material: 'oak', zIndex: 25 };
    } else if (definition.kind === 'divider') {
      node = { ...base, kind: 'divider', material: 'white-metal', zIndex: 24 };
    } else if (definition.kind === 'hook') {
      node = { ...base, kind: 'hook', hookType: 'single', zIndex: 30 };
    } else if (definition.kind === 'gear') {
      const gearCount = nodes.filter((candidate) => candidate.kind === 'gear').length;
      node = { ...base, kind: 'gear', gearIndex: gearCount % Math.max(items.length, 4), pose: 'wall', zIndex: 40 };
    } else {
      node = { ...base, kind: 'label', text: t('gear.wall.defaultLabel'), zIndex: 50 };
    }
    const snapped = snapNode(node, nodes);
    const localNode = worldNodeToLocal(document, snapped);
    dispatchHistory({
      type: 'execute',
      command: { id: createCommandId('add'), type: 'add-node', node: localNode },
    });
    setSelectedId(localNode.id);
    revealNode(snapped);
  };

  const deleteNode = (id: string) => {
    if (activeNodeId.value === id) clearActiveRuntime();
    const snapshot = captureSubtree(document, id);
    if (!snapshot) return;
    dispatchHistory({
      type: 'execute',
      command: { id: createCommandId('delete'), type: 'delete-subtree', snapshot },
    });
    setSelectedId((current) => current === id ? null : current);
  };

  const undo = useCallback(() => {
    clearActiveRuntime();
    dispatchHistory({ type: 'undo' });
  }, [clearActiveRuntime]);

  const redo = useCallback(() => {
    clearActiveRuntime();
    dispatchHistory({ type: 'redo' });
  }, [clearActiveRuntime]);

  const visibleCatalog = COMPONENT_CATALOG.filter((component) => component.category === category);

  if (!hydrated) {
    return (
      <View style={[styles.page, styles.loadingPage, { backgroundColor: theme.featureSurface }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: theme.featureSurface }]}>
      <View style={[styles.header, { paddingTop: insets.top + space.xs }]} pointerEvents="box-none">
        <AppIconButton theme={theme} name="chevronL" onPress={exitDesigner} />
        <View style={styles.titleBlock} pointerEvents="none">
          <Text style={[type.navTitle, { color: theme.text }]}>{t('gear.wall.designerTitle')}</Text>
          <Text style={[styles.subtitle, { color: theme.text2 }]}>{t('gear.wall.nodeCount', { count: nodes.length })}</Text>
        </View>
        <View style={styles.headerActionSpacer} />
      </View>

      <View style={styles.viewport}>
        <GestureDetector gesture={canvasGesture}>
          <View style={StyleSheet.absoluteFill}>
            <Canvas key={`gear-wall-canvas-${document.revision}`} style={StyleSheet.absoluteFill}>
              <Group transform={cameraTransform}>
                <WorldBackground dark={theme.dark} color={theme.featureSurface} />
                <Group key={`scene-${document.revision}`}>
                  <Picture picture={pegboardScenePicture} />
                  <SelectedPegboardSlot node={selectedPegboard} runtime={runtime} texture={metalTexture} outline={theme.accent} />
                  {orderedNodes.filter((node) => node.kind !== 'pegboard' && node.id !== selectedId).map((node) => (
                    <SkiaNode
                      key={node.id}
                      node={node}
                      selected={false}
                      runtime={runtime}
                      dragAncestorIds={ancestorIdsByNode.get(node.id) ?? []}
                      item={node.kind === 'gear' && items.length ? items[node.gearIndex % items.length] : undefined}
                      metalTexture={metalTexture}
                      woodTexture={woodTexture}
                      theme={theme}
                    />
                  ))}
                  {selectedNode && selectedNode.kind !== 'pegboard' ? (
                    <SkiaNode
                      key={`selected-${selectedNode.id}-${document.revision}`}
                      node={selectedNode}
                      selected
                      runtime={runtime}
                      dragAncestorIds={ancestorIdsByNode.get(selectedNode.id) ?? []}
                      item={selectedNode.kind === 'gear' && items.length ? items[selectedNode.gearIndex % items.length] : undefined}
                      metalTexture={metalTexture}
                      woodTexture={woodTexture}
                      theme={theme}
                    />
                  ) : null}
                  {orderedNodes.map((node) => (
                    <ActiveDragOutline
                      key={`drag-outline-${node.id}`}
                      node={node}
                      runtime={runtime}
                      outline={theme.accent}
                    />
                  ))}
                </Group>
              </Group>
            </Canvas>
          </View>
        </GestureDetector>
      </View>

      <View style={[styles.toolRail, { top: controlsTop + 10, backgroundColor: theme.surfaceTop, borderColor: theme.border }]}>
        <RailButton theme={theme} icon={Undo2} label={t('gear.wall.undo')} disabled={!history.undoStack.length} onPress={undo} />
        <RailButton theme={theme} icon={Redo2} label={t('gear.wall.redo')} disabled={!history.redoStack.length} onPress={redo} />
        <View style={[styles.railDivider, { backgroundColor: theme.border }]} />
        <RailButton theme={theme} icon={Plus} label={t('gear.wall.zoomIn')} onPress={() => changeZoom(1.2)} />
        <RailButton theme={theme} icon={Minus} label={t('gear.wall.zoomOut')} onPress={() => changeZoom(1 / 1.2)} />
        <RailButton theme={theme} icon={Focus} label={t('gear.wall.fit')} onPress={fitScene} />
      </View>

      {selectedNode ? (
        <View style={[styles.selectionBar, { bottom: libraryClearance + 8, backgroundColor: theme.surfaceTop, borderColor: theme.border }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '800', color: theme.text }}>{nodeLabel(selectedNode, t)}</Text>
            <Text style={{ marginTop: 2, fontSize: 10.5, color: theme.text2 }}>{Math.round(selectedNode.x)}, {Math.round(selectedNode.y)}</Text>
          </View>
          <Press
            onPress={() => deleteNode(selectedNode.id)}
            accessibilityRole="button"
            accessibilityLabel={t('common.delete')}
            style={[styles.deleteButton, { backgroundColor: theme.dangerSoft }]}
          >
            <Trash2 color={theme.danger} size={17} strokeWidth={1.9} />
            <Text style={{ fontSize: 12, fontWeight: '800', color: theme.danger }}>{t('common.delete')}</Text>
          </Press>
        </View>
      ) : null}

      <View style={[styles.library, { bottom: libraryBottom, backgroundColor: theme.surfaceTop, borderColor: theme.border }]}>
        <View style={styles.libraryHeader}>
          <Text style={[type.cardTitle, { color: theme.text }]}>{t('gear.wall.componentLibrary')}</Text>
          <Text style={[styles.libraryHint, { color: theme.text2 }]}>{t('gear.wall.componentHint')}</Text>
        </View>
        <View style={styles.categoryRow}>
          <CategoryButton theme={theme} icon={PanelsTopLeft} label={t('gear.wall.categoryStructure')} active={category === 'structure'} onPress={() => setCategory('structure')} />
          <CategoryButton theme={theme} icon={Rows3} label={t('gear.wall.categoryFixture')} active={category === 'fixture'} onPress={() => setCategory('fixture')} />
          <CategoryButton theme={theme} icon={Package} label={t('gear.wall.categoryGear')} active={category === 'gear'} onPress={() => setCategory('gear')} />
          <CategoryButton theme={theme} icon={Tag} label={t('gear.wall.categoryDecoration')} active={category === 'decoration'} onPress={() => setCategory('decoration')} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.componentRow}>
          {visibleCatalog.map((component) => (
            <ComponentButton key={component.id} theme={theme} component={component} label={componentLabel(component.id, t)} onPress={() => addComponent(component)} />
          ))}
        </ScrollView>
      </View>

    </View>
  );
}

function WorldBackground({ dark, color }: { dark: boolean; color: string }) {
  const gridPicture = useMemo(() => getWorldGridPicture(dark), [dark]);
  return (
    <Group>
      <Rect x={0} y={0} width={WORLD_WIDTH} height={WORLD_HEIGHT} color={color} />
      <Picture picture={gridPicture} />
    </Group>
  );
}

function SelectedPegboardSlot({ node, runtime, texture, outline }: { node?: PegboardNode; runtime: CanvasRuntime; texture: SkImage | null; outline: string }) {
  const picture = useMemo(() => createPegboardPicture(node, texture, true), [node, texture]);
  const dragTransform = useDerivedValue(() => {
    const dragged = Boolean(node) && runtime.activeNodeId.value === node?.id;
    return [
      { translateX: dragged ? runtime.activeDragX.value : 0 },
      { translateY: dragged ? runtime.activeDragY.value : 0 },
    ];
  });
  return (
    <Group transform={[{ translateX: node?.x ?? 0 }, { translateY: node?.y ?? 0 }]}>
      <Group transform={dragTransform}>
        <Picture picture={picture} />
        {node ? <RoundedRect x={-5} y={-5} width={node.width + 10} height={node.height + 10} r={7} style="stroke" strokeWidth={2} color={outline} /> : null}
      </Group>
    </Group>
  );
}

function SkiaNode({
  node,
  selected,
  runtime,
  dragAncestorIds,
  item,
  metalTexture,
  woodTexture,
  theme,
}: {
  node: CanvasNode;
  selected: boolean;
  runtime: CanvasRuntime;
  dragAncestorIds: string[];
  item?: GearItem;
  metalTexture: SkImage | null;
  woodTexture: SkImage | null;
  theme: Theme;
}) {
  const dragTransform = useDerivedValue(() => {
    const dragged = runtime.activeNodeId.value === node.id
      || dragAncestorIds.includes(runtime.activeNodeId.value);
    return [
      { translateX: dragged ? runtime.activeDragX.value : 0 },
      { translateY: dragged ? runtime.activeDragY.value : 0 },
    ];
  });

  return (
    <Group transform={[{ translateX: node.x }, { translateY: node.y }]}>
      <Group transform={dragTransform}>
        <Group origin={vec(node.width / 2, node.height / 2)} transform={node.rotation ? [{ rotate: node.rotation * Math.PI / 180 }] : undefined}>
          <NodeContent node={node} selected={selected} item={item} metalTexture={metalTexture} woodTexture={woodTexture} theme={theme} />
        </Group>
      </Group>
    </Group>
  );
}

function ActiveDragOutline({ node, runtime, outline }: { node: CanvasNode; runtime: CanvasRuntime; outline: string }) {
  const visibility = useDerivedValue(() => runtime.activeNodeId.value === node.id ? 1 : 0);
  const dragTransform = useDerivedValue(() => [
    { translateX: runtime.activeNodeId.value === node.id ? runtime.activeDragX.value : 0 },
    { translateY: runtime.activeNodeId.value === node.id ? runtime.activeDragY.value : 0 },
  ]);
  const radius = node.kind === 'gear' ? 24 : node.kind === 'label' ? 14 : 7;

  return (
    <Group transform={[{ translateX: node.x }, { translateY: node.y }]} opacity={visibility}>
      <Group transform={dragTransform}>
        <Group origin={vec(node.width / 2, node.height / 2)} transform={node.rotation ? [{ rotate: node.rotation * Math.PI / 180 }] : undefined}>
          <RoundedRect
            x={-FIXTURE_OUTLINE_INSET}
            y={-FIXTURE_OUTLINE_INSET}
            width={node.width + FIXTURE_OUTLINE_INSET * 2}
            height={node.height + FIXTURE_OUTLINE_INSET * 2}
            r={radius}
            style="stroke"
            strokeWidth={4}
            color="rgba(255,255,255,0.88)"
          />
          <RoundedRect
            x={-FIXTURE_OUTLINE_INSET}
            y={-FIXTURE_OUTLINE_INSET}
            width={node.width + FIXTURE_OUTLINE_INSET * 2}
            height={node.height + FIXTURE_OUTLINE_INSET * 2}
            r={radius}
            style="stroke"
            strokeWidth={2}
            color={outline}
          />
        </Group>
      </Group>
    </Group>
  );
}

function NodeContent({ node, selected, item, metalTexture, woodTexture, theme }: { node: CanvasNode; selected: boolean; item?: GearItem; metalTexture: SkImage | null; woodTexture: SkImage | null; theme: Theme }) {
  const outline = selected ? theme.accent : 'rgba(53,48,43,0.24)';

  if (node.kind === 'pegboard') {
    return <PegboardContent node={node} selected={selected} outline={outline} texture={metalTexture} />;
  }
  if (node.kind === 'shelf') {
    return (
      <Group>
        <RoundedRect x={6} y={8} width={node.width} height={node.height} r={3} color="rgba(40,42,44,0.22)"><BlurMask blur={10} style="normal" /></RoundedRect>
        <RoundedRect x={0} y={0} width={node.width} height={node.height} r={3} color="#A98562" />
        <SkiaImage image={woodTexture} x={0} y={0} width={node.width} height={node.height} fit="cover" opacity={0.9} />
        <RoundedRect x={0.5} y={0.5} width={node.width - 1} height={node.height - 1} r={3} style="stroke" strokeWidth={selected ? 2 : 1} color={outline} />
      </Group>
    );
  }
  if (node.kind === 'divider') {
    return (
      <Group>
        <RoundedRect x={3} y={5} width={node.width} height={node.height} r={3} color="rgba(40,42,44,0.20)"><BlurMask blur={8} style="normal" /></RoundedRect>
        <RoundedRect x={0} y={0} width={node.width} height={node.height} r={3} color="#D4D0C9" />
        <RoundedRect x={0.5} y={0.5} width={node.width - 1} height={node.height - 1} r={3} style="stroke" strokeWidth={selected ? 2 : 1} color={outline} />
      </Group>
    );
  }
  if (node.kind === 'hook') {
    return (
      <Group>
        <RoundedRect x={node.width / 2 - 3} y={0} width={6} height={node.height * 0.72} r={3} color="#4B4946" />
        <Line p1={vec(node.width / 2, node.height * 0.65)} p2={vec(node.width - 1, node.height - 2)} color="#4B4946" strokeWidth={5} strokeCap="round" />
        {selected ? <RoundedRect x={-4} y={-4} width={node.width + 8} height={node.height + 8} r={5} style="stroke" strokeWidth={2} color={outline} /> : null}
      </Group>
    );
  }
  if (node.kind === 'gear') {
    return <GearContent node={node} selected={selected} outline={outline} photo={item?.photos?.[0]} />;
  }
  return (
    <Group>
      <RoundedRect x={4} y={6} width={node.width} height={node.height} r={10} color="rgba(30,32,34,0.16)"><BlurMask blur={9} style="normal" /></RoundedRect>
      <RoundedRect x={0} y={0} width={node.width} height={node.height} r={10} color={theme.surfaceTop} />
      <Rect x={14} y={node.height / 2 - 1.5} width={node.width - 28} height={3} color={theme.text2} opacity={0.42} />
      <RoundedRect x={0.5} y={0.5} width={node.width - 1} height={node.height - 1} r={10} style="stroke" strokeWidth={selected ? 2 : 1} color={outline} />
    </Group>
  );
}

function PegboardContent({ node, selected, outline, texture }: { node: PegboardNode; selected: boolean; outline: string; texture: SkImage | null }) {
  const holesPicture = useMemo(() => getPegboardPicture(node), [node.columns, node.height, node.rows, node.width]);
  return (
    <Group>
      <RoundedRect x={12} y={14} width={node.width} height={node.height} r={5} color="rgba(46,48,50,0.20)"><BlurMask blur={22} style="normal" /></RoundedRect>
      <RoundedRect x={0} y={0} width={node.width} height={node.height} r={4} color="#B8B0A5" />
      <SkiaImage image={texture} x={0} y={0} width={node.width} height={node.height} fit="cover" opacity={0.84} />
      <Rect x={0} y={0} width={node.width} height={node.height}>
        <LinearGradient start={vec(0, 0)} end={vec(node.width, node.height)} colors={['rgba(255,255,255,0.18)', 'rgba(60,54,48,0.12)']} />
      </Rect>
      <Picture picture={holesPicture} />
      <RoundedRect x={0.5} y={0.5} width={node.width - 1} height={node.height - 1} r={4} style="stroke" strokeWidth={selected ? 2.5 : 1} color={outline} />
      {selected ? <RoundedRect x={-5} y={-5} width={node.width + 10} height={node.height + 10} r={7} style="stroke" strokeWidth={2} color={outline} /> : null}
    </Group>
  );
}

function GearContent({ node, selected, outline, photo }: { node: Extract<CanvasNode, { kind: 'gear' }>; selected: boolean; outline: string; photo?: string }) {
  const image = useImage(photo ?? null);
  return (
    <Group>
      <RoundedRect x={8} y={10} width={node.width} height={node.height} r={20} color="rgba(40,43,45,0.22)"><BlurMask blur={13} style="normal" /></RoundedRect>
      <RoundedRect x={0} y={0} width={node.width} height={node.height} r={20} color="#424A4A" />
      {image ? <SkiaImage image={image} x={0} y={0} width={node.width} height={node.height} fit="cover" /> : (
        <Group>
          <RoundedRect x={node.width * 0.25} y={node.height * 0.2} width={node.width * 0.5} height={node.height * 0.6} r={12} color="#697170" />
          <Rect x={node.width * 0.4} y={node.height * 0.12} width={node.width * 0.2} height={node.height * 0.16} color="#858D8C" />
        </Group>
      )}
      <RoundedRect x={0.5} y={0.5} width={node.width - 1} height={node.height - 1} r={20} style="stroke" strokeWidth={selected ? 2 : 1} color={selected ? outline : 'rgba(255,255,255,0.12)'} />
    </Group>
  );
}

function createPegboardScenePicture(boards: PegboardNode[], texture: SkImage | null) {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT));
  for (const board of boards) {
    canvas.save();
    canvas.translate(board.x, board.y);
    drawPegboard(canvas, board, texture, false);
    canvas.restore();
  }
  return recorder.finishRecordingAsPicture();
}

function createPegboardPicture(node: PegboardNode | undefined, texture: SkImage | null, selected: boolean) {
  const width = node?.width ?? 1;
  const height = node?.height ?? 1;
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(-8, -8, width + 24, height + 26));
  if (node) drawPegboard(canvas, node, texture, selected);
  return recorder.finishRecordingAsPicture();
}

function drawPegboard(canvas: SkCanvas, node: PegboardNode, texture: SkImage | null, selected: boolean) {
  const basePaint = Skia.Paint();
  basePaint.setColor(Skia.Color('#B8B0A5'));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, node.width, node.height), 4, 4), basePaint);

  if (texture) {
    const texturePaint = Skia.Paint();
    texturePaint.setAlphaf(0.84);
    canvas.drawImageRect(
      texture,
      Skia.XYWHRect(0, 0, texture.width(), texture.height()),
      Skia.XYWHRect(0, 0, node.width, node.height),
      texturePaint,
      false,
    );
  }

  const highlightPaint = Skia.Paint();
  highlightPaint.setColor(Skia.Color('rgba(255,255,255,0.31)'));
  const holePaint = Skia.Paint();
  holePaint.setColor(Skia.Color('#2D2A27'));
  for (let row = 0; row < node.rows; row += 1) {
    for (let column = 0; column < node.columns; column += 1) {
      const cx = BOARD_PADDING + column * BOARD_CELL + BOARD_CELL / 2;
      const cy = BOARD_PADDING + row * BOARD_CELL + BOARD_CELL / 2;
      if (cx > node.width - 8 || cy > node.height - 8) continue;
      canvas.drawCircle(cx + 0.8, cy + 1.1, 3.1, highlightPaint);
      canvas.drawCircle(cx, cy, 2.35, holePaint);
    }
  }

  const borderPaint = Skia.Paint();
  borderPaint.setStyle(PaintStyle.Stroke);
  borderPaint.setStrokeWidth(selected ? 2.5 : 1);
  borderPaint.setColor(Skia.Color(selected ? '#8A7DFF' : 'rgba(53,48,43,0.24)'));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(0.5, 0.5, node.width - 1, node.height - 1), 4, 4), borderPaint);
}

function getWorldGridPicture(dark: boolean) {
  const cached = dark ? darkGridPicture : lightGridPicture;
  if (cached) return cached;
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT));
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(dark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.035)'));
  for (let y = 40; y < WORLD_HEIGHT; y += 64) {
    for (let x = 40; x < WORLD_WIDTH; x += 64) canvas.drawCircle(x, y, 1, paint);
  }
  const picture = recorder.finishRecordingAsPicture();
  if (dark) darkGridPicture = picture;
  else lightGridPicture = picture;
  return picture;
}

function getPegboardPicture(node: PegboardNode) {
  const key = `${node.width}:${node.height}:${node.columns}:${node.rows}`;
  const cached = pegboardPictureCache.get(key);
  if (cached) return cached;

  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, node.width, node.height));
  const highlightPaint = Skia.Paint();
  highlightPaint.setColor(Skia.Color('rgba(255,255,255,0.31)'));
  const holePaint = Skia.Paint();
  holePaint.setColor(Skia.Color('#2D2A27'));

  for (let row = 0; row < node.rows; row += 1) {
    for (let column = 0; column < node.columns; column += 1) {
      const cx = BOARD_PADDING + column * BOARD_CELL + BOARD_CELL / 2;
      const cy = BOARD_PADDING + row * BOARD_CELL + BOARD_CELL / 2;
      if (cx > node.width - 8 || cy > node.height - 8) continue;
      canvas.drawCircle(cx + 0.8, cy + 1.1, 3.1, highlightPaint);
      canvas.drawCircle(cx, cy, 2.35, holePaint);
    }
  }

  const picture = recorder.finishRecordingAsPicture();
  if (pegboardPictureCache.size >= 32) {
    const oldestKey = pegboardPictureCache.keys().next().value;
    if (oldestKey) pegboardPictureCache.delete(oldestKey);
  }
  pegboardPictureCache.set(key, picture);
  return picture;
}


function normalizeFixtureDimensions(document: SceneDocument): SceneDocument {
  let changed = false;
  const nodesById = { ...document.nodesById };

  for (const node of Object.values(document.nodesById)) {
    if (!node.parentId) continue;
    const parent = document.nodesById[node.parentId];
    if (parent?.kind !== 'pegboard') continue;

    if (node.kind === 'shelf') {
      const shelfOverhang = 5;
      const width = Math.max(BOARD_CELL, (parent.columns - 1) * BOARD_CELL) + shelfOverhang * 2;
      const x = BOARD_PADDING + BOARD_CELL / 2 - shelfOverhang;
      if (node.width !== width || node.x !== x) {
        nodesById[node.id] = { ...node, x, width };
        changed = true;
      }
    } else if (node.kind === 'divider') {
      const x = node.x + node.width / 2 < parent.width / 2 ? -node.width / 2 : parent.width - node.width / 2;
      if (node.x !== x || node.y !== 0 || node.height !== parent.height) {
        nodesById[node.id] = { ...node, x, y: 0, height: parent.height };
        changed = true;
      }
    }
  }

  return changed ? { ...document, nodesById, revision: document.revision + 1 } : document;
}

function hitTestCanvasNode(nodes: CanvasNode[], x: number, y: number) {
  'worklet';
  for (const node of nodes) {
    if (node.hidden) continue;
    const inset = node.kind === 'hook' ? 8 : 0;
    if (x >= node.x - inset && x <= node.x + node.width + inset && y >= node.y - inset && y <= node.y + node.height + inset) return node;
  }
  return null;
}

function findPegboardExpansionPosition(
  nodes: CanvasNode[],
  width: number,
  height: number,
  fallback: { x: number; y: number },
) {
  const boards = nodes.filter((node): node is PegboardNode => node.kind === 'pegboard');
  if (!boards.length) return fallback;

  const rightmost = boards.reduce((current, board) => (
    board.x + board.width > current.x + current.width ? board : current
  ));
  const rightPosition = {
    x: rightmost.x + rightmost.width + 2,
    y: rightmost.y,
  };
  if (rightPosition.x + width <= WORLD_WIDTH - 32) return rightPosition;

  const minX = Math.min(...boards.map((board) => board.x));
  const maxY = Math.max(...boards.map((board) => board.y + board.height));
  const nextRow = { x: minX, y: maxY + 2 };
  if (nextRow.y + height <= WORLD_HEIGHT - 32) return nextRow;
  return {
    x: clamp(fallback.x, 32, WORLD_WIDTH - width - 32),
    y: clamp(fallback.y, 32, WORLD_HEIGHT - height - 32),
  };
}

function snapNode<T extends CanvasNode>(node: T, others: CanvasNode[]): T {
  let next = { ...node } as T;
  if (next.kind === 'pegboard') {
    for (const candidate of others) {
      if (candidate.kind !== 'pegboard') continue;
      if (Math.abs(next.y - candidate.y) < SNAP_DISTANCE) next.y = candidate.y;
      if (Math.abs(next.x - (candidate.x + candidate.width)) < SNAP_DISTANCE) next.x = candidate.x + candidate.width + 2;
      if (Math.abs(next.x + next.width - candidate.x) < SNAP_DISTANCE) next.x = candidate.x - next.width - 2;
    }
    return next;
  }
  const boards = others.filter((candidate): candidate is PegboardNode => candidate.kind === 'pegboard');
  const board = boards.find((candidate) => next.x + next.width / 2 >= candidate.x - 20 && next.x + next.width / 2 <= candidate.x + candidate.width + 20 && next.y + next.height / 2 >= candidate.y - 20 && next.y + next.height / 2 <= candidate.y + candidate.height + 20);
  if (!board) return next;
  if (next.kind === 'hook') {
    const column = clamp(Math.round((next.x - board.x - BOARD_PADDING) / BOARD_CELL), 0, board.columns - 1);
    const row = clamp(Math.round((next.y - board.y - BOARD_PADDING) / BOARD_CELL), 0, board.rows - 1);
    next = { ...next, x: board.x + BOARD_PADDING + column * BOARD_CELL + BOARD_CELL / 2 - next.width / 2, y: board.y + BOARD_PADDING + row * BOARD_CELL + BOARD_CELL / 2 - 5, parentId: board.id, holeColumn: column, holeRow: row } as T;
  } else if (next.kind === 'shelf') {
    const firstHoleX = board.x + BOARD_PADDING + BOARD_CELL / 2;
    const shelfOverhang = 5;
    const width = Math.max(BOARD_CELL, (board.columns - 1) * BOARD_CELL) + shelfOverhang * 2;
    const row = clamp(Math.round((next.y - board.y - BOARD_PADDING) / BOARD_CELL), 0, board.rows - 1);
    next = {
      ...next,
      x: firstHoleX - shelfOverhang,
      y: board.y + BOARD_PADDING + row * BOARD_CELL,
      width,
      parentId: board.id,
    } as T;
  } else if (next.kind === 'divider') {
    const leftDistance = Math.abs(next.x + next.width / 2 - board.x);
    const rightDistance = Math.abs(next.x + next.width / 2 - (board.x + board.width));
    next = {
      ...next,
      x: leftDistance < rightDistance ? board.x - next.width / 2 : board.x + board.width - next.width / 2,
      y: board.y,
      height: board.height,
      parentId: board.id,
    } as T;
  } else if (next.kind === 'gear') {
    next = { ...next, x: clamp(next.x, board.x + 8, board.x + board.width - next.width - 8), y: clamp(next.y, board.y + 8, board.y + board.height - next.height - 8), parentId: board.id, pose: 'wall' } as T;
  }
  return next;
}

function RailButton({ theme, icon: Icon, label, active = false, disabled = false, onPress }: { theme: Theme; icon: LucideIcon; label: string; active?: boolean; disabled?: boolean; onPress: () => void }) {
  return <Press disabled={disabled} onPress={onPress} accessibilityLabel={label} accessibilityState={{ disabled, selected: active }} style={[styles.railButton, active && { backgroundColor: theme.accentSoft }, disabled && styles.railButtonDisabled]}><Icon color={active ? theme.accent : theme.text2} size={20} strokeWidth={1.8} /></Press>;
}

function CategoryButton({ theme, icon: Icon, label, active, onPress }: { theme: Theme; icon: LucideIcon; label: string; active: boolean; onPress: () => void }) {
  return <Press onPress={onPress} style={[styles.categoryButton, active && { backgroundColor: theme.accentSoft }]}><Icon color={active ? theme.accent : theme.text2} size={15} strokeWidth={1.8} /><Text style={{ fontSize: 11, fontWeight: '700', color: active ? theme.accent : theme.text2 }}>{label}</Text></Press>;
}

function ComponentButton({ theme, component, label, onPress }: { theme: Theme; component: ComponentDefinition; label: string; onPress: () => void }) {
  const icon = component.kind === 'pegboard' ? PanelsTopLeft : component.kind === 'shelf' ? Rows3 : component.kind === 'divider' ? Layers3 : component.kind === 'hook' ? CircleDot : component.kind === 'gear' ? Package : Tag;
  const Icon = icon;
  const physicalSize = component.wallGrid
    ? `${component.wallGrid.columns * 45} × ${component.wallGrid.rows * 60} cm`
    : null;
  return (
    <Press onPress={onPress} style={[styles.componentButton, { backgroundColor: theme.fieldSurface, borderColor: theme.fieldBorder }]}>
      <View style={[styles.componentIcon, { backgroundColor: theme.surfaceTop }]}><Icon color={theme.text} size={21} strokeWidth={1.7} /></View>
      <View style={styles.componentText}>
        <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: theme.text }}>{label}</Text>
        {physicalSize ? <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 9.5, color: theme.text2 }}>{physicalSize}</Text> : null}
      </View>
      <Plus color={theme.text3} size={14} />
    </Press>
  );
}

const componentLabel = (id: string, t: ReturnType<typeof useI18n>['t']) => ({ 'wall-single': t('gear.wall.componentBoard'), 'wall-four': t('gear.wall.componentWallFour'), 'wall-eight': t('gear.wall.componentWallEight'), 'wall-twelve': t('gear.wall.componentWallTwelve'), 'shelf-oak': t('gear.wall.componentShelf'), 'divider-metal': t('gear.wall.componentDivider'), 'hook-single': t('gear.wall.componentHook'), 'gear-item': t('gear.wall.componentGear'), label: t('gear.wall.componentLabel') }[id] || id);
const nodeLabel = (node: CanvasNode, t: ReturnType<typeof useI18n>['t']) => ({ pegboard: t('gear.wall.componentBoard'), shelf: t('gear.wall.componentShelf'), divider: t('gear.wall.componentDivider'), hook: t('gear.wall.componentHook'), gear: t('gear.wall.componentGear'), label: t('gear.wall.componentLabel') }[node.kind]);

const styles = StyleSheet.create({
  page: { flex: 1, overflow: 'hidden' },
  loadingPage: { alignItems: 'center', justifyContent: 'center' },
  header: { position: 'absolute', zIndex: 200, left: space.lg, right: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleBlock: { position: 'absolute', left: 64, right: 64, alignItems: 'center' },
  headerActionSpacer: { width: 44, height: 44 },
  subtitle: { marginTop: 3, fontSize: 11.5 },
  viewport: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  toolRail: { position: 'absolute', left: 14, zIndex: 190, padding: 4, gap: 3, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#55595D', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  railButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  railButtonDisabled: { opacity: 0.32 },
  railDivider: { width: 24, height: StyleSheet.hairlineWidth, alignSelf: 'center', marginVertical: 2 },
  selectionBar: { position: 'absolute', left: 72, right: 72, zIndex: 195, minHeight: 52, paddingLeft: 16, paddingRight: 7, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#55595D', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  deleteButton: { minWidth: 70, height: 40, paddingHorizontal: 12, borderRadius: 13, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  library: { position: 'absolute', left: space.sm, right: space.sm, zIndex: 180, paddingTop: 10, paddingBottom: space.sm, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#55595D', shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  libraryHeader: { paddingHorizontal: 18, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  libraryHint: { fontSize: 10.5 },
  categoryRow: { paddingHorizontal: 14, paddingTop: 8, flexDirection: 'row', gap: 5 },
  categoryButton: { minHeight: 30, paddingHorizontal: 10, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  componentRow: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4, gap: 8 },
  componentButton: { width: 150, height: 58, paddingHorizontal: 8, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 7 },
  componentText: { flex: 1, minWidth: 0 },
  componentIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
