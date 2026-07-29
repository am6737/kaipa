import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Image as SkiaImage,
  LinearGradient,
  Line,
  Rect,
  RoundedRect,
  useImage,
  vec,
} from '@shopify/react-native-skia';
import {
  Check,
  CircleDot,
  Focus,
  Package,
  PackagePlus,
  PanelsTopLeft,
  Rows3,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Theme } from '../../theme/theme';
import { GearItem } from '../../data/gear';
import { useI18n } from '../../i18n';
import { AppIconButton, radius, space, type } from '../../design-system';
import { Press } from '../Press';

const CELL = 22;
const BOARD_COLUMNS = 10;
const BOARD_ROWS = 14;
const BOARD_PADDING = 18;
const BOARD_WIDTH = BOARD_COLUMNS * CELL + BOARD_PADDING * 2;
const BOARD_HEIGHT = BOARD_ROWS * CELL + BOARD_PADDING * 2;
const MODULE_GAP = 2;
const TOKEN_SIZE = 66;

type BoardModule = {
  id: string;
  x: number;
  y: number;
};

type HookInstance = {
  id: string;
  boardId: string;
  column: number;
  row: number;
};

type ShelfInstance = {
  id: string;
  boardId: string;
  row: number;
};

type DividerInstance = {
  id: string;
  boardId: string;
  edge: 'right';
};

type GearPlacement = {
  id: string;
  boardId: string;
  itemIndex: number;
  column: number;
  row: number;
};

type ToolMode = 'select' | 'hook';
type Direction = 'left' | 'right' | 'up' | 'down';

const initialBoards: BoardModule[] = [
  { id: 'board-0', x: 0, y: 0 },
  { id: 'board-1', x: 1, y: 0 },
];

const initialHooks: HookInstance[] = [
  { id: 'hook-0', boardId: 'board-0', column: 2, row: 2 },
  { id: 'hook-1', boardId: 'board-0', column: 7, row: 3 },
  { id: 'hook-2', boardId: 'board-1', column: 4, row: 2 },
];

const initialPlacements: GearPlacement[] = [
  { id: 'gear-0', boardId: 'board-0', itemIndex: 0, column: 2, row: 3 },
  { id: 'gear-1', boardId: 'board-0', itemIndex: 1, column: 7, row: 4 },
  { id: 'gear-2', boardId: 'board-1', itemIndex: 2, column: 4, row: 3 },
];

const clamp = (value: number, min: number, max: number) => {
  'worklet';
  return Math.min(max, Math.max(min, value));
};

export function GearWallPrototype({
  theme,
  items,
  onBack,
  onDone,
}: {
  theme: Theme;
  items: GearItem[];
  onBack: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [boards, setBoards] = useState(initialBoards);
  const [hooks, setHooks] = useState(initialHooks);
  const [shelves, setShelves] = useState<ShelfInstance[]>([
    { id: 'shelf-0', boardId: 'board-1', row: 9 },
  ]);
  const [dividers, setDividers] = useState<DividerInstance[]>([
    { id: 'divider-0', boardId: 'board-1', edge: 'right' },
  ]);
  const [placements, setPlacements] = useState(initialPlacements);
  const [selectedBoardId, setSelectedBoardId] = useState(initialBoards[0].id);
  const [mode, setMode] = useState<ToolMode>('select');

  const sceneScale = useSharedValue(0.78);
  const savedScale = useSharedValue(0.78);
  const panX = useSharedValue(0);
  const panY = useSharedValue(16);
  const savedPanX = useSharedValue(0);
  const savedPanY = useSharedValue(16);

  const bounds = useMemo(() => {
    const minX = Math.min(...boards.map((board) => board.x));
    const maxX = Math.max(...boards.map((board) => board.x));
    const minY = Math.min(...boards.map((board) => board.y));
    const maxY = Math.max(...boards.map((board) => board.y));
    return {
      minX,
      minY,
      width: (maxX - minX + 1) * BOARD_WIDTH + (maxX - minX) * MODULE_GAP,
      height: (maxY - minY + 1) * BOARD_HEIGHT + (maxY - minY) * MODULE_GAP + 112,
    };
  }, [boards]);

  const viewportHeight = height - insets.top - insets.bottom - 150;

  const fitScene = useCallback(() => {
    const nextScale = clamp(Math.min((width - 28) / bounds.width, (viewportHeight - 24) / bounds.height), 0.35, 1.05);
    sceneScale.value = withTiming(nextScale, { duration: 220 });
    savedScale.value = nextScale;
    panX.value = withTiming(0, { duration: 220 });
    panY.value = withTiming(10, { duration: 220 });
    savedPanX.value = 0;
    savedPanY.value = 10;
  }, [bounds.height, bounds.width, panX, panY, savedPanX, savedPanY, savedScale, sceneScale, viewportHeight, width]);

  const panGesture = useMemo(() => Gesture.Pan()
    .minPointers(2)
    .onUpdate((event) => {
      panX.value = savedPanX.value + event.translationX;
      panY.value = savedPanY.value + event.translationY;
    })
    .onEnd(() => {
      savedPanX.value = panX.value;
      savedPanY.value = panY.value;
    }), [panX, panY, savedPanX, savedPanY]);

  const pinchGesture = useMemo(() => Gesture.Pinch()
    .onUpdate((event) => {
      sceneScale.value = clamp(savedScale.value * event.scale, 0.35, 2.3);
    })
    .onEnd(() => {
      savedScale.value = sceneScale.value;
    }), [savedScale, sceneScale]);

  const canvasGesture = useMemo(
    () => Gesture.Simultaneous(panGesture, pinchGesture),
    [panGesture, pinchGesture],
  );

  const sceneStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: panX.value },
      { translateY: panY.value },
      { scale: sceneScale.value },
    ],
  }));

  const addBoard = (source: BoardModule, direction: Direction) => {
    const delta = {
      left: [-1, 0],
      right: [1, 0],
      up: [0, -1],
      down: [0, 1],
    }[direction];
    const x = source.x + delta[0];
    const y = source.y + delta[1];
    const occupied = boards.find((board) => board.x === x && board.y === y);
    if (occupied) {
      setSelectedBoardId(occupied.id);
      return;
    }
    const next = { id: `board-${Date.now()}`, x, y };
    setBoards((current) => [...current, next]);
    setSelectedBoardId(next.id);
    sceneScale.value = withSpring(Math.max(0.48, sceneScale.value * 0.9), { damping: 18, stiffness: 170 });
    savedScale.value = Math.max(0.48, savedScale.value * 0.9);
  };

  const toggleHook = (boardId: string, column: number, row: number) => {
    setSelectedBoardId(boardId);
    if (mode !== 'hook') return;
    setHooks((current) => {
      const existing = current.find((hook) => hook.boardId === boardId && hook.column === column && hook.row === row);
      if (existing) return current.filter((hook) => hook.id !== existing.id);
      return [...current, { id: `hook-${Date.now()}-${column}-${row}`, boardId, column, row }];
    });
  };

  const toggleShelf = () => {
    if (!selectedBoardId) return;
    setShelves((current) => {
      const existing = current.find((shelf) => shelf.boardId === selectedBoardId);
      if (existing) return current.filter((shelf) => shelf.id !== existing.id);
      return [...current, { id: `shelf-${Date.now()}`, boardId: selectedBoardId, row: 9 }];
    });
  };

  const toggleDivider = () => {
    if (!selectedBoardId) return;
    setDividers((current) => {
      const existing = current.find((divider) => divider.boardId === selectedBoardId);
      if (existing) return current.filter((divider) => divider.id !== existing.id);
      return [...current, { id: `divider-${Date.now()}`, boardId: selectedBoardId, edge: 'right' }];
    });
  };

  const addGear = () => {
    const boardId = selectedBoardId || boards[0]?.id;
    if (!boardId) return;
    const index = placements.length % Math.max(items.length, 4);
    const slot = placements.filter((placement) => placement.boardId === boardId).length;
    const column = 2 + (slot % 3) * 3;
    const row = 3 + Math.floor(slot / 3) * 4;
    setHooks((current) => {
      const exists = current.some((hook) => hook.boardId === boardId && hook.column === column && hook.row === row - 1);
      return exists ? current : [...current, { id: `hook-${Date.now()}`, boardId, column, row: row - 1 }];
    });
    setPlacements((current) => [...current, {
      id: `gear-${Date.now()}`,
      boardId,
      itemIndex: index,
      column,
      row,
    }]);
  };

  const moveGear = (placementId: string, deltaColumn: number, deltaRow: number) => {
    setPlacements((current) => current.map((placement) => placement.id === placementId ? {
      ...placement,
      column: clamp(placement.column + deltaColumn, 1, BOARD_COLUMNS - 2),
      row: clamp(placement.row + deltaRow, 1, BOARD_ROWS - 2),
    } : placement));
  };

  const sceneLeft = (width - bounds.width) / 2;
  const sceneTop = Math.max(10, (viewportHeight - bounds.height * 0.78) / 2);

  return (
    <View style={[styles.page, { backgroundColor: theme.dark ? '#111214' : '#F5F5F3' }]}>
      <View style={[styles.ambient, { backgroundColor: theme.dark ? '#17181A' : '#FAFAF8' }]} />
      <View style={[styles.studioGlow, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.82)' }]} />

      <View style={[styles.header, { paddingTop: insets.top + space.xs }]} pointerEvents="box-none">
        <AppIconButton theme={theme} name="chevronL" onPress={onBack} />
        <View style={styles.titleBlock} pointerEvents="none">
          <Text style={[type.navTitle, { color: theme.dark ? '#FFFFFF' : '#171717' }]}>{t('gear.wall.title')}</Text>
          <Text style={[styles.subtitle, { color: theme.dark ? 'rgba(255,255,255,0.58)' : 'rgba(60,60,67,0.56)' }]}>{t('gear.wall.boardCount', { count: boards.length })}</Text>
        </View>
        <AppIconButton theme={theme} name="share" onPress={onDone} />
      </View>

      <View style={[styles.viewport, { top: insets.top + 72, bottom: insets.bottom + 96 }]}>
        <GestureDetector gesture={canvasGesture}>
          <Animated.View style={StyleSheet.absoluteFill}>
            <Animated.View
              style={[
                styles.scene,
                {
                  width: bounds.width,
                  height: bounds.height,
                  left: sceneLeft,
                  top: sceneTop,
                },
                sceneStyle,
              ]}
            >
              <SkiaGearWallScene
                theme={theme}
                boards={boards}
                hooks={hooks}
                shelves={shelves}
                dividers={dividers}
                selectedBoardId={selectedBoardId}
                bounds={bounds}
              />
              {boards.map((board) => {
                const left = (board.x - bounds.minX) * (BOARD_WIDTH + MODULE_GAP);
                const top = (board.y - bounds.minY) * (BOARD_HEIGHT + MODULE_GAP);
                const selected = board.id === selectedBoardId;
                const hasLeftNeighbor = boards.some((candidate) => candidate.x === board.x - 1 && candidate.y === board.y);
                const hasRightNeighbor = boards.some((candidate) => candidate.x === board.x + 1 && candidate.y === board.y);
                const hasTopNeighbor = boards.some((candidate) => candidate.x === board.x && candidate.y === board.y - 1);
                const hasBottomNeighbor = boards.some((candidate) => candidate.x === board.x && candidate.y === board.y + 1);
                const boardHooks = hooks.filter((hook) => hook.boardId === board.id);
                const boardGear = placements.filter((placement) => placement.boardId === board.id);
                return (
                  <View key={board.id} style={[styles.boardWrap, { left, top, width: BOARD_WIDTH, height: BOARD_HEIGHT }]}>
                    <View style={styles.interactionBoard}>
                      <View style={styles.holeGrid}>
                        {Array.from({ length: BOARD_ROWS }).map((_, row) => (
                          <View key={row} style={styles.holeRow}>
                            {Array.from({ length: BOARD_COLUMNS }).map((__, column) => {
                              const hasHook = boardHooks.some((hook) => hook.column === column && hook.row === row);
                              return (
                                <Pressable
                                  key={column}
                                  accessibilityRole="button"
                                  accessibilityLabel={t('gear.wall.hole', { column: column + 1, row: row + 1 })}
                                  onPress={() => toggleHook(board.id, column, row)}
                                  style={styles.holeCell}
                                >
                                  {mode === 'hook' && hasHook ? <View style={styles.holeTouchActive} /> : null}
                                </Pressable>
                              );
                            })}
                          </View>
                        ))}
                      </View>

                      {boardGear.map((placement) => (
                        <GearToken
                          key={placement.id}
                          theme={theme}
                          item={items[placement.itemIndex % Math.max(items.length, 1)]}
                          fallbackIndex={placement.itemIndex}
                          placement={placement}
                          sceneScale={sceneScale}
                          onMove={moveGear}
                        />
                      ))}
                    </View>

                    {selected ? (
                      <>
                        {!hasLeftNeighbor ? <BoardExpandButton dark={theme.dark} direction="left" onPress={() => addBoard(board, 'left')} /> : null}
                        {!hasRightNeighbor ? <BoardExpandButton dark={theme.dark} direction="right" onPress={() => addBoard(board, 'right')} /> : null}
                        {!hasTopNeighbor ? <BoardExpandButton dark={theme.dark} direction="up" onPress={() => addBoard(board, 'up')} /> : null}
                        {!hasBottomNeighbor ? <BoardExpandButton dark={theme.dark} direction="down" onPress={() => addBoard(board, 'down')} /> : null}
                      </>
                    ) : null}
                  </View>
                );
              })}
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>

      {mode === 'hook' ? (
        <View style={[styles.hint, { bottom: insets.bottom + 104, backgroundColor: theme.dark ? 'rgba(30,31,33,0.92)' : 'rgba(255,255,255,0.94)' }]} pointerEvents="none">
          <Text style={[styles.hintText, { color: theme.dark ? '#FFFFFF' : '#222222' }]}>{t('gear.wall.hookHint')}</Text>
        </View>
      ) : null}

      <View style={[styles.toolbar, { bottom: Math.max(insets.bottom, 12) + 8, backgroundColor: theme.dark ? 'rgba(28,29,31,0.94)' : 'rgba(255,255,255,0.92)', borderColor: theme.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.055)' }]}>
        <ToolButton dark={theme.dark} icon={PackagePlus} label={t('gear.wall.gear')} onPress={addGear} />
        <ToolButton dark={theme.dark} icon={CircleDot} label={t('gear.wall.hook')} active={mode === 'hook'} onPress={() => setMode((current) => current === 'hook' ? 'select' : 'hook')} />
        <ToolButton dark={theme.dark} icon={Rows3} label={t('gear.wall.shelf')} active={shelves.some((shelf) => shelf.boardId === selectedBoardId)} onPress={toggleShelf} />
        <ToolButton dark={theme.dark} icon={PanelsTopLeft} label={t('gear.wall.divider')} active={dividers.some((divider) => divider.boardId === selectedBoardId)} onPress={toggleDivider} />
        <ToolButton dark={theme.dark} icon={Focus} label={t('gear.wall.fit')} onPress={fitScene} />
        <Press onPress={onDone} accessibilityRole="button" accessibilityLabel={t('common.done')} style={[styles.doneButton, { backgroundColor: theme.accent }]}>
          <Check color="#FFFFFF" size={25} strokeWidth={2.4} />
        </Press>
      </View>
    </View>
  );
}

function SkiaGearWallScene({
  theme,
  boards,
  hooks,
  shelves,
  dividers,
  selectedBoardId,
  bounds,
}: {
  theme: Theme;
  boards: BoardModule[];
  hooks: HookInstance[];
  shelves: ShelfInstance[];
  dividers: DividerInstance[];
  selectedBoardId: string;
  bounds: { minX: number; minY: number; width: number; height: number };
}) {
  const metalTexture = useImage(require('../../../assets/gear-wall/pegboard-metal.png'));
  const woodTexture = useImage(require('../../../assets/gear-wall/workbench-oak.png'));
  const floorY = bounds.height - 112;
  return (
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Rect x={0} y={0} width={bounds.width} height={bounds.height}>
        <LinearGradient
          start={vec(bounds.width * 0.5, 0)}
          end={vec(bounds.width * 0.5, bounds.height)}
          colors={theme.dark ? ['#191A1C', '#202225', '#151618'] : ['#FAFAF8', '#F1F1EE', '#E7E7E3']}
        />
      </Rect>
      <Rect x={18} y={floorY + 18} width={bounds.width - 20} height={72} color="rgba(61,65,68,0.16)">
        <BlurMask blur={24} style="normal" />
      </Rect>
      <Rect x={0} y={floorY} width={bounds.width} height={112} color={theme.dark ? '#292A2B' : '#D6C2A8'} />
      <SkiaImage image={woodTexture} x={0} y={floorY} width={bounds.width} height={112} fit="cover" opacity={theme.dark ? 0.42 : 0.86} />
      <Rect x={0} y={floorY} width={bounds.width} height={112}>
        <LinearGradient start={vec(0, floorY)} end={vec(bounds.width, floorY + 112)} colors={['rgba(255,255,255,0.22)', 'rgba(79,61,44,0.12)']} />
      </Rect>

      {boards.map((board) => {
        const x = (board.x - bounds.minX) * (BOARD_WIDTH + MODULE_GAP);
        const y = (board.y - bounds.minY) * (BOARD_HEIGHT + MODULE_GAP);
        const selected = board.id === selectedBoardId;
        const boardHooks = hooks.filter((hook) => hook.boardId === board.id);
        const shelf = shelves.find((candidate) => candidate.boardId === board.id);
        const divider = dividers.find((candidate) => candidate.boardId === board.id);
        return (
          <Group key={board.id}>
            <RoundedRect x={x + 10} y={y + 13} width={BOARD_WIDTH} height={BOARD_HEIGHT} r={5} color="rgba(50,52,53,0.22)">
              <BlurMask blur={20} style="normal" />
            </RoundedRect>
            <RoundedRect x={x} y={y} width={BOARD_WIDTH} height={BOARD_HEIGHT} r={4} color={theme.dark ? '#4A4946' : '#B9B1A6'} />
            <SkiaImage image={metalTexture} x={x} y={y} width={BOARD_WIDTH} height={BOARD_HEIGHT} fit="cover" opacity={theme.dark ? 0.44 : 0.82} />
            <Rect x={x} y={y} width={BOARD_WIDTH} height={BOARD_HEIGHT}>
              <LinearGradient start={vec(x, y)} end={vec(x + BOARD_WIDTH, y + BOARD_HEIGHT)} colors={['rgba(255,255,255,0.20)', 'rgba(255,255,255,0.02)', 'rgba(43,38,33,0.12)']} />
            </Rect>
            <RoundedRect
              x={x + 0.5}
              y={y + 0.5}
              width={BOARD_WIDTH - 1}
              height={BOARD_HEIGHT - 1}
              r={4}
              style="stroke"
              strokeWidth={selected ? 2 : 1}
              color={selected ? theme.accent : 'rgba(51,47,43,0.26)'}
            />

            {Array.from({ length: BOARD_ROWS }).flatMap((_, row) => Array.from({ length: BOARD_COLUMNS }).map((__, column) => {
              const cx = x + BOARD_PADDING + column * CELL + CELL / 2;
              const cy = y + BOARD_PADDING + row * CELL + CELL / 2;
              return (
                <Group key={`${row}-${column}`}>
                  <Circle cx={cx + 0.7} cy={cy + 1.2} r={3.2} color="rgba(255,255,255,0.34)" />
                  <Circle cx={cx} cy={cy} r={2.35} color={theme.dark ? '#171719' : '#302D29'} />
                  <Circle cx={cx - 0.5} cy={cy - 0.6} r={0.7} color="rgba(255,255,255,0.18)" />
                </Group>
              );
            }))}

            {boardHooks.map((hook) => {
              const hx = x + BOARD_PADDING + hook.column * CELL + CELL / 2;
              const hy = y + BOARD_PADDING + hook.row * CELL + CELL / 2;
              return (
                <Group key={hook.id}>
                  <Line p1={vec(hx + 2, hy + 3)} p2={vec(hx + 5, hy + 20)} color="rgba(39,40,41,0.24)" strokeWidth={5}>
                    <BlurMask blur={3} style="normal" />
                  </Line>
                  <Circle cx={hx} cy={hy} r={4.6} color="#6D6E6B" />
                  <Circle cx={hx - 1} cy={hy - 1} r={2.4} color="#D8D7D2" />
                  <Line p1={vec(hx, hy + 1)} p2={vec(hx + 3, hy + 18)} color="#B9B8B3" strokeWidth={3.6} strokeCap="round" />
                  <Line p1={vec(hx + 3, hy + 18)} p2={vec(hx + 9, hy + 14)} color="#B9B8B3" strokeWidth={3.6} strokeCap="round" />
                </Group>
              );
            })}

            {shelf ? (
              <Group>
                <Rect x={x + 24 + 8} y={y + BOARD_PADDING + shelf.row * CELL + 8} width={BOARD_WIDTH - 48} height={15} color="rgba(43,44,45,0.20)">
                  <BlurMask blur={7} style="normal" />
                </Rect>
                <Rect x={x + 24} y={y + BOARD_PADDING + shelf.row * CELL} width={BOARD_WIDTH - 48} height={14} color="#B89A78" />
                <SkiaImage image={woodTexture} x={x + 24} y={y + BOARD_PADDING + shelf.row * CELL} width={BOARD_WIDTH - 48} height={10} fit="cover" opacity={0.92} />
                <Rect x={x + 24} y={y + BOARD_PADDING + shelf.row * CELL + 10} width={BOARD_WIDTH - 48} height={4} color="#7C6248" />
              </Group>
            ) : null}

            {divider ? (
              <Group>
                <Rect x={x + BOARD_WIDTH + 3} y={y + 18} width={14} height={BOARD_HEIGHT + 76} color="rgba(42,43,44,0.18)">
                  <BlurMask blur={8} style="normal" />
                </Rect>
                <Rect x={x + BOARD_WIDTH - 4} y={y + 14} width={14} height={BOARD_HEIGHT + 78}>
                  <LinearGradient start={vec(x + BOARD_WIDTH - 4, y)} end={vec(x + BOARD_WIDTH + 10, y)} colors={['#EBE8E1', '#A6A39D', '#666764']} />
                </Rect>
              </Group>
            ) : null}
          </Group>
        );
      })}
    </Canvas>
  );
}

function GearToken({
  theme,
  item,
  fallbackIndex,
  placement,
  sceneScale,
  onMove,
}: {
  theme: Theme;
  item?: GearItem;
  fallbackIndex: number;
  placement: GearPlacement;
  sceneScale: SharedValue<number>;
  onMove: (placementId: string, deltaColumn: number, deltaRow: number) => void;
}) {
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragging = useSharedValue(0);
  const pan = useMemo(() => Gesture.Pan()
    .maxPointers(1)
    .onBegin(() => {
      dragging.value = withTiming(1, { duration: 100 });
    })
    .onUpdate((event) => {
      dragX.value = event.translationX / Math.max(sceneScale.value, 0.35);
      dragY.value = event.translationY / Math.max(sceneScale.value, 0.35);
    })
    .onEnd(() => {
      const deltaColumn = Math.round(dragX.value / CELL);
      const deltaRow = Math.round(dragY.value / CELL);
      runOnJS(onMove)(placement.id, deltaColumn, deltaRow);
      dragX.value = withSpring(0, { damping: 18, stiffness: 200 });
      dragY.value = withSpring(0, { damping: 18, stiffness: 200 });
      dragging.value = withTiming(0, { duration: 140 });
    }), [dragX, dragY, dragging, onMove, placement.id, sceneScale]);
  const animatedStyle = useAnimatedStyle(() => ({
    zIndex: dragging.value > 0 ? 40 : 10,
    transform: [
      { translateX: dragX.value },
      { translateY: dragY.value },
      { scale: 1 + dragging.value * 0.05 },
    ],
  }));
  const photo = item?.photos?.[0];
  const fallbackColors = ['#313438', '#6D7655', '#A65D36', '#4B535B'];
  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          styles.gearToken,
          {
            left: BOARD_PADDING + placement.column * CELL - TOKEN_SIZE / 2 + CELL / 2,
            top: BOARD_PADDING + placement.row * CELL - TOKEN_SIZE / 2 + CELL / 2,
          },
          animatedStyle,
        ]}
      >
        <View style={styles.gearShadow} />
        <View style={[styles.gearImage, { backgroundColor: photo ? 'rgba(0,0,0,0.06)' : fallbackColors[fallbackIndex % fallbackColors.length] }]}>
          {photo ? <Image source={{ uri: photo }} contentFit="cover" style={StyleSheet.absoluteFill} /> : <Package color={theme.dark ? '#F2EEE8' : '#FFFFFF'} size={27} strokeWidth={1.5} />}
        </View>
        <Text numberOfLines={1} style={[styles.gearLabel, { color: theme.dark ? '#FFFFFF' : '#262626', backgroundColor: theme.dark ? 'rgba(33,34,36,0.76)' : 'rgba(255,255,255,0.88)' }]}>{item?.name || `装备 ${fallbackIndex + 1}`}</Text>
      </Animated.View>
    </GestureDetector>
  );
}

function BoardExpandButton({ dark, direction, onPress }: { dark: boolean; direction: Direction; onPress: () => void }) {
  const position = direction === 'left'
    ? { left: -21, top: BOARD_HEIGHT / 2 - 18 }
    : direction === 'right'
      ? { right: -21, top: BOARD_HEIGHT / 2 - 18 }
      : direction === 'up'
        ? { top: -21, left: BOARD_WIDTH / 2 - 18 }
        : { bottom: -21, left: BOARD_WIDTH / 2 - 18 };
  return (
    <Press onPress={onPress} accessibilityRole="button" style={[styles.expandButton, position, { backgroundColor: dark ? 'rgba(36,37,39,0.96)' : 'rgba(255,255,255,0.96)', borderColor: dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.07)' }]}>
      <Text style={[styles.expandPlus, { color: dark ? '#FFFFFF' : '#252525' }]}>＋</Text>
    </Press>
  );
}

function ToolButton({
  dark,
  icon: Icon,
  label,
  active = false,
  onPress,
}: {
  dark: boolean;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.toolButton, active && (dark ? styles.toolButtonActiveDark : styles.toolButtonActiveLight)]}>
      <Icon color={dark ? (active ? '#FFFFFF' : 'rgba(255,255,255,0.78)') : (active ? '#171717' : 'rgba(28,28,30,0.68)')} size={21} strokeWidth={1.8} />
      <Text numberOfLines={1} style={[styles.toolLabel, { color: dark ? 'rgba(255,255,255,0.54)' : 'rgba(60,60,67,0.54)' }, active && { color: dark ? '#FFFFFF' : '#171717' }]}>{label}</Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, overflow: 'hidden' },
  ambient: { ...StyleSheet.absoluteFill, opacity: 1 },
  studioGlow: { position: 'absolute', left: '18%', right: '18%', top: '8%', height: '42%', borderRadius: 180, opacity: 0.9, shadowColor: '#FFFFFF', shadowOpacity: 0.9, shadowRadius: 70, shadowOffset: { width: 0, height: 0 } },
  header: { position: 'absolute', zIndex: 100, left: space.lg, right: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleBlock: { position: 'absolute', left: 64, right: 64, alignItems: 'center' },
  subtitle: { marginTop: 3, fontSize: 12 },
  viewport: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  scene: { position: 'absolute' },
  boardWrap: { position: 'absolute' },
  interactionBoard: { flex: 1 },
  holeGrid: { position: 'absolute', left: BOARD_PADDING, top: BOARD_PADDING },
  holeRow: { height: CELL, flexDirection: 'row' },
  holeCell: { width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' },
  holeTouchActive: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)', backgroundColor: 'rgba(46,111,72,0.38)' },
  expandButton: { position: 'absolute', width: 36, height: 36, borderRadius: 18, zIndex: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, shadowColor: '#5C6064', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  expandPlus: { marginTop: -2, fontSize: 24, fontWeight: '400' },
  gearToken: { position: 'absolute', width: TOKEN_SIZE, height: TOKEN_SIZE + 22, alignItems: 'center' },
  gearShadow: { position: 'absolute', top: 9, width: 55, height: 55, borderRadius: 18, backgroundColor: 'rgba(72,76,80,0.15)', shadowColor: '#606468', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 6, height: 8 }, transform: [{ translateX: 5 }, { translateY: 6 }, { rotate: '-6deg' }] },
  gearImage: { width: TOKEN_SIZE, height: TOKEN_SIZE, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)' },
  gearLabel: { marginTop: 4, maxWidth: 84, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 7, overflow: 'hidden', fontSize: 8.5, fontWeight: '700' },
  hint: { position: 'absolute', alignSelf: 'center', zIndex: 110, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, shadowColor: '#676B6F', shadowOpacity: 0.13, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  hintText: { fontSize: 12, fontWeight: '600' },
  toolbar: { position: 'absolute', left: 14, right: 14, minHeight: 72, zIndex: 120, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: StyleSheet.hairlineWidth, shadowColor: '#63676B', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  toolButton: { width: 49, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 3 },
  toolButtonActiveDark: { backgroundColor: 'rgba(255,255,255,0.13)' },
  toolButtonActiveLight: { backgroundColor: 'rgba(0,0,0,0.055)' },
  toolLabel: { fontSize: 9, fontWeight: '600' },
  doneButton: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
});
