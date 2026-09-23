# Sign in with Apple（Kaipa iOS）

Kaipa 的 Apple 登录走 **iOS 原生 ID token 流程**：App 用 `expo-apple-authentication` 唤起系统面板拿到
`identityToken`，再交给 Supabase 的 `signInWithIdToken()` 换会话。这条路径**不需要** Apple Services ID、
`.p8` 私钥或 client secret —— GoTrue 只做 ID token 的签名与 audience 校验，因此服务端用占位 secret 即可。

相关代码：

| 位置 | 作用 |
| --- | --- |
| `src/lib/auth.ts` | `isAppleSignInAvailable()` / `signInWithApple()` / `isAppleSignInCanceled()` |
| `src/screens/AuthFlow.tsx` | 「更多登录方式」里的 Apple 行 + 登录中覆盖层 + 错误文案 |
| `app.json` | `expo.ios.bundleIdentifier`、`expo.ios.usesAppleSignIn` |
| `app.config.js` | `expo-apple-authentication` 插件（prebuild 写入 `com.apple.developer.applesignin` entitlement） |
| `infra/supabase/setup-kaipa-supabase.sh` | 生成运行时 compose 时写入 Apple provider 配置 |

## 关键约束：client_id = audience 白名单

Apple 签发的 `identityToken` 里 `aud` 是**发起登录的 App 的 bundle ID**，GoTrue 会拿它与
`GOTRUE_EXTERNAL_APPLE_CLIENT_ID` 比对，不匹配直接拒绝。该变量是 `[]string`（逗号分隔），当前值为：

```
com.hitosea.letsgo,com.hitosea.letsgo.dev,host.exp.Exponent
```

- `com.hitosea.letsgo` —— `expo.ios.bundleIdentifier`，正式包的 audience。
- `com.hitosea.letsgo.dev` —— **EAS dev build** 的 audience。development profile 会在
  `app.config.js` 里给两端标识加 `.dev` 后缀（让 dev build 与正式包同机共存），bundle ID 跟着变，
  audience 也就跟着变。
- `host.exp.Exponent` —— **Expo Go** 的 audience。Expo Go 是 Apple 自己的 App，所以用 Expo Go 调试时
  `aud` 是 `host.exp.Exponent`，与正式包不同。

因此：**改 `expo.ios.bundleIdentifier`（或改 `.dev` 后缀的拼法）就必须同步改这里的 client_id**，
否则真机登录会失败（典型报错是 audience 不匹配或 `invalid id token`）。

Android 的 `expo.android.package` 与 Apple 的 audience 无关（Apple 登录只在 iOS 展示），Kaipa 两端都用
同一个标识（正式 `com.hitosea.letsgo` / dev `com.hitosea.letsgo.dev`），但只有 iOS 的 `bundleIdentifier`
会出现在 `aud` 里。改 Android 包名不影响这里（但会影响高德 Android key，它按「包名 + SHA1」注册）。

## 前置条件（Apple Developer）

1. 在 Apple Developer → Identifiers 里确认 App ID **`com.hitosea.letsgo`** 存在；跑 EAS dev build 还要
   另外有 **`com.hitosea.letsgo.dev`**（EAS 会按 `usesAppleSignIn` 自动注册，第一次构建后去后台确认一下）。
2. 该 App ID 必须勾选 **Sign in with Apple** 能力，然后重新生成 provisioning profile。
   - EAS 会依据 `expo.ios.usesAppleSignIn: true` 自动申请这项能力并重签 profile；
     如果是手动管理证书，需要自己去后台开启。
3. 真机（模拟器可以跑原生面板，但 `getCredentialStateAsync` 之类的接口只在真机可靠）。
4. Apple 只在**首次授权**返回姓名与邮箱；之后同一 Apple ID 再登录不会再带，所以姓名是在第一次登录时
   写进资料的（见下）。

## 运行时（自托管 Supabase）

`infra/supabase/setup-kaipa-supabase.sh` 在生成运行时 compose 时会写入：

```yaml
GOTRUE_EXTERNAL_APPLE_ENABLED: "true"
GOTRUE_EXTERNAL_APPLE_CLIENT_ID: "com.hitosea.letsgo,com.hitosea.letsgo.dev,host.exp.Exponent"
GOTRUE_EXTERNAL_APPLE_SECRET: "unused-for-id-token-flow"
GOTRUE_EXTERNAL_APPLE_REDIRECT_URI: ${API_EXTERNAL_URL}/auth/v1/callback
```

以及 auth 服务的 DNS 覆盖：

```yaml
    dns:
      - ${AUTH_DNS_SERVER:-192.168.100.200}
```

DNS 这一条不是可选项：校验 ID token 时 GoTrue 要在运行时访问 `appleid.apple.com` 拉取 OIDC discovery
文档与签名密钥，Docker 内嵌 DNS 对外部域名解析偶发失败，会导致登录报 key/JWKS 相关错误。若宿主的解析器
不是 `192.168.100.200`，用 `AUTH_DNS_SERVER` 环境变量覆盖。

改完配置后重建 auth 容器：

```bash
cd ~/workspaces/kaipa/infra/supabase/docker && docker compose up -d auth
```

### 自查

```bash
docker exec kaipa-supabase-auth env | grep APPLE
ANON_KEY=$(grep -m1 '^ANON_KEY=' ~/workspaces/kaipa/infra/supabase/docker/.env | cut -d= -f2-)
curl -s -H "apikey: $ANON_KEY" http://127.0.0.1:8010/auth/v1/settings \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['external']['apple'])"
```

应分别看到正确的 client_id 与 `True`。

## 客户端行为

- 入口只在 **iOS 且系统支持**时出现（`isAppleSignInAvailable()`）；其它平台「更多登录方式」里只有邮箱。
- nonce 流程：App 生成 32 字节随机数作为 raw nonce，SHA-256 后交给 Apple 写进 token 的 `nonce` 声明，
  raw nonce 交给 Supabase 校验。两者都必须是同一个来源，不要改成同一个值。
- 用户点「取消」时系统面板抛 `ERR_REQUEST_CANCELED`，UI 静默返回登录页，不报错。
- 首次授权拿到姓名后，会写入 `user_metadata`（`nickname` / `display_name`）与 `profiles`
  （`nick` / `display_name` / `avatar_ini`）。这一步是尽力而为，失败只影响资料显示，不影响登录。

## 测试步骤

**Expo Go（快速验证，bundle ID 无关）**

```bash
npx expo start
```

用 iPhone 上的 Expo Go 扫码 → 登录页 →「更多登录方式」→ Apple → 系统面板授权 → 应直接进入应用。

**EAS dev build（验证 `.dev` App ID 与 entitlement）**

```bash
npx eas build --profile development --platform ios
```

dev build 的 bundle ID 是 `com.hitosea.letsgo.dev`，所以它验证的是 `.dev` 这个 App ID 的能力与
audience，**不再顺带覆盖正式包的 audience**。要验证正式包那条路径，用 `--profile preview` 构建
（preview 不注入 `APP_VARIANT`，两端标识与正式包一致）。

装上 dev build 后再走一次登录。如果 Expo Go 成功而 dev build 失败，通常就是 client_id 与
`bundleIdentifier` 不一致，或 App ID 没开 Sign in with Apple 能力。

## 排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `Unsupported provider: provider is not enabled` | auth 容器没开 Apple provider | 检查 `GOTRUE_EXTERNAL_APPLE_ENABLED`，重建 auth 容器 |
| audience / `invalid id token` 类错误 | ① client_id 与当前 App 的 bundle ID 不匹配；② App 打的根本不是 8010 这套实例 | 先看报错出自哪个 auth 容器（`docker logs kaipa-supabase-auth` vs 共享实例），再补 `GOTRUE_EXTERNAL_APPLE_CLIENT_ID`；详见下条 |
| 本机 `.env` 是 8010，真机却报 audience 不匹配 | 包里的 `EXPO_PUBLIC_SUPABASE_URL` / `ANON_KEY` 是**构建期**内联的，不是 Metro 的 `.env`：EAS 云包取自 EAS 环境变量，dev client 取自提供 bundle 的那台 Metro | 核对 `eas env:list --environment <dev\|preview\|production>` 与构建所用 checkout 的 `.env`，改完重建（README「Dev build via EAS」） |
| nonce 校验失败 | 传给 Apple 的 nonce 不是 SHA-256 后的值，或传给 Supabase 的不是原始值 | 对照 `signInWithApple()`；仅调试时可临时设 `GOTRUE_EXTERNAL_APPLE_SKIP_NONCE_CHECK=true` |
| 拉取 Apple 密钥超时 / 解析失败 | 容器 DNS | 给 auth 服务加 `dns:`（见上），重建容器 |
| dev build 上登录失败但 Expo Go 正常 | App ID（正式是 `com.hitosea.letsgo`，dev build 是 `com.hitosea.letsgo.dev`）未开启 Sign in with Apple，或 profile 未重签 | Apple Developer 后台开启能力后重新 `eas build` |
| 第二次登录拿不到姓名 | Apple 只首次授权返回姓名 | 预期行为；首次已写入资料 |

`GOTRUE_EXTERNAL_APPLE_SKIP_NONCE_CHECK` 会削弱重放保护，**只用于本地定位问题**，定位完就删掉。

## 其它入口

- 微信 / Google 登录入口在 `AuthFlow.tsx` 里暂时隐藏，尚未接入；恢复时把对应项加回
  `AuthMoreSheet` 的 `items` 即可（Apple 行已经从 mock 换成真实流程，不要再回退成 `setTimeout` 假跳转）。
