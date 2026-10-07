import React, { useContext, useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import type { TLRow } from '../../data/timeline';
import type { Theme } from '../../theme/theme';
import { space } from '../../design-system';
import { useI18n } from '../../i18n';
import { Icon } from '../Icon';
import { SheetInteractionContext } from '../SheetInteractionContext';
import { moveTimelineItem, timelineDropIndex } from '../../lib/timelineReorder';

type Layout = { y: number; height: number };

function ReorderHandle({ theme, disabled, onStart, onMove, onEnd, onStep }: {
  theme: Theme; disabled: boolean;
  onStart: () => boolean; onMove: (dy: number) => void;
  onEnd: (cancelled: boolean) => void; onStep: (offset: number) => void;
}) {
  const { t } = useI18n();
  const callbacks = useRef({ disabled, onStart, onMove, onEnd });
  callbacks.current = { disabled, onStart, onMove, onEnd };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const finish = (cancelled: boolean) => {
    clear();
    if (active.current) callbacks.current.onEnd(cancelled);
    active.current = false;
  };
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !callbacks.current.disabled,
    onPanResponderGrant: () => {
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        active.current = callbacks.current.onStart();
      }, 360);
    },
    onPanResponderMove: (_, gesture) => {
      if (active.current) callbacks.current.onMove(gesture.dy);
      else if (Math.abs(gesture.dy) > 8 || Math.abs(gesture.dx) > 8) clear();
    },
    onPanResponderRelease: () => finish(false),
    onPanResponderTerminate: () => finish(true),
    onPanResponderTerminationRequest: () => !active.current,
    onShouldBlockNativeResponder: () => true,
  })).current;
  useEffect(() => () => finish(true), []);
  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t('journey.timeline.reorderHandle')}
      accessibilityHint={t('journey.timeline.reorderHint')}
      accessibilityState={{ disabled }}
      accessibilityActions={disabled ? [] : [{ name: 'increment', label: t('journey.timeline.moveDown') }, { name: 'decrement', label: t('journey.timeline.moveUp') }]}
      onAccessibilityAction={(event) => {
        if (!disabled) onStep(event.nativeEvent.actionName === 'increment' ? 1 : -1);
      }}
      style={{ width: 44, flex: 1, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}
    >
      <Icon name="grip" size={20} color={theme.text3} />
    </View>
  );
}

/** Keep layout slots stable during the gesture; only the floating item and the
 * displaced neighbours translate. Variable-height text/photo cards retain size. */
export function ReorderableTimelineGroup({ rows, theme, editable, renderRow, onSave, onError, onDragStateChange }: {
  rows: TLRow[]; theme: Theme; editable: boolean;
  renderRow: (row: TLRow, handle?: React.ReactNode) => React.ReactNode;
  onSave: (ids: string[]) => Promise<void>; onError: (error: unknown) => void;
  onDragStateChange?: (active: boolean) => void;
}) {
  const blockSheet = useContext(SheetInteractionContext);
  const layouts = useRef(new Map<string, Layout>());
  const translate = useRef(new Animated.Value(0)).current;
  const session = useRef<{ rows: TLRow[]; id: string; from: number; to: number; layout: Layout } | null>(null);
  const [drag, setDrag] = useState<{ id: string; from: number; to: number; height: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const mounted = useRef(true);
  const notifyDrag = (active: boolean) => { blockSheet?.(active); onDragStateChange?.(active); };
  const callbacks = useRef({ onSave, onError, onDragStateChange: notifyDrag });
  callbacks.current = { onSave, onError, onDragStateChange: notifyDrag };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (session.current) callbacks.current.onDragStateChange?.(false); session.current = null; };
  }, []);
  const save = async (ordered: TLRow[]) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try { await callbacks.current.onSave(ordered.map((row) => row.id)); }
    catch (error) { if (mounted.current) callbacks.current.onError(error); }
    finally { savingRef.current = false; if (mounted.current) setSaving(false); }
  };
  const end = (cancelled: boolean) => {
    const current = session.current;
    session.current = null;
    translate.setValue(0);
    if (mounted.current) setDrag(null);
    callbacks.current.onDragStateChange?.(false);
    if (current && !cancelled && current.from !== current.to) void save(moveTimelineItem(current.rows, current.from, current.to));
  };
  // A refetch/deletion or a switch into selection mode cancels an active drag.
  useEffect(() => {
    const current = session.current;
    if (current && (!editable || current.rows.length !== rows.length || current.rows.some((row, index) => row.id !== rows[index]?.id))) end(true);
  }, [rows, editable]);
  return (
    <View style={{ gap: space.md }}>
      {(session.current?.rows ?? rows).map((row, index) => {
        let offset = 0;
        if (drag && row.id !== drag.id) {
          if (drag.to > drag.from && index > drag.from && index <= drag.to) offset = -(drag.height + space.md);
          if (drag.to < drag.from && index >= drag.to && index < drag.from) offset = drag.height + space.md;
        }
        const handle = editable ? (
          <ReorderHandle
            theme={theme}
            disabled={saving || rows.length < 2}
            onStart={() => {
              if (savingRef.current || session.current) return false;
              const layout = layouts.current.get(row.id);
              if (!layout || rows.some((item) => !layouts.current.has(item.id))) return false;
              session.current = { rows: [...rows], id: row.id, from: index, to: index, layout };
              setDrag({ id: row.id, from: index, to: index, height: layout.height });
              callbacks.current.onDragStateChange?.(true);
              return true;
            }}
            onMove={(dy) => {
              const current = session.current;
              if (!current) return;
              const last = layouts.current.get(current.rows[current.rows.length - 1].id)!;
              const clamped = Math.max(-current.layout.y, Math.min(dy, last.y + last.height - current.layout.height - current.layout.y));
              translate.setValue(clamped);
              const to = timelineDropIndex(current.rows.map((item) => layouts.current.get(item.id)!), current.from, clamped);
              if (to !== current.to) {
                current.to = to;
                setDrag({ id: current.id, from: current.from, to, height: current.layout.height });
              }
            }}
            onEnd={end}
            onStep={(offset) => {
              if (!session.current && index + offset >= 0 && index + offset < rows.length) void save(moveTimelineItem(rows, index, index + offset));
            }}
          />
        ) : undefined;
        return (
          <Animated.View
            key={row.id}
            onLayout={(event) => { layouts.current.set(row.id, { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height }); }}
            style={{
              zIndex: drag?.id === row.id ? 2 : 0,
              elevation: drag?.id === row.id ? 6 : 0,
              opacity: drag && drag.id !== row.id ? 0.75 : 1,
              transform: [{ translateY: drag?.id === row.id ? translate : offset }],
              backgroundColor: drag?.id === row.id ? theme.surfaceTop : undefined,
              borderRadius: 18,
            }}
          >
            {renderRow(row, handle)}
          </Animated.View>
        );
      })}
    </View>
  );
}
