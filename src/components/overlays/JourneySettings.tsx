import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Theme } from '../../theme/theme';
import { Poi } from '../../data/pois';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { uploadCover } from '../../lib/storage';
import { DetailPage, radius, space, type } from '../../design-system';
import { MediaViewer } from './JourneyTimeline';

function SectionLabel({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 16, lineHeight: 22, fontWeight: '700', color: theme.text3, marginBottom: space.sm }}>
      {children}
    </Text>
  );
}

function FieldCard({
  theme,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  theme: Theme;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <View
      style={{
        minHeight: multiline ? 116 : 78,
        borderRadius: radius.feature,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.hairline,
        backgroundColor: theme.surfaceTop,
        justifyContent: multiline ? 'flex-start' : 'center',
        paddingHorizontal: space.lg,
        paddingVertical: multiline ? space.md : 0,
      }}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.text3}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        maxLength={multiline ? 280 : 48}
        style={{
          minHeight: multiline ? 82 : undefined,
          fontSize: multiline ? 16 : 18,
          lineHeight: multiline ? 23 : undefined,
          fontWeight: multiline ? '400' : '700',
          color: theme.text,
          paddingVertical: 0,
        }}
      />
    </View>
  );
}

function ToggleCard({
  theme,
  label,
  sub,
  value,
  onChange,
}: {
  theme: Theme;
  label: string;
  sub?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View
      style={{
        minHeight: 78,
        borderRadius: radius.feature,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.hairline,
        backgroundColor: theme.surfaceTop,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <Press onPress={() => onChange(!value)} scaleTo={1} opacityTo={1} style={{ flex: 1, paddingRight: space.md }}>
        <Text style={{ fontSize: 17, fontWeight: '600', color: theme.text }}>{label}</Text>
        {sub ? <Text style={[type.caption, { color: theme.text3, lineHeight: 18, marginTop: space.xxs }]}>{sub}</Text> : null}
      </Press>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.progressTrack, true: theme.accent }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={theme.progressTrack}
      />
    </View>
  );
}

function CoverTile({
  theme,
  uri,
  onPreview,
  onReplace,
}: {
  theme: Theme;
  uri: string | null;
  onPreview: () => void;
  onReplace: () => void;
}) {
  return (
    <View style={{ width: 112, height: 112 }}>
      <Press onPress={uri ? onPreview : onReplace} style={StyleSheet.absoluteFill}>
        <View
          style={{
            flex: 1,
            borderRadius: 22,
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.hairline,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.fieldSurface,
          }}
        >
          {uri ? (
            <>
              <Image source={{ uri }} contentFit="cover" style={StyleSheet.absoluteFill} />
            </>
          ) : (
            <Icon name="plus" color={theme.text3} size={32} strokeWidth={1.5} />
          )}
        </View>
      </Press>
      {uri ? (
        <Press
          accessibilityRole="button"
          onPress={onReplace}
          style={{
            position: 'absolute',
            right: space.xs,
            bottom: space.xs,
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.52)',
          }}
        >
          <Icon name="camera" color="#FFFFFF" size={16} />
        </Press>
      ) : null}
    </View>
  );
}

export function JourneySettings({
  theme,
  poi,
  onClose,
  onToast,
}: {
  theme: Theme;
  poi: Poi;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const { t } = useI18n();
  const nav = useNav();
  const originalPhotos = useMemo(() => poi.photoUris ?? [], [poi.photoUris]);
  const [selectedCover, setSelectedCover] = useState<string | null>(originalPhotos[0] ?? null);
  const [name, setName] = useState(poi.name);
  const [region, setRegion] = useState(poi.region);
  const [desc, setDesc] = useState(poi.desc ?? '');
  const [trackPublic, setTrackPublic] = useState(poi.trackPublic ?? false);
  const [routeShowPhotos, setRouteShowPhotos] = useState(poi.routeShowPhotos ?? true);
  const [routeShowTimeline, setRouteShowTimeline] = useState(poi.routeShowTimeline ?? true);
  const [saving, setSaving] = useState(false);
  const [coverViewerOpen, setCoverViewerOpen] = useState(false);
  const hasTrack = (poi.trackCoords?.length ?? 0) > 0;
  const hasChanges = useMemo(
    () =>
      selectedCover !== (originalPhotos[0] ?? null) ||
      name !== poi.name ||
      region !== poi.region ||
      desc !== (poi.desc ?? '') ||
      trackPublic !== (poi.trackPublic ?? false) ||
      routeShowPhotos !== (poi.routeShowPhotos ?? true) ||
      routeShowTimeline !== (poi.routeShowTimeline ?? true),
    [
      desc,
      name,
      originalPhotos,
      poi.desc,
      poi.name,
      poi.region,
      poi.routeShowPhotos,
      poi.routeShowTimeline,
      poi.trackPublic,
      region,
      routeShowPhotos,
      routeShowTimeline,
      selectedCover,
      trackPublic,
    ],
  );

  const pickCover = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('journey.photoWall.needLibraryPerm'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.82 });
    const uri = !result.canceled ? result.assets?.[0]?.uri : undefined;
    if (!uri) return;
    setSelectedCover(uri);
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      onToast(t('record.hero.nameRequired'));
      return;
    }

    setSaving(true);
    try {
      let resolvedCover = selectedCover;
      if (resolvedCover && !originalPhotos.includes(resolvedCover)) {
        resolvedCover = await uploadCover(resolvedCover, poi.id);
      }
      const remainingPhotos = originalPhotos.filter((uri) => uri !== selectedCover && uri !== resolvedCover);
      nav.patchCurrent({
        name: trimmedName,
        region: region.trim(),
        desc: desc.trim(),
        trackPublic,
        routeShowPhotos,
        routeShowTimeline,
        photoUris: resolvedCover ? [resolvedCover, ...remainingPhotos] : originalPhotos.slice(1),
      });
      onToast(t('appShell.toastJourneyUpdated'));
      onClose();
    } catch (error) {
      console.warn('[JourneySettings] save failed:', error);
      onToast(t('journey.timeline.uploadFailedMessage'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    nav.openActionSheet({
      title: t('journey.settings.deleteConfirmTitle'),
      message: t('journey.remove.confirmMessage'),
      items: [
        {
          label: t('journey.settings.deleteJourney'),
          destructive: true,
          onPress: () => nav.removeJourney(),
        },
      ],
    });
  };

  const saveButton = (
    <Press
      accessibilityRole="button"
      accessibilityLabel={t('common.save')}
      accessibilityState={{ disabled: !hasChanges || saving }}
      onPress={() => void save()}
      disabled={!hasChanges || saving}
      style={{
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.fieldBorder,
        backgroundColor: theme.controlSurface,
      }}
    >
      {saving ? (
        <ActivityIndicator size="small" color={theme.text} />
      ) : (
        <Icon
          name="check"
          color={hasChanges ? theme.text : theme.text3}
          size={20}
          strokeWidth={2.2}
        />
      )}
    </Press>
  );

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 190, backgroundColor: theme.groupedBg }]}>
      <DetailPage
        theme={theme}
        title={t('journey.settings.title')}
        onBack={onClose}
        right={saveButton}
        backgroundColor={theme.groupedBg}
        flatChrome
      >
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.lg }}>
        <View style={{ marginBottom: space.xxl }}>
          <SectionLabel theme={theme}>{t('journey.settings.customCover')}</SectionLabel>
          <CoverTile
            theme={theme}
            uri={selectedCover}
            onPreview={() => setCoverViewerOpen(true)}
            onReplace={() => void pickCover()}
          />
        </View>

        <View style={{ marginBottom: space.xxl }}>
          <SectionLabel theme={theme}>{t('journeyEdit.fieldName')}</SectionLabel>
          <FieldCard
            theme={theme}
            value={name}
            onChangeText={setName}
            placeholder={t('record.hero.namePlaceholder')}
          />
        </View>

        <View style={{ marginBottom: space.xxl }}>
          <SectionLabel theme={theme}>{t('journeyEdit.fieldRegion')}</SectionLabel>
          <FieldCard
            theme={theme}
            value={region}
            onChangeText={setRegion}
            placeholder={t('record.facts.locationPlaceholder')}
          />
        </View>

        <View style={{ marginBottom: space.xxl }}>
          <SectionLabel theme={theme}>{t('journeyEdit.sectionDesc')}</SectionLabel>
          <FieldCard
            theme={theme}
            value={desc}
            onChangeText={setDesc}
            placeholder={t('journeyEdit.descFooter')}
            multiline
          />
        </View>

        {hasTrack ? (
          <View style={{ marginBottom: space.xxl }}>
            <SectionLabel theme={theme}>{t('journey.settings.exploreSection')}</SectionLabel>
            <View style={{ gap: space.sm }}>
              <ToggleCard
                theme={theme}
                label={t('journey.settings.trackPublic')}
                sub={t('journey.settings.trackPublicSub')}
                value={trackPublic}
                onChange={setTrackPublic}
              />
              {trackPublic ? (
                <>
                  <ToggleCard
                    theme={theme}
                    label={t('journey.settings.routeShowPhotos')}
                    sub={t('journey.settings.routeShowPhotosSub')}
                    value={routeShowPhotos}
                    onChange={setRouteShowPhotos}
                  />
                  <ToggleCard
                    theme={theme}
                    label={t('journey.settings.routeShowTimeline')}
                    sub={t('journey.settings.routeShowTimelineSub')}
                    value={routeShowTimeline}
                    onChange={setRouteShowTimeline}
                  />
                </>
              ) : null}
            </View>
          </View>
        ) : null}

        <Press
          onPress={confirmDelete}
          style={{
            alignSelf: 'stretch',
            height: 72,
            marginTop: space.xs,
            marginBottom: space.xxxl,
            paddingHorizontal: space.lg,
            borderRadius: radius.feature,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.hairline,
            backgroundColor: theme.surfaceTop,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.sm,
          }}
        >
          <Icon name="trash" color={theme.danger} size={20} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.danger }}>{t('journey.settings.deleteJourney')}</Text>
        </Press>
      </View>
      </DetailPage>
      {coverViewerOpen && selectedCover ? (
        <MediaViewer
          theme={theme}
          media={[{ tone: poi.tone, uri: selectedCover }]}
          index={0}
          showTypeBadge={false}
          onClose={() => setCoverViewerOpen(false)}
          onDelete={() => {
            setSelectedCover(null);
            setCoverViewerOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}
