const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// 让 node 能直接 require 项目里的 .ts 源码（同 test-admin-inbox-model.cjs）。
require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  filename,
);

const SRC = path.join(__dirname, '..', 'src');
const SDK = 'doopush-react-native-sdk';

// ---------------------------------------------------------------- 静态门槛
// 顶层 import SDK = Metro 把它变成模块体开头的 require，缺原生模块时
// requireNativeModule 会在求值阶段抛，App 直接 [runtime not ready]。
// 所以 src 里任何文件都不许静态 import 它，只能走 getDooPush() 的惰性 require。
function staticViolations(dir) {
  const hits = [];
  const importRe = /^\s*import[^\n]*from\s+['"]doopush-react-native-sdk['"]/m;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { hits.push(...staticViolations(full)); continue; }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    const source = fs.readFileSync(full, 'utf8');
    if (importRe.test(source) && !/^\s*import\s+type\s/.test(source)) hits.push(path.relative(SRC, full));
  }
  return hits;
}
assert.deepEqual(staticViolations(SRC), [], 'src 里仍有顶层 import doopush-react-native-sdk，缺模块时会红屏');

// ---------------------------------------------------------------- 运行时桩
const state = { nativePresent: true, sdkRequired: false, logs: [] };
const fakeDooPush = {
  configure: () => {},
  getDeviceToken: async () => 'token-1',
  getDeviceId: async () => 'device-1',
  register: async () => ({ token: 'token-9', deviceId: 'device-9', vendor: 'apns' }),
};
const stubs = {
  'expo-modules-core': () => ({ requireOptionalNativeModule: () => (state.nativePresent ? {} : null) }),
  // __importDefault 会把非 ESM 桩包一层，所以这里直接给模块本体的形状。
  'expo-constants': () => ({ expoConfig: { extra: { doopush: { appId: 'app-id', appKey: 'app-key' } } } }),
  'expo-network': () => ({ getNetworkStateAsync: async () => ({ isConnected: true, isInternetReachable: true }) }),
  'react-native': () => ({ Platform: { OS: 'ios', Version: 34 } }),
  // 缺原生模块时 SDK 被 require 就会抛，跟真机 requireNativeModule 行为一致：
  // 静态 import 的文件因此必须在求值阶段就崩（原红屏）。
  [SDK]: () => {
    if (!state.nativePresent) throw new Error("Cannot find native module 'DooPushReactNativeSDK'");
    state.sdkRequired = true;
    return { DooPush: fakeDooPush };
  },
};
const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (stubs[request]) return stubs[request]();
  return realLoad.call(this, request, parent, isMain);
};

const realConsole = global.console;
global.console = {
  ...realConsole,
  log: (...a) => state.logs.push(['log', a]),
  warn: (...a) => state.logs.push(['warn', a]),
  error: (...a) => state.logs.push(['error', a]),
};

// 先取惰性加载器再取注册模块：后者的 './doopushNative' 复用同一实例，探测缓存才连得上。
function loadPair() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(SRC)) delete require.cache[key];
  }
  const native = require(path.join(SRC, 'lib/doopushNative.ts'));
  const register = require(path.join(SRC, 'lib/doopushRegister.ts'));
  return { native, register };
}

(async () => {
  // ① 缺原生模块（旧安装包 / Expo Go）：求值不碰 SDK，App 能起，注册带明确错误停用。
  state.nativePresent = false; state.sdkRequired = false; state.logs = [];
  let native, register;
  assert.doesNotThrow(() => { ({ native, register } = loadPair()); },
    '缺原生模块时加载推送代码就崩了（旧 dev 包的 [runtime not ready] 红屏）');
  assert.equal(native.hasDooPushNative(), false, '缺模块时 hasDooPushNative 应为 false');
  assert.equal(state.sdkRequired, false, '缺原生模块时不该 require SDK（它的顶层 requireNativeModule 会抛）');
  assert.ok(
    state.logs.some(([level, args]) => level === 'error' && String(args[0]).includes('DooPushReactNativeSDK')),
    '缺模块必须留下可查的 console.error',
  );
  await assert.rejects(() => register.safeDooPushRegister(), /不含 DooPush 原生模块/);
  assert.equal(state.sdkRequired, false, '注册路径同样不得加载 SDK');

  // ② 有原生模块：惰性取到 SDK，走缓存注册。
  state.nativePresent = true; state.sdkRequired = false; state.logs = [];
  ({ native, register } = loadPair());
  assert.equal(state.sdkRequired, false, '没用到 SDK 时不应提前加载');
  assert.equal(native.hasDooPushNative(), true, '有原生模块时 hasDooPushNative 应为 true');
  assert.equal(state.sdkRequired, true, '有原生模块时应惰性加载 SDK');
  const cached = await register.safeDooPushRegister();
  assert.deepEqual({ token: cached.token, deviceId: cached.deviceId }, { token: 'token-1', deviceId: 'device-1' },
    'native 已有 token+deviceId 时应复用缓存，不再 register');

  // ③ 缓存为空时才真正 register。
  state.nativePresent = true; state.logs = [];
  fakeDooPush.getDeviceToken = async () => null;
  fakeDooPush.getDeviceId = async () => null;
  ({ native, register } = loadPair());
  const fresh = await register.safeDooPushRegister();
  assert.equal(fresh.deviceId, 'device-9', '无缓存时应走 native register');

  global.console = realConsole;
  Module._load = realLoad;
  console.log('PASS: 缺 DooPush 原生模块不再红屏（求值不碰 SDK、注册带明确错误停用）；模块存在时惰性加载并按缓存/注册两条路径工作。');
})().catch((e) => { realConsole.error(e); process.exit(1); });
