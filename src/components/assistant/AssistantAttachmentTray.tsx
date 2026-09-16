import { File as FSFile } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Camera, Check, FileText, Images } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { radius, space } from '../../design-system';
import type { Theme } from '../../theme/theme';
import { Press } from '../Press';

export type LocalAgentAttachment = {
  id: string;
  kind: 'image' | 'file';
  name: string;
  uri: string;
  mimeType: string;
  size?: number;
};

const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

function imageMime(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  return 'image/jpeg';
}

function attachmentId(prefix: string, uri: string) {
  return `${prefix}:${uri}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function AssistantAttachmentTray({
  theme,
  selected,
  labels,
  onChange,
  onError,
}: {
  theme: Theme;
  selected: LocalAgentAttachment[];
  labels: { camera: string; library: string; file: string; recent: string; permission: string; tooMany: string; tooLarge: string; failed: string };
  onChange: (attachments: LocalAgentAttachment[]) => void;
  onError: (message: string) => void;
}) {
  const { width } = useWindowDimensions();
  const [recent, setRecent] = useState<MediaLibrary.Asset[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [endCursor, setEndCursor] = useState<string>();
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const selectingAssetRef = useRef(false);
  const tileSize = Math.floor((width - space.lg * 2 - space.sm * 2 - 9) / 4);
  const selectedIds = useMemo(() => new Set(selected.map((attachment) => attachment.id)), [selected]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
        if (!permission.granted) {
          if (active) onError(labels.permission);
          return;
        }
        const result = await MediaLibrary.getAssetsAsync({
          first: 60,
          mediaType: MediaLibrary.MediaType.photo,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });
        if (active) {
          setRecent(result.assets);
          setEndCursor(result.endCursor);
          setHasNextPage(result.hasNextPage);
        }
      } catch {
        if (active) onError(labels.failed);
      } finally {
        if (active) setLoadingRecent(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [labels.failed, labels.permission, onError]);

  const loadMore = async () => {
    if (!hasNextPage || !endCursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const result = await MediaLibrary.getAssetsAsync({
        first: 60,
        after: endCursor,
        mediaType: MediaLibrary.MediaType.photo,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      setRecent((current) => [...current, ...result.assets]);
      setEndCursor(result.endCursor);
      setHasNextPage(result.hasNextPage);
    } catch {
      onError(labels.failed);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  const append = (attachments: LocalAgentAttachment[]) => {
    const valid = attachments.filter((attachment) => !attachment.size || attachment.size <= MAX_ATTACHMENT_BYTES);
    if (valid.length !== attachments.length) onError(labels.tooLarge);
    const available = MAX_ATTACHMENTS - selected.length;
    if (valid.length > available) onError(labels.tooMany);
    onChange([...selected, ...valid.slice(0, Math.max(0, available))]);
  };

  const takePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return onError(labels.permission);
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled) return;
      append(result.assets.map((asset) => ({
        id: attachmentId('camera', asset.uri),
        kind: 'image' as const,
        name: asset.fileName || `photo-${Date.now()}.jpg`,
        uri: asset.uri,
        mimeType: asset.mimeType || imageMime(asset.fileName || ''),
        size: asset.fileSize,
      })));
    } catch {
      onError(labels.failed);
    }
  };

  const pickLibrary = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return onError(labels.permission);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, MAX_ATTACHMENTS - selected.length),
        quality: 0.8,
      });
      if (result.canceled) return;
      append(result.assets.map((asset) => ({
        id: attachmentId('library', asset.uri),
        kind: 'image' as const,
        name: asset.fileName || `photo-${Date.now()}.jpg`,
        uri: asset.uri,
        mimeType: asset.mimeType || imageMime(asset.fileName || ''),
        size: asset.fileSize,
      })));
    } catch {
      onError(labels.failed);
    }
  };

  const pickFile = async () => {
    try {
      const result = await FSFile.pickFileAsync({
        multipleFiles: true,
        mimeTypes: [
          'application/pdf',
          'text/*',
          'application/json',
          'application/xml',
          'application/gpx+xml',
          'application/vnd.google-earth.kml+xml',
          'application/vnd.google-earth.kmz',
          'application/zip',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
      });
      if (result.canceled) return;
      append(result.result.map((file) => ({
        id: attachmentId('file', file.uri),
        kind: 'file' as const,
        name: file.name,
        uri: file.uri,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
      })));
    } catch {
      onError(labels.failed);
    }
  };

  const toggleRecent = async (asset: MediaLibrary.Asset) => {
    const id = `media:${asset.id}`;
    if (selectedIds.has(id)) {
      onChange(selected.filter((attachment) => attachment.id !== id));
      return;
    }
    if (selected.length >= MAX_ATTACHMENTS) return onError(labels.tooMany);
    if (selectingAssetRef.current) return;
    selectingAssetRef.current = true;
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset.id, { shouldDownloadFromNetwork: false });
      if (!info.localUri) throw new Error('Asset is not available locally');
      append([{
        id,
        kind: 'image',
        name: asset.filename || `photo-${asset.id}.jpg`,
        uri: info.localUri,
        mimeType: imageMime(asset.filename),
      }]);
    } catch {
      onError(labels.failed);
    } finally {
      selectingAssetRef.current = false;
    }
  };

  const actions = [
    { key: 'camera', label: labels.camera, icon: Camera, onPress: takePhoto },
    { key: 'library', label: labels.library, icon: Images, onPress: pickLibrary },
    { key: 'file', label: labels.file, icon: FileText, onPress: pickFile },
  ];

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.controlSurface,
          boxShadow: theme.dark
            ? '0px 8px 24px rgba(0,0,0,0.34)'
            : '0px 8px 24px rgba(0,0,0,0.09)',
        },
      ]}
    >
      <View style={styles.actions}>
        {actions.map((action) => {
          const ActionIcon = action.icon;
          return (
            <Press
              key={action.key}
              onPress={() => void action.onPress()}
              scaleTo={0.98}
              accessibilityRole="button"
              style={[styles.action, { backgroundColor: theme.fieldSurface }]}
            >
              <ActionIcon size={21} color={theme.text} strokeWidth={1.9} />
              <Text style={[styles.actionLabel, { color: theme.text }]}>{action.label}</Text>
            </Press>
          );
        })}
      </View>
      <Text style={[styles.recentLabel, { color: theme.text }]}>{labels.recent}</Text>
      {loadingRecent ? (
        <View style={styles.loading}><ActivityIndicator color={theme.text2} /></View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.grid}
          scrollEventThrottle={80}
          onScroll={({ nativeEvent }) => {
            if (nativeEvent.layoutMeasurement.height + nativeEvent.contentOffset.y >= nativeEvent.contentSize.height - tileSize) void loadMore();
          }}
        >
          {recent.map((asset) => {
            const id = `media:${asset.id}`;
            const isSelected = selectedIds.has(id);
            return (
              <Pressable key={asset.id} onPress={() => void toggleRecent(asset)} style={{ width: tileSize, height: tileSize }}>
                <Image source={{ uri: asset.uri }} contentFit="cover" style={styles.photo} />
                {isSelected ? (
                  <View style={[styles.check, { backgroundColor: theme.accent }]}>
                    <Check size={13} color="#FFFFFF" strokeWidth={3} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
          {loadingMore ? <View style={[styles.moreLoading, { width: tileSize }]}><ActivityIndicator size="small" color={theme.text2} /></View> : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { height: 306, marginTop: space.sm, marginHorizontal: space.lg, paddingHorizontal: space.sm, paddingTop: space.sm, borderRadius: radius.feature, overflow: 'hidden' },
  actions: { height: 82, flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  action: { flex: 1, minWidth: 0, height: 68, borderRadius: radius.feature, paddingHorizontal: space.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  actionLabel: { fontSize: 13, lineHeight: 17, fontWeight: '700', letterSpacing: 0 },
  recentLabel: { marginBottom: space.xs, fontSize: 14, lineHeight: 19, fontWeight: '700', letterSpacing: 0 },
  loading: { height: 180, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, paddingBottom: space.md },
  photo: { width: '100%', height: '100%', borderRadius: 4 },
  check: { position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  moreLoading: { height: 60, alignItems: 'center', justifyContent: 'center' },
});
