import React, { useState } from 'react';
import { Alert, Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../../i18n';
import type { Theme } from '../../theme/theme';
import type { TimelineIncomingPath } from '../../data/timeline';
import type { JourneyStop } from '../../lib/journeyStops';
import { drawnAccessPath, importedAccessPath, usableIncomingPath } from '../../lib/journeyAccess';
import { pickTrackFiles, parseTrackFile } from '../../lib/trackImport';
import { buildTrackData } from '../../lib/trackParser';
import { measureTrack, type Coordinate } from '../../lib/routeSegments';
import { NativeMap, NATIVE_MAP_AVAILABLE } from '../maps/NativeMap';
import { useMapPresentation } from '../maps/MapPresentationContext';
import { Press } from '../Press';

export function JourneyAccessPathSheet({ theme, from, to, initial, onSave, onClose }: {
  theme: Theme; from: JourneyStop; to: JourneyStop; initial?: TimelineIncomingPath;
  onSave: (path: TimelineIncomingPath) => void; onClose: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { mapStyle, mapLabelsVisible } = useMapPresentation();
  const saved = usableIncomingPath(initial, from.rowId, from.coordinate, to.coordinate) ? initial : undefined;
  const [points, setPoints] = useState<Coordinate[]>(saved?.coordinates.slice(1, -1) ?? []);
  const [source, setSource] = useState<'drawn' | 'imported'>(saved?.source ?? 'drawn');
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState<Coordinate[] | null>(saved?.source === 'imported' ? saved!.coordinates : null);
  const path = source === 'imported' ? imported : drawnAccessPath(from.coordinate, to.coordinate, points);
  const preview = imported ?? [from.coordinate, ...points, to.coordinate];
  const tap = (point: Coordinate) => { setSource('drawn'); setImported(null); setPoints((current) => [...current, point]); };
  const pick = async () => {
    setBusy(true);
    try {
      const files = await pickTrackFiles();
      if (!files?.length) return;
      const parsed = await parseTrackFile(files[0], t);
      const sliced = importedAccessPath(from.coordinate, to.coordinate, buildTrackData(parsed.stats).trackCoords);
      if (!sliced) { Alert.alert(t('journey.timeline.accessImportMismatch')); return; }
      setSource('imported'); setImported(sliced); setPoints(sliced.slice(1, -1));
    } catch { Alert.alert(t('journey.timeline.accessImportFailed')); }
    finally { setBusy(false); }
  };
  const button = (label: string, action: () => void, disabled = false) => (
    <Press onPress={action} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={{ padding: 12, borderRadius: 16, backgroundColor: theme.fieldSurface, opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ color: theme.text, fontWeight: '600' }}>{label}</Text>
    </Press>
  );
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        {NATIVE_MAP_AVAILABLE ? <NativeMap style={StyleSheet.absoluteFill} interactive
          initialCenter={from.coordinate} initialZoom={14} initialFitCoordinates={[from.coordinate, to.coordinate]}
          initialPadding={[insets.top + 90, 32, insets.bottom + 250, 32]} mapStyle={mapStyle} showLabels={mapLabelsVisible}
          onPress={tap} onPoiPress={(poi) => tap(poi.coordinate)}
          markers={[
            { id: 'access-from', coordinate: from.coordinate, title: from.name, color: theme.accent },
            { id: 'access-to', coordinate: to.coordinate, title: to.name, color: theme.danger },
            ...points.map((coordinate, i) => ({ id: `access-${i}`, coordinate, color: theme.accent })),
          ]}
          polylines={points.length || imported ? [{ id: 'access-draft', coordinates: preview, color: theme.accent, width: 4, dashed: source === 'drawn' }] : []}
        /> : <Text style={{ color: theme.text2, marginTop: insets.top + 100, padding: 24 }}>{t('journey.timeline.trackMapUnavailable')}</Text>}
        <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
          {button(t('common.cancel'), onClose)}
          {button(t('common.save'), () => path && onSave({ fromRowId: from.rowId, coordinates: path, source }), !path || busy)}
        </View>
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: insets.bottom + 20, backgroundColor: theme.surfaceTop, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 10 }}>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 18 }}>{t('journey.timeline.accessTitle')}</Text>
          <Text style={{ color: theme.text2 }}>{from.name} → {to.name}</Text>
          <Text style={{ color: theme.text2 }}>{t('journey.timeline.accessDrawHint')}</Text>
          <Text style={{ color: theme.text2 }}>{source === 'drawn' ? t('journey.timeline.accessDrawn') : t('journey.timeline.accessImported')}{path ? ` · ${((measureTrack(path)?.totalMeters ?? 0) / 1000).toFixed(2)} km` : ''}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {button(t('journey.timeline.accessUndo'), () => { setImported(null); setSource('drawn'); setPoints((current) => current.slice(0, -1)); }, !points.length || busy)}
            {button(t('journey.timeline.accessImport'), () => { void pick(); }, busy)}
          </View>
        </View>
      </View>
    </Modal>
  );
}
