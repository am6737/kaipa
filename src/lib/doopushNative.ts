import { requireOptionalNativeModule } from 'expo-modules-core';

type DooPushApi = typeof import('doopush-react-native-sdk').DooPush;

// undefined = 还没探测过；null = 探测过且原生模块不存在。
let cached: DooPushApi | null | undefined;

/**
 * 惰性取 DooPush SDK，缺原生模块时返回 null（而不是抛）。
 *
 * 为什么不能写成顶层 import：SDK 入口 `build/DooPushModule.js` 在模块求值阶段就调
 * `requireNativeModule('DooPushReactNativeSDK')`，找不到直接抛 `Cannot find native module`。
 * 静态 import 会被 Metro 变成模块体开头的 require，所以抛错早于任何 useEffect 门槛——
 * 连 PushBootstrap 都渲染不到，整个 App 以 `[runtime not ready]` 红屏起不来。
 *
 * 「原生模块不存在」有两种正当来源：Expo Go（本来就不带这个 pod），以及安装包比 JS 旧的
 * 版本错配（例如 dev 变体的二进制是加推送原生依赖之前构建的）。两者都不该拖垮首页，
 * 所以这里探测一次，拿不到就让整条推送链路停用。
 *
 * 代价要记着：版本错配从红屏降级成一条 console.error。带凭据验证推送时先看这行日志，
 * 别把「App 起来了」当成「设备注册成功了」。
 */
export function getDooPush(): DooPushApi | null {
  if (cached === undefined) {
    if (requireOptionalNativeModule('DooPushReactNativeSDK')) {
      cached = (require('doopush-react-native-sdk') as typeof import('doopush-react-native-sdk')).DooPush;
    } else {
      cached = null;
      console.error(
        '[DooPush] 当前安装包不含 DooPushReactNativeSDK 原生模块，推送子系统已停用。'
        + '若这个版本刚加过推送原生依赖，说明跑的是旧二进制 → 重装 dev 变体（见 docs/push-notifications.md）。',
      );
    }
  }
  return cached;
}

export function hasDooPushNative(): boolean {
  return getDooPush() != null;
}
