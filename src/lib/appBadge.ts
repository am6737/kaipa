import { Platform } from 'react-native';
import { clearDeliveredNotifications } from '../../modules/app-badge';
import { getDooPush } from './doopushNative';

// DooPush 的小米分支清角标是发一条空白通知（setNumber(0)），会在通知栏留一条空消息。
// MIUI 的角标跟着通知栏走，直接清通知就够了，所以小米不走 DooPush。
function isXiaomi() {
  if (Platform.OS !== 'android') return false;
  const manufacturer = (Platform.constants as { Manufacturer?: string }).Manufacturer ?? '';
  return manufacturer.toLowerCase() === 'xiaomi';
}

/**
 * 进入前台时清掉桌面角标和通知栏里本 App 的推送。
 *
 * 桌面角标只由推送投递改写（iOS 每条设为 1，华为/荣耀累加，原生 Android 和小米看通知栏），
 * App 不在前台时无从回写，没法和未读数对齐；打开 App 就算看过了，未读交给消息中心的红点。
 * 华为、荣耀、vivo、OPPO 的桌面自己记数，要靠 DooPush 去改；其余机型只认通知栏。
 */
export async function clearAppBadge(): Promise<void> {
  if (Platform.OS === 'web') return;
  const DooPush = getDooPush();
  if (DooPush && !isXiaomi()) {
    // Android 上 SDK 未 configure 时返回 false 而不抛，这里不依赖它的结果。
    await DooPush.clearBadge().catch((e) => console.warn('[appBadge] DooPush clearBadge failed:', e));
  }
  await clearDeliveredNotifications().catch((e) => console.warn('[appBadge] clear notifications failed:', e));
}
