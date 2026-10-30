// TabPanelSwitch.tsx — tab 面板切换时的入场过渡。
//
// 只动画「进场」：面板换掉后按 tab 条的方向轻微平移 + 淡入，让左右相邻的 tab
// 读起来像同一排内容在横向移动，和 ProfileTabs 的滑块下划线同向。出场不动画，
// 免得两个面板同时挂在树上把高度撑跳（DESIGN.md 要求布局不随状态位移）。
//
// 用 key + entering 布局动画而不是 effect 里重置 shared value：effect 在新面板
// 已经画出来之后才跑，会先闪一帧满不透明再归零淡入；entering 的初始值在 UI
// 线程挂载那一帧就生效。方向也直接闭包进 entering，避免 worklet 读到旧的 ref。
import React, { useCallback, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';
import ReAnimated, { Easing, withTiming } from 'react-native-reanimated';
import { motion } from '../design-system';

const SHIFT = 12;
const EASING = Easing.bezier(0.16, 1, 0.3, 1);

function enterFrom(direction: number) {
  return () => {
    'worklet';
    const config = { duration: motion.emphasized, easing: EASING };
    return {
      initialValues: { opacity: 0, transform: [{ translateX: direction * SHIFT }] },
      animations: { opacity: withTiming(1, config), transform: [{ translateX: withTiming(0, config) }] },
    };
  };
}

export function TabPanelSwitch({ order, active, children }: {
  /** tab 条里的 key 顺序，用来判断这次切换往哪边走。 */
  order: readonly string[];
  active: string;
  children: ReactNode;
}) {
  const shown = useRef({ key: active, entering: undefined as ReturnType<typeof enterFrom> | undefined });
  if (shown.current.key !== active) {
    const from = order.indexOf(shown.current.key);
    const to = order.indexOf(active);
    // 首次挂载不动画；未知 key 时只淡入不平移。
    shown.current = { key: active, entering: enterFrom(from < 0 || to < 0 ? 0 : to > from ? 1 : -1) };
  }

  return (
    <ReAnimated.View key={active} entering={shown.current.entering}>
      {children}
    </ReAnimated.View>
  );
}

/**
 * 吸顶 tab 条下的面板切换不跳滚动位置。
 *
 * 面板至少撑满「视口减 tab 条」的高度，换成短面板时内容不会缩到当前滚动位置
 * 以下、被系统夹回去；已经滚过 tab 条时切换，就停在 tab 条刚好吸顶的位置，
 * 新面板从头开始读，而不是落在它中间某处。还没滚到 tab 条时位置原样保留。
 */
export function useStickyTabScroll(scrollRef: RefObject<ScrollView | null>) {
  const scrollY = useRef(0);
  const tabsY = useRef(0);
  const [viewport, setViewport] = useState(0);
  const [tabsHeight, setTabsHeight] = useState(0);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
  }, []);
  const onViewportLayout = useCallback((event: LayoutChangeEvent) => {
    setViewport(event.nativeEvent.layout.height);
  }, []);
  const onTabsLayout = useCallback((event: LayoutChangeEvent) => {
    tabsY.current = event.nativeEvent.layout.y;
    setTabsHeight(event.nativeEvent.layout.height);
  }, []);
  /** 在 setTab 之前调用：旧面板还在，内容够高，这一跳和新面板淡入落在同一帧。 */
  const settleBeforeSwitch = useCallback(() => {
    if (scrollY.current <= tabsY.current) return;
    scrollY.current = tabsY.current;
    scrollRef.current?.scrollTo({ y: tabsY.current, animated: false });
  }, [scrollRef]);

  return {
    scrollProps: { onScroll, onLayout: onViewportLayout, scrollEventThrottle: 16 },
    onTabsLayout,
    panelMinHeight: viewport ? Math.max(0, viewport - tabsHeight) : undefined,
    settleBeforeSwitch,
  };
}
