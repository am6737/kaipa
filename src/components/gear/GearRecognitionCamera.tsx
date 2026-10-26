// GearRecognitionCamera.tsx — full-screen viewfinder for 拍照识别 in the add
// gear form. It only captures or picks an image; recognition runs in the form.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { useI18n } from '../../i18n';

export function GearRecognitionCamera({ onCancel, onImage }: { onCancel: () => void; onImage: (asset: ImagePicker.ImagePickerAsset) => void }) {
  const { t } = useI18n();
  const { top, bottom } = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const frameSize = Math.min(Dimensions.get('window').width - 56, 320);

  const takePhoto = async () => {
    setError('');
    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) setError(t('gear.editor.cameraPermission'));
      return;
    }
    if (!cameraRef.current) return;
    setBusy(true);
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 0.65, base64: true });
      if (result?.uri) onImage({ uri: result.uri, base64: result.base64, mimeType: 'image/jpeg' } as ImagePicker.ImagePickerAsset);
    } catch {
      setError(t('gear.add.imageReadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const choosePhoto = async () => {
    setError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(t('gear.editor.libraryPermission'));
      return;
    }
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.65, base64: true });
      if (!result.canceled) onImage(result.assets[0]);
    } catch {
      setError(t('gear.add.imageReadFailed'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!permission) void requestPermission();
  }, [permission, requestPermission]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0B0C0E' }]}>
      {permission?.granted ? <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" /> : null}
      <View style={{ paddingTop: top + 6, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Press accessibilityRole="button" accessibilityLabel={t('gear.add.cancel')} onPress={onCancel} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" color="#FFFFFF" size={22} strokeWidth={2.2} /></Press>
        <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>{t('gear.add.photoRecognize')}</Text>
        <View style={{ width: 44 }} />
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 120 }}>
        <View style={{ width: frameSize, height: frameSize }}>
          <ScanCorners color="#FFFFFF" />
        </View>
        {error ? <Text style={{ marginTop: 12, paddingHorizontal: 28, textAlign: 'center', fontSize: 13, lineHeight: 19, color: '#FFB4AB' }}>{error}</Text> : null}
      </View>
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: Math.max(bottom, 20) + 18, alignItems: 'center' }}>
        <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Press accessibilityLabel={t('gear.add.choosePhoto')} onPress={busy ? undefined : choosePhoto} style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(78,78,78,0.82)' }}><Icon name="photo" color="#FFFFFF" size={22} /></Press>
          <Press accessibilityLabel={t('gear.add.takePhoto')} onPress={busy ? undefined : takePhoto} style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF' }} />}</Press>
          <View style={{ width: 52 }} />
        </View>
      </View>
    </View>
  );
}

function ScanCorners({ color }: { color: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Path d="M 20 4 H 13 Q 4 4 4 13 V 20" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M 80 4 H 87 Q 96 4 96 13 V 20" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M 4 80 V 87 Q 4 96 13 96 H 20" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M 96 80 V 87 Q 96 96 87 96 H 80" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
