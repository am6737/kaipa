import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { File as FSFile } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { buildTrackData, computeStats, parseTrack, snapWaypoints } from '../../lib/trackParser';
import { extractKmlFromKmz } from '../../lib/kmz';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { useData } from '../../data/DataContext';
import { uploadMedia } from '../../lib/storage';
import { Press } from '../Press';
import { motion, radius, space, type } from '../../design-system';

type SelectedTrackFile = {
  name: string;
  uri: string;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export function JourneyTrackUploadSheet({ theme, journeyId, replacing, onClose }: { theme: Theme; journeyId: string; replacing: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const nav = useNav();
  const { userId } = useData();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [selectedFile, setSelectedFile] = useState<SelectedTrackFile | null>(null);
  const [loading, setLoading] = useState(false);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(windowHeight)).current;
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: motion.standard,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        bounciness: 0,
        speed: 18,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, translateY]);

  const close = (ignoreLoading = false) => {
    if ((!ignoreLoading && loading) || closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: motion.quick,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: windowHeight,
        duration: motion.standard,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => onCloseRef.current());
  };

  const chooseFile = async () => {
    try {
      const result = await FSFile.pickFileAsync({ mimeTypes: '*/*' });
      if (result.canceled || !result.result) return;

      const filename = result.result.name || '';
      const ext = (filename.split('.').pop() || '').toLowerCase();
      if (ext !== 'gpx' && ext !== 'kml' && ext !== 'kmz') {
        nav.showToast(t('record.track.errFormat'));
        return;
      }
      setSelectedFile(result.result);
    } catch (error) {
      console.warn('[JourneyTrackUpload] file picker error:', error);
      nav.showToast(t('record.track.errParse'));
    }
  };

  const uploadTrack = async () => {
    if (!selectedFile) return;

    setLoading(true);
    try {
      const filename = selectedFile.name || '';
      const ext = (filename.split('.').pop() || '').toLowerCase();
      let text: string;
      let parseFilename = filename;
      if (ext === 'kmz') {
        const buffer = await selectedFile.arrayBuffer();
        const kml = extractKmlFromKmz(new Uint8Array(buffer));
        if (!kml) {
          nav.showToast(t('record.track.errParse'));
          return;
        }
        text = kml;
        parseFilename = filename.replace(/\.kmz$/i, '.kml');
      } else {
        text = await selectedFile.text();
      }

      const parsed = parseTrack(text, parseFilename, t as any);
      if (parsed.error || !parsed.points) {
        nav.showToast(parsed.error || t('record.track.errParse'));
        return;
      }

      const stats = computeStats(parsed.points);
      if (!stats) {
        nav.showToast(t('record.track.errParse'));
        return;
      }

      const trackFileUrl = await uploadMedia(selectedFile.uri, userId, journeyId);
      const { trackCoords, trackElevation, trackDurationMs, dist, asc } = buildTrackData(stats);
      const trackWaypoints = parsed.waypoints ? snapWaypoints(parsed.waypoints, stats) : undefined;
      nav.patchCurrent({
        trackCoords,
        trackElevation,
        trackDurationMs,
        trackWaypoints,
        dist,
        asc: asc || '—',
        trackFileUrl,
        trackFileName: filename,
      });
      close(true);
      nav.showToast(t('journey.track.uploadSuccess'));
    } catch (error) {
      console.warn('[JourneyTrackUpload] track parse error:', error);
      nav.showToast(t('record.track.errParse'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal transparent animationType="none" visible onRequestClose={() => close()} statusBarTranslucent>
      <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.34)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} />
        </Animated.View>
        <Animated.View
          style={{
            transform: [{ translateY }],
            paddingTop: space.sm,
            paddingHorizontal: space.lg,
            paddingBottom: Math.max(insets.bottom, space.md) + space.sm,
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            backgroundColor: theme.groupedBg,
          }}
        >
          <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: radius.pill, backgroundColor: theme.text3, opacity: 0.34 }} />

          <Text style={[type.pageTitle, { color: theme.text, fontSize: 28, lineHeight: 34, marginTop: space.lg }]}>{replacing ? t('journey.track.reuploadTitle') : t('journey.track.uploadTitle')}</Text>

          <Press
            onPress={chooseFile}
            disabled={loading}
            accessibilityRole="button"
            style={{
              minHeight: 116,
              marginTop: space.xl,
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              borderRadius: radius.feature,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              backgroundColor: theme.surfaceTop,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journey.track.fileLabel')}</Text>
              <Text numberOfLines={2} style={[type.body, { color: selectedFile ? theme.text2 : theme.text3, lineHeight: 21, marginTop: space.xs }]}>
                {selectedFile?.name || t('journey.track.filePlaceholder')}
              </Text>
            </View>
            <Text style={[type.body, { color: theme.text2, fontWeight: '700' }]}>{selectedFile ? t('journey.track.changeFile') : t('journey.track.selectFile')}</Text>
          </Press>

          <View
            style={{
              minHeight: 116,
              marginTop: space.sm,
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              borderRadius: radius.feature,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              backgroundColor: theme.surfaceTop,
              opacity: 0.52,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journey.track.drawTitle')}</Text>
              <Text style={[type.body, { color: theme.text3, lineHeight: 21, marginTop: space.xs }]}>{t('journey.track.drawDescription')}</Text>
            </View>
            <Text style={[type.body, { color: theme.text3, fontWeight: '700' }]}>{t('journey.track.comingSoon')}</Text>
          </View>

          <View style={{ height: space.xl }} />

          <Press
            onPress={uploadTrack}
            disabled={!selectedFile || loading}
            accessibilityRole="button"
            style={{
              height: 58,
              borderRadius: radius.pill,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: space.xs,
              backgroundColor: selectedFile ? theme.accent : theme.fieldSurface,
            }}
          >
            {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
            <Text style={[type.sectionTitle, { color: selectedFile ? '#FFFFFF' : theme.text3 }]}>
              {loading ? t('journey.track.reading') : replacing ? t('journey.track.replaceAction') : t('journey.track.uploadAction')}
            </Text>
          </Press>
        </Animated.View>
      </View>
    </Modal>
  );
}
