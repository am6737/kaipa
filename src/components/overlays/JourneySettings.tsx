import React, { useMemo, useState } from 'react';
import { View, Text, Switch, StyleSheet, Alert, Linking } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Theme } from '../../theme/theme';
import { Poi } from '../../data/pois';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { PhotoTile } from '../PhotoTile';
import { FullOverlay } from './FullOverlay';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import type { JourneyPatch } from '../../nav/NavContext';
import { uploadCover } from '../../lib/storage';
import { supabase } from '../../lib/supabase';

function Section({ theme, title, footer, children }: { theme: Theme; title?: string; footer?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 24 }}>
      {title ? (
        <Text style={{ fontSize: 13, fontWeight: '500', color: theme.text3, marginBottom: 8, marginLeft: 16 }}>{title}</Text>
      ) : null}
      <View
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: theme.dark ? '#1c1c1e' : '#fff',
        }}
      >
        {children}
      </View>
      {footer ? <Text style={{ fontSize: 13, color: theme.text3, lineHeight: 18, marginTop: 8, marginLeft: 16, marginRight: 16 }}>{footer}</Text> : null}
    </View>
  );
}

function Row({
  theme,
  label,
  value,
  trailing,
  onPress,
  last,
  indent,
  danger,
}: {
  theme: Theme;
  label: string;
  value?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
  indent?: boolean;
  danger?: boolean;
}) {
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: indent ? 32 : 16, paddingRight: 16, paddingVertical: 12, minHeight: 48 }}>
      <Text style={{ fontSize: 16, color: danger ? theme.danger : theme.text, flex: value ? undefined : 1 }}>{label}</Text>
      {value ? (
        <Text style={{ flex: 1, fontSize: 16, color: theme.text2, textAlign: 'right', marginLeft: 12 }} numberOfLines={1}>{value}</Text>
      ) : null}
      {trailing ? <View style={{ marginLeft: 12, flexShrink: 0 }}>{trailing}</View> : null}
    </View>
  );
  return (
    <>
      {onPress ? <Press onPress={onPress}>{body}</Press> : body}
      {!last ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: indent ? 32 : 16 }} /> : null}
    </>
  );
}

export function JourneySettings({
  theme,
  poi,
  onClose,
  onToast,
  onEdit,
}: {
  theme: Theme;
  poi: Poi;
  onClose: () => void;
  onToast: (msg: string) => void;
  onEdit: () => void;
}) {
  const { t } = useI18n();
  const nav = useNav();
  const [coverUri, setCoverUri] = useState<string | null>(poi.photoUris?.[0] ?? null);
  const [linkOn, setLinkOn] = useState(true);
  const [allowUpload, setAllowUpload] = useState(true);
  const [moderate, setModerate] = useState(false);
  const [inviteVisible, setInviteVisible] = useState(true);
  const [trackPublic, setTrackPublic] = useState(poi.trackPublic ?? false);
  const [routeShowPhotos, setRouteShowPhotos] = useState(poi.routeShowPhotos ?? true);
  const [routeShowTimeline, setRouteShowTimeline] = useState(poi.routeShowTimeline ?? true);

  const hasTrack = !!poi.trackCoords && poi.trackCoords.length > 0;
  const showTrackOptions = hasTrack;

  const shareInfo = useMemo(() => {
    const slug = (poi.name || 'kaipa').replace(/\s+/g, '').slice(0, 8);
    let h = 0;
    for (let i = 0; i < poi.name.length; i++) h = (h << 5) - h + poi.name.charCodeAt(i);
    h = h | 0;
    const code = String(1000 + (Math.abs(h) % 9000));
    const base = process.env.EXPO_PUBLIC_WEB_URL || 'https://kaipa.app';
    return { slug, code, fullUrl: `${base}/j/${slug}-${code}` };
  }, [poi.name]);

  const previewGuest = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('journey_shares').upsert(
          { journey_id: poi.id, user_id: user.id, slug: shareInfo.slug, code: shareInfo.code, active: true },
          { onConflict: 'slug,code' },
        );
      }
    } catch {}
    Linking.openURL(shareInfo.fullUrl);
  };

  const handleTrackPublic = (v: boolean) => {
    setTrackPublic(v);
    const patch: JourneyPatch = { trackPublic: v, routeShowPhotos, routeShowTimeline };
    if (poi.trackCoords) patch.trackCoords = poi.trackCoords;
    if (poi.trackElevation) patch.trackElevation = poi.trackElevation;
    if (poi.trackDurationMs) patch.trackDurationMs = poi.trackDurationMs;
    if (poi.photoUris) patch.photoUris = poi.photoUris;
    nav.patchCurrent(patch);
  };
  const handleRouteShowPhotos = (v: boolean) => { setRouteShowPhotos(v); nav.patchCurrent({ routeShowPhotos: v }); };
  const handleRouteShowTimeline = (v: boolean) => { setRouteShowTimeline(v); nav.patchCurrent({ routeShowTimeline: v }); };

  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert(t('journey.photoWall.needLibraryPerm')); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled && res.assets?.[0]) {
      const localUri = res.assets[0].uri;
      setCoverUri(localUri);
      try {
        const publicUrl = await uploadCover(localUri, poi.id);
        const rest = poi.photoUris?.slice(1) ?? [];
        nav.patchCurrent({ photoUris: [publicUrl, ...rest] });
      } catch (error) {
        console.warn('[JourneySettings] cover upload failed:', error);
        setCoverUri(poi.photoUris?.[0] ?? null);
        onToast(t('journey.timeline.uploadFailedMessage'));
      }
    }
  };

  const removeCover = () => {
    setCoverUri(null);
    const rest = poi.photoUris?.slice(1) ?? [];
    nav.patchCurrent({ photoUris: rest.length ? rest : [] });
  };

  const handleCoverPress = () => {
    if (coverUri) {
      Alert.alert(t('journey.settings.coverSection'), undefined, [
        { text: t('journey.settings.changeCover'), onPress: pickCover },
        { text: t('journey.settings.removeCover'), style: 'destructive', onPress: removeCover },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
    } else {
      pickCover();
    }
  };


  return (
    <FullOverlay theme={theme} title={t('journey.settings.title')} onClose={onClose} zIndex={150}>
      <View style={{ paddingBottom: 16 }}>

        {/* Banner cover */}
        <Press onPress={handleCoverPress} style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 24 }}>
          <View style={{ height: 200, borderRadius: 14, overflow: 'hidden' }}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <PhotoTile tone={poi.tone} seed={poi.name + 'cover'} style={StyleSheet.absoluteFill} />
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.5)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={{ position: 'absolute', left: 16, right: 16, bottom: 12 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#fff', letterSpacing: -0.3 }} numberOfLines={1}>
                {poi.name}
              </Text>
              {poi.region ? (
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 3 }} numberOfLines={1}>
                  {poi.region}
                </Text>
              ) : null}
            </View>
            <View style={{
              position: 'absolute', right: 10, bottom: 10,
              width: 30, height: 30, borderRadius: 15,
              backgroundColor: 'rgba(0,0,0,0.35)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="camera" color="#fff" size={15} />
            </View>
          </View>
        </Press>

        {/* Journey info */}
        <Section theme={theme} title={t('journey.settings.infoSection')}>
          <Row theme={theme} label={t('journeyEdit.fieldName')} value={poi.name} onPress={onEdit} trailing={<Icon name="chevronR" color={theme.text3} size={14} />} />
          <Row
            theme={theme}
            label={t('journeyEdit.fieldRegion')}
            value={poi.region || '—'}
            onPress={onEdit}
            trailing={<Icon name="chevronR" color={theme.text3} size={14} />}
            last={!(poi.date || poi.days)}
          />
          {poi.date || poi.days ? (
            <Row
              theme={theme}
              label={t('journeyEdit.fieldDate')}
              value={[poi.date, poi.days].filter(Boolean).join(' · ') || '—'}
              onPress={onEdit}
              trailing={<Icon name="chevronR" color={theme.text3} size={14} />}
              last
            />
          ) : null}
        </Section>

        {/* Permissions */}
        <Section theme={theme} title={t('journey.settings.permSection')} footer={t('journey.settings.shareFooter')}>
          <Row theme={theme} label={t('journey.settings.enableLink')} trailing={<Switch value={linkOn} onValueChange={setLinkOn} />} last={!linkOn} />
          {linkOn ? (
            <>
              <Row theme={theme} label={t('journey.settings.allowUpload')} trailing={<Switch value={allowUpload} onValueChange={setAllowUpload} />} />
              <Row theme={theme} label={t('journey.settings.moderate')} trailing={<Switch value={moderate} onValueChange={setModerate} />} last />
            </>
          ) : null}
        </Section>

        {/* Visibility */}
        <Section theme={theme} title={t('journey.settings.visibilitySection')} footer={t('journey.settings.visibilityFooter')}>
          <Row theme={theme} label={t('journey.settings.inviteOnly')} trailing={<Switch value={inviteVisible} onValueChange={setInviteVisible} />} last={!showTrackOptions} />
          {showTrackOptions ? (
            <>
              <Row
                theme={theme}
                label={t('journey.settings.trackPublic')}
                trailing={<Switch value={trackPublic} onValueChange={handleTrackPublic} />}
                last={!trackPublic}
              />
              {trackPublic ? (
                <>
                  <Row
                    theme={theme}
                    label={t('journey.settings.routeShowPhotos')}
                    trailing={<Switch value={routeShowPhotos} onValueChange={handleRouteShowPhotos} />}
                    indent
                  />
                  <Row
                    theme={theme}
                    label={t('journey.settings.routeShowTimeline')}
                    trailing={<Switch value={routeShowTimeline} onValueChange={handleRouteShowTimeline} />}
                    indent
                    last
                  />
                </>
              ) : null}
            </>
          ) : null}
        </Section>

        {/* Actions */}
        <Section theme={theme}>
          <Row
            theme={theme}
            label={t('journey.settings.previewGuest')}
            onPress={previewGuest}
            trailing={<Icon name="chevronR" color={theme.text3} size={14} />}
            last
          />
        </Section>
      </View>
    </FullOverlay>
  );
}
