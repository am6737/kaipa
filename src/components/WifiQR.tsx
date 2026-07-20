// WifiQR.tsx — renders a standard Wi-Fi network QR (the `WIFI:` MECARD-like
// payload). iOS Camera and Android cameras natively offer "Join network" when
// scanning it, so a guest can join the host's hotspot in one tap. Shared so the
// v1.5 BLE path can reuse the same payload/visual. Pure JS over the already-
// bundled react-native-qrcode-svg + react-native-svg — no new native module.
import React from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

/** Build the de-facto-standard Wi-Fi config string consumed by phone cameras. */
export function wifiQrPayload(ssid: string, password: string, hidden = false): string {
  const esc = (s: string) => (s || '').replace(/([\\;,:"])/g, '\\$1');
  return `WIFI:T:WPA;S:${esc(ssid)};P:${esc(password)};H:${hidden ? 'true' : 'false'};;`;
}

export function WifiQR({
  ssid,
  password,
  size = 200,
}: {
  ssid: string;
  password: string;
  size?: number;
}) {
  // QR must sit on a light surface to stay scannable even in dark mode.
  return (
    <View style={{ padding: 14, backgroundColor: '#fff', borderRadius: 18 }}>
      <QRCode value={wifiQrPayload(ssid, password)} size={size} color="#000" backgroundColor="#fff" />
    </View>
  );
}
